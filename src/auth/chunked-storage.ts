// Stores long values in a key-value store that only accepts short ones (ADR-0017). Some iOS
// versions refused keychain values over about 2 KB, and the session of Supabase is usually
// longer: each value is split into chunks under that size.
//
// A value is kept as `<key>.count` (the number of chunks) and `<key>.0`, `<key>.1`… The count
// is written last and removed first, so a value that was half written or half removed reads
// as missing, never as a corrupt session.

/** The storage that the Supabase client asks for. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Characters per chunk. A character of JavaScript takes up to 3 bytes in UTF-8, so a chunk
 * takes 1,800 bytes at most: under the 2 KB limit even if it is all accents.
 */
export const CHUNK_LENGTH = 600;

function countKey(key: string): string {
  return `${key}.count`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/**
 * Splits a value into chunks of at most `length` characters, without separating the two
 * halves of a character outside the Basic Multilingual Plane (an emoji, say): a lone half
 * cannot be encoded in UTF-8.
 */
export function splitIntoChunks(value: string, length: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + length, value.length);
    const last = value.charCodeAt(end - 1);
    const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
    if (isHighSurrogate && end < value.length) {
      // The chunk ends with the first half: it goes to the next chunk, or the second half
      // comes into this one if the chunk would be left empty.
      end += end - start > 1 ? -1 : 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

async function readCount(
  store: KeyValueStore,
  key: string,
): Promise<number | null> {
  const stored = await store.getItem(countKey(key));
  if (stored === null) return null;
  const count = Number(stored);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

async function removeChunks(
  store: KeyValueStore,
  key: string,
  from: number,
  to: number,
): Promise<void> {
  for (let index = from; index < to; index++) {
    await store.removeItem(chunkKey(key, index));
  }
}

export function chunkedStorage(
  store: KeyValueStore,
  length = CHUNK_LENGTH,
): KeyValueStore {
  return {
    async getItem(key) {
      const count = await readCount(store, key);
      if (count === null) return null;
      const chunks: string[] = [];
      for (let index = 0; index < count; index++) {
        const chunk = await store.getItem(chunkKey(key, index));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join("");
    },

    async setItem(key, value) {
      const previous = (await readCount(store, key)) ?? 0;
      const chunks = splitIntoChunks(value, length);
      // Without the count, a reader never takes the chunks being replaced for the value.
      await store.removeItem(countKey(key));
      for (const [index, chunk] of chunks.entries()) {
        await store.setItem(chunkKey(key, index), chunk);
      }
      await store.setItem(countKey(key), String(chunks.length));
      await removeChunks(store, key, chunks.length, previous);
    },

    async removeItem(key) {
      const count = (await readCount(store, key)) ?? 0;
      await store.removeItem(countKey(key));
      await removeChunks(store, key, 0, count);
    },
  };
}
