# ADR-0016: Cursor de sincronización serializado por usuario

- **Estado:** Aceptado
- **Fecha:** 2026-11-17

## Contexto

- El pull descarga las filas que el servidor ha modificado desde el último `updated_at` recibido, y `updated_at` lo asigna el servidor ([ADR-0004](0004-offline-first-con-sincronizacion.md)).
- Una marca de tiempo asignada al escribir no sigue el orden en que las transacciones se confirman. Ejemplo: la transacción A toma `now()` = 10:00:00.100 y la B toma 10:00:00.200, pero B confirma antes. Un pull entre los dos commits ve B y guarda el cursor en .200. Cuando A confirma con .100, ningún pull posterior la ve. **Esa fila se pierde para siempre en ese dispositivo**, sin ningún error.
- Ocurre cuando dos dispositivos de la misma cuenta escriben a la vez (RF-05), o cuando una subida coincide con la lectura de otro dispositivo. Es raro, pero su efecto es silencioso y permanente.
- Cada cuenta tiene un solo usuario y pocos dispositivos: las escrituras de un mismo usuario son pocas y cortas.

## Opciones consideradas

### `updated_at = now()` o `clock_timestamp()` sin más
- ✅ Lo más sencillo.
- ❌ Tiene el problema descrito: la marca se toma antes del commit.

### Columna de revisión con una secuencia (`revision bigint`)
- ✅ Números enteros sin empates.
- ❌ No lo resuelve: los números de una secuencia también se reparten antes del commit, así que una revisión menor puede confirmarse después que una mayor.

### Pull con margen (`updated_at > cursor − 1 minuto`)
- ✅ Sencillo, y el cliente ya tolera recibir filas repetidas.
- ❌ Depende de una heurística: una transacción más lenta que el margen pierde filas igual.
- ❌ Cada pull vuelve a descargar lo del último minuto.

### Identificador de transacción (`xid8`) y snapshot
- ✅ Es correcto en teoría: el servidor devuelve el `xmin` del snapshot como cursor.
- ❌ Necesita una función RPC para leer el snapshot junto con las filas.
- ❌ Es frágil: si Supabase restaura o migra la base, los identificadores cambian y los cursores guardados en los dispositivos dejan de valer.

### Bloqueo por usuario y `clock_timestamp()` en el trigger
- ✅ El trigger que asigna `updated_at` toma antes un bloqueo del usuario (`pg_advisory_xact_lock`), que dura hasta el final de la transacción, y solo entonces lee el reloj. Las escrituras de un usuario quedan en fila: la B no puede tomar su marca hasta que la A ha confirmado. Para cada usuario, el orden de `updated_at` es el orden de confirmación.
- ✅ El pull sigue siendo una consulta normal por `updated_at` desde la app, sin RPC.
- ✅ No depende de márgenes ni de identificadores internos de Postgres.
- ❌ Dos escrituras simultáneas del mismo usuario se esperan entre sí. Con un usuario y transacciones cortas, la espera no se nota. Los usuarios distintos no se bloquean entre sí, salvo una colisión del hash, que solo añade una espera.
- ❌ Depende de que el reloj del servidor no retroceda. Es un reloj gestionado por Supabase y sincronizado.

## Decisión

Se elige el **bloqueo por usuario y `clock_timestamp()`**, en el trigger `set_updated_at` de todas las tablas de `supabase/migrations`. Se usa `clock_timestamp()` y no `now()`, porque `now()` es el inicio de la transacción, anterior al bloqueo.

El ADR-0004 sigue vigente: este ADR concreta cómo se asigna `updated_at` para que el pull sea correcto.

## Consecuencias

- El trigger ignora el `updated_at` que envíe el cliente e impide cambiar el `id` o el usuario de una fila.
- Las filas de una misma transacción pueden compartir marca. El motor de sincronización debe paginar el pull con el par `(updated_at, id)` y no solo con `updated_at`. Hay un índice `(user_id, updated_at, id)` en cada tabla para ello.
- El pull puede recibir filas que ya tiene (por ejemplo, las que el propio dispositivo acaba de subir). Aplicarlas debe ser idempotente.
- Si en el futuro una cuenta tuviera muchas escrituras concurrentes (datos compartidos entre usuarios), el bloqueo por usuario se reevaluará junto con el motor de sincronización.
