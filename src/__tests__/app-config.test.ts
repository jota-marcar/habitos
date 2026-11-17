import appConfig, {
  resolveGoogleUrlScheme,
  resolveVariant,
} from "../../app.config";
import easJson from "../../eas.json";

const GOOGLE_IOS_CLIENT_ID = "1234-abcd.apps.googleusercontent.com";

const staticConfig = {
  name: "Hábitos",
  slug: "habitos",
  ios: {
    icon: "./assets/expo.icon",
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
};

/** Sets an environment variable, or removes it with undefined. */
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/**
 * The config of a variant, with the Google client ID of its environment (null: missing), on the
 * PC or on an EAS Build server.
 */
function configFor(
  variant: string | undefined,
  {
    googleIosClientId = GOOGLE_IOS_CLIENT_ID,
    easBuild = false,
    config = staticConfig,
  }: {
    googleIosClientId?: string | null;
    easBuild?: boolean;
    config?: typeof staticConfig & { plugins?: string[] };
  } = {},
) {
  const previous = {
    APP_VARIANT: process.env.APP_VARIANT,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    EAS_BUILD: process.env.EAS_BUILD,
  };
  setEnv("APP_VARIANT", variant);
  setEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", googleIosClientId ?? undefined);
  setEnv("EAS_BUILD", easBuild ? "true" : undefined);
  try {
    return appConfig({
      config,
      projectRoot: ".",
      staticConfigPath: null,
      packageJsonPath: null,
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) setEnv(name, value);
  }
}

describe("resolveVariant", () => {
  test("a missing or empty value means development", () => {
    expect(resolveVariant(undefined)).toBe("development");
    expect(resolveVariant("")).toBe("development");
  });

  test("accepts the two known variants", () => {
    expect(resolveVariant("development")).toBe("development");
    expect(resolveVariant("production")).toBe("production");
  });

  test.each(["prod", "Production", "preview", " production"])(
    "rejects the unknown value %p",
    (value) => {
      expect(() => resolveVariant(value)).toThrow("Unknown APP_VARIANT");
    },
  );
});

describe("appConfig", () => {
  test("the development variant has its own name, scheme and bundle identifier", () => {
    const config = configFor("development");

    expect(config.name).toBe("Habitos Dev");
    expect(config.ios?.infoPlist?.CFBundleDisplayName).toBe("Hábitos Dev");
    expect(config.scheme).toBe("habitos-dev");
    expect(config.ios?.bundleIdentifier).toBe("com.jotamarcar.habitos.dev");
  });

  test("the production variant has its own name, scheme and bundle identifier", () => {
    const config = configFor("production");

    expect(config.name).toBe("Habitos");
    expect(config.ios?.infoPlist?.CFBundleDisplayName).toBe("Hábitos");
    expect(config.scheme).toBe("habitos");
    expect(config.ios?.bundleIdentifier).toBe("com.jotamarcar.habitos");
  });

  test("without APP_VARIANT the config is the development one", () => {
    expect(configFor(undefined)).toEqual(configFor("development"));
  });

  test("the variants share nothing that identifies the app", () => {
    const development = configFor("development");
    const production = configFor("production");

    expect(development.name).not.toBe(production.name);
    expect(development.ios?.infoPlist?.CFBundleDisplayName).not.toBe(
      production.ios?.infoPlist?.CFBundleDisplayName,
    );
    expect(development.scheme).not.toBe(production.scheme);
    expect(development.ios?.bundleIdentifier).not.toBe(
      production.ios?.bundleIdentifier,
    );
  });

  test("keeps the static values of app.json", () => {
    const config = configFor("production");

    expect(config.slug).toBe("habitos");
    expect(config.ios?.icon).toBe("./assets/expo.icon");
    expect(config.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  // The Xcode target comes from the name, and the build tools disagree on non-ASCII letters.
  test.each(["development", "production"])(
    "the internal name of the %s variant is plain ASCII",
    (variant) => {
      expect(configFor(variant).name).toMatch(/^[A-Za-z ]+$/);
    },
  );

  test("an unknown variant stops the build", () => {
    expect(() => configFor("staging")).toThrow("Unknown APP_VARIANT");
  });
});

describe("resolveGoogleUrlScheme", () => {
  test("is the iOS client ID reversed", () => {
    expect(resolveGoogleUrlScheme(GOOGLE_IOS_CLIENT_ID, true)).toBe(
      "com.googleusercontent.apps.1234-abcd",
    );
  });

  test.each([undefined, ""])(
    "a missing client ID %p stops a build on EAS",
    (id) => {
      expect(() => resolveGoogleUrlScheme(id, true)).toThrow(
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing from the EAS environment",
      );
    },
  );

  test.each([undefined, ""])(
    "a missing client ID %p is allowed on the PC, where eas env:pull brings it",
    (id) => {
      expect(resolveGoogleUrlScheme(id, false)).toBeNull();
    },
  );

  test.each([true, false])(
    "a value that is not a Google iOS client ID is an error (on EAS: %p)",
    (onEasBuild) => {
      expect(() => resolveGoogleUrlScheme("1234-abcd", onEasBuild)).toThrow(
        "is not a Google iOS client ID",
      );
    },
  );
});

describe("Google Sign-In", () => {
  test("returns to the URL scheme of the client ID of the environment", () => {
    expect(configFor("production", { easBuild: true }).plugins).toContainEqual([
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: "com.googleusercontent.apps.1234-abcd" },
    ]);
  });

  test("keeps the plugins of app.json", () => {
    const config = configFor("development", {
      config: { ...staticConfig, plugins: ["expo-router"] },
    });

    expect(config.plugins?.[0]).toBe("expo-router");
  });

  test("without the client ID, a build on EAS stops", () => {
    expect(() =>
      configFor("development", { googleIosClientId: null, easBuild: true }),
    ).toThrow("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing");
  });

  // EAS CLI reads the config before every command, also before `eas env:pull`.
  test("without the client ID, the config can still be read on the PC", () => {
    const config = configFor("development", {
      googleIosClientId: null,
      config: { ...staticConfig, plugins: ["expo-router"] },
    });

    expect(config.plugins).toEqual(["expo-router"]);
    expect(config.ios?.bundleIdentifier).toBe("com.jotamarcar.habitos.dev");
  });
});

// Each build profile takes the variables of its own EAS environment (ADR-0017): a profile that
// took those of the other one would point the app at the Supabase project of the other variant.
describe("eas.json", () => {
  test.each(Object.entries(easJson.build))(
    "the %s profile takes the EAS environment of its variant",
    (_, profile) => {
      expect(profile.environment).toBe(profile.env.APP_VARIANT);
    },
  );
});
