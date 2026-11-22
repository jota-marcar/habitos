// The options of a habit (RF-34), when it is held down in the day view.

import type { DayHabit } from "@/domain/day";
import { habitOptions } from "@/domain/options";

import { OptionsSheet } from "./options-sheet";
import type { SheetState } from "./sheet";
import type { Day } from "./use-day";

export function HabitOptionsSheet({
  sheet,
  dayHabit,
  day,
  onEdit,
}: {
  sheet: SheetState;
  /** The habit that was held down, as it is now on the day on screen. */
  dayHabit: DayHabit | null;
  day: Day;
  onEdit: (habitId: string) => void;
}) {
  return (
    <OptionsSheet
      sheet={sheet}
      testID="habit-options"
      item={
        dayHabit === null
          ? null
          : {
              id: dayHabit.habit.id,
              name: dayHabit.habit.name,
              quantitative: dayHabit.habit.type === "quantitative",
              amounts: dayHabit.version,
              value: dayHabit.value,
              options: habitOptions(dayHabit.habit, day.date, day.today),
              archiveMessage:
                "Dejará de aparecer en los próximos días y de recordarse. Su historial se conserva. No se puede deshacer: para retomarlo habrá que crear uno nuevo.",
              deleteMessage:
                "Se borrará de todos los días, también de los pasados, junto con todo su historial. No se puede deshacer.",
            }
      }
      actions={{
        decrement: day.decrement,
        setAmount: day.setAmount,
        archive: day.archive,
        remove: day.remove,
        edit: onEdit,
      }}
    />
  );
}
