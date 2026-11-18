// Revoking the authorization of Sign in with Apple, which Apple asks for when an account is
// deleted (RF-04, ADR-0019). The app sends a fresh authorization code; it is exchanged for a
// token, which is then revoked. Both requests are signed with a client secret: a JWT signed
// with the private key of Sign in with Apple, which only this function knows.
// It uses Web APIs alone (fetch, WebCrypto, atob), so that it runs both in Deno and in the
// tests of Node.

const APPLE_ID = "https://appleid.apple.com";

// Apple accepts up to six months; each request makes its own, so a few minutes are enough.
const CLIENT_SECRET_LIFETIME_S = 5 * 60;

export interface AppleConfig {
  /** The Team ID of the Apple Developer account. */
  teamId: string;
  /** The ID of the key of Sign in with Apple. */
  keyId: string;
  /** The private key (.p8 file), in PEM. */
  privateKey: string;
  /** The bundle ID of the app: a native app's tokens are issued to it. */
  clientId: string;
}

/**
 * Why the authorization could not be revoked:
 * - `invalid_code`: Apple rejected the code (used or expired: they last five minutes).
 * - `account_mismatch`: the code belongs to another Apple ID than the account's.
 * - `unavailable`: Apple did not answer as expected; trying again may work.
 */
export type AppleFailure = "invalid_code" | "account_mismatch" | "unavailable";

export class AppleError extends Error {
  constructor(readonly reason: AppleFailure) {
    super(`Sign in with Apple could not be revoked: ${reason}.`);
    this.name = "AppleError";
  }
}

type Fetch = typeof fetch;

/**
 * Revokes the authorization that `authorizationCode` belongs to, after checking that it is
 * the one of the Apple ID `appleUserId` (the `sub` of its tokens).
 */
export async function revokeAppleAuthorization(
  authorizationCode: string,
  appleUserId: string,
  config: AppleConfig,
  fetchImpl: Fetch,
  now: Date = new Date(),
): Promise<void> {
  const clientSecret = await createClientSecret(config, now);
  const tokens = await post(
    fetchImpl,
    "/auth/token",
    {
      client_id: config.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    },
    "invalid_code",
  );
  const refreshToken = readString(tokens, "refresh_token");
  const idToken = readString(tokens, "id_token");
  if (refreshToken === null || idToken === null) {
    throw new AppleError("unavailable");
  }
  // Revoking would disconnect the app from that other Apple ID, which is not what was asked.
  if (readString(decodeJwtPayload(idToken), "sub") !== appleUserId) {
    throw new AppleError("account_mismatch");
  }
  await post(
    fetchImpl,
    "/auth/revoke",
    {
      client_id: config.clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    },
    "unavailable",
  );
}

/**
 * A form request to Apple. A 400 means that Apple rejected the request (`rejected`); any
 * other error, or no answer at all, is `unavailable`.
 */
async function post(
  fetchImpl: Fetch,
  path: string,
  fields: Record<string, string>,
  rejected: AppleFailure,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${APPLE_ID}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    throw new AppleError("unavailable");
  }
  if (response.status === 400) throw new AppleError(rejected);
  if (!response.ok) throw new AppleError("unavailable");
  const text = await response.text();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppleError("unavailable");
  }
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

/**
 * The claims of a JWT, without checking its signature: the token comes straight from Apple,
 * over HTTPS, in the answer to a request signed by this function.
 */
function decodeJwtPayload(jwt: string): unknown {
  const payload = jwt.split(".")[1];
  if (payload === undefined) throw new AppleError("unavailable");
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    throw new AppleError("unavailable");
  }
}

/** The client secret: a JWT signed with ES256 that Apple checks with the public key. */
export async function createClientSecret(
  config: AppleConfig,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = { alg: "ES256", kid: config.keyId };
  const claims = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_LIFETIME_S,
    aud: APPLE_ID,
    sub: config.clientId,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const key = await importPrivateKey(config.privateKey);
  // WebCrypto gives the raw signature (r and s, 32 bytes each), which is the form of JWS.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The .p8 key, in PEM. Its line breaks are optional, and may also arrive written as `\n`:
 * that is how some tools keep a multi-line secret on one line.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function encodeJson(value: object): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
