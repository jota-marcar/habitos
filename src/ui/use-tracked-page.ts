// What every page of the carousel does with its list, whatever it tracks: habits of a day, goals
// of a week or long-term goals. It reads the database when a period is shown and again after
// each change it makes (ADR-0010), writes the changes one after another, and records the taps.
//
// The groups (pending and done) and their order are computed when the period is shown, and then
// kept while it stays on screen, so the list does not move under the finger (RF-12). Only after a
// pause in the taps do the items that were done or undone move to their group, where the screen
// animates them.

import { useCallback, useEffect, useRef, useState } from "react";

import type { LocalDate } from "@/domain/dates";
import { isDone } from "@/domain/day";
import {
  canRecordOn,
  decremented,
  incremented,
  toggled,
} from "@/domain/entries";
import { keepGroups, type DayGroups } from "@/domain/order";
import type { Amounts, TrackedType } from "@/domain/tracked";
import { refreshReminders } from "@/notifications/reminders";
import { onSyncedChanges, syncSoon } from "@/sync/app-sync";

import { today } from "@/shared/clock";
import { useDatabase } from "./database";
import { playRecorded, recordedFeedback } from "./haptics";
import { reportWriteFailure } from "./write-failure";

/**
 * How long the list waits after the last change made on it before moving the items that were
 * done or undone to their group (RF-12): enough to see the item marked, and to tap it again
 * without it going away.
 */
export const SETTLE_DELAY_MS = 600;

/** What a tap needs to know of an item to record it. */
export interface Progress {
  readonly type: TrackedType;
  /** The amounts in force in the period on screen. */
  readonly amounts: Amounts;
  /** What is recorded in the period: 0 if there is nothing. */
  readonly value: number;
  readonly done: boolean;
}

/** What a page reads of a period. */
export interface PageRead<T> {
  readonly items: readonly T[];
  /** Whether the page has anything at all, in this period or not. */
  readonly hasAny: boolean;
  /** The items in their groups and order, as they are when the period is shown. */
  readonly group: () => DayGroups<T>;
  /** The groups after a pause in the taps: the items that changed move to theirs. */
  readonly settle: (order: DayGroups<string>) => DayGroups<string>;
  /** Saves what is recorded of `item` in the period. */
  readonly save: (item: T, value: number) => Promise<void>;
}

/** What a page tracks. It must not change between renders: build it with `useMemo`. */
export interface PageSource<T> {
  readonly idOf: (item: T) => string;
  readonly progressOf: (item: T) => Progress;
  /** Reads the period that starts on `period`: a day, or the Monday of a week. */
  readonly read: (period: LocalDate) => Promise<PageRead<T>>;
}

export interface TrackedPage<T> {
  /** The items in the groups and order of the screen, or null while they are being read. */
  readonly items: DayGroups<T> | null;
  readonly hasAny: boolean;
  /** Shows a period, which groups and sorts its items again. */
  readonly show: (period: LocalDate) => void;
  /** Reads the period on screen again without sorting it, after a change made elsewhere. */
  readonly reload: () => void;
  /** Makes a change after the ones before it and reads the period again, without sorting it. */
  readonly change: (make: () => Promise<void>) => Promise<void>;
  /** Marks or unmarks a boolean item, or adds the increment to a quantitative one. */
  readonly record: (id: string) => Promise<void>;
  /** Subtracts the increment from a quantitative item. */
  readonly decrement: (id: string) => Promise<void>;
  /** Replaces what a quantitative item has accumulated with an exact amount. */
  readonly setAmount: (id: string, amount: number) => Promise<void>;
}

