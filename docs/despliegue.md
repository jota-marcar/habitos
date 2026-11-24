# Despliegue

Qué comando usar para llevar un cambio al iPhone y a los probadores. El detalle de cada paso está en [testflight.md](testflight.md) y los motivos, en los ADR [0008](adr/0008-variantes-de-desarrollo-y-produccion.md) y [0020](adr/0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md).

## Las dos partes de la aplicación

| Parte | Qué es | Cómo cambia |
|-------|--------|-------------|
| **Binario nativo** | El programa de iOS compilado: nombre, icono, permisos y módulos que hablan con el sistema (notificaciones, SQLite, inicio de sesión, vibración, actualizaciones) | Solo con un **build** |
| **JavaScript** | El código de `src/`: pantallas, reglas y sincronización | Con **Metro** en desarrollo o con una **actualización OTA** |

El JavaScript solo puede usar lo que el binario trae. Por eso, un cambio nativo siempre necesita un build.

## Qué comando usar

| Quiero… | Comando | Gasta un build | Quién lo recibe |
|---------|---------|----------------|-----------------|
| Ver en Hábitos Dev la rama en la que estoy | `npm start` | No | Mi iPhone, por wifi |
| Instalar en Hábitos Dev un cambio nativo | `npm run build:dev` | **Sí** | Mi iPhone, desde un enlace |
| Probar el paquete exacto que recibirán los probadores | `npm run update:dev` | No | Hábitos Dev, al abrirlo desde el lanzador |
| Entregar un cambio solo de JavaScript | `npm run update:prod` | No | **Todos** los que tengan un build compatible, sin hacer nada |
| Entregar un cambio nativo | `npm run build:prod` | **Sí** | Team (Expo) al procesarse; **Amigos**, cuando lo añado a su grupo y Apple lo aprueba |

Un cambio es **nativo** si añade o actualiza una dependencia con código nativo, o si toca `app.json` (salvo `version`), `app.config.ts` o los iconos. Todo lo demás es solo JavaScript.

**Cuidado con `package.json` y `.gitignore`.** Los `scripts` del primero y el contenido del segundo forman parte de la huella nativa. Aunque no cambien el binario, tocarlos hace que las actualizaciones dejen de llegar a los builds instalados, y entonces hace falta un build nuevo.

`update:dev` y `update:prod` comparan la huella con la del último build de su canal y se niegan a publicar si no coincide, porque EAS la publicaría con éxito y no llegaría a nadie. La huella depende de las variables del entorno de EAS: para compararla a mano, usa `eas fingerprint:compare --build-id <id> --environment <variante>`.

## Los dos caminos

### Cambio solo de JavaScript

