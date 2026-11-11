# ADR-0009: SQL directo y migraciones propias en la capa de datos local

- **Estado:** Propuesto
- **Fecha:** 2026-11-11

## Contexto

- La base de datos local es SQLite y es la fuente de verdad en el dispositivo ([ADR-0004](0004-offline-first-con-sincronizacion.md)).
- El modelo es pequeño: cuatro tablas (hábitos, versiones, registros y recordatorios).
- `expo-sqlite` es código nativo: no funciona en los tests que se ejecutan en el PC ni en la CI.
- No hay Mac ni simulador, y los builds de EAS son limitados. Lo que solo se pueda probar en el iPhone se prueba poco.
- El proyecto bloquea los scripts de instalación de las dependencias y quiere las menos posibles.

## Opciones consideradas

### Consultas

**ORM (Drizzle)**
- ✅ Tipos de cada consulta generados a partir del esquema.
- ✅ Generador de migraciones.
- ❌ Dos o tres dependencias más y una capa que aprender, para cuatro tablas.
- ❌ El SQL real queda oculto, y el esquema de Postgres hay que mantenerlo alineado igualmente.

**SQL directo**
- ✅ Sin dependencias nuevas. El SQL de SQLite queda a la vista, parecido al de Postgres.
- ❌ Los tipos de las filas se escriben a mano, y un error en una consulta solo lo detecta un test.

### Migraciones

**Generadas por una herramienta**
- ✅ Menos escritura manual.
- ❌ Solo tiene sentido con un ORM.

**Lista ordenada en el código, con la versión en la propia base**
- ✅ Simple y visible: una migración es un texto SQL en una lista.
- ✅ Es el patrón del ejemplo de la documentación de `expo-sqlite`.
- ❌ La disciplina es manual: una migración publicada no se edita.

### Tests

**Simular la base de datos**
- ✅ Sin dependencias y rápido.
- ❌ No ejecuta el SQL, que es donde estarán los errores.

**SQLite para Node como dependencia de desarrollo (`better-sqlite3`)**
- ✅ Ejecuta el SQL real.
- ❌ Necesita compilar código nativo con un script de instalación.

**El SQLite integrado en Node (`node:sqlite`)**
- ✅ Ejecuta el SQL real, en memoria y sin dependencias.
- ❌ El módulo es reciente: en Node 24 es "release candidate" desde la versión 24.15, y antes muestra un aviso de función experimental.
- ❌ No es el mismo binario de SQLite que el del iPhone.

## Decisión

- **Consultas con SQL directo**, en repositorios de `src/data` que convierten las filas en los tipos del dominio.
- **Los repositorios dependen de una interfaz mínima** (`Database`: ejecutar, consultar y transacción), no de `expo-sqlite`. En el dispositivo la implementa un adaptador de `expo-sqlite`; en los tests, uno del SQLite integrado en Node.
- **Migraciones en una lista ordenada en el código.** La base guarda su versión en `PRAGMA user_version`. Al abrir, se aplican las que faltan, cada una en una transacción junto con su número de versión. Una migración publicada no se edita: un cambio de esquema es una migración nueva al final de la lista.
- **Cobertura de tests del 100 % en `src/data`**, igual que en el dominio.
- **Esquema local:**
  - Sin `user_id`: la base del dispositivo es de un solo usuario y el servidor asigna el suyo. Al cambiar de cuenta, la base local se vacía.
  - Cada tabla lleva `updated_at` y `deleted` ([ADR-0004](0004-offline-first-con-sincronizacion.md)) y una columna solo local, `pending_sync`, que marca las filas con cambios sin subir.
  - Las claves únicas (`habit_id + date`, `habit_id + time`, `habit_id + effective_from`) ignoran las filas borradas, para poder volver a crear lo que se borró.
  - Tablas `STRICT` y restricciones `CHECK`: la base rechaza lo que el dominio no admite.

## Consecuencias

- Los tests de la capa de datos ejecutan el SQL real y no necesitan iPhone ni build.
- El adaptador de `expo-sqlite` es lo único que no se puede probar en el PC. Será muy fino y se probará en el dispositivo.
- Hace falta Node 24.15 o posterior para que los tests no muestren el aviso de función experimental.
- El SQLite de Node y el del iPhone pueden diferir en versión. Solo se usa SQL estándar de SQLite; si algo se comporta distinto, se verá al probar en el dispositivo.
- Los tipos del módulo de SQLite de Node se declaran a mano, solo lo que usan los tests, para no dar al código de la aplicación acceso a los tipos de Node.
- El uso de `pending_sync` (cuándo se desmarca, reintentos, purga de filas borradas) queda para el diseño de la sincronización.
- Si el modelo crece o las consultas se complican, se reevaluará un ORM.
