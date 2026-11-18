// Deleting the account of the caller (RF-04, ADR-0019): the authorization of Sign in with
// Apple is revoked first, and then the user is deleted, which deletes every row of the
// account in cascade. In this order a failure can always be retried: the other way round, a
// failed revocation would leave a deleted user that no request can reach any more.
// The services come from index.ts, so that this logic is tested without Deno or Supabase.

import { AppleError, type AppleFailure } from "./apple.ts";

export interface AccountUser {
  id: string;
  /** The Apple user ID (`sub`), if the account was ever signed in with Apple. */
  appleUserId: string | null;
}

export interface DeleteAccountServices {
  /** The user of an access token, or null if the token is not valid. */
  findUser(accessToken: string): Promise<AccountUser | null>;
  /** Revokes Sign in with Apple. It fails with an `AppleError`. */
  revokeApple(authorizationCode: string, appleUserId: string): Promise<void>;
  /** Deletes the user, and with it every row of the account. */
  deleteUser(userId: string): Promise<void>;
}

/** The errors of the answer, which the app tells apart. */
export type DeleteAccountError =
  | "method_not_allowed"
  | "unauthorized"
  | "invalid_request"
  | "apple_authorization_required"
  | `apple_${AppleFailure}`
  | "server_error";

const STATUS: Readonly<Record<DeleteAccountError, number>> = {
  method_not_allowed: 405,
  unauthorized: 401,
  invalid_request: 400,
  apple_authorization_required: 400,
  apple_invalid_code: 400,
  apple_account_mismatch: 403,
  apple_unavailable: 502,
  server_error: 500,
};

export async function handleDeleteAccount(
  request: Request,
  services: DeleteAccountServices,
): Promise<Response> {
  if (request.method !== "POST") return failure("method_not_allowed");
  const accessToken = readBearerToken(request);
  if (accessToken === null) return failure("unauthorized");
  const body = await readBody(request);
  if (body === null) return failure("invalid_request");
  try {
    const user = await services.findUser(accessToken);
    if (user === null) return failure("unauthorized");
    if (user.appleUserId !== null) {
      if (body.appleAuthorizationCode === undefined) {
        return failure("apple_authorization_required");
      }
      await services.revokeApple(body.appleAuthorizationCode, user.appleUserId);
    }
    await services.deleteUser(user.id);
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof AppleError) return failure(`apple_${error.reason}`);
    console.error("The account could not be deleted.", error);
    return failure("server_error");
  }
}

function failure(error: DeleteAccountError): Response {
  return Response.json({ error }, { status: STATUS[error] });
}

function readBearerToken(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec(
    request.headers.get("Authorization") ?? "",
  );
  return match?.[1] ?? null;
}

interface DeleteAccountBody {
  /** A fresh authorization code of Sign in with Apple, for an account with Apple. */
  appleAuthorizationCode?: string;
}

/** The body, which may be empty; null if it is not what it should be. */
async function readBody(request: Request): Promise<DeleteAccountBody | null> {
  const text = await request.text();
  if (text === "") return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const code: unknown = (value as Record<string, unknown>)
    .appleAuthorizationCode;
  if (code === undefined) return {};
  if (typeof code !== "string" || code === "") return null;
  return { appleAuthorizationCode: code };
}