export function useTrackedPage<T>(
  source: PageSource<T>,
  period: LocalDate,
): TrackedPage<T> {
  const db = useDatabase();
  const [items, setItems] = useState<DayGroups<T> | null>(null);
  const [hasAny, setHasAny] = useState(false);
  // The period on screen, for what happens outside a render.
  const shown = useRef(period);
  // The groups computed when the period was shown, as ids.
  const order = useRef<DayGroups<string> | null>(null);
  // Changes are written one after another, so that quick taps do not overwrite each other.
  const writes = useRef<Promise<void>>(Promise.resolve());
  // Discards the reads that finish after a newer one has started.
  const lastRead = useRef(0);
  // A read that had to sort, until one finishes: a newer read takes over if it is discarded.
  const sortDue = useRef(false);
  // The pause after the last change, and whether it is over: the next read then moves the
  // items to their group.
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settleDue = useRef(false);

  const holdSettling = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleDue.current = false;
  }, []);

  const load = useCallback(
    async (shownPeriod: LocalDate, sort: boolean) => {
      const read = ++lastRead.current;
      if (sort) sortDue.current = true;
      const page = await source.read(shownPeriod);
      if (read !== lastRead.current) return;

      if (sortDue.current || order.current === null) {
        sortDue.current = false;
        const grouped = page.group();
        order.current = {
          pending: grouped.pending.map(source.idOf),
          done: grouped.done.map(source.idOf),
        };
        setItems(grouped);
      } else {
        if (settleDue.current) {
          order.current = page.settle(order.current);
          settleDue.current = false;
        }
        setItems(keepGroups(page.items, source.idOf, order.current));
      }
      setHasAny(page.hasAny);
    },
    [source],
  );

  const show = useCallback(
    (next: LocalDate) => {
      holdSettling();
      shown.current = next;
      void load(next, true);
    },
    [holdSettling, load],
  );

  const reload = useCallback(() => void load(shown.current, false), [load]);

  // A pending pause does not outlive the screen.
  useEffect(() => holdSettling, [holdSettling]);

  // A synchronization may bring what changed on another device (RF-05).
  useEffect(() => onSyncedChanges(reload), [reload]);

  const change = useCallback(
    (make: () => Promise<void>): Promise<void> => {
      const write = writes.current.then(async () => {
        try {
          await make();
        } catch (error) {
          reportWriteFailure(error);
          throw error;
        }
        // What is recorded decides which reminders and digests are still due (RF-24, RF-49),
        // and archiving or deleting takes them all away.
        void refreshReminders(db);
        syncSoon(db);
        await load(shown.current, false);
      });
      // A failed write is reported to the caller but does not block the next ones.
      writes.current = write.catch(() => undefined);
      return write;
    },
    [db, load],
  );

  // Records the value that `next` gives for an item of the period on screen. Each change holds
  // the items in their places and starts the pause again, once it is written; when the pause is
  // over, the period is read again and they move to their group. A tap on the list
  // (`withHaptics`) is felt as soon as its value is known, before it is written.
  const setValue = useCallback(
    (
      id: string,
      next: (progress: Progress) => number,
      withHaptics = false,
    ): Promise<void> => {
      holdSettling();
      const write = change(async () => {
        if (!canRecordOn(period, today())) return;
        const page = await source.read(period);
        const item = page.items.find((i) => source.idOf(i) === id);
        if (item === undefined) return;

        const progress = source.progressOf(item);
        const value = next(progress);
        if (withHaptics) {
          const { type, amounts, done } = progress;
          playRecorded(recordedFeedback(done, isDone(type, amounts, value)));
        }
        await page.save(item, value);
      });
      void write.then(() => {
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleDue.current = true;
          void load(shown.current, false);
        }, SETTLE_DELAY_MS);
      }, holdSettling);
      return write;
    },
    [source, period, change, holdSettling, load],
  );

  const record = useCallback(
    (id: string) =>
      setValue(
        id,
        ({ type, amounts, value }) =>
          type === "boolean"
            ? toggled(value)
            : incremented(value, amounts.increment ?? 0),
        true,
      ),
    [setValue],
  );

  const decrement = useCallback(
    (id: string) =>
      setValue(id, ({ amounts, value }) =>
        decremented(value, amounts.increment ?? 0),
      ),
    [setValue],
  );

  const setAmount = useCallback(
    (id: string, amount: number) => setValue(id, () => amount),
    [setValue],
  );

  return {
    items,
    hasAny,
    show,
    reload,
    change,
    record,
    decrement,
    setAmount,
  };
}
