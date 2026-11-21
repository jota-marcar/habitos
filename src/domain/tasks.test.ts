import { localDate } from "./dates";
import { taskOptions } from "./options";
import {
  changeTask,
  createTask,
  dayTaskOf,
  defaultTaskDue,
  dueTimesAsReminders,
  isClosed,
  isDayTask,
  isTaskOnDay,
  nextTaskDue,
  recordTask,
  tasksPendingAt,
  upcomingTaskAlerts,
  type NewTask,
  type Task,
} from "./tasks";
import { localTime, type LocalDateTime } from "./times";

const TODAY = localDate("2026-11-12");
const at = (date: string, time: string): LocalDateTime => ({
  date: localDate(date),
  time: localTime(time),
});
const NOW = at("2026-11-12", "10:00");

const NEW_TASK: NewTask = {
  name: "  Pagar  ",
  type: "boolean",
  color: "blue",
  target: null,
  unit: null,
  increment: null,
  due: at("2026-11-12", "20:00"),
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Pagar",
    type: "boolean",
    color: null,
    target: null,
    unit: null,
    increment: null,
    dueOn: TODAY,
    dueTime: localTime("20:00"),
    value: 0,
    completedOn: null,
    ...overrides,
  };
}

const quantitative = (overrides: Partial<Task> = {}) =>
  task({
    type: "quantitative",
    target: 2,
    unit: "L",
    increment: 0.5,
    ...overrides,
  });

describe("defaultTaskDue", () => {
  test("starts at 22:00 today", () => {
    expect(defaultTaskDue(TODAY, NOW)).toEqual(at("2026-11-12", "22:00"));
  });

  test("starts at 22:00 of a future day on screen", () => {
    expect(defaultTaskDue(localDate("2026-11-20"), NOW)).toEqual(
      at("2026-11-20", "22:00"),
    );
  });

  test("a past day on screen starts today", () => {
    expect(defaultTaskDue(localDate("2026-11-01"), NOW)).toEqual(
      at("2026-11-12", "22:00"),
    );
  });

  test("after 22:00, starts at the next o'clock hour", () => {
    expect(defaultTaskDue(TODAY, at("2026-11-12", "22:30"))).toEqual(
      at("2026-11-12", "23:00"),
    );
    expect(defaultTaskDue(TODAY, at("2026-11-12", "22:00"))).toEqual(
      at("2026-11-12", "23:00"),
    );
  });

  test("the next o'clock hour may be tomorrow", () => {
    expect(defaultTaskDue(TODAY, at("2026-11-12", "23:15"))).toEqual(
      at("2026-11-13", "00:00"),
    );
  });
});

describe("createTask", () => {
  test("creates a pending task with its name trimmed", () => {
    const result = createTask(NEW_TASK, "t1", NOW);

    expect(result).toEqual({
      ok: true,
      value: task({ color: "blue" }),
    });
  });

  test("trims the unit of a quantitative task", () => {
    const result = createTask(
      {
        ...NEW_TASK,
        type: "quantitative",
        target: 2,
        unit: " L ",
        increment: 1,
      },
      "t1",
      NOW,
    );

    expect(result.ok && result.value.unit).toBe("L");
  });

  test("rejects a due moment that is not in the future", () => {
    expect(createTask({ ...NEW_TASK, due: NOW }, "t1", NOW)).toEqual({
      ok: false,
      errors: ["due_passed"],
    });
  });

  test("reports every error", () => {
    const result = createTask(
      { ...NEW_TASK, name: " ", target: 1, due: at("2026-11-11", "10:00") },
      "t1",
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      errors: ["name_empty", "amounts_not_allowed", "due_passed"],
    });
  });
});

describe("isClosed", () => {
  test("is open until the due minute, and closed from it", () => {
    expect(isClosed(task(), at("2026-11-12", "19:59"))).toBe(false);
    expect(isClosed(task(), at("2026-11-12", "20:00"))).toBe(true);
    expect(isClosed(task(), at("2026-11-13", "08:00"))).toBe(true);
  });
});

describe("changeTask", () => {
  const changes = {
    name: "Pagar la luz",
    color: null,
    target: null,
    unit: null,
    increment: null,
    due: at("2026-11-14", "09:00"),
  };

  test("changes everything but the type", () => {
    expect(changeTask(task(), changes, NOW)).toEqual({
      ok: true,
      value: task({
        name: "Pagar la luz",
        dueOn: localDate("2026-11-14"),
        dueTime: localTime("09:00"),
      }),
    });
  });

  test("a closed task cannot change", () => {
    expect(changeTask(task(), changes, at("2026-11-12", "20:00"))).toEqual({
      ok: false,
      errors: ["due_passed"],
    });
  });

  test("rejects invalid changes", () => {
    expect(changeTask(task(), { ...changes, name: "" }, NOW)).toEqual({
      ok: false,
      errors: ["name_empty"],
    });
  });

  test("a higher target makes a done task pending", () => {
    const done = quantitative({ value: 2, completedOn: TODAY });
    const result = changeTask(
      done,
      { ...changes, target: 3, unit: "L", increment: 0.5 },
      NOW,
    );

    expect(result.ok && result.value.completedOn).toBeNull();
  });

  test("a lower target makes a pending task done today", () => {
    const result = changeTask(
      quantitative({ value: 1 }),
      { ...changes, target: 1, unit: "L", increment: 0.5 },
      NOW,
    );

    expect(result.ok && result.value.completedOn).toBe(TODAY);
  });

  test("a task still done keeps the day it was done", () => {
    const yesterday = localDate("2026-11-11");
    const result = changeTask(
      quantitative({ value: 2, completedOn: yesterday }),
      { ...changes, target: 1, unit: "L", increment: 0.5 },
      NOW,
    );

    expect(result.ok && result.value.completedOn).toBe(yesterday);
  });
});

