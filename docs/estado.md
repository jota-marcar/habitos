# Estado del proyecto

Qué hay publicado, qué viene ahora y qué falta por decidir. Una sesión nueva puede empezar por aquí. Se actualiza en el mismo Pull Request que cambia algo de lo que cuenta, y al publicar.

**Última actualización:** 2026-11-25.

## Qué hay publicado

| Entorno | Binario | Actualización OTA | Nube |
|---------|---------|-------------------|------|
| **Producción** (Hábitos, TestFlight) | `0.3.0 (3)`, tag `v0.3.0`, del 2026-11-24, con Sentry. Caduca hacia el **2027-02-22** | Ninguna: funciona con la que lleva el binario | `habitos`: al día hasta `20261125120000_long_term_goals`, aplicada el 2026-11-25 |
| **Desarrollo** (Hábitos Dev) | `0.3.0 (1)`, del 2026-11-24 | `0.3.0`, del 2026-11-24, desde `main` | `habitos-dev`: al día hasta `20261125120000_long_term_goals`, aplicada el 2026-11-25 |

Las migraciones de la nube las aplica el usuario. Lo que dice esta tabla sobre ellas es lo último registrado: antes de publicar, compruébalo con `supabase migration list`.

La `0.3.0` llegó a los probadores el 2026-11-24. Es un binario nuevo, así que las actualizaciones OTA anteriores ya no le llegan. Se generó antes del PR 113, así que todavía no lleva las tablas de las metas.

## Qué viene después

1. **Metas, el tercer horizonte** (rumbo elegido el 2026-11-25): los requisitos están en la [sección 3.9](especificacion-funcional.md#39-metas). Se hacen como los objetivos semanales, en Pull Requests sucesivos:
   1. **Hecho (PR 111):** especificación y glosario.
   2. **Hecho (PR 112):** el núcleo común de hábitos y objetivos (C4 de la auditoría).
   3. **Hecho (PR 113):** el modelo de datos y la sincronización, con su ADR ([ADR-0027](adr/0027-metas-en-dos-tablas-propias-sin-versiones-con-un-total-por-meta.md), aceptado). La migración de la nube `20261125120000_long_term_goals` ya está aplicada en los dos entornos.
   4. **Hecho (PR 115):** la interfaz, la tercera página de la pantalla principal con su formulario y sus opciones.
   5. Los avisos de las metas, que están por definir.
2. **Versión `0.4.0`, por OTA, con las metas:** el selector de fecha usa el módulo nativo que ya lleva el binario, así que no hace falta un build. Lleva la migración local de las metas, así que la actualización **no se podrá deshacer**: cualquier fallo se corrige publicando otra hacia delante ([despliegue.md](despliegue.md#actualizaciones-con-una-migración-local)). Se prepara con `node scripts/bump-version.mjs`, se prueba sin prisa en Hábitos Dev con `update:dev` y después sale con `update:prod`. Falta decidir si sale antes o después de los avisos de las metas.
3. **Ideas por debatir:** las propuestas sin decidir están en [ideas.md](ideas.md), que se revisa a medida que avanza el desarrollo. Los avisos de las metas se debatirán junto con IDEA-07 (avisos de ritmo) e IDEA-01 (un único aviso de pendientes, configurable).
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
