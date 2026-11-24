import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";

import { APP_VERSION } from "./app-version";
import {
  errorReportingOptions,
  isConnectionFailure,
  keepBreadcrumb,
  recordScreen,
  reportError,
  scrubEvent,
  startErrorReporting,
} from "./error-reporting";

const DSN = "https://key@o1.ingest.de.sentry.io/2";
// What the user writes: it must never leave the device.
const HABIT = "Llamar a mamá";
const GOAL = "Correr 20 km";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("errorReportingOptions", () => {
  test.each([undefined, ""])("without a DSN (%p) it does not start", (dsn) => {
    expect(errorReportingOptions({ dsn, variant: "production" })).toBeNull();
  });

  test.each(["development", "production"])(
    "the environment is the variant of the app: %s",
    (variant) => {
      expect(errorReportingOptions({ dsn: DSN, variant })?.environment).toBe(
        variant,
      );
    },
  );

  test.each([undefined, "staging"])(
    "an unknown variant (%p) is an error, not a guess",
    (variant) => {
      expect(() => errorReportingOptions({ dsn: DSN, variant })).toThrow(
        "Unknown app variant",
      );
    },
  );

  test("the reports are anonymous, without tracing, replays or screenshots", () => {
    const options = errorReportingOptions({ dsn: DSN, variant: "production" });

    expect(options).toMatchObject({
      dsn: DSN,
      sendDefaultPii: false,
      enableAutoPerformanceTracing: false,
      enableUserInteractionTracing: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      enableAutoBreadcrumbTracking: false,
      enableNetworkBreadcrumbs: false,
    });
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("tracesSampler");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
  });

  test("leaves out the console from the trail", () => {
    errorReportingOptions({ dsn: DSN, variant: "production" });

    expect(Sentry.breadcrumbsIntegration).toHaveBeenCalledWith({
      console: false,
    });
  });

  test("tags the version of the app, which changes with each update", () => {
    const options = errorReportingOptions({ dsn: DSN, variant: "production" });

    expect(options?.initialScope).toEqual({
      tags: { "app.version": APP_VERSION },
    });
  });

  test("filters every breadcrumb and every event", () => {
    const options = errorReportingOptions({ dsn: DSN, variant: "production" });

    expect(options?.beforeBreadcrumb).toBe(keepBreadcrumb);
    expect(options?.beforeSend).toBe(scrubEvent);
  });
});

describe("keepBreadcrumb", () => {
  test.each([
    { category: "touch", message: `Touch event within element: ${HABIT}` },
    { category: "ui.multiClick", data: { label: HABIT } },
    { category: "console", message: `Saving ${GOAL}` },
    { category: "ui.lifecycle", data: { screen: "RNSScreen" } },
    { message: HABIT },
  ])("drops the breadcrumb %p", (breadcrumb: Breadcrumb) => {
    expect(keepBreadcrumb(breadcrumb)).toBeNull();
  });

  test("keeps the screens", () => {
    const breadcrumb = { category: "navigation", data: { to: "/habits/[id]" } };

    expect(keepBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });

  test.each(["xhr", "fetch"])(
    "keeps the %s requests without their parameters",
    (category) => {
      const breadcrumb = {
        category,
        data: {
          method: "GET",
          url: `https://ref.supabase.co/rest/v1/habits?name=eq.${HABIT}#top`,
          status_code: 500,
        },
      };

      expect(keepBreadcrumb(breadcrumb)).toEqual({
        category,
        data: {
          method: "GET",
          url: "https://ref.supabase.co/rest/v1/habits",
          status_code: 500,
        },
      });
    },
  );

  test("keeps the events sent before", () => {
    const breadcrumb = { category: "sentry.event", event_id: "abc" };

    expect(keepBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });
});

describe("scrubEvent", () => {
  test("no habit or goal name, no user and no request leave the device", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "UNIQUE constraint" }] },
      user: { id: "user-1", username: HABIT },
      request: { url: `habitos://habits?name=${GOAL}` },
      breadcrumbs: [
        { category: "touch", message: `Touch event within element: ${HABIT}` },
        { category: "console", message: `Saving ${GOAL}` },
        { category: "navigation", data: { to: "/weekly-goals/[id]/edit" } },
        {
          category: "xhr",
          data: { url: `https://ref.supabase.co/rest/v1/goals?name=${GOAL}` },
        },
      ],
    };

    const sent = scrubEvent(event);

    const text = JSON.stringify(sent);
    expect(text).not.toContain(HABIT);
    expect(text).not.toContain(GOAL);
    expect(sent.user).toBeUndefined();
    expect(sent.request).toBeUndefined();
    expect(sent.exception).toEqual(event.exception);
    expect(sent.breadcrumbs).toEqual([
      { category: "navigation", data: { to: "/weekly-goals/[id]/edit" } },
      {
        category: "xhr",
        data: { url: "https://ref.supabase.co/rest/v1/goals" },
      },
    ]);
  });

  test("an event without breadcrumbs stays without them", () => {
    const event: ErrorEvent = { type: undefined, message: "boom" };

    expect(scrubEvent(event)).toEqual({ type: undefined, message: "boom" });
  });
});

describe("isConnectionFailure", () => {
  test.each([
    new TypeError("Network request failed"),
    new Error("TypeError: Network request failed"),
    Object.assign(new Error("Failed to fetch"), {
      name: "AuthRetryableFetchError",
    }),
  ])("a request without connection is not a bug: %p", (error) => {
    expect(isConnectionFailure(error)).toBe(true);
  });

  test.each([
    new Error("UNIQUE constraint failed"),
    "Network request failed",
    null,
    undefined,
    { message: 42 },
  ])("anything else is: %p", (error) => {
    expect(isConnectionFailure(error)).toBe(false);
  });
});

describe("startErrorReporting", () => {
  test("starts Sentry with the options of the environment", () => {
    startErrorReporting({ dsn: DSN, variant: "development" });

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, environment: "development" }),
    );
  });

  test("without a DSN, Sentry does not start", () => {
    startErrorReporting({ dsn: undefined, variant: "development" });

    expect(Sentry.init).not.toHaveBeenCalled();
  });
});

describe("reportError", () => {
  test("sends the error with the area where it was caught", () => {
    const error = new Error("no database");

    reportError(error, "write");

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { area: "write" },
    });
  });

  test("does not send a failure of the connection", () => {
    reportError(new TypeError("Network request failed"), "sync");

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("recordScreen", () => {
  test("leaves the pattern of the route in the trail", () => {
    recordScreen("/habits/[id]/edit");

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "navigation",
      type: "navigation",
      data: { to: "/habits/[id]/edit" },
    });
  });
});
