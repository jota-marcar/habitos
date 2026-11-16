// A notifier for the tests: it keeps in memory what is scheduled and logs what it is asked.

import type {
  NotificationCategory,
  Notifier,
  PlannedNotification,
  ScheduledNotification,
} from "../notifier";

export function fakeNotifier(initial: ScheduledNotification[] = []) {
  const scheduled = new Map(initial.map((n) => [n.id, n.signature]));
  const notifications = new Map<string, PlannedNotification>();
  const categories = new Map<string, NotificationCategory>();
  const log: string[] = [];

  const notifier: Notifier = {
    scheduled: async () =>
      [...scheduled].map(([id, signature]) => ({ id, signature })),
    schedule: async (notification, signature) => {
      log.push(`schedule ${notification.id}`);
      scheduled.set(notification.id, signature);
      notifications.set(notification.id, notification);
    },
    cancel: async (id) => {
      log.push(`cancel ${id}`);
      scheduled.delete(id);
      notifications.delete(id);
    },
    setCategory: async (category) => {
      log.push(`category ${category.id}`);
      categories.set(category.id, category);
    },
  };
  return { notifier, scheduled, notifications, categories, log };
}
