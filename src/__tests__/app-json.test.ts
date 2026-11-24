// app.json only holds what both variants share (ADR-0008). EAS CLI rewrites this file with
// values resolved for one variant, so these tests catch them before they are committed.
import appJson from "../../app.json";
import packageLock from "../../package-lock.json";
import packageJson from "../../package.json";

const expo: Record<string, unknown> = appJson.expo;
const ios = (expo.ios ?? {}) as Record<string, unknown>;
const extra = (expo.extra ?? {}) as Record<string, unknown>;

describe("app.json", () => {
  test.each(["name", "scheme"])(
    "does not set %s, which belongs to the variant",
    (key) => {
      expect(expo[key]).toBeUndefined();
    },
  );

  // The app only targets iOS (ADR-0002): no Android or web settings to keep up to date.
  test("only targets iOS", () => {
    expect(expo.platforms).toEqual(["ios"]);
    expect(expo.android).toBeUndefined();
    expect(expo.web).toBeUndefined();
  });

  test("does not set the iOS bundle identifier, which belongs to the variant", () => {
    expect(ios.bundleIdentifier).toBeUndefined();
  });

  test("does not copy the values that Expo Router generates by itself", () => {
    expect(extra.router).toBeUndefined();
  });

  test("only enables local notifications, so the build needs no push entitlement", () => {
    const plugins = (expo.plugins ?? []) as unknown[];
    const notifications = plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications",
    );
    expect(notifications).toEqual([
      "expo-notifications",
      { enableRemoteNotifications: false },
    ]);
  });

  // app.json decides the version, and scripts/bump-version.mjs keeps the others in step (ADR-0024).
  test("has a semantic version, the same in package.json and its lockfile", () => {
    expect(appJson.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.version).toBe(appJson.expo.version);
    expect(packageLock.version).toBe(appJson.expo.version);
    expect(packageLock.packages[""].version).toBe(appJson.expo.version);
  });

  test("keeps the link with the EAS project", () => {
    expect(expo.owner).toBe("jota_marcar");
    expect(extra.eas).toEqual({
      projectId: "9321856d-8680-432d-ab9c-e35062400d59",
    });
  });

  // EAS Update (ADR-0020): the updates come from the EAS project of the app, and the fingerprint
  // policy only sends an update to the builds whose native code it matches.
  test("receives updates from its EAS project, only when the native code matches", () => {
    expect(expo.updates).toEqual({
      url: `https://u.expo.dev/${(extra.eas as { projectId: string }).projectId}`,
    });
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  test("enables Sign in with Apple, which adds its entitlement (ADR-0017)", () => {
    expect(ios.usesAppleSignIn).toBe(true);
    expect(expo.plugins).toContain("expo-apple-authentication");
  });

  test("keeps the keychain without asking for Face ID, which the app does not use", () => {
    expect(expo.plugins).toContainEqual([
      "expo-secure-store",
      { faceIDPermission: false },
    ]);
  });

  // ADR-0026: the organization token carries the address of Sentry, and sentry-cli uses it
  // instead of the configured one, with a warning on every upload if they differ. The region
  // (EU) comes from the organization, not from this URL.
  test("uploads to Sentry through its main address, which the token carries", () => {
    expect(expo.plugins).toContainEqual([
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        organization: "jota-marcar",
        project: "habitos",
      },
    ]);
  });

  test("the texts of iOS, like the sign-in buttons, are in Spanish", () => {
    const infoPlist = ios.infoPlist as Record<string, unknown>;
    expect(infoPlist.CFBundleDevelopmentRegion).toBe("es");
  });
});
