// Native sign-in with Apple or Google, whose token is sent to Supabase (RF-01, ADR-0017).
// The session that Supabase returns is kept by its client; the screens learn about it through
// `onAuthStateChange`.

import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";

import { readAuthConfig } from "./config";
import { supabase } from "./supabase";

export type SignInProvider = "apple" | "google";

/**
 * How a sign-in ended. "failed" covers every error, the lack of connection included: signing
 * in needs it (RF-01), and the user can do the same about all of them, which is to try again.
 */
export type SignInOutcome = "signed_in" | "cancelled" | "failed";

/**
 * A nonce for Apple: the hash goes to Apple, which puts it in the token, and the raw value to
 * Supabase, which checks that its hash matches. A token caught on the way is of no use without
 * the raw value.
 */
async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = randomUUID();
  const hashed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function sendToSupabase(
  provider: SignInProvider,
  token: string,
  nonce?: string,
): Promise<SignInOutcome> {
  const { error } = await supabase().auth.signInWithIdToken({
    provider,
    token,
    nonce,
  });
  return error === null ? "signed_in" : "failed";
}

export async function signInWithApple(): Promise<SignInOutcome> {
  try {
    const nonce = await createNonce();
    const credential = await AppleAuthentication.signInAsync({
      // The email identifies the account in Supabase. The name is not used.
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
    if (credential.identityToken === null) return "failed";
    return await sendToSupabase("apple", credential.identityToken, nonce.raw);
  } catch (error) {
    if (hasCode(error, "ERR_REQUEST_CANCELED")) return "cancelled";
    return "failed";
  }
}

/**
 * A fresh authorization code of Sign in with Apple, for deleting the account (RF-04,
 * ADR-0019): the Edge Function exchanges it for a token and revokes it. Codes last five
 * minutes and serve once, so one is asked for every time. No data are requested.
 */
export async function authorizeWithApple(): Promise<
  { authorizationCode: string } | "cancelled" | "failed"
> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [],
    });
    if (credential.authorizationCode === null) return "failed";
    return { authorizationCode: credential.authorizationCode };
  } catch (error) {
    if (hasCode(error, "ERR_REQUEST_CANCELED")) return "cancelled";
    return "failed";
  }
}

let googleConfigured = false;

function configureGoogle(): void {
  if (googleConfigured) return;
  const config = readAuthConfig();
  GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    iosClientId: config.googleIosClientId,
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<SignInOutcome> {
  try {
    configureGoogle();
    const response = await GoogleSignin.signIn();
    if (response.type === "cancelled") return "cancelled";
    if (response.data.idToken === null) return "failed";
    // Without nonce: the free version of the library cannot send one (ADR-0017).
    return await sendToSupabase("google", response.data.idToken);
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      (error.code === statusCodes.SIGN_IN_CANCELLED ||
        error.code === statusCodes.IN_PROGRESS)
    ) {
      return "cancelled";
    }
    return "failed";
  }
}

/** Forgets the Google account on the device, so that the next sign-in lets the user choose. */
export async function signOutOfGoogle(): Promise<void> {
  try {
    if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
  } catch {
    // The session of the app is closed anyway: at worst, Google offers the same account again.
  }
}

/**
 * Disconnects the app from the Google account signed in on the device (RF-04), and forgets
 * it. Without one, there is nothing to disconnect.
 */
export async function revokeGoogleAccess(): Promise<void> {
  if (!GoogleSignin.hasPreviousSignIn()) return;
  configureGoogle();
  await GoogleSignin.revokeAccess();
  await GoogleSignin.signOut();
}
