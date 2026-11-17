// Dynamic Expo config: everything that differs between the development and the production
// app lives here (ADR-0008). Static values stay in app.json.
// Keep this file free of imports from other project files: Expo evaluates it on its own.

import type { ConfigContext, ExpoConfig } from "expo/config";

export type AppVariant = "development" | "production";

interface VariantConfig {
  /** Internal name: it names the Xcode project, so it must be plain ASCII. */
  readonly name: string;
  /** The name the user sees under the icon. */
  readonly displayName: string;
  readonly scheme: string;
  readonly bundleIdentifier: string;
}

// EAS CLI and Expo derive the Xcode target from `name` in different ways when it has
// non-ASCII letters ("HbitosDev" against "HabitosDev"), and the build fails. That is why the
// accent only goes in the display name.
// Each variant has its own identity so both apps can be installed side by side and no value
// of one environment can reach the other.
const VARIANTS: Record<AppVariant, VariantConfig> = {
  development: {
    name: "Habitos Dev",
    displayName: "Hábitos Dev",
    scheme: "habitos-dev",
    bundleIdentifier: "com.jotamarcar.habitos.dev",
  },
  production: {
    name: "Habitos",
    displayName: "Hábitos",
    scheme: "habitos",
    bundleIdentifier: "com.jotamarcar.habitos",
  },
};

/**
 * Reads the variant from APP_VARIANT. A missing value means development, so that production
 * is never built by accident; an unknown value is an error instead of a silent fallback.
 */
export function resolveVariant(value: string | undefined): AppVariant {
  if (value === undefined || value === "") return "development";
  if (value === "development" || value === "production") return value;
  throw new Error(
    `Unknown APP_VARIANT "${value}": expected "development" or "production".`,
  );
}

const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

/**
 * The URL scheme that Google Sign-In returns to: the iOS client ID of the environment, reversed
 * (ADR-0017). The client ID comes from the EAS environment of the build profile, or from
 * `.env.local` on the PC, so each variant gets the one of its own Google Cloud project.
 *
 * Only a build needs it: without it the app could not sign in with Google, so it stops there.
 * On the PC the config is read without it too, because EAS CLI reads it before running any
 * command, `eas env:pull` included, which is what brings the client ID. Returns null then.
 */
export function resolveGoogleUrlScheme(
  iosClientId: string | undefined,
  onEasBuild: boolean,
): string | null {
  if (iosClientId === undefined || iosClientId === "") {
    if (!onEasBuild) return null;
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing from the EAS environment of the build profile (see "environment" in eas.json and docs/supabase.md).',
    );
  }
  if (!iosClientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID "${iosClientId}" is not a Google iOS client ID: it must end in "${GOOGLE_CLIENT_ID_SUFFIX}".`,
    );
  }
  const id = iosClientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  return `com.googleusercontent.apps.${id}`;
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const variant = VARIANTS[resolveVariant(process.env.APP_VARIANT)];
  // EAS Build sets EAS_BUILD on its servers.
  const googleUrlScheme = resolveGoogleUrlScheme(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    Boolean(process.env.EAS_BUILD),
  );

  return {
    ...config,
    name: variant.name,
    slug: "habitos",
    scheme: variant.scheme,
    plugins: [
      ...(config.plugins ?? []),
      ...(googleUrlScheme === null
        ? []
        : [
            [
              "@react-native-google-signin/google-signin",
              { iosUrlScheme: googleUrlScheme },
            ] as [string, { iosUrlScheme: string }],
          ]),
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: variant.bundleIdentifier,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: variant.displayName,
      },
    },
  };
}
