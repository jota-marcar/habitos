// The form to edit a task (RF-41), presented as a modal. It is opened from the options of the
// task (RF-46), until its due moment arrives.

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { listTasks, saveTask } from "@/data/tasks-repository";
import { isClosed, type Task } from "@/domain/tasks";
import { localDateTimeOf } from "@/notifications/planner";
import { now } from "@/ui/clock";
import { useDatabase } from "@/ui/database";
import {
  buildTaskChanges,
  taskFormOf,
  type TaskFormValues,
} from "@/ui/task-form";
import { TaskFormScreen } from "@/ui/task-form-screen";

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    let left = false;
    const read = async () => {
      const found = (await listTasks(db)).find((t) => t.id === id);
      if (left) return;
      // There is nothing to edit if the task is gone or closed (RF-44).
      if (found === undefined || isClosed(found, localDateTimeOf(now()))) {
        router.back();
        return;
      }
      setTask(found);
    };
    void read();
    return () => {
      left = true;
    };
  }, [db, id, router]);

  if (task === null) return null;

  const save = async (values: TaskFormValues) => {
    const result = buildTaskChanges(task, values, localDateTimeOf(now()));
    if (!result.ok) return result.errors;
    await saveTask(db, result.value);
    return [];
  };

  return (
    <TaskFormScreen initialValues={taskFormOf(task)} editing onSubmit={save} />
  );
}
