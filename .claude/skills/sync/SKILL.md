---
name: sync
description: Pone al día el repositorio local después de un merge. Actualiza main y borra las ramas locales cuyo Pull Request ya está fusionado. Úsala cuando el usuario diga que ha hecho el merge de un PR, o antes de crear una rama nueva.
---

# Sincronizar tras un merge

## 1. Ejecutar

```bash
node .claude/skills/sync/sync.mjs
```

El script:

- Se detiene sin cambiar nada si hay cambios sin commit.
- Cambia a `main` y la actualiza con `--ff-only`.
- Borra las ramas locales cuyo Pull Request está fusionado **y** cuya rama remota ya no existe. Pregunta a GitHub porque un squash merge no deja rastro en git.

## 2. Interpretar el resultado

- **BLOCKER:** explica al usuario qué cambios hay sin commit. No los descartes ni hagas commit por tu cuenta.
- **Kept branches:** menciónalas con su motivo. No las borres a mano: si el usuario quiere borrarlas, que lo diga.

## 3. Informar

Resume en una o dos líneas qué ha entrado en `main` y qué ramas se han borrado. Después continúa con lo que el usuario haya pedido.
