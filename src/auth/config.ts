// What the app needs to reach its Supabase project and Google Sign-In (ADR-0017). The values
// come from the EAS environment of the build profile (or `.env.local` on the PC), so each
// variant reaches its own project: they are never written in the repository.

export interface AuthConfig {
  readonly supabaseUrl: string;
  /** The public key of the project (`sb_publishable_…`): Row Level Security protects the data. */
  readonly supabaseKey: string;
  /** The OAuth client of type "web": the audience of the Google token that Supabase checks. */
  readonly googleWebClientId: string;
  readonly googleIosClientId: string;
}

type AuthEnv = { readonly [Key in keyof AuthConfig]: string | undefined };

const VARIABLES: { readonly [Key in keyof AuthConfig]: string } = {
  supabaseUrl: "EXPO_PUBLIC_SUPABASE_URL",
  supabaseKey: "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  googleWebClientId: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  googleIosClientId: "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
};

/** Checks the values, so that a build without them fails at once with a clear error. */
export function authConfigFrom(env: AuthEnv): AuthConfig {
  const missing = (Object.keys(VARIABLES) as (keyof AuthConfig)[])
    .filter((key) => env[key] === undefined || env[key] === "")
    .map((key) => VARIABLES[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}. See docs/supabase.md.`,
    );
  }
  const config = env as AuthConfig;
  if (!config.supabaseUrl.startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must start with https://.");
  }
  return config;
}

export function readAuthConfig(): AuthConfig {
  // Expo only inlines `process.env.EXPO_PUBLIC_…` read with a dot, one by one.
  return authConfigFrom({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}
