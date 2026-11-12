// The messages the user sees for the error codes of the domain (docs/arquitectura.md).

import {
  MAX_NAME_LENGTH,
  MAX_UNIT_LENGTH,
  type HabitError,
} from "@/domain/habits";
import type { ReminderError } from "@/domain/reminders";

export const HABIT_ERROR_MESSAGES: Readonly<Record<HabitError, string>> = {
  name_empty: "Escribe un nombre.",
  name_too_long: `El nombre admite ${MAX_NAME_LENGTH} caracteres como máximo.`,
  scheduled_days_invalid: "Los días elegidos no son válidos.",
  scheduled_days_empty: "Elige al menos un día.",
  amounts_not_allowed: "Un hábito de sí o no no tiene meta.",
  target_not_positive: "La meta debe ser un número mayor que 0.",
  target_too_precise: "La meta admite 2 decimales como máximo.",
  unit_empty: "Escribe una unidad.",
  unit_too_long: `La unidad admite ${MAX_UNIT_LENGTH} caracteres como máximo.`,
  increment_not_positive: "El incremento debe ser un número mayor que 0.",
  increment_too_precise: "El incremento admite 2 decimales como máximo.",
};

export const REMINDER_ERROR_MESSAGES: Readonly<Record<ReminderError, string>> =
  {
    time_duplicated: "Ya hay un recordatorio a esa hora.",
  };
