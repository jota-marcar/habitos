// The options of a long-term goal (RF-60), when it is held down in the page of goals.

import type { LocalDate } from "@/domain/dates";
import type { DayLongTermGoal } from "@/domain/long-term-goals";
import { longTermGoalOptions } from "@/domain/options";

import { OptionsSheet } from "./options-sheet";
import type { SheetState } from "./sheet";
import type { LongTermGoalsPage } from "./use-long-term-goals";

export function LongTermGoalOptionsSheet({
  sheet,
  dayGoal,
  day,
  today,
  page,
  onEdit,
}: {
  sheet: SheetState;
  /** The goal that was held down, as it is now on the day on screen. */
  dayGoal: DayLongTermGoal | null;
  day: LocalDate;
  today: LocalDate;
  page: LongTermGoalsPage;
  onEdit: (goalId: string) => void;
}) {
  return (
    <OptionsSheet
      sheet={sheet}
      testID="long-term-goal-options"
      item={
        dayGoal === null
          ? null
          : {
              id: dayGoal.goal.id,
              name: dayGoal.goal.name,
              quantitative: dayGoal.goal.type === "quantitative",
              amounts: dayGoal.goal,
              value: dayGoal.value,
              options: longTermGoalOptions(dayGoal.goal, day, today),
              deleteMessage:
                "Se borrará junto con todo lo apuntado. No se puede deshacer.",
            }
      }
      actions={{
        decrement: page.decrement,
        setAmount: page.setAmount,
        remove: page.remove,
        edit: onEdit,
      }}
    />
  );
}
