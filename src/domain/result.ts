// Outcome of an operation that can be rejected by the rules of the domain.
// Errors are codes, not messages: the interface decides the text shown to the user.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly E[] };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(errors: readonly E[]): Result<never, E> {
  return { ok: false, errors };
}
