# ADR-0015: Pruebas del esquema de Supabase con pgTAP en la CI

- **Estado:** Aceptado
- **Fecha:** 2026-11-17

## Contexto

- El esquema de la nube se versiona como migraciones SQL en `supabase/` ([ADR-0003](0003-supabase-como-backend.md)). Su parte delicada es la seguridad: Row Level Security es lo único que impide que un usuario lea o cambie los datos de otro, así que no basta con revisarla a ojo.
- El esquema existe dos veces, en SQLite y en Postgres, y debe mantenerse alineado ([ADR-0004](0004-offline-first-con-sincronizacion.md)).
- El entorno local es Windows 10 Home sin Docker. La pila local de Supabase (`supabase start`) necesita Docker; su modo sin contenedores (`--runtime native`) aún es experimental en la CLI 3.
- La CLI de Supabase se distribuye en npm con un script de instalación que descarga un binario. El proyecto no aprueba scripts de instalación sin necesidad (`CONTRIBUTING.md`, "Scripts de instalación").
- Los runners de GitHub Actions (`ubuntu-latest`) traen Docker y `psql`.

## Opciones consideradas

### Dónde se ejecutan las pruebas

**Solo en local, contra la pila de Supabase**
- ❌ Sin Docker no se pueden ejecutar, y nada obliga a ejecutarlas antes del merge.

**Postgres embebido en Node (PGlite o similar), en local y en la CI**
- ✅ Funcionaría sin Docker y con los tests de siempre.
- ❌ No es la base de Supabase: faltan el esquema `auth`, `auth.uid()`, los roles `anon` y `authenticated` y los permisos por defecto. Habría que imitarlos, y los tests probarían la imitación.

**En la CI, contra la base local de Supabase (`supabase db start`) con pgTAP**
- ✅ Es la misma imagen de Postgres que usa Supabase en la nube, con sus roles y su esquema `auth`.
- ✅ pgTAP es la herramienta de pruebas que documenta Supabase (`supabase test db`). Cada fichero va en una transacción que se deshace al terminar.
- ❌ Los tests de la base no se pueden ejecutar en el PC: un fallo se ve en la CI. Es aceptable porque el esquema cambia poco.

### Cómo se instala la CLI

**`devDependency` de npm**
- ✅ Versión fijada en `package-lock.json` y el mismo comando en todas partes.
- ❌ Hay que aprobar su script de instalación, que descarga un binario en cada `npm ci`, también en los jobs que no lo usan.

**`supabase/setup-cli` en la CI, y Scoop en el PC cuando haga falta**
- ✅ `npm ci` no cambia. La acción se fija por commit y la CLI, por versión exacta.
- ❌ La versión del PC y la de la CI son independientes. En el PC solo se usa para enlazar los proyectos y aplicar migraciones (`link`, `db push`), que no dependen tanto de la versión.

### Alineación entre SQLite y Postgres

**Revisarla a mano en cada Pull Request**
- ❌ Olvidar una columna en un lado solo se descubriría cuando fallara la sincronización.

**Un test que compara los dos esquemas reales**
- ✅ Aplica las migraciones de SQLite en memoria y lee las columnas de Postgres. Compara nombres y si admiten nulos, con las diferencias intencionadas escritas en el test (`user_id`, `pending_sync`, `updated_at` nulo en el dispositivo).
- ❌ No compara los tipos, que difieren a propósito (`INTEGER` 0/1 frente a `boolean`, `TEXT` frente a `uuid` o `date`).

## Decisión

- Las pruebas del esquema son **tests pgTAP en `supabase/tests/database/`**, ejecutados en el job `Database` de la CI contra la base local de Supabase (`supabase db start` y `supabase test db`).
- La **CLI** se instala en la CI con `supabase/setup-cli`, fijada por commit y con una versión exacta de la CLI. No es dependencia de npm.
- La **alineación** con el esquema del dispositivo la comprueba `supabase/tests/schema-alignment.test.ts`, con Jest, en el mismo job (`npm run test:schema`). `npm test` lo ignora porque necesita la base.

## Consecuencias

- `npm run verify` sigue sin necesitar Docker, pero ya no cubre todo: el job `Database` también debe pasar para hacer merge. Hay que marcarlo como obligatorio en la protección de `main`.
- Actualizar la CLI es un cambio deliberado: subir `version` en `ci.yml` y revisar las notas de la versión.
- Las migraciones de Postgres se escriben sin poder ejecutarlas en el PC. Para depurar, la CI es el banco de pruebas.
- Si el modo sin contenedores de la CLI (`supabase start --runtime native`) deja de ser experimental, se reevaluará ejecutar los tests en el PC.
- Aplicar las migraciones a los proyectos de desarrollo y producción sigue siendo manual (`supabase db push`). Automatizarlo desde la CI queda pendiente.
