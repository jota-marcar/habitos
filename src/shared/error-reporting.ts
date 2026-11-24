// Error reports with Sentry (ADR-0026). They are anonymous: no user, no IP, no screenshots, no
// session replay and no tracing. Only what helps to find the bug leaves the device: the error,
// where it happened, the device and the version, and a trail of the screens and of the requests,
// without their parameters. Nothing the user writes, like the name of a habit, may reach it:
// the rows carry it as their accessibility label, so the trail of touches is never recorded.
// Without a DSN (the tests and the PC) nothing starts, and every call here does nothing.

import * as Sentry from "@sentry/react-native";
import type {
  Breadcrumb,
  ErrorEvent,
  ReactNativeOptions,
} from "@sentry/react-native";

import { APP_VERSION } from "./app-version";

/** Where an error was caught, to group them in Sentry. */
export type ErrorArea =
  "error-screen" | "write" | "sync" | "reminders" | "background";

export interface ErrorReportingEnv {
  /** EXPO_PUBLIC_SENTRY_DSN, from the EAS environment of the variant. */
  readonly dsn: string | undefined;
  /** The variant of app.config.ts: development or production. */
  readonly variant: unknown;
}

/**
 * The only breadcrumbs that leave the device. Any other one, such as a touch (it would carry
 * the name of a habit) or a console message (it would carry its data), is dropped.
 */
const KEPT_CATEGORIES = new Set(["navigation", "xhr", "fetch", "sentry.event"]);

/** The options of Sentry for an environment, or null when it must not start. */
export function errorReportingOptions(
  env: ErrorReportingEnv,
): ReactNativeOptions | null {
  if (env.dsn === undefined || env.dsn === "") return null;
  return {
    dsn: env.dsn,
    // An unknown variant would be a bug of app.config.ts (its tests prevent it). It must not stop
    // the app from opening, and it stays visible in Sentry.
    environment:
      env.variant === "development" || env.variant === "production"
        ? env.variant
        : "unknown",
    initialScope: { tags: { "app.version": APP_VERSION } },
    // Anonymous: no IP address, no user and no cookies or headers.
    sendDefaultPii: false,
    // No tracing (tracesSampleRate stays unset) and no session replay (no replay sample rates).
    enableAutoPerformanceTracing: false,
    enableUserInteractionTracing: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    // The native SDK of iOS records system and interface events, and the requests again.
    enableAutoBreadcrumbTracking: false,
    enableNetworkBreadcrumbs: false,
    integrations: [Sentry.breadcrumbsIntegration({ console: false })],
    beforeBreadcrumb: keepBreadcrumb,
    beforeSend: scrubEvent,
  };
}

/** Whether a breadcrumb can leave the device, without the parameters of a request. */
export function keepBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (
    breadcrumb.category === undefined ||
    !KEPT_CATEGORIES.has(breadcrumb.category)
  ) {
    return null;
  }
  const url = breadcrumb.data?.url;
  if (typeof url !== "string") return breadcrumb;
  return {
    ...breadcrumb,
    data: { ...breadcrumb.data, url: withoutQuery(url) },
  };
}

/** The last check before an event leaves the device. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { user: _user, request: _request, ...rest } = event;
  const breadcrumbs = event.breadcrumbs
    ?.map(keepBreadcrumb)
    .filter((breadcrumb) => breadcrumb !== null);
  return breadcrumbs === undefined ? rest : { ...rest, breadcrumbs };
}

function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * A request that failed because there is no connection: it is not a bug, and the app retries
 * it later. It would fill Sentry each time the iPhone goes offline.
 */
export function isConnectionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === "AuthRetryableFetchError" ||
    (typeof message === "string" && message.includes("Network request failed"))
  );
}

/** Starts Sentry, if the environment has a DSN. It goes before anything else (index.ts). */
export function startErrorReporting(env: ErrorReportingEnv): void {
  const options = errorReportingOptions(env);
  if (options !== null) Sentry.init(options);
}

/** Sends an error that the app caught, so it does not get lost in a console nobody reads. */
export function reportError(error: unknown, area: ErrorArea): void {
  if (isConnectionFailure(error)) return;
  Sentry.captureException(error, { tags: { area } });
}

/**
 * Records that a screen opened. It receives the pattern of the route (`/habits/[id]`), never
 * its values.
 */
export function recordScreen(route: string): void {
  Sentry.addBreadcrumb({
    category: "navigation",
    type: "navigation",
    data: { to: route },
  });
}
