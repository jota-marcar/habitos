// Dynamic Expo config: everything that differs between the development and the production
// app lives here (ADR-0008). Static values stay in app.json.
// Keep this file free of imports from other project files: Expo evaluates it on its own.

import type { ConfigContext, ExpoConfig } from "expo/config";

export type AppVariant = "development" | "production";

interface VariantConfig {
  readonly name: string;
  readonly scheme: string;
  readonly bundleIdentifier: string;
}

// Each variant has its own identity so both apps can be installed side by side and no value
// of one environment can reach the other.
const VARIANTS: Record<AppVariant, VariantConfig> = {
  development: {
    name: "Hábitos Dev",
    scheme: "habitos-dev",
    bundleIdentifier: "com.jotamarcar.habitos.dev",
  },
  production: {
    name: "Hábitos",
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
    },
  };
}
