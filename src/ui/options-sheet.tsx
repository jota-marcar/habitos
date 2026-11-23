// The options of a habit or a weekly goal (RF-34, RF-50), in a sheet that comes up when it is
// held down in its list. Which options it shows is decided by the domain.

import type { SFSymbol } from "expo-symbols";
import { Alert } from "react-native";

import { parseAmount } from "@/domain/amounts";
import { exactAmount } from "@/domain/entries";
import type { Amounts } from "@/domain/habits";
import type { HabitOption } from "@/domain/options";

import { formatAmount, formatProgress } from "@/shared/format";
import { AMOUNT_ERROR_MESSAGES } from "./messages";
import { Sheet, SheetOption, SheetTitle, type SheetState } from "./sheet";

const ICONS: Readonly<
  Record<HabitOption, { icon: SFSymbol; fallbackIcon: string }>
> = {
  decrement: { icon: "minus", fallbackIcon: "−" },
  exact_amount: { icon: "number", fallbackIcon: "#" },
  edit: { icon: "pencil", fallbackIcon: "✎" },
  archive: { icon: "archivebox", fallbackIcon: "▣" },
  delete: { icon: "trash", fallbackIcon: "×" },
};

/** The habit or goal that was held down, as it is now on screen. */
export interface OptionsItem {
  readonly id: string;
  readonly name: string;
  readonly quantitative: boolean;
  readonly amounts: Amounts;
  readonly value: number;
  readonly options: readonly HabitOption[];
  /** What the confirmations explain. */
  readonly archiveMessage: string;
  readonly deleteMessage: string;
}

export interface OptionsActions {
  readonly decrement: (id: string) => Promise<void>;
  readonly setAmount: (id: string, amount: number) => Promise<void>;
  readonly archive: (id: string) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly edit: (id: string) => void;
}

interface Props {
  sheet: SheetState;
  testID: string;
  item: OptionsItem | null;
  actions: OptionsActions;
}

export function OptionsSheet({ sheet, testID, item, actions }: Props) {
  return (
    <Sheet sheet={sheet} closeLabel="Cerrar las opciones" testID={testID}>
      {item === null ? null : (
        <Options sheet={sheet} item={item} actions={actions} />
      )}
    </Sheet>
  );
}

function Options({
  sheet,
  item,
  actions,
}: Omit<Props, "testID" | "item"> & { item: OptionsItem }) {
  const { id, name, quantitative, amounts, value } = item;
  const unit = amounts.unit ?? "";

  // The native prompt of iOS. A rejected amount opens it again with the reason, keeping
  // what was typed.
  const askAmount = (message: string, typed: string) =>
    Alert.prompt(
      name,
      message,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          isPreferred: true,
          onPress: (text?: string) => {
            const answer = text ?? "";
            const result = exactAmount(parseAmount(answer) ?? Number.NaN);
            if (result.ok) return actions.setAmount(id, result.value);
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
    decrement: `Restar ${formatAmount(amounts.increment ?? 0)} ${unit}`.trim(),
    exact_amount: "Escribir la cantidad",
    edit: "Editar",
    archive: "Archivar",
    delete: "Eliminar",
  };

  // Subtracting leaves the options open, to do it several times in a row; the others close
  // them.
  const run: Readonly<Record<HabitOption, () => void>> = {
    decrement: () => void actions.decrement(id),
    exact_amount: () => {
      sheet.close();
      askAmount(`Cantidad en ${unit}`, formatAmount(value));
    },
    edit: () => {
      sheet.close();
      actions.edit(id);
    },
    archive: () => {
      sheet.close();
      confirm(`¿Archivar «${name}»?`, item.archiveMessage, "Archivar", () =>
        actions.archive(id),
      );
    },
    delete: () => {
      sheet.close();
      confirm(`¿Eliminar «${name}»?`, item.deleteMessage, "Eliminar", () =>
        actions.remove(id),
      );
    },
  };

  return (
    <>
      <SheetTitle
        title={name}
        detail={quantitative ? formatProgress(value, amounts) : null}
      />
      {item.options.map((option) => (
        <SheetOption
          key={option}
          {...ICONS[option]}
          label={labels[option]}
          destructive={option === "delete"}
          onPress={run[option]}
        />
      ))}
    </>
  );
}
