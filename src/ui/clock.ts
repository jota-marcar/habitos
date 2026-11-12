// The only place where the interface reads the clock or generates identifiers: the domain gets
// both as data (docs/arquitectura.md).

import { randomUUID } from "expo-crypto";

import { localDateOf, type LocalDate } from "@/domain/dates";

/** Today in the device's local time. */
export function today(): LocalDate {
  return localDateOf(new Date());
}

/** A new identifier for a row of the local database. */
export function newId(): string {
  return randomUUID();
}
