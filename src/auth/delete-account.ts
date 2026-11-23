// Deleting the account (RF-04, ADR-0019): the Edge Function `delete-account` deletes the user,
// and with it every row of the account, after revoking Sign in with Apple. Then the device
// forgets the account: its data, its notifications, its access to Google and the session.

import { FunctionsHttpError, type User } from "@supabase/supabase-js";

import { deleteAccountData } from "@/data/account-data";
import type { Database } from "@/data/database";
import { removeAllNotifications } from "@/notifications/expo-notifier";
import { resumeSync, suspendSync } from "@/sync/app-sync";
import { clearSyncRecord } from "@/sync/sync-record";

import { authorizeWithApple, revokeGoogleAccess } from "./sign-in";
import { supabase } from "@/shared/supabase";

/**
 * How deleting the account ended:
 * - `deleted`: the account no longer exists, and the device is signed out.
 * - `cancelled`: the user cancelled the sign-in with Apple; nothing changed.
 * - `apple_mismatch`: the sign-in with Apple was done with another Apple ID; nothing changed.
 * - `failed`: anything else, the lack of connection included; nothing changed, and the user
 *   can try again.
 */
export type DeleteAccountOutcome =
  "deleted" | "cancelled" | "apple_mismatch" | "failed";

/** Whether the account was ever signed in with Apple, whose authorization must be revoked. */
export function usesApple(user: User): boolean {
  const providers: unknown = user.app_metadata.providers;
  if (Array.isArray(providers)) return providers.includes("apple");
  return user.app_metadata.provider === "apple";
}

export async function deleteAccount(
  db: Database,
  user: User,
): Promise<DeleteAccountOutcome> {
  let appleAuthorizationCode: string | undefined;
  if (usesApple(user)) {
    const authorization = await authorizeWithApple();
    if (typeof authorization === "string") return authorization;
    appleAuthorizationCode = authorization.authorizationCode;
  }
  // A synchronization in progress would upload or download the data of a deleted account.
  await suspendSync();
  try {
    const { error } = await supabase().functions.invoke("delete-account", {
      body: { appleAuthorizationCode },
    });
    if (error !== null) return await outcomeOf(error);
    await forgetAccount(db);
    return "deleted";
  } finally {
    resumeSync();
  }
}

/** The function answers with the reason in `error`; only a wrong Apple ID is told apart. */
async function outcomeOf(error: unknown): Promise<DeleteAccountOutcome> {
  if (!(error instanceof FunctionsHttpError)) return "failed";
  try {
    const body: unknown = await (error.context as Response).json();
    const reason =
      typeof body === "object" && body !== null && "error" in body
        ? body.error
        : null;
    return reason === "apple_account_mismatch" ? "apple_mismatch" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Once the account is deleted, the device forgets it even if a step fails: there is nothing
 * left to try again. Data left behind are removed by the next sign-in, which is necessarily
 * of another user (ADR-0018).
 */
async function forgetAccount(db: Database): Promise<void> {
  await Promise.allSettled([
    deleteAccountData(db),
    clearSyncRecord(),
    removeAllNotifications(),
    revokeGoogleAccess(),
  ]);
  await supabase().auth.signOut({ scope: "local" });
}
