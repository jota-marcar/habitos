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

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const variant = VARIANTS[resolveVariant(process.env.APP_VARIANT)];

  return {
    ...config,
    name: variant.name,
    slug: "habitos",
    scheme: variant.scheme,
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
