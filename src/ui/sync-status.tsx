// Shows the state of the copy in the account (RF-53): a line in the settings and, only when
// changes have been failing to reach the account for days, a line on the main screen.

import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";

import { hasPendingChanges } from "@/data/account-data";
import { syncStatusOf, type SyncStatus } from "@/domain/sync-status";
import { onSyncFinished } from "@/sync/app-sync";
import { readSyncRecord } from "@/sync/sync-record";

import { now } from "@/shared/clock";
import { useDatabase } from "./database";
import { syncStatusText } from "./sync-status-text";
import { fontSize, spacing, useColors } from "./theme";

function useSyncStatus(): SyncStatus | null {
  const db = useDatabase();
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let active = true;
    const read = async () => {
      const [record, pending] = await Promise.all([
        readSyncRecord(),
        hasPendingChanges(db),
      ]);
      if (active) setStatus(syncStatusOf(record, pending, now().getTime()));
    };
    // Not being able to read it only leaves the line as it was.
    const refresh = () => void read().catch(() => undefined);

    refresh();
    const stop = onSyncFinished(refresh);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      active = false;
      stop();
      subscription.remove();
    };
  }, [db]);

  return status;
}

/** The line of the settings. */
export function SyncStatusLine() {
  const colors = useColors();
  const status = useSyncStatus();
  const text = status === null ? null : syncStatusText(status, now().getTime());
  if (text === null) return null;
  return (
    <Text
      testID="sync-status"
      style={[
        styles.line,
        {
          color:
            status?.kind === "stuck" ? colors.danger : colors.textSecondary,
        },
      ]}
    >
      {text}
    </Text>
  );
}

/** The line of the main screen, only while changes are stuck. */
export function SyncWarning() {
  const colors = useColors();
  const status = useSyncStatus();
  if (status?.kind !== "stuck") return null;
  return (
    <Text
      testID="sync-warning"
      style={[styles.warning, { color: colors.danger }]}
    >
      {syncStatusText(status, now().getTime())}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: fontSize.caption },
  warning: {
    fontSize: fontSize.caption,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md + spacing.md,
  },
});
