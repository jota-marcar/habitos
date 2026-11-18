/**
 * @jest-environment node
 */
// Node, for WebCrypto: the preset of Expo does not have it.

import {
  AppleError,
  createClientSecret,
  revokeAppleAuthorization,
  type AppleConfig,
} from "./apple.ts";

const NOW = new Date("2026-11-18T10:00:00Z");
const APPLE_USER_ID = "001234.abcdef.1234";

let keys: CryptoKeyPair;
let config: AppleConfig;

beforeAll(async () => {
  keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  config = {
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: await toPem(keys.privateKey),
    clientId: "com.jotamarcar.habitos.dev",
  };
});

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function toBase64Url(text: string): string {
  return toBase64(new TextEncoder().encode(text))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The key in PEM, as Apple gives it in the .p8 file. */
async function toPem(key: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key));
  const lines = toBase64(der).match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function decodePart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
}

function jwt(claims: object): string {
  const encode = (value: object) => toBase64Url(JSON.stringify(value));
  return `${encode({ alg: "RS256" })}.${encode(claims)}.signature`;
}

interface Call {
  url: string;
  fields: Record<string, string>;
}

/** A fetch that answers each request with the next answer, and keeps the requests. */
function fakeApple(...answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        fields: Object.fromEntries(new URLSearchParams(String(init?.body))),
      });
      const answer = answers.shift();
      if (answer === undefined) throw new Error("Unexpected request.");
      if (answer instanceof Error) throw answer;
      return answer;
    },
  );
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

function tokens(sub = APPLE_USER_ID): Response {
  return Response.json({
    access_token: "access",
    refresh_token: "refresh",
    id_token: jwt({ sub, aud: "com.jotamarcar.habitos.dev" }),
  });
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppleError) return error.reason;
    throw error;
  }
  throw new Error("It did not fail.");
}

describe("createClientSecret", () => {
  test("is a JWT for Apple signed with ES256 by the key", async () => {
    const secret = await createClientSecret(config, NOW);
    const [header, claims, signature] = secret.split(".");

    expect(decodePart(header)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    const issuedAt = NOW.getTime() / 1000;
    expect(decodePart(claims)).toEqual({
      iss: "TEAM123456",
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: "https://appleid.apple.com",
      sub: "com.jotamarcar.habitos.dev",
    });
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keys.publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  test("accepts the key with its line breaks written as \\n, as some tools keep it", async () => {
    const oneLine = config.privateKey.replace(/\n/g, "\\n");

    const secret = await createClientSecret(
      { ...config, privateKey: oneLine },
      NOW,
    );

    expect(secret.split(".")).toHaveLength(3);
  });
});

describe("revokeAppleAuthorization", () => {
  test("exchanges the code for a token and revokes it", async () => {
    const apple = fakeApple(tokens(), new Response(""));

    await revokeAppleAuthorization(
      "code",
      APPLE_USER_ID,
      config,
      apple.fetchImpl,
      NOW,
    );

    expect(apple.calls).toEqual([
      {
        url: "https://appleid.apple.com/auth/token",
        fields: {
          client_id: "com.jotamarcar.habitos.dev",
          client_secret: expect.any(String),
          code: "code",
          grant_type: "authorization_code",
        },
      },
      {
        url: "https://appleid.apple.com/auth/revoke",
        fields: {
          client_id: "com.jotamarcar.habitos.dev",
          client_secret: apple.calls[0].fields.client_secret,
          token: "refresh",
          token_type_hint: "refresh_token",
        },
      },
    ]);
  });

  test("a code that Apple rejects is invalid_code", async () => {
    const apple = fakeApple(
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );

    expect(
      await reasonOf(
        revokeAppleAuthorization(
          "used",
          APPLE_USER_ID,
          config,
          apple.fetchImpl,
        ),
      ),
    ).toBe("invalid_code");
  });

  test("the code of another Apple ID is account_mismatch, and nothing is revoked", async () => {
    const apple = fakeApple(tokens("another-apple-id"));

    expect(
      await reasonOf(
        revokeAppleAuthorization(
          "code",
          APPLE_USER_ID,
          config,
          apple.fetchImpl,
        ),
      ),
    ).toBe("account_mismatch");
    expect(apple.calls).toHaveLength(1);
  });

  test.each([
    ["no connection", [new Error("Network down.")]],
    ["an error of Apple", [new Response("", { status: 503 })]],
    ["an answer that is not JSON", [new Response("<html>")]],
    ["an answer without tokens", [Response.json({ access_token: "access" })]],
    ["an answer that is null", [Response.json(null)]],
    ["an answer that is a string", [Response.json("tokens")]],
    [
      "a refresh_token that is not a string",
      [Response.json({ refresh_token: 1, id_token: "a.b.c" })],
    ],
    [
      "an id_token that is not a JWT",
      [Response.json({ refresh_token: "refresh", id_token: "not-a-jwt" })],
    ],
    [
      "an id_token whose claims are not JSON",
      [Response.json({ refresh_token: "refresh", id_token: "a.b.c" })],
    ],
    ["a failed revocation", [tokens(), new Response("", { status: 400 })]],
  ])("%s is unavailable", async (_case, answers) => {
    const apple = fakeApple(...answers);

    expect(
      await reasonOf(
        revokeAppleAuthorization(
          "code",
          APPLE_USER_ID,
          config,
          apple.fetchImpl,
        ),
      ),
    ).toBe("unavailable");
  });
});
