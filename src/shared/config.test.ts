import { authConfigFrom } from "./config";

const ENV = {
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  supabaseKey: "sb_publishable_key",
  googleWebClientId: "web.apps.googleusercontent.com",
  googleIosClientId: "ios.apps.googleusercontent.com",
};

describe("authConfigFrom", () => {
  test("takes the values of the environment", () => {
    expect(authConfigFrom(ENV)).toEqual(ENV);
  });

  test("names every missing or empty variable", () => {
    expect(() =>
      authConfigFrom({ ...ENV, supabaseKey: undefined, googleIosClientId: "" }),
    ).toThrow(
      "Missing environment variables: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.",
    );
  });

  test("the Supabase project is only reached through HTTPS", () => {
    expect(() =>
      authConfigFrom({ ...ENV, supabaseUrl: "http://127.0.0.1:54321" }),
    ).toThrow("must start with https://");
  });
});
