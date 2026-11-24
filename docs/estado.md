# Estado del proyecto

Qué hay publicado, qué viene ahora y qué falta por decidir. Una sesión nueva puede empezar por aquí. Se actualiza en el mismo Pull Request que cambia algo de lo que cuenta, y al publicar.

**Última actualización:** 2026-11-24.

## Qué hay publicado

| Entorno | Binario | Actualización OTA | Nube |
|---------|---------|-------------------|------|
| **Producción** (Hábitos, TestFlight) | `0.1.0 (2)`, tag `v0.1.0+2`. Caduca hacia el **2027-02-19** | `0.2.0`, tag `v0.2.0`, del 2026-11-24 | `habitos`: al día hasta `20261123120000_empty_deleted_rows` |
| **Desarrollo** (Hábitos Dev) | `0.1.0 (1)`, del 2026-11-21. Hay un build nuevo en marcha, con Sentry, del 2026-11-24 | `0.2.1`, del 2026-11-24, solo para probar | `habitos-dev`: comprobar con `supabase migration list --remote` |

Las migraciones de la nube las aplica el usuario. Lo que dice esta tabla sobre ellas es lo último registrado: antes de publicar, compruébalo con `supabase migration list`.

La `0.2.0` se comprobó en producción el 2026-11-24. TestFlight sigue mostrando `0.1.0 (2)` porque llegó por OTA: la versión real es la que aparece en **Ajustes**. Esta actualización **no se puede deshacer**, porque lleva una migración local: cualquier fallo se corrige publicando otra hacia delante ([despliegue.md](despliegue.md#actualizaciones-con-una-migración-local)).

## Qué viene después

1. **Build nuevo, con Sentry ([ADR-0026](adr/0026-informes-de-errores-anonimos-con-sentry.md)) y sin los restos de web y Android:** ya está en `main` (PR 104 y 105), y Sentry está configurado ([despliegue.md](despliegue.md#informes-de-errores-sentry)).
   - **Huella nativa:** `main` ya tiene otra, así que sus OTA no llegan a los builds instalados.
   - **La `0.2.1`:** solo llegó a Hábitos Dev; producción sigue en la `0.2.0`. Lleva los puntos menores de la auditoría: la pantalla de error propia en español, la lectura que puede pisar una ordenación, los límites de los campos al escribir, el botón Posponer a última hora y el criterio de los objetivos archivados. **Pendiente de decidir:** que llegue a producción con el build nuevo, que llevaría la versión `0.3.0`, o publicarla antes por OTA revirtiendo el PR 104 en `main`.
   - **Pasos:** probar `build:dev` con un error forzado ([despliegue.md](despliegue.md#comprobarlo)), preparar la versión y lanzar `build:prod`. El build de producción actual caduca hacia el 2027-02-19.
2. **Decidir el rumbo del producto** con lo que digan los probadores: objetivos a largo plazo, estadísticas o preparar la App Store.
3. **Antes del tercer horizonte, si es el rumbo elegido:** el núcleo común de hábitos y objetivos.
4. **Al tocar los ficheros afectados:** TypeScript más estricto, dividir los ficheros más grandes, quitar lo que sobra y revisar la regla de separar los textos.

## Decisiones pendientes

Aplazadas en su momento hasta que la app se abriera a más gente, cosa que ya ha pasado con los amigos en TestFlight:

| Decisión | Recomendación | Dónde |
|----------|---------------|-------|
| Plan de Supabase | Revisado el 2026-11-23: seguir en Free con los amigos y pasar a Pro (desde 25 USD/mes) antes de la App Store. Free no tiene copias automáticas y pausa los proyectos tras 1 semana sin actividad | [ADR-0003](adr/0003-supabase-como-backend.md) |
| Nonce del inicio de sesión con Google | Mantenerlo mientras sean amigos; revisarlo antes de la App Store | [ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md) |
| Purgar las filas borradas, ya vacías | No hace falta aún: ocupan poco y sin ellas un dispositivo antiguo no sabría qué se borró | [ADR-0009](adr/0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md), [ADR-0023](adr/0023-vaciar-las-filas-borradas-y-hacer-definitivo-el-borrado.md) |
| Mismo correo con Apple y con Google | Comprobar si da una sola cuenta. Con "Ocultar mi correo" de Apple serían dos | [ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md) |
| Inicio de sesión obligatorio en la App Store | Revisarlo antes de enviarla | [Riesgos](arquitectura.md#9-riesgos-conocidos) |
| Política de privacidad | Necesaria antes de la App Store: la app guarda datos de otras personas y envía informes de errores anónimos a Sentry | Sin escribir |

**Huella nativa, comprobada el 2026-11-23:** la calculada en Windows con las variables de EAS coincide con la de los builds de desarrollo y de producción, hechos en macOS ([ADR-0020](adr/0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md)). `update:dev` y `update:prod` lo vuelven a comprobar antes de publicar.
