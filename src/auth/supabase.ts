// The Supabase client of the app, created once (ADR-0003, ADR-0017). The session lives in the
// keychain, split into chunks, and is renewed only while the app is in the foreground.

import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

import { chunkedStorage, type KeyValueStore } from "./chunked-storage";
import { readAuthConfig } from "./config";

// After the first unlock, so that the code that runs in the background with the phone locked
// can read the session too (ADR-0017).
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const keychain: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS),
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client === null) {
    const config = readAuthConfig();
    const created = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        storage: chunkedStorage(keychain),
        autoRefreshToken: true,
        persistSession: true,
        // The sign-in is native: no session ever arrives in a URL.
        detectSessionInUrl: false,
        // React Native has no Web Locks: this keeps two renewals of the session from running
        // at the same time inside the app.
        lock: processLock,
      },
    });
    // The timers of a suspended app do not run: the session is renewed when it comes back.
    if (AppState.currentState === "active") created.auth.startAutoRefresh();
    AppState.addEventListener("change", (state) => {
      if (state === "active") void created.auth.startAutoRefresh();
      else void created.auth.stopAutoRefresh();
    });
    client = created;
  }
  return client;
}
