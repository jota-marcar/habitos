import { syncStatusText } from "./sync-status-text";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = 1_000 * DAY;

const copiedAgo = (ms: number) =>
  syncStatusText({ kind: "copied", at: NOW - ms }, NOW);

describe("syncStatusText", () => {
  test("says nothing while there is nothing to say", () => {
    expect(syncStatusText({ kind: "none" }, NOW)).toBeNull();
  });

  test("says how long ago it was copied", () => {
    expect(copiedAgo(30 * 1000)).toBe("Copiado en tu cuenta ahora mismo");
    expect(copiedAgo(5 * MINUTE)).toBe("Copiado en tu cuenta hace 5 min");
    expect(copiedAgo(59 * MINUTE)).toBe("Copiado en tu cuenta hace 59 min");
    expect(copiedAgo(HOUR)).toBe("Copiado en tu cuenta hace 1 h");
    expect(copiedAgo(23 * HOUR)).toBe("Copiado en tu cuenta hace 23 h");
    expect(copiedAgo(DAY)).toBe("Copiado en tu cuenta hace 1 día");
    expect(copiedAgo(4 * DAY)).toBe("Copiado en tu cuenta hace 4 días");
  });

  test("says when there are changes to copy", () => {
    expect(syncStatusText({ kind: "pending" }, NOW)).toBe(
      "Hay cambios pendientes de copiar en tu cuenta",
    );
  });

  test("says for how long they have been stuck, and what to check", () => {
    expect(syncStatusText({ kind: "stuck", days: 3 }, NOW)).toBe(
      "Sin copiar en tu cuenta desde hace 3 días. Comprueba la conexión.",
    );
  });
});
