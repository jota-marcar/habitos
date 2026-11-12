// app.json only holds what both variants share (ADR-0008). EAS CLI rewrites this file with
// values resolved for one variant, so these tests catch them before they are committed.
import appJson from "../../app.json";

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

  test("does not set the iOS bundle identifier, which belongs to the variant", () => {
    expect(ios.bundleIdentifier).toBeUndefined();
  });

  test("does not copy the values that Expo Router generates by itself", () => {
    expect(extra.router).toBeUndefined();
  });

  test("keeps the link with the EAS project", () => {
    expect(expo.owner).toBe("jota_marcar");
    expect(extra.eas).toEqual({
      projectId: "9321856d-8680-432d-ab9c-e35062400d59",
    });
  });
});
