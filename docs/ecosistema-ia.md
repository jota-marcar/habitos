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
| `CLAUDE.md` | Instrucciones que Claude carga en cada sesión | Contexto y reglas del proyecto |
| Permisos (`.claude/settings.json`) | Qué puede hacer Claude sin preguntar, qué debe preguntar y qué tiene prohibido | Reducir confirmaciones en lo seguro y forzarlas en lo delicado |
| Hooks (`.claude/settings.json` y `.claude/hooks/`) | Scripts que se ejecutan automáticamente en ciertos eventos | Reglas que deben cumplirse siempre |
| Skills (`.claude/skills/`) | Flujos de trabajo empaquetados que se invocan con `/nombre` | Procesos repetitivos con pasos fijos |
| Subagentes (`.claude/agents/`) | Agentes especializados con su propio contexto e instrucciones | Tareas acotadas que se benefician de un enfoque dedicado (revisión, tests) |
| Servidores MCP (`.mcp.json`) | Conexiones a sistemas externos | Cuando un sistema externo no es accesible bien desde la terminal |

## Piezas actuales

### `CLAUDE.md`

Contexto del proyecto, comandos de desarrollo, reglas de arquitectura y de git. Ver [CLAUDE.md](../CLAUDE.md).

### Permisos

Definidos en [.claude/settings.json](../.claude/settings.json):

- **Permitido sin preguntar:** comandos de git de consulta y de trabajo local (`status`, `log`, `diff`, `switch`, `add`, `commit`, `pull`, `merge`…), consultas de `gh` (`pr view`, `pr checks`, `run view`…), consultas de `npm` y de `eas` (`npm ls`, `npm view`, `eas whoami`, `eas build:view`…), los scripts de las skills y las herramientas de verificación del proyecto (`npm run …`, `npm test`, `npx expo lint`, `npx expo-doctor`, `npx expo config`, `npx tsc`, `npx jest`, `npx prettier`, `npx eslint`).
- **Siempre pregunta:** todo lo que sale del equipo o es difícil de deshacer (`git push`, `gh pr create`, `gh pr merge`, `git reset --hard`, `git clean`) los cambios de dependencias (`npm install`, `npm uninstall`, `npx expo install`), porque ejecutan scripts de paquetes de terceros, y los builds de EAS (`eas build`, `npm run build:dev`), porque son limitados.
- **Prohibido:** leer ficheros `.env`, que contendrán secretos.

En el mismo fichero, `attribution.commit` vacío hace que los commits no lleven la línea `Co-Authored-By` de Claude. Los PR sí indican que se han generado con Claude Code.

Cada persona puede añadir sus propias preferencias en `.claude/settings.local.json`, que no se versiona.

### Hook `protect-main`

[.claude/hooks/protect-main.mjs](../.claude/hooks/protect-main.mjs), en el evento `PreToolUse` de las herramientas Bash y PowerShell.

- Bloquea `git commit` cuando la rama actual es `main`.
- Bloquea `git push` hacia `main`, ya sea explícito (`git push origin main`, `HEAD:main`) o implícito (push sin rama estando en `main`).
- Al bloquear, explica a Claude el motivo y le indica que cree una rama.

Complementa la protección de `main` en GitHub: el servidor lo impediría igualmente, pero el hook lo detecta antes.

**Limitaciones conocidas:** comprueba la rama del directorio de trabajo de la sesión, así que no detecta un `cd otro-repo && git commit`. Si Node no está disponible, el hook falla sin bloquear.

**Requisito:** Node.js en el `PATH`.

### Hook `format`

[.claude/hooks/format.mjs](../.claude/hooks/format.mjs), en el evento `PostToolUse` de las herramientas Edit y Write.

- Formatea con Prettier el fichero editado (`.js`, `.mjs`, `.ts`, `.tsx`, `.json`, `.yml`…), respetando `.prettierignore`.
- En ficheros de código ejecuta `eslint --fix`. Si quedan errores que no se corrigen solos, se los devuelve a Claude para que los arregle en el momento.
- Ignora los ficheros de fuera del proyecto y el Markdown, que queda fuera de Prettier para no reformatear las tablas de `docs/`.

No comprueba tipos: `tsc` sobre todo el proyecto tarda demasiado para hacerlo en cada edición. Los tipos se comprueban con `npm run verify` antes de cada commit; si se olvida a menudo, se pasará a un hook `Stop`.

**Limitaciones conocidas:** tarda unos 3 segundos por edición en Windows, sobre todo por ESLint. Si `node_modules` no está instalado, no hace nada. Solo ve las ediciones hechas con Edit y Write: un fichero cambiado desde la terminal (por ejemplo, con un script) no pasa por él, y lo comprueba `npm run verify`.

