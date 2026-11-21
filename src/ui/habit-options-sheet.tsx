// The options of a habit (RF-34), in a sheet that comes up when the habit is held down in
// the day view. Which options it shows is decided by the domain.

import type { SFSymbol } from "expo-symbols";
import { Alert } from "react-native";

import { parseAmount } from "@/domain/amounts";
import { exactAmount } from "@/domain/entries";
import { habitOptions, taskOptions, type HabitOption } from "@/domain/options";
import { isDayTask, type DayItem } from "@/domain/tasks";

import { formatAmount, formatProgress } from "./format";
import { AMOUNT_ERROR_MESSAGES } from "./messages";
import { Sheet, SheetOption, SheetTitle, type SheetState } from "./sheet";
import type { Day } from "./use-day";

const ICONS: Readonly<
  Record<HabitOption, { icon: SFSymbol; fallbackIcon: string }>
> = {
  decrement: { icon: "minus", fallbackIcon: "−" },
  exact_amount: { icon: "number", fallbackIcon: "#" },
  edit: { icon: "pencil", fallbackIcon: "✎" },
  archive: { icon: "archivebox", fallbackIcon: "▣" },
  delete: { icon: "trash", fallbackIcon: "×" },
};

interface Props {
  sheet: SheetState;
  /** The habit or task that was held down, as it is now on the day on screen. */
  dayHabit: DayItem | null;
  day: Day;
  onEdit: (habitId: string) => void;
}

export function HabitOptionsSheet(props: Props) {
  const { sheet, dayHabit } = props;
  return (
    <Sheet
      sheet={sheet}
      closeLabel="Cerrar las opciones"
      testID="habit-options"
    >
      {dayHabit === null ? null : <Options {...props} dayHabit={dayHabit} />}
    </Sheet>
  );
}

function Options({
  sheet,
  dayHabit: item,
  day,
  onEdit,
}: Props & { dayHabit: DayItem }) {
  const { habit, version, value } = item;
  const isTask = isDayTask(item);
  const quantitative = habit.type === "quantitative";
  const unit = version.unit ?? "";

  // The native prompt of iOS. A rejected amount opens it again with the reason, keeping
  // what was typed.
  const askAmount = (message: string, typed: string) =>
    Alert.prompt(
      habit.name,
      message,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          isPreferred: true,
          onPress: (text?: string) => {
            const answer = text ?? "";
            const result = exactAmount(parseAmount(answer) ?? Number.NaN);
            if (result.ok) return day.setAmount(habit.id, result.value);
            askAmount(AMOUNT_ERROR_MESSAGES[result.errors[0]], answer);
          },
        },
      ],
      "plain-text",
      typed,
      "decimal-pad",
    );

  const confirm = (
    title: string,
    message: string,
    action: string,
    onConfirm: () => Promise<void>,
  ) =>
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ]);

  const labels: Readonly<Record<HabitOption, string>> = {
    decrement: `Restar ${formatAmount(version.increment ?? 0)} ${unit}`.trim(),
    exact_amount: "Escribir la cantidad",
    edit: "Editar",
    archive: "Archivar",
    delete: "Eliminar",
  };

  // Subtracting leaves the options open, to do it several times in a row; the others close
  // them.
  const actions: Readonly<Record<HabitOption, () => void>> = {
    decrement: () => void day.decrement(habit.id),
    exact_amount: () => {
      sheet.close();
      askAmount(`Cantidad en ${unit}`, formatAmount(value));
    },
    edit: () => {
      sheet.close();
      onEdit(habit.id);
    },
    archive: () => {
      sheet.close();
      confirm(
        `¿Archivar «${habit.name}»?`,
        "Dejará de aparecer en los próximos días y de recordarse. Su historial se conserva. No se puede deshacer: para retomarlo habrá que crear uno nuevo.",
        "Archivar",
        () => day.archive(habit.id),
      );
    },
    delete: () => {
      sheet.close();
      confirm(
        `¿Eliminar «${habit.name}»?`,
        isTask
          ? "La tarea se borrará para siempre. No se puede deshacer."
          : "Se borrará de todos los días, también de los pasados, junto con todo su historial. No se puede deshacer.",
        "Eliminar",
        () => day.remove(habit.id),
      );
    },
  };

  return (
    <>
      <SheetTitle
        title={habit.name}
        detail={quantitative ? formatProgress(value, version) : null}
      />
      {(isTask
        ? taskOptions(item)
        : habitOptions(habit, day.date, day.today)
      ).map((option) => (
        <SheetOption
          key={option}
          {...ICONS[option]}
          label={labels[option]}
          destructive={option === "delete"}
          onPress={actions[option]}
        />
      ))}
    </>
  );
}
