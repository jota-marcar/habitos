// The form to create a task (RF-40), presented as a modal. It is told the day on screen when it
// was opened, which is where the due moment starts.

import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { saveTask } from "@/data/tasks-repository";
import { parseLocalDate } from "@/domain/dates";
import { defaultTaskDue } from "@/domain/tasks";
import { localDateTimeOf } from "@/notifications/planner";
import { newId, now, today } from "@/ui/clock";
import { useDatabase } from "@/ui/database";
import { buildTask, emptyTaskForm, type TaskFormValues } from "@/ui/task-form";
import { TaskFormScreen } from "@/ui/task-form-screen";

export default function NewTask() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const db = useDatabase();
  const [initialValues] = useState(() => {
    const shown = (day === undefined ? null : parseLocalDate(day)) ?? today();
    return emptyTaskForm(defaultTaskDue(shown, localDateTimeOf(now())));
  });

  const create = async (values: TaskFormValues) => {
    const result = buildTask(values, newId(), localDateTimeOf(now()));
    if (!result.ok) return result.errors;
    await saveTask(db, result.value);
    return [];
  };

  return <TaskFormScreen initialValues={initialValues} onSubmit={create} />;
}
