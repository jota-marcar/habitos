// The entry point of the Edge Function `delete-account` (RF-04, ADR-0019): it connects the
// handler to Supabase and to Apple. The logic lives in handler.ts and apple.ts, tested with
// Jest; this file is tested from end to end in the CI (supabase/tests/delete-account.test.ts).

import { createClient, isAuthApiError } from "@supabase/supabase-js";

import { revokeAppleAuthorization, type AppleConfig } from "./apple.ts";
import { handleDeleteAccount, type DeleteAccountServices } from "./handler.ts";

// The global of Deno, which runs this file, with the little that is used. It is read through
// globalThis so that the TypeScript of the project checks this file without Deno's types.
interface DenoRuntime {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
}
const deno = (globalThis as unknown as { Deno: DenoRuntime }).Deno;

function required(name: string): string {
  const value = deno.env.get(name);
  if (value === undefined || value === "") {
    throw new Error(`The secret ${name} is missing.`);
  }
  return value;
}

/** The secret key of the project, which Supabase gives every function. */
function secretKey(): string {
  const keys: Partial<Record<string, string>> = JSON.parse(
    deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
  );
  return keys.default ?? required("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * Only accounts with Apple need it, so it is read when used. They are secrets of each project
 * of Supabase, with the values of its environment (docs/supabase.md).
 */
function appleConfig(): AppleConfig {
  return {
    teamId: required("APPLE_TEAM_ID"),
    keyId: required("APPLE_KEY_ID"),
    privateKey: required("APPLE_PRIVATE_KEY"),
    clientId: required("APPLE_CLIENT_ID"),
  };
}

const admin = createClient(required("SUPABASE_URL"), secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const services: DeleteAccountServices = {
  async findUser(accessToken) {
    // It asks Auth, which also rejects the token of a user that no longer exists.
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error !== null) {
      if (isAuthApiError(error) && error.status < 500) return null;
      throw error;
    }
    const apple = data.user.identities?.find((i) => i.provider === "apple");
    // The `id` of an identity is the user ID of its provider: for Apple, its `sub`.
    return { id: data.user.id, appleUserId: apple?.id ?? null };
  },
  revokeApple: (authorizationCode, appleUserId) =>
    revokeAppleAuthorization(
      authorizationCode,
      appleUserId,
      appleConfig(),
      fetch,
    ),
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error !== null) throw error;
  },
};

deno.serve((request) => handleDeleteAccount(request, services));
