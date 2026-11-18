/**
 * @jest-environment node
 */
// Node, for Request and Response: the preset of Expo replaces fetch and its classes.

import { AppleError } from "./apple.ts";
import {
  handleDeleteAccount,
  type AccountUser,
  type DeleteAccountServices,
} from "./handler.ts";

const GOOGLE_USER: AccountUser = { id: "user-1", appleUserId: null };
const APPLE_USER: AccountUser = { id: "user-2", appleUserId: "apple-sub" };

let steps: string[];

function services(
  user: AccountUser | null,
  overrides: Partial<DeleteAccountServices> = {},
): DeleteAccountServices {
  return {
    findUser: async (token) => {
      steps.push(`findUser ${token}`);
      return user;
    },
    revokeApple: async (code, appleUserId) => {
      steps.push(`revokeApple ${code} ${appleUserId}`);
    },
    deleteUser: async (id) => {
      steps.push(`deleteUser ${id}`);
    },
    ...overrides,
  };
}

function request(body?: string, init: RequestInit = {}): Request {
  return new Request("http://localhost/delete-account", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
    body,
    ...init,
  });
}

async function answer(response: Response) {
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  steps = [];
});

test("deletes the user of the session", async () => {
  const response = await handleDeleteAccount(request(), services(GOOGLE_USER));

  expect(await answer(response)).toEqual({
    status: 200,
    body: { deleted: true },
  });
  expect(steps).toEqual(["findUser token", "deleteUser user-1"]);
});

test("with Apple, revokes its authorization before deleting the user", async () => {
  const response = await handleDeleteAccount(
    request(JSON.stringify({ appleAuthorizationCode: "code" })),
    services(APPLE_USER),
  );

  expect(response.status).toBe(200);
  expect(steps).toEqual([
    "findUser token",
    "revokeApple code apple-sub",
    "deleteUser user-2",
  ]);
});

test("with Apple and no code, deletes nothing", async () => {
  const response = await handleDeleteAccount(
    request("{}"),
    services(APPLE_USER),
  );

  expect(await answer(response)).toEqual({
    status: 400,
    body: { error: "apple_authorization_required" },
  });
  expect(steps).toEqual(["findUser token"]);
});

test.each([
  ["invalid_code", 400],
  ["account_mismatch", 403],
  ["unavailable", 502],
] as const)(
  "if Apple fails with %s, the user is not deleted",
  async (reason, status) => {
    const response = await handleDeleteAccount(
      request(JSON.stringify({ appleAuthorizationCode: "code" })),
      services(APPLE_USER, {
        revokeApple: async () => {
          throw new AppleError(reason);
        },
      }),
    );

    expect(await answer(response)).toEqual({
      status,
      body: { error: `apple_${reason}` },
    });
    expect(steps).toEqual(["findUser token"]);
  },
);

test("an unexpected error is a server_error", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await handleDeleteAccount(
    request(),
    services(GOOGLE_USER, {
      deleteUser: async () => {
        throw new Error("Database down.");
      },
    }),
  );

  expect(await answer(response)).toEqual({
    status: 500,
    body: { error: "server_error" },
  });
  expect(console.error).toHaveBeenCalled();
});

test.each([
  ["no Authorization header", request(undefined, { headers: {} })],
  [
    "another kind of Authorization",
    request(undefined, { headers: { Authorization: "Basic abc" } }),
  ],
])("%s is unauthorized, without looking for the user", async (_case, req) => {
  const response = await handleDeleteAccount(req, services(GOOGLE_USER));

  expect(await answer(response)).toEqual({
    status: 401,
    body: { error: "unauthorized" },
  });
  expect(steps).toEqual([]);
});

test("a token without user is unauthorized", async () => {
  const response = await handleDeleteAccount(request(), services(null));

  expect(response.status).toBe(401);
  expect(steps).toEqual(["findUser token"]);
});

test("only POST is allowed", async () => {
  const response = await handleDeleteAccount(
    request(undefined, { method: "GET" }),
    services(GOOGLE_USER),
  );

  expect(await answer(response)).toEqual({
    status: 405,
    body: { error: "method_not_allowed" },
  });
  expect(steps).toEqual([]);
});

test.each([
  ["not JSON", "{"],
  ["not an object", "null"],
  [
    "a code that is not a string",
    JSON.stringify({ appleAuthorizationCode: 1 }),
  ],
  ["an empty code", JSON.stringify({ appleAuthorizationCode: "" })],
])("a body that is %s is an invalid_request", async (_case, body) => {
  const response = await handleDeleteAccount(
    request(body),
    services(APPLE_USER),
  );

  expect(await answer(response)).toEqual({
    status: 400,
    body: { error: "invalid_request" },
  });
  expect(steps).toEqual([]);
});
