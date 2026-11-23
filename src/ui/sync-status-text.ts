// What the state of the copy says to the user (RF-53).

import type { SyncStatus } from "@/domain/sync-status";

const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function timeAgo(ms: number): string {
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  if (minutes < 1) return "ahora mismo";
  if (minutes < MINUTES_PER_HOUR) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `hace ${hours} h`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/** The line of the settings, or null if there is nothing to say yet. */
export function syncStatusText(status: SyncStatus, now: number): string | null {
  switch (status.kind) {
    case "none":
      return null;
    case "copied":
      return `Copiado en tu cuenta ${timeAgo(now - status.at)}`;
    case "pending":
      return "Hay cambios pendientes de copiar en tu cuenta";
    case "stuck":
      return `Sin copiar en tu cuenta desde hace ${status.days} días. Comprueba la conexión.`;
  }
}
