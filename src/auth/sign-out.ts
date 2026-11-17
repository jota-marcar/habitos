// Signing out (RF-03): the data of the account leave the device, but stay in the account, so
// that another account can sign in on the same phone without mixing them. Whether there are
// changes that would be lost is asked first, by the screen, with `hasPendingChanges`.

import { deleteAccountData } from "@/data/account-data";
import type { Database } from "@/data/database";
import { removeAllNotifications } from "@/notifications/expo-notifier";

import { signOutOfGoogle } from "./sign-in";
import { supabase } from "./supabase";

/**
 * The data go first: if anything fails before the end, the session is still open and the user
 * can try again, and no data of the account are left for the next one.
 */
export async function signOut(db: Database): Promise<void> {
  await deleteAccountData(db);
  await removeAllNotifications();
  await signOutOfGoogle();
  // Only this device: the default scope would sign out the other devices of the account too.
  // The session is removed from the keychain before the request, so it works offline.
  await supabase().auth.signOut({ scope: "local" });
}
