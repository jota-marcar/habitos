import {
  CHUNK_LENGTH,
  chunkedStorage,
  splitIntoChunks,
  type KeyValueStore,
} from "./chunked-storage";

/** A store in memory that, like the keychain, refuses values over a size. */
function memoryStore(maxBytes = 2048): KeyValueStore & {
  items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      if (new TextEncoder().encode(value).length > maxBytes) {
        throw new Error(`Value of ${key} is too long.`);
      }
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
}

describe("splitIntoChunks", () => {
  test("splits a value into chunks of the given length", () => {
    expect(splitIntoChunks("abcdefg", 3)).toEqual(["abc", "def", "g"]);
  });

  test("an empty value has no chunks", () => {
    expect(splitIntoChunks("", 3)).toEqual([]);
  });

  test("does not separate the two halves of an emoji", () => {
    // "ab😀c": the emoji takes two characters of JavaScript, at positions 2 and 3.
    const chunks = splitIntoChunks("ab😀c", 3);

    expect(chunks).toEqual(["ab", "😀c"]);
    expect(chunks.join("")).toBe("ab😀c");
  });

  test("keeps an emoji whole even if it does not fit in one chunk", () => {
    expect(splitIntoChunks("😀😀", 1)).toEqual(["😀", "😀"]);
  });

  test("an emoji at the end of the value is not split", () => {
    expect(splitIntoChunks("ab😀", 3)).toEqual(["ab", "😀"]);
  });
});

describe("chunkedStorage", () => {
  // A session of Supabase is usually longer than 2 KB, with names that may have accents.
  const longValue = JSON.stringify({
    access_token: "a".repeat(1500),
    refresh_token: "r".repeat(40),
    user: { name: "Jesús Martín ".repeat(100) },
  });

  test("keeps a value longer than the store accepts", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store);

    await storage.setItem("session", longValue);

    expect(await storage.getItem("session")).toBe(longValue);
    expect(store.items.size).toBeGreaterThan(2);
  });

  test("each chunk fits in 2 KB even if every character takes 3 bytes", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store);

    await storage.setItem("session", "€".repeat(CHUNK_LENGTH * 3));

    expect(await storage.getItem("session")).toBe("€".repeat(CHUNK_LENGTH * 3));
  });

  test("a missing value reads as null", async () => {
    expect(await chunkedStorage(memoryStore()).getItem("session")).toBeNull();
  });

  test("an empty value is kept", async () => {
    const storage = chunkedStorage(memoryStore());

    await storage.setItem("session", "");

    expect(await storage.getItem("session")).toBe("");
  });

  test("replacing a value with a shorter one removes the chunks left over", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store, 4);

    await storage.setItem("session", "abcdefghij");
    await storage.setItem("session", "xyz");

    expect(await storage.getItem("session")).toBe("xyz");
    expect([...store.items.keys()].sort()).toEqual([
      "session.0",
      "session.count",
    ]);
  });

  test("removing a value removes all of its chunks", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store, 4);
    await storage.setItem("session", "abcdefghij");
    await storage.setItem("other", "kept");

    await storage.removeItem("session");

    expect(await storage.getItem("session")).toBeNull();
    expect([...store.items.keys()].sort()).toEqual(["other.0", "other.count"]);
  });

  test("removing a missing value changes nothing", async () => {
    const store = memoryStore();

    await chunkedStorage(store).removeItem("session");

    expect(store.items.size).toBe(0);
  });

  test("a value with a missing chunk reads as null, not as a cut value", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store, 4);
    await storage.setItem("session", "abcdefghij");

    store.items.delete("session.1");

    expect(await storage.getItem("session")).toBeNull();
  });

  test.each(["-1", "1.5", "many"])(
    "a value with the invalid count %p reads as null",
    async (count) => {
      const store = memoryStore();
      store.items.set("session.count", count);
      store.items.set("session.0", "abc");

      expect(await chunkedStorage(store).getItem("session")).toBeNull();
    },
  );

  test("if writing fails halfway, the old value is not read as the new one", async () => {
    const store = memoryStore();
    const storage = chunkedStorage(store, 4);
    await storage.setItem("session", "old-value");
    const setItem = store.setItem;
    let writes = 0;
    store.setItem = async (key, value) => {
      if (++writes === 2) throw new Error("Keychain failure.");
      await setItem(key, value);
    };

    await expect(storage.setItem("session", "new-value")).rejects.toThrow(
      "Keychain failure.",
    );

    expect(await storage.getItem("session")).toBeNull();
  });
});
