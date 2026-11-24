# Ecosistema de desarrollo con IA

Cómo está configurado Claude Code en este repositorio: qué piezas hay, para qué sirve cada una y cuándo se añade una nueva.

## Principio: crecer a partir de la fricción

Las piezas se añaden cuando resuelven un problema real, no por adelantado:

- **Regla de tres:** la primera vez algo se hace a mano; la segunda, se observa; la tercera, se automatiza.
- **Lo determinista va en hooks.** Si una regla debe cumplirse siempre, no se confía en que el modelo la recuerde: se impone con un hook.
- **Cada pieza nueva entra por Pull Request** y se registra en este documento.

## Metodología de trabajo

Cómo se usa Claude Code en este proyecto, más allá de las piezas:

- **Dos fases.** Primero se debate (opciones, recomendación y pasos) y, con el visto bueno, se desarrolla sin interrupciones hasta el Pull Request. Está en [CLAUDE.md](../CLAUDE.md#forma-de-trabajar).
- **Una sesión por tarea o Pull Request.** Cada mensaje de una sesión vuelve a enviar toda la conversación, así que una sesión larga es lenta y cara, y al compactarse pierde detalle. Al cambiar de tarea se empieza una sesión nueva.
- **El contexto vive en el repositorio.** Lo que haya que recordar va en la especificación, la arquitectura, los ADR o la memoria de Claude, no en la conversación. Una sesión nueva debe poder continuar leyendo solo eso.
- **Lo voluminoso, aparte.** Registros de build, documentación larga o búsquedas amplias se delegan en un subagente de exploración, que devuelve solo la conclusión. El contexto principal queda para decidir y escribir.
- **Modelo según la tarea.** El modelo más capaz, para debatir y diseñar; uno más barato basta para tareas mecánicas.
- **Regla de tres aplicada.** Lo que se repite tres veces se convierte en script, skill, hook o test. Así nacieron `/sync`, la espera de la CI en `/pr`, la aceptación de ADR y el test de `app.json`.

## Tipos de pieza

| Pieza | Qué es | Cuándo usarla |
|-------|--------|---------------|
| `CLAUDE.md` | Instrucciones que Claude carga en cada sesión | Contexto y reglas que hacen falta siempre |
| Reglas por ruta (`.claude/rules/`) | Instrucciones que solo se cargan al tocar ciertos ficheros | Reglas de una capa o de un área concreta |
| Permisos (`.claude/settings.json`) | Qué puede hacer Claude sin preguntar, qué debe preguntar y qué tiene prohibido | Reducir confirmaciones en lo seguro y forzarlas en lo delicado |
| Hooks (`.claude/settings.json` y `.claude/hooks/`) | Scripts que se ejecutan automáticamente en ciertos eventos | Reglas que deben cumplirse siempre |
| Skills (`.claude/skills/`) | Flujos de trabajo empaquetados que se invocan con `/nombre` | Procesos repetitivos con pasos fijos |
| Subagentes (`.claude/agents/`) | Agentes especializados con su propio contexto e instrucciones | Tareas acotadas que se benefician de un enfoque dedicado (revisión, tests) |
| Servidores MCP (`.mcp.json`) | Conexiones a sistemas externos | Cuando un sistema externo no es accesible bien desde la terminal |

## Piezas actuales

### `CLAUDE.md`

Contexto del proyecto, forma de trabajar, comandos y las reglas que hacen falta en cualquier tarea, también las que se pueden incumplir sin tocar un fichero (no publicar, no ejecutar nada contra la nube). Ver [CLAUDE.md](../CLAUDE.md).

### Reglas por ruta

[.claude/rules/](../.claude/rules/). Claude las carga al leer o editar un fichero de su ruta, así que no ocupan contexto en las demás tareas: [dominio](../.claude/rules/dominio.md), [datos y sincronización](../.claude/rules/datos-y-sincronizacion.md) y [Supabase](../.claude/rules/supabase.md). Una regla que deba cumplirse siempre va en `CLAUDE.md`.

### Permisos

Definidos en [.claude/settings.json](../.claude/settings.json):

- **Permitido sin preguntar:** comandos de git de consulta y de trabajo local (`status`, `log`, `diff`, `switch`, `add`, `commit`, `pull`, `merge`…), `git push` y crear o editar un Pull Request con `gh`, consultas de `gh` (`pr view`, `pr checks`, `run view`…), consultas de `npm` y de `eas` (`npm ls`, `npm view`, `eas whoami`, `eas build:view`…), los scripts de las skills y las herramientas de verificación del proyecto (`npm run …`, `npm test`, `npx expo lint`, `npx expo-doctor`, `npx expo config`, `npx tsc`, `npx jest`, `npx prettier`, `npx eslint`). Subir y abrir el PR no pide confirmación porque el usuario revisa cada PR antes de fusionarlo, y `main` la protegen el hook y GitHub.
- **Siempre pregunta:** los push que reescriben o borran (`--force`, `-f`, `+rama`, `--delete`, `:rama`, `--all`, `--mirror`), `gh pr merge`, `git reset --hard` y `git clean`; los cambios de dependencias (`npm install`, `npm uninstall`, `npx expo install`), porque ejecutan scripts de paquetes de terceros; los builds de EAS (`eas build`, `npm run build:dev`, `npm run build:prod`, `node scripts/build.mjs`), porque son limitados; y las actualizaciones OTA (`eas update`, `eas update:rollback`, `eas channel:…`, `npm run update:dev`, `npm run update:prod`, `node scripts/update.mjs`), porque las de producción llegan directamente a los probadores. Estas reglas están duplicadas para Bash y para PowerShell, que tiene su propia sintaxis.
- **Excepción:** `/sync` sube con `--force-with-lease` las ramas apiladas que acaba de rebasar, sin preguntar, porque el permiso cubre al script y no a cada comando que ejecuta. Solo lo hace si la rama no había cambiado en GitHub y `verify` pasa.
- **Prohibido:** leer ficheros `.env`, que contendrán secretos. Es una protección de las herramientas de Claude y de los comandos habituales como `cat`, pero no alcanza a un script que abra el fichero por su cuenta.

En el mismo fichero, `attribution.commit` vacío hace que los commits no lleven la línea `Co-Authored-By` de Claude. Los PR sí indican que se han generado con Claude Code.

Cada persona puede añadir sus propias preferencias en `.claude/settings.local.json`, que no se versiona.

### Hook `protect-main`

[.claude/hooks/protect-main.mjs](../.claude/hooks/protect-main.mjs), en el evento `PreToolUse` de las herramientas Bash y PowerShell.

- Bloquea `git commit` cuando la rama actual es `main`.
- Bloquea `git push` hacia `main`: explícito (`git push origin main`, `HEAD:main`, `HEAD:refs/heads/main`), a través de `HEAD` estando en `main`, implícito (push sin rama estando en `main`) o con `--all` y `--mirror`.
- Al bloquear, explica a Claude el motivo y le indica que cree una rama.
- Pide confirmación en los push que las reglas de permisos no distinguen y pueden reescribir o borrar ramas remotas: banderas combinadas (`-uf`, `-ud`) y `--prune`.
- Lo prueba [protect-main-hook.test.js](../src/__tests__/protect-main-hook.test.js), que lo ejecuta sobre un repositorio desechable.

Complementa la protección de `main` en GitHub: el servidor lo impediría igualmente, pero el hook lo detecta antes.

**Limitaciones conocidas:** comprueba la rama del directorio de trabajo de la sesión, así que no detecta un `cd otro-repo && git commit`. Tampoco ve un git dentro de `$(...)` o de `bash -c "..."`, y un texto como `echo git commit` en `main` lo toma por un commit. Si Node no está disponible, el hook falla sin bloquear.

**Requisito:** Node.js en el `PATH`.

### Hook `format`

[.claude/hooks/format.mjs](../.claude/hooks/format.mjs), en el evento `PostToolUse` de las herramientas Edit y Write.

- Formatea con Prettier el fichero editado (`.js`, `.mjs`, `.ts`, `.tsx`, `.json`, `.yml`…), respetando `.prettierignore`.
- En ficheros de código ejecuta `eslint --fix`. Si quedan errores que no se corrigen solos, se los devuelve a Claude para que los arregle en el momento.
- Ignora los ficheros de fuera del proyecto y el Markdown, que queda fuera de Prettier para no reformatear las tablas de `docs/`.

No comprueba tipos: `tsc` sobre todo el proyecto tarda demasiado para hacerlo en cada edición. Los tipos se comprueban con `npm run verify` antes de cada commit.

**Limitaciones conocidas:** tarda unos 3 segundos por edición en Windows, sobre todo por ESLint. Si `node_modules` no está instalado, no hace nada. Solo ve las ediciones hechas con Edit y Write: un fichero cambiado desde la terminal (por ejemplo, con un script) no pasa por él, y lo comprueba `npm run verify`.

**Requisito:** Node.js en el `PATH` y dependencias instaladas (`npm install`).

### Regla de dependencias en ESLint

No es una pieza de Claude Code, pero cumple el mismo principio de imponer lo determinista: [eslint.config.js](../eslint.config.js) solo deja que `src/domain` importe de `src/domain` (ni paquetes ni otras capas) e impide que cada capa importe de las que tiene encima ([ADR-0025](adr/0025-capa-compartida-y-regla-de-dependencias-entre-capas-impuesta-con-eslint.md)), como exige la [arquitectura](arquitectura.md#4-capas-y-estructura-del-código). El hook `format` la aplica en cada edición.

### Protección de `app.json`

Los comandos de EAS reescriben `app.json` con valores ya resueltos para una variante (el bundle identifier de desarrollo, por ejemplo), que no deben llegar al repositorio ([ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md)). Dos piezas lo vigilan:

- El test [app-json.test.ts](../src/__tests__/app-json.test.ts) falla si `app.json` contiene `name`, `scheme`, el bundle identifier o el bloque que genera Expo Router.
- [scripts/build.mjs](../scripts/build.mjs) (`npm run build:dev` y `npm run build:prod`) no lanza el build si hay cambios sin commit, y avisa si EAS ha tocado `app.json`. El de producción, además, solo compila `main` al día con GitHub. [scripts/update.mjs](../scripts/update.mjs) (`npm run update:dev` y `npm run update:prod`) aplica las mismas comprobaciones a las actualizaciones OTA. Además, se niega a publicar sin `SENTRY_AUTH_TOKEN` y, después de publicar, sube los source maps a Sentry ([ADR-0026](adr/0026-informes-de-errores-anonimos-con-sentry.md)).

### CI con GitHub Actions

Tampoco es una pieza de Claude Code, pero es la red de seguridad de todo lo anterior: lo que los hooks y Claude comprueban en local, la CI lo vuelve a comprobar en GitHub.

- [ci.yml](../.github/workflows/ci.yml), en cada Pull Request hacia `main`: **Verify** (`npm run verify`) y **Database** (el esquema de la nube y la sincronización contra un Supabase local), obligatorios para hacer merge, y **Audit** (`npm run audit-deps`), que solo informa.
- [weekly-review.yml](../.github/workflows/weekly-review.yml), cada lunes: `npm run audit-deps` y `npx expo-doctor`. Si falla, GitHub avisa por correo.

Los detalles están en [CONTRIBUTING.md](../CONTRIBUTING.md#8-integración-continua).

### Skill `/pr`

[.claude/skills/pr/](../.claude/skills/pr/SKILL.md). Sube la rama actual, abre un Pull Request hacia `main` con título en Conventional Commits y la plantilla rellenada, y espera al resultado de la CI.

- El script [context.mjs](../.claude/skills/pr/context.mjs) comprueba el estado de forma determinista: rama válida, cambios sin commit, commits nuevos, si va por detrás de `main`, si ya hay un PR y dónde está `gh`. Si encuentra un bloqueo, la skill se detiene.
- Si el cambio toca código, pasa antes `/code-review medium`, la revisión integrada de Claude Code. Hasta ahora ningún PR había tenido una segunda mirada. Se evaluará tras 5 PR: si encuentra poco, se quita; si se queda corta, se valorará un revisor propio contra la especificación y los ADR.
- El script [checks.mjs](../.claude/skills/pr/checks.mjs) espera a que terminen los checks e informa de su resultado y de si el PR se puede fusionar.
- Nunca hace merge.
- Se invoca con `/pr` (con notas opcionales) o al pedir "abre el PR".

### Skill `/adr`

[.claude/skills/adr/](../.claude/skills/adr/SKILL.md). Crea un ADR en `docs/adr/` en estado `Propuesto`, actualiza el índice y, si sustituye a otro, marca el antiguo.

- El script [next.mjs](../.claude/skills/adr/next.mjs) calcula el siguiente número, el nombre del fichero (sin tildes) y la fecha.
- El script [accept.mjs](../.claude/skills/adr/accept.mjs) pasa uno o varios ADR a `Aceptado`, en su fichero y en el índice. Solo se usa cuando el usuario lo acepta de forma expresa.
- Se invoca con `/adr <título>` o cuando se toma una decisión técnica importante.

### Skill `/sync`

[.claude/skills/sync/](../.claude/skills/sync/SKILL.md). Pone al día el repositorio local después de un merge.

- El script [sync.mjs](../.claude/skills/sync/sync.mjs) actualiza `main` y borra las ramas locales cuyo Pull Request está fusionado, cuya rama remota ya no existe y que no tienen commits fuera de ese PR. Pregunta a GitHub porque un squash merge no deja rastro en git. Lo prueba [sync-script.test.js](../src/__tests__/sync-script.test.js), que lo ejecuta sobre repositorios desechables con GitHub simulado.
- Pone al día las ramas apiladas sobre un PR recién fusionado con `git rebase --onto`, pasa `npm run verify` y las sube con `--force-with-lease`. Un `git merge origin/main` daba conflictos casi siempre: con squash merge, `main` tiene el código del PR de abajo en un commit nuevo y git ve dos versiones de las mismas líneas. Nació de la regla de tres tras los conflictos de los PR 27, 28 y 32.
- No hace nada si hay cambios sin commit, no fuerza ramas con conflictos ni con `verify` en rojo, y no borra ramas con el PR abierto, sin PR o con trabajo que no llegó al PR.
- Funciona desde un worktree de git, que es donde trabajan las sesiones de Claude Code. Actualiza `main` en el checkout donde esté abierta sin cambiarse a ella, avanza la rama del worktree actual si no tiene commits propios y nunca rebasa ni borra una rama abierta en otro worktree. Si el checkout de `main` tiene cambios sin commit, avisa y no toca nada.
- Recuerda los ADR que siguen en Propuesto, porque solo el usuario puede aceptarlos.
- Se invoca con `/sync` o cuando el usuario dice que ha hecho un merge.

Los scripts de las skills comparten [.claude/lib/gh-path.mjs](../.claude/lib/gh-path.mjs), que localiza GitHub CLI.

### Subagentes integrados

No hay subagentes propios. Se usa el de exploración que trae Claude Code (`Explore`) para lo voluminoso: registros de build y de CI, documentación extensa y búsquedas amplias. Lee aparte y devuelve solo la conclusión, de modo que el contexto principal no se llena.

### Memoria

Notas que Claude guarda fuera del repositorio y carga en cada sesión: preferencias del usuario, cuentas y lecciones que no se deducen del código. No sustituye a la documentación: lo que afecta al proyecto va en `docs/`, y el estado de las publicaciones, en [estado.md](estado.md).

## Piezas previstas

| Pieza | Cuándo |
|-------|--------|
| Subagente revisor propio (contra la especificación y los ADR) | Solo si `/code-review` se queda corto tras la prueba de 5 PR |
| Plugin oficial `expo` para Claude Code (la plantilla lo activa; aquí se quitó) | Si hay fricción con las APIs de Expo |

## Descartadas

| Pieza | Motivo |
|-------|--------|
| MCP de Supabase | Chocaría con la regla de no ejecutar nada contra la nube, y la CLI y la CI cubren lo necesario |
| Hook `Stop` o de commit que pase `verify` | Tarda casi un minuto y la CI apenas falla: 3 de 100 ejecuciones en la auditoría |
| Vista previa de las pantallas en el navegador | La app es solo para iOS y depende de módulos nativos |
| MCP oficial de Expo | Requiere un plan de pago de EAS y sus funciones locales solo funcionan con el simulador en macOS |
| MCP de GitHub | `gh` cubre todo lo necesario desde la terminal |
| `AGENTS.md` de la plantilla de Expo | Claude Code solo lo lee si no hay `CLAUDE.md`, y sus indicaciones útiles ya están ahí |
| Sistema multiagente (orquestador, planificador…) | Sobredimensionado para un desarrollador y una app de este tamaño |
| Subagente de tests | Los tests se escriben junto al código en la misma sesión y no ha habido fricción |
