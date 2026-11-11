import appConfig, { resolveVariant } from "../../app.config";

const staticConfig = {
  name: "Hábitos",
  slug: "habitos",
  ios: {
    icon: "./assets/expo.icon",
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
};

function configFor(variant: string | undefined) {
  const previous = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    return appConfig({
      config: staticConfig,
      projectRoot: ".",
      staticConfigPath: null,
      packageJsonPath: null,
    });
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
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