1. Probarlo con `npm start` en Hábitos Dev.
2. Con el código en una rama o en `main`, publicar con `npm run update:dev` y probarlo en Hábitos Dev desde el lanzador ([testflight.md, 6.1](testflight.md#61-probarla-en-hábitos-dev)).
3. [Preparar la versión](#versiones) en el PR, fusionarlo y poner `main` al día (`/sync`).
4. Si necesita una migración de la nube o cambia `delete-account`, aplicarlo antes a producción ([supabase.md, secciones 5 y 9.3](supabase.md#5-aplicar-el-esquema)).
5. `npm run update:prod`. Los probadores la descargan al abrir la aplicación y la usan la siguiente vez que la abren. Se comprueba en **Ajustes**, que muestra la versión.

### Cambio nativo

1. [Preparar la versión](#versiones) en el PR, fusionarlo y poner `main` al día (`/sync`).
2. `npm run build:dev`, instalarlo y probarlo con `npm start`.
3. Si necesita una migración de la nube o cambia `delete-account`, aplicarlo antes a producción.
4. `npm run build:prod`. Se compila y se envía solo a TestFlight.
5. Cuando App Store Connect lo procese, añadirlo al grupo **Amigos** y esperar la revisión beta si la pide ([testflight.md, 3.1](testflight.md#31-probadores-externos)).

## Versiones

Cada publicación de producción, build u OTA, tiene una versión nueva y un tag en git ([ADR-0024](adr/0024-versiones-visibles-con-versionado-semantico-y-un-tag-por-publicacion.md)).

| Desde la última publicación hay… | Sube | Ejemplo |
|----------------------------------|------|---------|
| Alguna funcionalidad nueva (`feat`) | La menor | `0.2.0` → `0.3.0` |
| Solo correcciones u otros cambios (`fix`, `docs`, `chore`…) | El parche | `0.2.0` → `0.2.1` |
| Un cambio incompatible (`feat!`, `fix!`) | La mayor, o la menor antes de la `1.0.0` | `0.2.0` → `0.3.0` |

Para prepararla, en una rama:

```powershell
node scripts/bump-version.mjs
```

Calcula la versión con los commits desde el último tag y la escribe en `app.json`, `package.json` y `package-lock.json`. No gasta un build ni cambia la huella nativa. Si no hay commits nuevos, como al renovar un build que caduca, se indica el nivel: `node scripts/bump-version.mjs patch`.

`build:prod` y `update:prod` se niegan a publicar una versión que ya tiene tag, y crean el suyo cuando la publicación termina bien.

**Dónde se ve:** **Ajustes** muestra la versión que está funcionando, también tras una OTA. **TestFlight** muestra la del último build, y solo cambia con otro build.

## Antes de lanzar nada

- **`main` al día.** `build:prod` y `update:prod` lo comprueban y se niegan a seguir. `build:dev` y `update:dev` no: usan la rama en la que estés, tal como esté en tu PC. Un `build:dev` desde una rama atrasada gasta un build en un binario sin los últimos cambios nativos.
- **Sin cambios pendientes.** Los cuatro comandos se detienen si hay cambios sin commit.
- **Dependencias instaladas.** Los cuatro comandos se detienen si `node_modules` no coincide con `package-lock.json`, y piden `npm ci`. EAS CLI lee la configuración de Expo en el PC, con los plugins que haya instalados allí. Si falta uno, se para con un error que no dice la causa ("expo config exited with non-zero code"), como le pasó al primer `build:prod` de la versión 0.3.0, que añadía Sentry. `/sync` ya ejecuta `npm ci` en el checkout de `main` cuando hace falta, así que solo debería saltar si se trabaja sin `/sync`.
- **Comprobar sin lanzar.** Con `-- --check` solo se hacen las comprobaciones, por ejemplo `npm run build:dev -- --check`.

## Actualizaciones con una migración local

La app no abre una base con un esquema más nuevo que su código: muestra una pantalla de error, sin perder datos, hasta recibir una versión que lo conozca. Por eso, una actualización que añade una migración a `src/data/migrations.ts` no se puede deshacer con seguridad, ni con `eas update:rollback` ni con la vuelta automática de `expo-updates`.

1. Si lleva migración de la nube, aplicarla antes en cada entorno. Sin sus tablas, la sincronización falla y deja de subir también el resto de los datos.
2. Probarla en Hábitos Dev antes de publicarla en producción.
3. Si falla, no deshacerla: publicar una corrección.

Puede ir junto con la funcionalidad que la usa, para no enseñar a los probadores una pantalla a medias. Las actualizaciones siguientes sí se pueden deshacer, porque la versión anterior ya conoce el esquema.

## Informes de errores (Sentry)

Los errores de los dos entornos llegan a Sentry de forma anónima ([ADR-0026](adr/0026-informes-de-errores-anonimos-con-sentry.md)). Para que se lean con su código fuente, cada build y cada actualización suben sus *source maps*.

### Puesta en marcha (una vez, la hace el usuario)

1. **Cuenta y proyecto.**
   - En [sentry.io](https://sentry.io), crea la cuenta y la organización con **Data Storage Location: EU**. No se puede cambiar después: habría que crear otra organización.
   - Crea un proyecto **React Native** llamado `habitos`. Es uno para los dos entornos, que se distinguen por `environment`.
   - En los ajustes del proyecto, activa **Prevent Storing of IP Addresses**. La app ya no las envía; esto lo asegura también en el servidor.
2. **Slug de la organización.** Pon el de tu organización (aparece en la URL) en `organization` del plugin `@sentry/react-native/expo` de `app.json`.
3. **Token.** Crea un token de organización en **Settings → Developer Settings → Organization Tokens**. Sirve para subir los source maps y crear las releases.
4. **Variables de EAS.** El DSN está en **Project Settings → Client Keys (DSN)**:

   ```powershell
   eas env:set --name SENTRY_AUTH_TOKEN --value <token> --environment development --environment production --visibility sensitive
   ```

   ```powershell
   eas env:set --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --environment development --visibility plaintext
   ```

   ```powershell
   eas env:set --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --environment production --visibility plaintext
   ```

   El DSN se crea en cada entorno por separado, aunque hoy coincida, para no mezclar valores de las dos variantes ([ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md)). No es secreto: viaja dentro de la app.
5. **Token en Windows.** Guárdalo como variable de entorno de tu usuario, porque las actualizaciones suben sus source maps desde el PC. Abre después una terminal nueva:

   ```powershell
   [Environment]::SetEnvironmentVariable("SENTRY_AUTH_TOKEN", "<token>", "User")
   ```

6. **En el PC, si quieres probar Sentry con `npm start`:** ejecuta `eas env:pull` y el DSN de desarrollo llegará a `.env.local`. Sin DSN, la app funciona igual y no envía nada.

**La URL del plugin es `https://sentry.io/`, no la de la región (`de.sentry.io`).** El token de organización lleva su propia dirección, y `sentry-cli` la usa en lugar de la configurada: con otra, avisa en cada subida. Sentry dirige cada petición a la región de la organización, la UE. La app envía los errores a la dirección del DSN (`ingest.de.sentry.io`).

### Qué hace cada comando

- **`build:dev` y `build:prod`:** la fase de Xcode que añade el plugin sube los source maps y los símbolos nativos con el token del entorno de EAS. Si falta el token, el build falla, y si falta el DSN, se detiene al leer la configuración. Así ningún build sale sin informes.
- **`update:dev` y `update:prod`:** se niegan a publicar sin `SENTRY_AUTH_TOKEN` en Windows. El DSN no lo comprueban: si se borra del entorno de EAS, la actualización sale sin informes de errores. Después de `eas update`, suben los source maps de `dist`. Si la subida falla, la actualización ya está publicada. En ese caso, se repite solo la subida, sin volver a publicar, con `npm run update:dev -- --upload-sourcemaps` (o `update:prod`). Hay que hacerlo antes de cualquier otro `eas update` o `expo export`, porque `dist` tiene que seguir siendo el de esa actualización.

### Comprobarlo

Con un build nuevo de Hábitos Dev, fuerza un error (por ejemplo, un `throw` temporal en una pantalla, publicado con `update:dev`). Después comprueba en Sentry tres cosas:

- el error aparece en el entorno `development`, con las líneas de `src/`;
- en el rastro hay pantallas, pero no toques ni nombres de hábitos;
- no aparece ningún usuario ni ninguna dirección IP.

## Límites

- **Los builds son limitados:** 15 de iOS en el plan gratuito de EAS. Conviene agrupar los cambios nativos.
- **Un build de TestFlight caduca a los 90 días.** Antes hay que subir otro, aunque no haya cambios nativos.
- **El plan gratuito de Sentry** admite 5000 errores al mes y una sola persona. Los fallos de conexión no se envían.
- **Una actualización solo llega a los builds con su mismo código nativo.** Si no coincide, no llega y tampoco rompe nada. El build `0.1.0 (1)`, anterior a `expo-updates`, nunca recibe actualizaciones.

## Si algo sale mal

**Si la actualización añade una [migración local](#actualizaciones-con-una-migración-local), no la deshagas:** la app dejaría de abrirse hasta recibir otra versión. Publica una corrección.

En los demás casos, si falla al arrancar, `expo-updates` vuelve sola a la anterior. Para deshacerla a mano:

```powershell
eas update:rollback
```

Permite volver a una actualización anterior o al código del propio build. Para dejar de servir actualizaciones sin publicar otra: `eas channel:pause production` (y `eas channel:resume production` para reanudar).
