// The minimal access to the local notifications of the device that the planner needs.
// The planner only uses this interface, so its tests run without iOS.

import type { LocalDateTime } from "@/domain/times";

/** A notification that has to warn at a minute of a local day: a reminder or a digest. */
export interface PlannedNotification {
  /** Stable while it is the same reminder, or the same digest, on the same day. */
  readonly id: string;
  readonly at: LocalDateTime;
  readonly title: string;
  readonly body: string | null;
  /** The habit of a reminder, or null for a pending digest, which names several (RF-37). */
  readonly habitId: string | null;
  /** The category, which gives the notification its buttons (RF-25), or null for none. */
  readonly category: string | null;
}

/** A notification already scheduled on the device. */
export interface ScheduledNotification {
  readonly id: string;
  /** What `schedule` was given, or null if it was scheduled some other way. */
  readonly signature: string | null;
}

/** A button of a notification. iOS does not allow `:` or `-` in its identifier. */
export interface NotificationButton {
  readonly id: string;
  readonly title: string;
}

/** A set of buttons that notifications share. iOS does not allow `:` or `-` in its identifier. */
export interface NotificationCategory {
  readonly id: string;
  readonly buttons: readonly NotificationButton[];
}

export interface Notifier {
  /** The notifications scheduled on the device that have not warned yet. */
  scheduled(): Promise<ScheduledNotification[]>;
  /** Schedules a notification, replacing any other with the same identifier. */
  schedule(notification: PlannedNotification, signature: string): Promise<void>;
  /** Cancels a scheduled notification. Cancelling one that is not there changes nothing. */
  cancel(id: string): Promise<void>;
  /** Registers a category, replacing any other with the same identifier. */
  setCategory(category: NotificationCategory): Promise<void>;
}

/** What the user did with a reminder: tapped one of its buttons, or the reminder itself. */
export interface ReminderResponse {
  /** The button, or null if the reminder itself was tapped (RF-26). */
  readonly buttonId: string | null;
  /** The notification that was answered, as it was scheduled. */
  readonly notification: PlannedNotification;
}
