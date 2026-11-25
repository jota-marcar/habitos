// The options sheet of a page and the item held down to open it (RF-34, RF-50). The sheet shows
// the item as it is now on the page; what it was like when it was held down is kept for when it
// is no longer there, while the sheet closes.

import { useState } from "react";

import type { DayGroups } from "@/domain/order";

import { playOptionsOpened } from "./haptics";
import { useSheet, type SheetState } from "./sheet";

export interface HeldOptions<T> {
  readonly sheet: SheetState;
  /** The item held down, as it is now on the page, or null if none was. */
  readonly held: T | null;
  /** Opens the options of `item`. */
  readonly open: (item: T) => void;
}

export function useHeldOptions<T>(
  groups: DayGroups<T> | null,
  idOf: (item: T) => string,
): HeldOptions<T> {
  const sheet = useSheet();
  const [held, setHeld] = useState<T | null>(null);
  const all = groups === null ? [] : [...groups.pending, ...groups.done];
  const heldNow =
    held === null
      ? null
      : (all.find((item) => idOf(item) === idOf(held)) ?? held);

  const open = (item: T) => {
    playOptionsOpened();
    setHeld(item);
    sheet.open();
  };

  return { sheet, held: heldNow, open };
}
