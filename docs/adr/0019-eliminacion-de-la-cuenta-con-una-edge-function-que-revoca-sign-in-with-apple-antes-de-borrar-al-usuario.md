# ADR-0019: Eliminación de la cuenta con una Edge Function que revoca Sign in with Apple antes de borrar al usuario

- **Estado:** Aceptado
- **Fecha:** 2026-11-18

## Contexto

- **Requisito.** El usuario puede eliminar su cuenta tras una confirmación explícita (RF-04). Se borran para siempre todos sus datos, en la cuenta y en el dispositivo, y la app deja de estar conectada a su cuenta de Apple o de Google.
- **App Store.** Exige esta opción a toda app que permita crear cuentas ([5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#5.1.1)). Apple pide además [revocar el token de Sign in with Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- **En la nube, los datos dependen del usuario.** Todas las tablas cuelgan de `auth.users` con `on delete cascade` y los usuarios no tienen permiso de `delete` (ver `docs/arquitectura.md`). Borrar al usuario borra todo lo suyo, pero solo puede hacerlo quien tenga la clave secreta del proyecto.
- **Revocar el token de Apple** exige dos peticiones a Apple:
  - `/auth/token` cambia un código de autorización por un token de renovación;
  - `/auth/revoke` revoca ese token.

  Las dos van firmadas con un *client secret*: un JWT ES256 firmado con la clave privada `.p8` de Sign in with Apple. Los códigos de autorización caducan en unos cinco minutos y solo sirven una vez.
- **Lo que ya estaba decidido.** El ADR-0017 dejó para este momento la revocación: la app volvería a pedir el inicio de sesión con Apple justo antes de borrar la cuenta, sin guardar nada al iniciar sesión. La arquitectura fijó que lo haría una Edge Function de Supabase, nunca la app.
- **Claves del proyecto.** La app usa las claves nuevas de Supabase (`sb_publishable_…`). La comprobación de JWT de la pasarela de las Edge Functions (`verify_jwt`) solo entiende las claves antiguas. Supabase recomienda desactivarla y comprobar al usuario dentro de la función ([guía de migración](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)).

## Opciones consideradas

### Quién borra

**Una sola Edge Function (`delete-account`) que revoca Apple y borra al usuario**
- ✅ Las claves privadas (la de Supabase y la de Apple) solo viven en el servidor.
- ✅ Una sola llamada desde la app: o se hace todo, o nada que impida reintentar.
- ❌ Es la primera Edge Function del proyecto: necesita su despliegue, sus secretos y sus pruebas.

**Una función de Postgres (`security definer`) para borrar y una Edge Function solo para Apple**
- ✅ El borrado se prueba con pgTAP, como el resto del esquema.
- ❌ La Edge Function hace falta igualmente, por Apple. Son dos llamadas que pueden quedarse a medias.

**La app sola**
- ❌ No puede: borrar usuarios y firmar el *client secret* necesitan claves privadas, que no pueden ir dentro de la app.

### Cómo se obtiene el token de Apple

**Pedir el inicio de sesión con Apple al eliminar la cuenta, para tener un código nuevo**
- ✅ No se guarda ningún token: no hay nada que proteger ni que pueda filtrarse.
- ✅ La hoja de Apple sirve también de segunda confirmación.
- ❌ Un paso más para el usuario. Depende de que el inicio de sesión con Apple funcione.

**Cambiar el código por un token de renovación al iniciar sesión y guardarlo en la nube**
- ✅ Eliminar la cuenta no pide nada a Apple.
- ❌ Hay que guardar un token secreto por usuario, en una tabla privada, y mantenerlo al día.
- ❌ Cambia el inicio de sesión, que ya funciona, para un caso que ocurre una vez.

### Orden en la función

**Revocar Apple y después borrar al usuario**
- ✅ Si falla el borrado, el usuario sigue existiendo y puede reintentar: un código nuevo vuelve a funcionar.

**Borrar al usuario y después revocar Apple**
- ❌ Si la revocación falla, el usuario ya no existe y ninguna petición puede llegar a ella: la app quedaría conectada a Apple para siempre.

### Cómo se identifica al usuario

**`verify_jwt = false` y `auth.getUser(token)` dentro de la función**
- ✅ Funciona con las claves nuevas, y Auth rechaza también el token de un usuario que ya no existe.
- ✅ Devuelve las identidades del usuario, de donde sale el `sub` de Apple.
- ❌ Una petición a Auth en cada llamada; para una acción que se hace una vez, no importa.

**`verify_jwt = true`**
- ❌ La pasarela no entiende las claves nuevas. Supabase lo desaconseja con ellas.

## Decisión

- **Una Edge Function, `delete-account`.** Recibe el token de la sesión y, si la cuenta usa Apple, un código de autorización nuevo. Por este orden:
  1. comprueba al usuario con Auth;
  2. si la cuenta tiene una identidad de Apple, cambia el código por un token, comprueba que su `sub` es el de esa identidad y lo revoca;
  3. borra al usuario con la clave secreta, y la cascada borra sus datos.

  Responde `{ "deleted": true }` o `{ "error": "<código>" }`. La app distingue los errores por ese código.
- **Si el Apple ID no coincide, no se revoca nada ni se borra nada:** revocarlo desconectaría de la app a otro Apple ID.
- **El *client secret* se firma con WebCrypto,** sin librerías, y dura cinco minutos.
- **La app:**
  1. confirma con una alerta nativa;
  2. si la cuenta usa Apple, pide el inicio de sesión con Apple, sin pedir datos (`requestedScopes: []`);
  3. detiene la sincronización y llama a la función;
  4. solo si la función confirma el borrado, vacía la base local, cancela los avisos, revoca el acceso de Google si se entró con Google en el dispositivo y cierra la sesión local. Estos pasos se intentan todos aunque falle alguno: la cuenta ya no existe y no hay nada que reintentar.
- **Código y pruebas:**
  - La lógica de la función (`handler.ts`) y el cliente de Apple (`apple.ts`) no dependen de Deno ni de Supabase: se prueban con Jest, con cobertura del 100 %, como el dominio, los datos y la sincronización.
  - `index.ts` solo conecta esas piezas con Supabase y con Apple. Se prueba de punta a punta en el job `Database` de la CI, contra la función servida por el Supabase local ([ADR-0015](0015-pruebas-del-esquema-de-supabase-con-pgtap-en-la-ci.md)).
  - La versión de supabase-js que usa Deno (`deno.json`) se fija a la del proyecto, y un test lo comprueba.
- **Secretos por entorno.** `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` y `APPLE_CLIENT_ID` (el bundle ID) son secretos de cada proyecto de Supabase, con una clave `.p8` propia por entorno ([ADR-0008](0008-variantes-de-desarrollo-y-produccion.md)). Los pasos están en [docs/supabase.md](../supabase.md).

## Consecuencias

- **No hace falta un build nuevo:** no se añade código nativo.
- **Despliegue manual.** Crear las claves, guardar los secretos y desplegar la función (`supabase functions deploy`) lo hace el usuario, en cada entorno, siguiendo `docs/supabase.md`.
- **Sin probar de punta a punta con Apple.** Ni la CI ni los tests pueden obtener un código de autorización real. El cliente de Apple se prueba con respuestas simuladas, y el resto se verifica en el iPhone. Eso exige antes corregir el inicio de sesión con Apple, que hoy falla en el dispositivo.
- **Los demás dispositivos de la cuenta** pierden la sesión, porque Auth ya no renueva sus tokens. Pero conservan sus datos locales y sus avisos programados hasta que alguien vuelva a iniciar sesión, que los borra por pertenecer a otro usuario ([ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)). Ya ocurre siempre que una sesión termina sin cerrarla. Con un solo iPhone no aplica; si se usa en varios, convendrá cancelar los avisos al perder la sesión.
- **Google.** La app solo puede revocar su acceso si se inició sesión con Google en ese dispositivo: la revocación usa el token que guarda la librería de Google.
- **Un fallo al final del borrado en el dispositivo** (la sesión no se puede cerrar del llavero) muestra el mensaje de error aunque la cuenta ya no exista. Es muy improbable; el siguiente inicio de sesión vacía lo que quede.
