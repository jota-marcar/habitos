# ADR-0023: Vaciar las filas borradas y hacer definitivo el borrado

- **Estado:** Aceptado
- **Fecha:** 2026-11-23

## Contexto

- RF-11 y RF-45 prometen que eliminar un hábito o un objetivo lo borra "como si no hubiera existido". La auditoría del 2026-11-22 (R3) comprobó que no era así: la fila solo se marcaba con `deleted = true` y conservaba nombre, unidad, valores y fechas en el dispositivo y en la nube hasta eliminar la cuenta. Con usuarios externos es también un tema de privacidad.
- La sincronización necesita saber qué se ha borrado para propagarlo a los demás dispositivos ([ADR-0004](0004-offline-first-con-sincronizacion.md), [ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)), así que algo de cada fila tiene que quedar.
- Según [ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md), en un conflicto gana el último cambio en llegar. Un dispositivo con un cambio sin subir sobre una fila ya borrada la subía con `deleted = false` y la devolvía a la vida, con su contenido.
- Los probadores usan el build `0.1.0 (2)`, que sube las filas borradas con su contenido y no se puede cambiar sin publicar antes. La solución tiene que funcionar también con esa versión.
- Una migración local nueva obligaría a publicar en la misma OTA o después, y no se puede deshacer.

## Opciones consideradas

### Vaciar las filas en la app y en la nube, con un trigger
- ✅ La regla vive en la base de datos: se cumple con cualquier versión de la app, también las ya instaladas.
- ✅ No cambia el motor de sincronización ni necesita migración local: los dispositivos reciben la fila vacía con la bajada normal.
- ✅ Permite hacer definitivo el borrado en el mismo sitio.
- ❌ Sigue quedando una fila por cada cosa borrada, con su identificador y su dueño.
- ❌ Los valores que no admiten nulos necesitan un valor fijo.

### Borrar las filas de verdad y llevar un registro aparte de lo borrado
- ✅ No queda ninguna fila del contenido.
- ❌ Hay que rehacer la bajada, con una tabla y un cursor nuevos.
- ❌ Los dispositivos con el build actual no conocen ese registro: nunca se enterarían de los borrados.

### Vaciar las filas solo en la app
- ✅ Es el cambio más pequeño, sin migración en la nube.
- ❌ Las versiones ya instaladas seguirían subiendo el contenido.
- ❌ No arregla lo ya borrado ni impide que un borrado se revierta.

## Decisión

Se elige **vaciar las filas borradas con un trigger en la nube (`tombstone_deleted_row`) y también en el dispositivo al borrar**. Una fila borrada conserva solo su identificador, su dueño, su padre y la marca de borrado. El resto se vacía o toma un valor fijo (`1970-01-05`, que es lunes y vale también para las semanas, y `00:00`).

El trigger aplica tres reglas:

1. Una fila borrada se vacía.
2. Una fila borrada sigue borrada, aunque un dispositivo la suba como viva. Es la **excepción a "gana el último cambio"** de [ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md): borrar lo confirma el usuario de forma explícita y no se puede deshacer.
3. Una fila nueva de un padre borrado nace borrada.

La migración vacía también lo que ya estaba borrado. Al recibir un `updated_at` nuevo, los dispositivos descargan esas filas y vacían su copia, sin migración local.

## Consecuencias

- Eliminar cumple lo que promete, en la nube y en todos los dispositivos, con cualquier versión de la app.
- **La migración no se puede deshacer:** lo ya borrado deja de poder recuperarse, ni siquiera a mano desde la base de datos.
- Un cambio hecho sin conexión sobre algo que otro dispositivo ha borrado se pierde. Se acepta: el borrado fue explícito.
- En el dispositivo que hizo ese cambio, la fila desaparece en la sincronización siguiente a la subida, no en la misma.
- Los valores vacíos están en dos sitios: `EMPTIED_VALUES` en `src/data/emptied-rows.ts` y la migración. Un test de punta a punta en la CI comprueba que coinciden. Una tabla sincronizada nueva necesita el trigger y sus valores.
- Las copias de seguridad de Supabase pueden conservar el contenido anterior durante su periodo de retención.
- Sigue pendiente decidir si las filas vacías se purgan pasado un tiempo ([ADR-0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)).
