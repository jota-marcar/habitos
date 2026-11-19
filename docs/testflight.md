# Build de producción y TestFlight

Guía para compilar la variante de producción, Hábitos (`com.jotamarcar.habitos`), y publicarla en TestFlight. Los pasos que se hacen fuera del repositorio los lanza el usuario. Lo técnico está en [arquitectura.md](arquitectura.md#8-entornos-y-publicación) y en los ADR [0002](adr/0002-expo-como-plataforma.md) y [0008](adr/0008-variantes-de-desarrollo-y-produccion.md).

## Qué hay en el repositorio

| Ruta | Qué es |
|------|--------|
| `eas.json` → `build.production` | El perfil del build: `APP_VARIANT=production` y las variables del entorno `production` de EAS |
| `eas.json` → `submit.production` | El envío a App Store Connect: `ascAppId` es el identificador de la app allí |
| `scripts/build.mjs` | `npm run build:prod`: comprueba que se compila `main` al día, lanza el build y lo envía a TestFlight |

`appVersionSource: "remote"` y `autoIncrement` hacen que EAS guarde y suba el número de build en cada compilación. La versión que ve el usuario es `version` en `app.json`.

## 1. Antes del primer build (una sola vez)

### 1.1 La nube de producción

El build apunta a `habitos`, así que todo lo de producción de [supabase.md](supabase.md) debe estar hecho antes: el esquema (sección 5), el inicio de sesión con Apple y Google (sección 8) y eliminar la cuenta (sección 9). Para comprobarlo, sustituye `REF_PROD` por el identificador de `habitos`:

```powershell
supabase migration list --remote=REF_PROD
supabase secrets list --remote=REF_PROD
supabase functions list --remote=REF_PROD
eas env:list --environment production
```

- Cada migración de *Local* aparece también en *Remote*.
- Están los cuatro secretos `APPLE_*` y `delete-account` aparece como `ACTIVE`.
- Hay cuatro variables, la URL lleva el identificador de `habitos` y ningún valor coincide con los de `development`.

### 1.2 La app en App Store Connect

EAS Submit puede crear la app, pero falla si el nombre ya lo usa otra app de la App Store, y un nombre tan corto como "Hábitos" suele estarlo. Por eso se crea a mano:

1. En [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **Nueva app**.
2. **Plataforma:** iOS. **Nombre:** uno libre en la App Store. Es el de la tienda y TestFlight; bajo el icono se ve `CFBundleDisplayName`, "Hábitos". **Idioma principal:** Español (España). **ID del paquete:** `com.jotamarcar.habitos` (aparece si el App ID existe; ver [supabase.md, 8.1](supabase.md#81-apple-developer-sign-in-with-apple-en-cada-app-id)). **SKU:** `habitos`. **Acceso:** completo.
3. En **Información de la app**, el **ID de Apple** (unos 10 dígitos) es el `ascAppId` de `eas.json`. No es secreto. Solo hay que cambiarlo si se vuelve a crear la app.

## 2. Lanzar el build

Gasta uno de los builds de iOS del plan gratuito de EAS, así que agrupa antes los cambios. Con el PR fusionado y `main` al día (`/sync`):

```powershell
npm run build:prod -- --check
npm run build:prod
```

El primero solo hace las comprobaciones: que no haya cambios sin commit, que la rama sea `main` y que coincida con GitHub. El segundo compila en EAS y, al terminar, envía el build a App Store Connect (`--auto-submit`).

La primera vez, EAS pregunta en la terminal:

| Pregunta | Respuesta | Por qué |
|----------|-----------|---------|
| Iniciar sesión con tu Apple ID | Sí | Para gestionar los certificados y los perfiles |
| *Reuse this distribution certificate?* | Sí | El de los development builds sirve para todas las apps del equipo, y Apple limita cuántos puede haber |
| Perfil de aprovisionamiento de App Store para `com.jotamarcar.habitos` | Generarlo | |
| *Would you like to set up Push Notifications for your project?* | **No** | La app solo usa notificaciones locales (`enableRemoteNotifications: false`). Si se contesta que sí, ofrece reutilizar una clave de push existente (aceptar: no cambia el binario) o crear una nueva (innecesaria) |
| *Generate a new App Store Connect API Key?* | Sí | EAS la guarda y los envíos siguientes ya no piden el Apple ID |
| *Select role for the generated API key* | **`APP_MANAGER`** | Basta para subir builds y gestionar TestFlight. `ADMIN`, la opción por defecto, también podría gestionar usuarios y acuerdos de la cuenta, y la clave queda en los servidores de Expo |

En el envío, EAS crea además el grupo de pruebas internas `Team (Expo)` en TestFlight y te añade como probador.

La clave de la API se puede consultar o revocar en **App Store Connect → Usuarios y acceso → Integraciones → App Store Connect API**.

Después, revisa `git diff app.json`. El script avisa si EAS lo ha cambiado. Si el build termina pero el envío falla, se puede repetir solo el envío, sin gastar otro build:

```powershell
eas submit --platform ios --profile production --latest
```

## 3. TestFlight

1. App Store Connect procesa el build (de 5 a 30 minutos) y avisa por correo. Aparece en la pestaña **TestFlight** de la app.
2. No pide información de cumplimiento de exportación: `ITSAppUsesNonExemptEncryption: false` en `app.json` ya la da.
3. En **Pruebas internas → Team (Expo)**, el grupo que crea EAS, comprueba que el build está asignado y que apareces como probador. Si el build no está, añádelo con **+**. Los grupos internos no pasan revisión de Apple.
4. En el iPhone, instala la app **TestFlight** de la App Store, acepta la invitación del correo (o abre TestFlight, si el correo es el de tu Apple ID) e instala Hábitos. Convive con Hábitos Dev: son apps distintas.

Cada build de TestFlight caduca a los **90 días**: a partir de ahí la app no se abre. Antes de que caduque, hay que subir uno nuevo.

### 3.1 Probadores externos

Para que pruebe la app alguien que no es usuario de tu cuenta de App Store Connect (un amigo, por ejemplo), se usa un grupo de **pruebas externas**. No le da ningún acceso a tu cuenta.

1. **TestFlight → Información de pruebas:** una descripción breve de la beta, un correo para comentarios, tus datos de contacto y una nota para el revisor: "Se inicia sesión con Sign in with Apple o Google; no hace falta cuenta de demostración".
2. **Pruebas externas → +:** crea un grupo (por ejemplo, `Amigos`), añade a los probadores por su correo y añade el build. Se envía a la **revisión beta** de Apple.
3. El estado del build en el grupo pasa por **Pendiente de revisión** (en la cola de Apple), **En revisión** y **Aprobado** (o **Rechazado**, con el motivo en App Store Connect y por correo). Suele tardar menos de un día; la primera vez puede tardar uno o dos. Los builds siguientes de la misma versión no siempre necesitan una revisión completa.
4. Al aprobarse, a cada probador le llega un correo con un enlace para abrir TestFlight y un código de canje. Basta con abrirlo en el iPhone. El correo de la invitación puede ser distinto del de su Apple ID: la invitación se asocia al Apple ID que la canjea, y es de un solo uso.
5. **Google:** mientras el proyecto `habitos` de Google Cloud esté "en pruebas", solo pueden entrar con Google las cuentas de su lista de usuarios de prueba (**Google Auth Platform → Público**). Añade las de los probadores, o pulsa **Publicar aplicación** ([supabase.md, 8.2](supabase.md#82-google-cloud-un-proyecto-por-entorno)). Con Apple pueden entrar sin más.

Los datos de los probadores quedan en `habitos`, visibles desde el panel; conviene que lo sepan. Pueden borrarlos con **Ajustes → Eliminar cuenta**. Pueden desinstalar TestFlight y la app sigue funcionando, pero sin TestFlight no reciben los builds nuevos, que hacen falta cuando caduca el actual.

## 4. Probarlo en el iPhone

Contra `habitos`, no contra `habitos-dev`:

1. **Iniciar sesión con Apple** entra en la app. En **Authentication → Users** de `habitos` aparece el usuario con el proveedor `apple`.
2. Crea un hábito y márcalo. Al cabo de unos segundos, sus filas aparecen en **Table Editor** de `habitos`.
3. **Ajustes → Cerrar sesión** y **Iniciar sesión con Google**. El usuario de Google aparece en **Users**.
4. **Ajustes → Eliminar cuenta** con cada proveedor. El usuario y sus filas desaparecen de `habitos`. Con Apple, en **Ajustes del iPhone → [tu nombre] → Iniciar sesión con Apple**, Hábitos ya no aparece.
5. Nada de lo anterior aparece en `habitos-dev`.

Si algo falla, el registro de la función está en **Edge Functions → delete-account → Logs** del panel de `habitos`, y el del inicio de sesión, en **Authentication → Logs** (o **Logs → Auth**).

## 5. Las versiones siguientes

1. Las migraciones nuevas y los cambios de `delete-account` se aplican a `habitos` antes de que el build que los usa llegue a TestFlight ([supabase.md, secciones 5 y 9.3](supabase.md#5-aplicar-el-esquema)).
2. Si cambia algo que ve el usuario, sube `version` en `app.json`. El número de build lo sube EAS.
3. `npm run build:prod` desde `main` al día.
