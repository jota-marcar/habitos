// Sentry in the tests (ADR-0026): Jest uses this mock instead of the package everywhere, so no
// test starts the native SDK or sends anything. The tests can check what would have been sent.

export const init = jest.fn();
export const captureException = jest.fn();
export const addBreadcrumb = jest.fn();
export const breadcrumbsIntegration = jest.fn((options: unknown) => ({
  name: "Breadcrumbs",
  options,
}));