describe("recordTask", () => {
  test("a task done before its due day counts as done today", () => {
    const later = task({ dueOn: localDate("2026-11-20") });

    expect(recordTask(later, 1, NOW)).toEqual({
      ...later,
      value: 1,
      completedOn: TODAY,
    });
  });

  test("unmarking it makes it pending again", () => {
    expect(recordTask(task({ value: 1, completedOn: TODAY }), 0, NOW)).toEqual(
      task(),
    );
  });

  test("a quantitative task is done when it reaches its target", () => {
    expect(recordTask(quantitative(), 1.5, NOW)?.completedOn).toBeNull();
    expect(recordTask(quantitative(), 2, NOW)?.completedOn).toBe(TODAY);
  });

  test("a closed task cannot be recorded", () => {
    expect(recordTask(task(), 1, at("2026-11-12", "20:00"))).toBeNull();
  });
});

describe("isTaskOnDay", () => {
  test("a pending task is on its due day only", () => {
    expect(isTaskOnDay(task(), TODAY)).toBe(true);
    expect(isTaskOnDay(task(), localDate("2026-11-13"))).toBe(false);
  });

  test("a done task is on the day it was done", () => {
    const done = task({
      dueOn: localDate("2026-11-20"),
      value: 1,
      completedOn: TODAY,
    });

    expect(isTaskOnDay(done, TODAY)).toBe(true);
    expect(isTaskOnDay(done, localDate("2026-11-20"))).toBe(false);
  });
});

describe("dayTaskOf", () => {
  test("a pending task is a row in the pending group", () => {
    const row = dayTaskOf(quantitative({ value: 1 }), NOW);

    expect(isDayTask(row)).toBe(true);
    expect(row).toMatchObject({
      habit: { id: "t1", name: "Pagar", type: "quantitative" },
      version: { target: 2, unit: "L", increment: 0.5 },
      value: 1,
      done: false,
      missed: false,
      closed: false,
    });
  });

  test("a missed task goes with the done ones", () => {
    expect(dayTaskOf(task(), at("2026-11-12", "20:00"))).toMatchObject({
      done: true,
      missed: true,
      closed: true,
    });
  });

  test("a task done in time is not missed once it closes", () => {
    const done = task({ value: 1, completedOn: TODAY });

    expect(dayTaskOf(done, at("2026-11-13", "08:00"))).toMatchObject({
      done: true,
      missed: false,
      closed: true,
    });
  });

  test("its options depend on whether it is closed", () => {
    expect(taskOptions(dayTaskOf(task(), NOW))).toEqual(["edit", "delete"]);
    expect(taskOptions(dayTaskOf(quantitative(), NOW))).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "delete",
    ]);
    expect(taskOptions(dayTaskOf(task(), at("2026-11-13", "08:00")))).toEqual([
      "delete",
    ]);
  });
});

test("dueTimesAsReminders gives each task its due time", () => {
  expect(dueTimesAsReminders([task()])).toEqual([
    { id: "t1", habitId: "t1", time: "20:00" },
  ]);
});

describe("tasksPendingAt and nextTaskDue", () => {
  const soon = task({ id: "soon", dueTime: localTime("12:00") });
  const late = task({ id: "late", dueOn: localDate("2026-11-14") });
  const sameAsLate = task({ id: "same", dueOn: localDate("2026-11-14") });
  const done = task({
    id: "done",
    dueTime: localTime("11:00"),
    value: 1,
    completedOn: TODAY,
  });
  const past = task({ id: "past", dueOn: localDate("2026-11-11") });

  test("are the tasks not done and not due, the first due going first", () => {
    const pending = tasksPendingAt([late, done, past, sameAsLate, soon], NOW);

    expect(pending.map((t) => t.id)).toEqual(["soon", "late", "same"]);
  });

  test("the next due moment is the closest", () => {
    expect(nextTaskDue([late, soon], NOW)).toEqual(at("2026-11-12", "12:00"));
  });

  test("there is none without pending tasks", () => {
    expect(nextTaskDue([done, past], NOW)).toBeNull();
  });
});

describe("upcomingTaskAlerts", () => {
  const moments = (tasks: Task[], now: LocalDateTime) =>
    upcomingTaskAlerts(tasks, now).map(({ moment, at: { date, time } }) => [
      moment,
      date,
      time,
    ]);

  test("warns 2 hours and 1 hour before, and at the due moment", () => {
    expect(moments([task()], NOW)).toEqual([
      ["2h", "2026-11-12", "18:00"],
      ["1h", "2026-11-12", "19:00"],
      ["due", "2026-11-12", "20:00"],
    ]);
  });

  test("a warning may fall on the day before", () => {
    const early = task({
      dueOn: localDate("2026-11-13"),
      dueTime: localTime("00:30"),
    });

    expect(moments([early], NOW)).toEqual([
      ["2h", "2026-11-12", "22:30"],
      ["1h", "2026-11-12", "23:30"],
      ["due", "2026-11-13", "00:30"],
    ]);
  });

  test("leaves out the warnings whose time has passed", () => {
    expect(moments([task()], at("2026-11-12", "18:00"))).toEqual([
      ["1h", "2026-11-12", "19:00"],
      ["due", "2026-11-12", "20:00"],
    ]);
  });

  test("a task done or closed has no warnings", () => {
    const done = task({ value: 1, completedOn: TODAY });

    expect(moments([done], NOW)).toEqual([]);
    expect(moments([task()], at("2026-11-12", "20:00"))).toEqual([]);
  });
});