**Requisito:** Node.js en el `PATH` y dependencias instaladas (`npm install`).

### Regla de dependencias en ESLint

No es una pieza de Claude Code, pero cumple el mismo principio de imponer lo determinista: [eslint.config.js](../eslint.config.js) solo deja que `src/domain` importe de `src/domain` (ni paquetes ni otras capas) e impide que `src/data` importe de las capas que la usan, como exige la [arquitectura](arquitectura.md#4-capas-y-estructura-del-código). El hook `format` la aplica en cada edición.

### Protección de `app.json`

Los comandos de EAS reescriben `app.json` con valores ya resueltos para una variante (el bundle identifier de desarrollo, por ejemplo), que no deben llegar al repositorio ([ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md)). Dos piezas lo vigilan:

- El test [app-json.test.ts](../src/__tests__/app-json.test.ts) falla si `app.json` contiene `name`, `scheme`, el bundle identifier o el bloque que genera Expo Router.
- [scripts/build-dev.mjs](../scripts/build-dev.mjs) (`npm run build:dev`) no lanza el build si hay cambios sin commit, y avisa si EAS ha tocado `app.json`.

### CI con GitHub Actions

Tampoco es una pieza de Claude Code, pero es la red de seguridad de todo lo anterior: lo que los hooks y Claude comprueban en local, la CI lo vuelve a comprobar en GitHub.

- [ci.yml](../.github/workflows/ci.yml), en cada Pull Request hacia `main`: **Verify** (`npm run verify`), obligatorio para hacer merge, y **Audit** (`npm run audit-deps`), que solo informa.
- [weekly-review.yml](../.github/workflows/weekly-review.yml), cada lunes: `npm run audit-deps` y `npx expo-doctor`. Si falla, GitHub avisa por correo.

Los detalles están en [CONTRIBUTING.md](../CONTRIBUTING.md#8-integración-continua).

### Skill `/pr`

[.claude/skills/pr/](../.claude/skills/pr/SKILL.md). Sube la rama actual, abre un Pull Request hacia `main` con título en Conventional Commits y la plantilla rellenada, y espera al resultado de la CI.

- El script [context.mjs](../.claude/skills/pr/context.mjs) comprueba el estado de forma determinista: rama válida, cambios sin commit, commits nuevos, si va por detrás de `main`, si ya hay un PR y dónde está `gh`. Si encuentra un bloqueo, la skill se detiene.
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

- El script [sync.mjs](../.claude/skills/sync/sync.mjs) actualiza `main` y borra las ramas locales cuyo Pull Request está fusionado y cuya rama remota ya no existe. Pregunta a GitHub porque un squash merge no deja rastro en git.
- No hace nada si hay cambios sin commit, y no borra ramas con el PR abierto o sin PR.
- Se invoca con `/sync` o cuando el usuario dice que ha hecho un merge.

### Subagentes integrados

No hay subagentes propios. Se usa el de exploración que trae Claude Code (`Explore`) para lo voluminoso: registros de build y de CI, documentación extensa y búsquedas amplias. Lee aparte y devuelve solo la conclusión, de modo que el contexto principal no se llena.

### Memoria

Notas que Claude guarda fuera del repositorio y carga en cada sesión: preferencias del usuario, cuentas y lecciones que no se deducen del código. No sustituye a la documentación: lo que afecta al proyecto va en `docs/`.

## Piezas previstas

| Pieza | Cuándo |
|-------|--------|
| MCP de Supabase (limitado a un proyecto, solo lectura en producción) | Al crear el proyecto de Supabase |
| Hook `Stop` que comprueba tipos antes de terminar | Si se olvida ejecutar `npm run verify` |
| Evaluar el plugin oficial `expo` para Claude Code (la plantilla lo activa; aquí se quitó) | Cuando haya fricción con las APIs de Expo |
| Revisión antes del PR con `/code-review` (integrada en Claude Code) | En el próximo Pull Request con código, como prueba |
| Subagente revisor propio (contra la especificación y los ADR) | Solo si `/code-review` se queda corto |
| Vista previa de las pantallas en el navegador integrado | Al empezar las pantallas |

## Descartadas

| Pieza | Motivo |
|-------|--------|
| MCP oficial de Expo | Requiere un plan de pago de EAS y sus funciones locales solo funcionan con el simulador en macOS |
| MCP de GitHub | `gh` cubre todo lo necesario desde la terminal |
| `AGENTS.md` de la plantilla de Expo | Claude Code no lo lee; sus indicaciones útiles están en `CLAUDE.md` |
| Sistema multiagente (orquestador, planificador…) | Sobredimensionado para un desarrollador y una app de este tamaño |
| Subagente de tests | Los tests se escriben junto al código en la misma sesión y no ha habido fricción |
