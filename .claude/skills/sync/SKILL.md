---
name: sync
description: Pone al día el repositorio local después de un merge. Actualiza main, rebasa sobre main las ramas apiladas encima del PR fusionado y borra las ramas locales cuyo Pull Request ya está fusionado. Úsala cuando el usuario diga que ha hecho el merge de un PR, o antes de crear una rama nueva.
---

# Sincronizar tras un merge

## 1. Ejecutar

```bash
node .claude/skills/sync/sync.mjs
```

El script:

- Se detiene sin cambiar nada si hay cambios sin commit.
- Cambia a `main` y la actualiza con `--ff-only`.
- Pone al día las ramas apiladas: toda rama local sin fusionar que contenga la cabeza de un PR ya fusionado se rebasa con `git rebase --onto origin/main <cabeza>`, de modo que solo se reaplican sus propios commits. Si estaba apilada sobre otra rama que acaba de rebasarse, la sigue. Después pasa `npm run verify` y, si pasa y la rama estaba subida y al día, la sube con `--force-with-lease`. Si hay conflictos, aborta el rebase y deja la rama como estaba.
- Borra las ramas locales cuyo Pull Request está fusionado, cuya rama remota ya no existe **y** que no tienen commits fuera de ese PR. Pregunta a GitHub porque un squash merge no deja rastro en git.

## 2. Interpretar el resultado

- **BLOCKER:** explica al usuario qué cambios hay sin commit. No los descartes ni hagas commit por tu cuenta.
- **Restacked branches:** ramas puestas al día; las subidas actualizan su PR y relanzan la CI.
- **RESTACK PROBLEMS:** explica cada una al usuario. Conflicto: el PR de abajo cambió después de crear la rama y hay que resolverlo a mano. `verify` falla: la rama está rebasada en local pero sin subir; investiga el error antes de subirla. Rama distinta de la remota: tenía commits sin subir o la remota tenía otros; no fuerces nada sin preguntar.
- **Kept branches:** menciónalas con su motivo. Si dice que tiene commits fuera de su Pull Request, avisa al usuario: es trabajo que no ha llegado a `main`. No las borres a mano: si el usuario quiere borrarlas, que lo diga.

## 3. Informar

Resume en una o dos líneas qué ha entrado en `main`, qué ramas se han puesto al día y cuáles se han borrado. Después continúa con lo que el usuario haya pedido.
