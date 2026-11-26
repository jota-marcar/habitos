// The native time pickers work with a Date: this gives the one of a time of today.

import type { LocalTime } from "@/domain/times";

/** Today at `time`, in the local time of the device: what a time picker starts at. */
export function dateAt(time: LocalTime): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}
