// The options of a weekly goal (RF-50), when it is held down in the weekly page.

import type { LocalDate } from "@/domain/dates";
import { weeklyGoalOptions } from "@/domain/options";
import type { WeekGoal } from "@/domain/weekly-goals";
import type { Week } from "@/domain/weeks";

import { OptionsSheet } from "./options-sheet";
import type { SheetState } from "./sheet";
import type { WeekPage } from "./use-week";

export function WeeklyGoalOptionsSheet({
  sheet,
  weekGoal,
  week,
  today,
  page,
  onEdit,
}: {
  sheet: SheetState;
  /** The goal that was held down, as it is now in the week on screen. */
  weekGoal: WeekGoal | null;
  week: Week;
  today: LocalDate;
  page: WeekPage;
  onEdit: (goalId: string) => void;
}) {
  return (
    <OptionsSheet
      sheet={sheet}
      testID="weekly-goal-options"
      item={
        weekGoal === null
          ? null
          : {
              id: weekGoal.goal.id,
              name: weekGoal.goal.name,
              quantitative: weekGoal.goal.type === "quantitative",
              amounts: weekGoal.version,
              value: weekGoal.value,
              options: weeklyGoalOptions(weekGoal.goal, week, today),
              archiveMessage:
                "Dejará de aparecer en las próximas semanas. Lo conseguido se conserva. No se puede deshacer: para retomarlo habrá que crear uno nuevo.",
              deleteMessage:
                "Se borrará de todas las semanas, también de las pasadas, junto con todo lo apuntado. No se puede deshacer.",
            }
      }
      actions={{
        decrement: page.decrement,
        setAmount: page.setAmount,
        archive: page.archive,
        remove: page.remove,
        edit: onEdit,
      }}
    />
  );
}
