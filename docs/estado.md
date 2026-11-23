# Estado del proyecto

Qué hay publicado, qué viene ahora y qué falta por decidir. Una sesión nueva puede empezar por aquí. Se actualiza en el mismo Pull Request que cambia algo de lo que cuenta, y al publicar.

**Última actualización:** 2026-11-23.

## Qué hay publicado

| Entorno | Binario | Actualización OTA | Nube |
|---------|---------|-------------------|------|
| **Producción** (Hábitos, TestFlight) | `0.1.0 (2)`, tag `v0.1.0+2`. Caduca hacia el **2027-02-19** | Ninguna | `habitos`: le faltan `20261122120000_weekly_goals` y `20261123120000_empty_deleted_rows` |
| **Desarrollo** (Hábitos Dev) | `0.1.0 (1)`, del 2026-11-21 | Se publica para probar | `habitos-dev`: comprobar con `supabase migration list --remote` |

Las migraciones de la nube las aplica el usuario. Lo que dice esta tabla sobre ellas es lo último registrado: antes de publicar, compruébalo con `supabase migration list`.

## Próxima publicación: `0.2.0`

Es una actualización OTA, sin build: el código nativo coincide con el del build `0.1.0 (2)`. **No se puede deshacer**, porque lleva una migración local ([despliegue.md](despliegue.md#actualizaciones-con-una-migración-local)).

Trae los objetivos semanales con sus avisos de progreso, el aviso antes de quedarse sin recordatorios, el estado de la copia en Ajustes, el borrado definitivo, la versión visible y las correcciones de la auditoría del 2026-11-22.

### Pasos

1. Aplicar las migraciones que falten en `habitos-dev`.
2. `npm run update:dev` y probar en Hábitos Dev la lista de abajo.
3. Aplicar las migraciones en `habitos`. La de vaciar lo eliminado es irreversible.
4. `npm run update:prod`, que crea el tag `v0.2.0`.
5. Abrir Hábitos dos veces y comprobar en **Ajustes** que dice "Versión 0.2.0". TestFlight seguirá mostrando `0.1.0 (2)`.

### Qué probar en el iPhone

Nada de esto se ha probado todavía en un dispositivo:

- Guardar un hábito con el selector de hora abierto: la hora se añade.
- Cerrar un formulario con cambios: pide confirmación.
- Cambiar la zona horaria en los ajustes del iPhone: los recordatorios siguen a su hora local.
- Quitar un recordatorio y volver a ponerlo sin conexión: al recuperarla, se sincroniza.
- Cambiar los días de un hábito con algo registrado hoy: sigue viéndose hoy.
- Eliminar un hábito y sincronizar: desaparece también del otro dispositivo.
- Ajustes muestra el estado de la copia y la versión.

## Qué viene después

- **Puntos menores de la auditoría:** índices de las consultas frecuentes, pantalla de error propia en español, la lectura que puede pisar una ordenación, límites de los campos al escribir, el botón Posponer a última hora y el criterio de los objetivos archivados.
- **Antes del tercer horizonte:** tests de notificaciones, separación de capas, núcleo común de hábitos y objetivos, empaquetar la app en la CI y dividir `arquitectura.md`.
- **En el próximo build:** informes de errores (Sentry), con su ADR, y la limpieza de los restos de web y Android.

## Decisiones pendientes

Aplazadas en su momento hasta que la app se abriera a más gente, cosa que ya ha pasado con los amigos en TestFlight:

| Decisión | Recomendación | Dónde |
|----------|---------------|-------|
| Revisar los límites del plan gratuito de Supabase | Hacerlo antes de invitar a más gente | [ADR-0003](adr/0003-supabase-como-backend.md) |
| Nonce del inicio de sesión con Google | Mantenerlo mientras sean amigos; revisarlo antes de la App Store | [ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md) |
| Purgar las filas borradas, ya vacías | No hace falta aún: ocupan poco y sin ellas un dispositivo antiguo no sabría qué se borró | [ADR-0009](adr/0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md), [ADR-0023](adr/0023-vaciar-las-filas-borradas-y-hacer-definitivo-el-borrado.md) |
| Mismo correo con Apple y con Google | Comprobar si da una sola cuenta. Con "Ocultar mi correo" de Apple serían dos | [ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md) |
| Inicio de sesión obligatorio en la App Store | Revisarlo antes de enviarla | [Riesgos](arquitectura.md#9-riesgos-conocidos) |
| Política de privacidad | Necesaria antes de la App Store: la app guarda datos de otras personas | Sin escribir |

**Por confirmar con la primera OTA:** que la huella calculada en Windows coincide con la del build de EAS en macOS ([ADR-0020](adr/0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md)). Si la actualización no llega, `eas fingerprint:compare` muestra la diferencia.
