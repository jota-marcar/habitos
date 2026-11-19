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

- **Iniciar sesión con tu Apple ID**, para gestionar las credenciales.
- **Certificado de distribución:** reutiliza el de los development builds o crea uno.
- **Perfil de aprovisionamiento de App Store** para `com.jotamarcar.habitos`: deja que lo cree.
- **App Store Connect API Key** para el envío: deja que la genere y la guarde en EAS. Los envíos siguientes ya no piden el Apple ID.

Después, revisa `git diff app.json`. El script avisa si EAS lo ha cambiado. Si el build termina pero el envío falla, se puede repetir solo el envío, sin gastar otro build:

```powershell
eas submit --platform ios --profile production --latest
```

## 3. TestFlight

1. App Store Connect procesa el build (de 5 a 30 minutos) y avisa por correo. Aparece en la pestaña **TestFlight** de la app.
2. No pide información de cumplimiento de exportación: `ITSAppUsesNonExemptEncryption: false` en `app.json` ya la da.
3. En **Pruebas internas**, crea un grupo (por ejemplo, `Interno`), añádete como probador y añade el build. Con la distribución automática del grupo, los builds siguientes llegan solos.
4. En el iPhone, instala la app **TestFlight** de la App Store, acepta la invitación del correo e instala Hábitos. Convive con Hábitos Dev: son apps distintas.

Cada build de TestFlight caduca a los **90 días**. Antes de que caduque, hay que subir uno nuevo.

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
