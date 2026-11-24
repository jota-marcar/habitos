# ADR-0026: Informes de errores anónimos con Sentry

- **Estado:** Aceptado
- **Fecha:** 2026-11-24

## Contexto

La app ya está en manos de los probadores de TestFlight, y un fallo en su iPhone no llega a nadie. La auditoría del 2026-11-22 (propuesta R1) pedía un servicio de informes de errores. El PR 89 hizo la parte que no necesitaba código nativo: el estado de la copia en Ajustes (RF-53) y el diálogo cuando falla un guardado. La parte nativa se aplazó al siguiente build.

Hay muchos fallos que hoy no ve nadie:

- **Pantalla de error:** la de `src/ui/error-screen.tsx` captura el error antes que cualquier servicio.
- **Guardados, sincronización y avisos:** cuando fallan, solo dejan un aviso en una consola que nadie lee.
- **Errores nativos:** si la app se cierra de golpe, no queda ningún rastro.

Lo condicionan:

- **Privacidad:** los nombres de los hábitos y de los objetivos los escribe el usuario y pueden decir mucho de él. Además, las filas los llevan como etiqueta de accesibilidad.
- **Coste:** es un proyecto personal, así que tiene que caber en un plan gratuito.
- **Variantes:** desarrollo y producción no comparten valores ([ADR-0008](0008-variantes-de-desarrollo-y-produccion.md)).
- **Actualizaciones OTA:** los errores de cada actualización tienen que poder leerse con su código fuente ([ADR-0020](0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md)).

## Opciones consideradas

### Servicio

- **Sentry, con `@sentry/react-native` (elegida).**
  - ✅ Es el servicio que documenta Expo, con un plugin, la configuración de Metro y la subida de source maps para EAS Build y EAS Update.
  - ✅ Captura los errores de JavaScript y los nativos.
  - ✅ Tiene un plan gratuito, con 5000 errores al mes y una persona, y permite guardar los datos en la UE.
  - ❌ Añade código nativo, así que hace falta un build.
  - ❌ Su script de instalación descarga un binario.
  - ❌ Por defecto recoge más de lo que queremos: toques, consola y peticiones con sus parámetros.
- **Firebase Crashlytics.**
  - ✅ Gratuito.
  - ❌ Exige `@react-native-firebase` y un proyecto de Firebase solo para esto.
  - ❌ Los source maps de las actualizaciones OTA no están resueltos de forma estándar.
  - ❌ Los datos se quedan en Google.
- **Informes propios en Supabase (una tabla o una Edge Function).**
  - ✅ Sin dependencias.
  - ❌ No captura los errores nativos.
  - ❌ No tiene símbolos ni source maps, y no agrupa ni avisa: todo eso habría que construirlo.
- **Seguir sin informes.**
  - ❌ Los fallos de los probadores siguen sin llegar a nadie.

### Rastro de toques

`Sentry.wrap` siempre añade una `TouchEventBoundary`, que registra cada toque con la etiqueta del elemento tocado. En `@sentry/react-native` 8.28 no tiene ninguna opción para desactivarla: sus props, `touchEventBoundaryProps`, solo cambian la categoría, los nombres ignorados o la etiqueta. Por eso la app **no usa `Sentry.wrap`**, y `beforeBreadcrumb` descarta cualquier toque que llegara por otro camino.

## Decisión

Se usa Sentry, con su organización en la región de la UE y un proyecto para las dos variantes, separadas por `environment`. Los informes son **anónimos** y solo llevan lo necesario para encontrar el fallo.

**Qué no se envía:**

- **Datos personales:** `sendDefaultPii: false` y sin `setUser`, así que no hay usuario ni dirección IP. `beforeSend` quita además `user` y `request`.
- **Rendimiento y grabaciones:** sin tracing ni session replay, porque no se configura ninguna tasa de muestreo. Tampoco hay capturas de pantalla ni jerarquía de vistas.
- **Rastros:**
  - Sin el de toques ni el de consola: `breadcrumbsIntegration({ console: false })`.
  - Sin los rastros automáticos del SDK nativo de iOS: `enableAutoBreadcrumbTracking` y `enableNetworkBreadcrumbs` están a `false`.
  - `beforeBreadcrumb` solo deja pasar una lista cerrada de categorías: `navigation`, `xhr`, `fetch` y `sentry.event`. A las peticiones les quita los parámetros de la URL.
- **Fallos de conexión:** no son errores de la app y llenarían Sentry cada vez que el iPhone se queda sin red.

**Qué se envía:**

- El error y la zona donde se capturó.
- El dispositivo y la versión de la app.
- El rastro de pantallas: lo deja la propia app con el patrón de la ruta (`/habits/[id]/edit`), nunca con sus valores.
- Una sesión anónima por cada apertura, que es el comportamiento por defecto del SDK. No lleva usuario y sirve para saber qué parte de las aperturas termina sin cierres inesperados.

**Capturas explícitas.** El módulo `src/shared/error-reporting.ts` ([ADR-0025](0025-capa-compartida-y-regla-de-dependencias-entre-capas-impuesta-con-eslint.md)) envía lo que hoy se pierde:

- la pantalla de error,
- los guardados que fallan,
- la sincronización,
- el refresco de los avisos,
- las respuestas a los botones de los avisos,
- la tarea en segundo plano.

**Entornos.**

- El DSN sale de `EXPO_PUBLIC_SENTRY_DSN`, una variable del entorno de EAS de cada variante. El `environment` sale de la variante, que `app.config.ts` deja en `extra.appVariant`.
- Sin DSN, en el PC o en los tests, Sentry no arranca.
- Un build en EAS sin DSN se detiene, como ya pasa sin el cliente de Google.

**Source maps.**

- **Builds:** la fase de Xcode que añade el plugin los sube con `SENTRY_AUTH_TOKEN`, que es una variable sensible de EAS. Sin el token, el build falla.
- **Actualizaciones OTA:** `scripts/update.mjs` los sube después de `eas update` y se niega a publicar si no tiene el token. Metro les pone un Debug ID, así que los errores encuentran sus source maps sin depender de la versión.

## Consecuencias

- ✅ Los fallos de los probadores llegan agrupados, legibles y con la versión.
- ✅ Llegan también los que hoy se pierden: los de la pantalla de error, los guardados, la sincronización, los avisos y los nativos.
- ✅ Lo que sale del dispositivo está en una lista cerrada, y unos tests comprueban que no salen nombres de hábitos ni de objetivos. El módulo exige una cobertura del 100 %.
- ❌ Hace falta un build de desarrollo y otro de producción. Desde el merge, las actualizaciones OTA de `main` solo llegan a builds nuevos.
- ❌ Hay que mantener una cuenta más y un token con caducidad, y el plan gratuito tiene un tope de errores al mes.
- ❌ Sin `Sentry.wrap` no se mide el arranque ni la interacción: no hace falta, porque no hay tracing.
- ❌ Se deniega el script de instalación de `@sentry/cli`, porque el binario llega como dependencia opcional (`CONTRIBUTING.md`). Si algún día no llegara, la subida de source maps fallaría de forma visible.
- Pendiente:
  - Antes de la App Store, citar Sentry en la política de privacidad.
  - Revisar si conviene el rastro de las peticiones, que lleva la ruta de Supabase sin parámetros.
