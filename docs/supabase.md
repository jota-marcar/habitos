# Supabase: puesta en marcha y migraciones

Guía de los pasos que se hacen fuera del repositorio: crear los proyectos de Supabase, enlazarlos con la CLI, aplicarles el esquema, configurar el inicio de sesión con Apple y Google y desplegar la eliminación de la cuenta. El build de producción y TestFlight están en [testflight.md](testflight.md). Lo técnico está en [arquitectura.md](arquitectura.md) y en los ADR [0003](adr/0003-supabase-como-backend.md), [0015](adr/0015-pruebas-del-esquema-de-supabase-con-pgtap-en-la-ci.md), [0016](adr/0016-cursor-de-sincronizacion-serializado-por-usuario.md) y [0019](adr/0019-eliminacion-de-la-cuenta-con-una-edge-function-que-revoca-sign-in-with-apple-antes-de-borrar-al-usuario.md).

## Qué hay en el repositorio

| Ruta | Qué es |
|------|--------|
| `supabase/config.toml` | Configuración del proyecto para la CLI (la que crea `supabase init`) |
| `supabase/migrations/` | El esquema de la nube, como migraciones SQL que se aplican en orden |
| `supabase/tests/database/` | Tests pgTAP de Row Level Security y restricciones. Corren en la CI |
| `supabase/tests/schema-alignment.test.ts` | Comprueba que la nube y el dispositivo tienen las mismas columnas. Corre en la CI |
| `supabase/tests/sync.test.ts` | La sincronización de punta a punta, con dos dispositivos. Corre en la CI |
| `supabase/functions/delete-account/` | La Edge Function que elimina la cuenta (sección 9) |
| `supabase/tests/delete-account.test.ts` | Esa función de punta a punta, servida por el Supabase local. Corre en la CI |

Hay dos proyectos de Supabase, uno por entorno ([ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md)). Nunca se mezclan sus datos ni sus claves.

| Entorno | Nombre del proyecto | Para qué |
|---------|---------------------|----------|
| Desarrollo | `habitos-dev` | La variante Hábitos Dev. Las migraciones nuevas se aplican aquí primero |
| Producción | `habitos` | La variante Hábitos de TestFlight y la App Store |

## 1. Crear los dos proyectos (una sola vez)

1. Entra en [supabase.com/dashboard](https://supabase.com/dashboard) y crea una cuenta si aún no la tienes. La organización que se crea con ella sirve; el plan gratuito permite dos proyectos activos, justo los que hacen falta.
2. Pulsa **New project** y rellena:
   - **Name:** `habitos-dev`.
   - **Database password:** pulsa **Generate a password** y guárdala en tu gestor de contraseñas, como "Supabase habitos-dev (base de datos)". La pedirá la CLI al aplicar migraciones. No la pongas en ningún fichero del repositorio.
   - **Region:** la más cercana a ti. No se puede cambiar después.
   - Si aparecen opciones sobre la **Data API**, deja la Data API activada: la app hablará con la base a través de ella. La opción de exponer automáticamente las tablas nuevas da igual, porque la migración concede los permisos de forma explícita.
3. Espera a que el proyecto termine de crearse (un par de minutos).
4. Repite los pasos 2 y 3 con el nombre **`habitos`** para producción, con **otra** contraseña distinta.
5. Apunta el **identificador (ref)** de cada proyecto: son las 20 letras de la dirección del panel, `supabase.com/dashboard/project/<ref>`, o **Project Settings → General → Project ID**. No es secreto, pero tampoco hace falta ponerlo en el repositorio.

## 2. Instalar la CLI de Supabase en el PC (una sola vez)

En Windows, Supabase recomienda instalarla con [Scoop](https://scoop.sh), un instalador de programas para la terminal. En PowerShell, **sin** abrirlo como administrador:

```powershell
# Solo si no tienes Scoop. La primera línea permite ejecutar el instalador de Scoop para tu usuario.
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
```

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version
```

La versión debe ser 3.x. La CI usa una versión exacta (la de `version` en `.github/workflows/ci.yml`); en el PC basta con que sea de la misma versión mayor. Para actualizarla más adelante: `scoop update supabase`.

No hace falta Docker: los comandos de esta guía trabajan contra los proyectos de la nube.

## 3. Iniciar sesión con la CLI (una sola vez)

En la carpeta del repositorio:

```powershell
supabase login
```

Abre el navegador para autorizar la CLI en tu cuenta. El token se guarda en el almacén de credenciales de Windows, no en el repositorio.

## 4. Enlazar el repositorio con el proyecto de desarrollo

```powershell
supabase link REF_DEV
```

Sustituye `REF_DEV` por el identificador de `habitos-dev` que apuntaste en el paso 1, tal cual: sin comillas ni `< >`. Por ejemplo, `supabase link abcdefghijklmnopqrst`. En PowerShell, `<` es un operador y da el error "El operador '<' está reservado para uso futuro".

- Si pide la contraseña de la base de datos, usa la de `habitos-dev`.
- Puede mostrar diferencias entre la configuración de la API del proyecto y `supabase/config.toml`. Son avisos y no cambian nada.
- El enlace se guarda en `supabase/.temp/`, que git ignora. Comprueba que `git status` no muestra nada nuevo.

El repositorio queda enlazado con **desarrollo**. `--remote` a secas apunta siempre a ese proyecto; producción se nombra de forma explícita, para que no se pueda tocar por despiste.

## 5. Aplicar el esquema

> **Ojo con la CLI 3:** `supabase db push` sin más apunta a la base local (que aquí no existe). Para la nube hay que añadir `--remote`.

### Desarrollo

```powershell
supabase db push --remote --dry-run
```

Muestra las migraciones que va a aplicar, sin aplicarlas. Deben aparecer las de `supabase/migrations` que el proyecto aún no tenga. Si todo cuadra:

```powershell
supabase db push --remote
```

Pide confirmación: la respuesta por defecto es **No**, así que escribe `y` y pulsa Intro.

### Producción

```powershell
supabase db push --remote=REF_PROD --dry-run
supabase db push --remote=REF_PROD
```

Sustituye `REF_PROD` por el identificador de `habitos` (producción), igual que antes: sin comillas ni `< >`. Si se queda el texto `REF_PROD`, la CLI lo toma por el nombre de una rama del proyecto enlazado y falla con `Branch "REF_PROD" not found`. En todos los comandos con `--remote=REF_PROD` de esta guía pasa lo mismo.

Comprueba que la primera línea dice `Target: project <ref de habitos> (not the linked project)`. Si pide confirmación, escribe `y`. Si nombra la rama `production`, es la rama principal de `habitos`, no el entorno: el proyecto se reconoce por el identificador. Si pide la contraseña de la base de datos, es la de `habitos`, no la de desarrollo.

A partir de ahora, cada migración nueva se aplica **primero a desarrollo**, y a producción justo antes de publicar la versión de la app que la necesita, sea un build o una actualización OTA. Sin sus tablas, la sincronización falla y deja de subir también el resto de los datos ([despliegue.md](despliegue.md#actualizaciones-con-una-migración-local)).

## 6. Comprobar que ha ido bien

Desde la terminal, las migraciones aplicadas a cada proyecto:

```powershell
supabase migration list --remote
supabase migration list --remote=REF_PROD
```

Cada migración de la columna *Local* debe aparecer también en *Remote*. Si *Remote* está vacía, falta aplicarla. Sirve también para saber si un proyecto está al día antes de un build.

En el panel de cada proyecto:

1. **Table Editor:** aparecen las 9 tablas: `habits`, `habit_versions`, `entries`, `reminders`, `weekly_goals`, `weekly_goal_versions`, `weekly_goal_entries`, `long_term_goals` y `long_term_goal_entries`. En un proyecto nuevo están vacías.
2. Cada tabla muestra que tiene **RLS enabled** y tres políticas (leer, crear y actualizar).
3. **Advisors → Security Advisor:** no debe haber avisos sobre estas tablas. Si aparece alguno, cópialo en la conversación para analizarlo antes de seguir.

## 7. Hacer obligatorio el check de la base en GitHub (una sola vez)

En el repositorio de GitHub, **Settings → Rules** (o **Branches**, según cómo esté configurada la protección de `main`), edita la regla de `main` y añade **Database** a los checks obligatorios, junto a **Verify**. El check solo aparece en la lista después de que la CI lo haya ejecutado al menos una vez, en el PR que lo introduce.

## 8. Inicio de sesión con Apple y Google

La app inicia sesión de forma nativa con Apple o Google y envía el token a Supabase ([ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md)). Para que funcione hay que configurar los dos entornos por separado. **Haz cada paso dos veces, una por entorno, sin mezclar nunca los valores:**

| Entorno | Bundle ID | Proyecto de Google Cloud | Proyecto de Supabase | Entorno de EAS |
|---------|-----------|--------------------------|----------------------|----------------|
| Desarrollo | `com.jotamarcar.habitos.dev` | `habitos-dev` | `habitos-dev` | `development` |
| Producción | `com.jotamarcar.habitos` | `habitos` | `habitos` | `production` |

Apunta los valores que vayas obteniendo en tu gestor de contraseñas o en una nota aparte, con el entorno al lado. Ninguno es secreto salvo el *client secret* de Google, pero no van en el repositorio.

### 8.1 Apple Developer: Sign in with Apple en cada App ID

1. Entra en [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Abre el App ID `com.jotamarcar.habitos.dev`. Si no existe aún, se creará en el primer build que lo necesite: vuelve a este paso después.
3. En **Capabilities**, marca **Sign In with Apple**. Si pregunta, deja **Enable as a primary App ID**. No hace falta configurar la URL de notificaciones del servidor.
4. Pulsa **Save**. Si avisa de que los perfiles de aprovisionamiento quedan invalidados, acepta: EAS los regenera en el siguiente build.
5. Repite con `com.jotamarcar.habitos`.

EAS también puede activar esta capacidad al compilar, porque la app la declara (`usesAppleSignIn` en `app.json`). Hacerlo a mano no estorba y evita sorpresas.

No hace falta crear un *Services ID*: solo lo usa el inicio de sesión web. La clave `.p8` no la necesita el inicio de sesión, sino eliminar la cuenta (sección 9).

### 8.2 Google Cloud: un proyecto por entorno

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto llamado **`habitos-dev`**.
2. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth** (puede aparecer como **Google Auth Platform**) y pulsa **Comenzar**:
   - **Nombre de la aplicación:** `Hábitos Dev`. **Correo de asistencia:** el tuyo.
   - **Público:** **Externo**.
   - **Información de contacto:** tu correo. Acepta la política y pulsa **Crear**.
3. En **Público** (o **Usuarios de prueba**), añade tu cuenta de Google como usuario de prueba. Mientras la app esté "en pruebas", solo esas cuentas pueden iniciar sesión.
4. En **Clientes**, pulsa **Crear cliente**:
   - **Tipo:** **Aplicación web**. **Nombre:** `Supabase`. Sin orígenes ni URI de redirección.
   - Apunta el **ID de cliente** (`….apps.googleusercontent.com`) y el **secreto del cliente**.
5. Vuelve a **Crear cliente**:
   - **Tipo:** **iOS**. **Nombre:** `Hábitos Dev iOS`. **ID del paquete:** `com.jotamarcar.habitos.dev`.
   - Apunta su **ID de cliente**.
6. Repite todo con un proyecto **`habitos`**, la app `Hábitos` y el ID del paquete `com.jotamarcar.habitos`.

Para producción, cuando la app vaya a usarla alguien más, pulsa **Publicar aplicación** en **Público**. Con los permisos que pide (correo y perfil básico) Google no exige verificación.

### 8.3 Supabase: activar los proveedores

En el panel de cada proyecto de Supabase, en **Authentication → Sign In / Providers**:

1. **Apple:** actívalo.
   - **Client IDs:** el bundle ID de su entorno, y solo ese (`com.jotamarcar.habitos.dev` en `habitos-dev`).
   - Deja vacío **Secret Key (for OAuth)**: solo hace falta para el inicio de sesión web.
   - **Save**.
2. **Google:** actívalo.
   - **Client IDs:** el ID del cliente **web** y el del cliente **iOS** de su entorno, separados por una coma y en ese orden, sin espacios.
   - **Client Secret (for OAuth):** el secreto del cliente web de su entorno.
   - Activa **Skip nonce check**. La librería gratuita de Google no puede enviar nonce; el motivo está en el ADR-0017.
   - **Save**.

Después, en **Project Settings → API Keys**, apunta la **Publishable key** (`sb_publishable_…`). No uses la *secret key* ni la `service_role`. La **URL del proyecto** es `https://<ref>.supabase.co`, con el identificador que apuntaste en el paso 1.

### 8.4 EAS: las variables de cada entorno

La app recibe cuatro valores por entorno, como variables de EAS. Son públicos (van dentro de la app), así que su visibilidad es **plaintext**. En PowerShell, desde la carpeta del repositorio, crea las de desarrollo sustituyendo cada valor:

```powershell
eas env:set --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://REF_DEV.supabase.co
eas env:set --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value CLAVE_PUBLICA_DEV
eas env:set --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value ID_CLIENTE_WEB_DEV
eas env:set --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value ID_CLIENTE_IOS_DEV
```

Repite los cuatro con `--environment production` y los valores de producción. `env:set` crea la variable o, si ya existe, cambia su valor, así que puedes repetir un comando para corregirlo. `env:create` está obsoleto: si lo usaste, comprueba con `eas env:list` qué variables llegaron a crearse. Puedes comprobarlas con `eas env:list --environment development` o en [expo.dev](https://expo.dev), en **Environment variables** del proyecto.

Cada perfil de `eas.json` usa su entorno (`"environment"`), y un test comprueba que coincide con su variante. Así un build de desarrollo nunca recibe los valores de producción.

Para el servidor de desarrollo del PC, descarga las de desarrollo:

```powershell
eas env:pull --environment development
```

Escribe `.env.local`, que git ignora. Sin él, la app arranca en una pantalla de error que nombra las variables que faltan. Repítelo si cambias alguna variable. Después de cualquier comando de `eas`, revisa `git diff app.json`.

### 8.5 Probarlo

El inicio de sesión necesita un development build nuevo, porque añade código nativo (`npm run build:dev`). Con el build instalado y `npm start` en marcha:

1. La app abre en la pantalla de inicio de sesión.
2. **Iniciar sesión con Apple** y **Iniciar sesión con Google** entran en la app.
3. En **Authentication → Users** del proyecto de desarrollo aparece tu usuario, con el proveedor usado.
4. **Ajustes → Cerrar sesión** vuelve a la pantalla de inicio de sesión. Los hábitos se borran del dispositivo, pero siguen en la cuenta.

## 9. Eliminar la cuenta: la Edge Function `delete-account`

Eliminar la cuenta (RF-04) lo hace la Edge Function `delete-account` ([ADR-0019](adr/0019-eliminacion-de-la-cuenta-con-una-edge-function-que-revoca-sign-in-with-apple-antes-de-borrar-al-usuario.md)). Revoca el acceso de Sign in with Apple y borra al usuario. Para revocar necesita una clave privada de Apple, propia de cada entorno. **Haz cada paso dos veces, una por entorno, sin mezclar nunca los valores.**

### 9.1 Apple Developer: una clave de Sign in with Apple por entorno

1. En [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Keys**, pulsa **+**.
2. **Key Name:** `Hábitos Dev Sign in with Apple`. Marca **Sign in with Apple** y pulsa **Configure**.
3. **Primary App ID:** `com.jotamarcar.habitos.dev`. **Save** y **Continue**.
4. **Register** y después **Download**. El fichero `AuthKey_XXXXXXXXXX.p8` **solo se puede descargar una vez**: guárdalo en tu gestor de contraseñas.
5. Apunta el **Key ID** (los 10 caracteres del nombre del fichero) y tu **Team ID** (arriba a la derecha, o en **Membership details**).
6. Repite con `Hábitos Sign in with Apple` y el App ID `com.jotamarcar.habitos`.

### 9.2 Supabase: los secretos de la función

La función lee cuatro secretos de su proyecto. En PowerShell, desde la carpeta del repositorio (enlazado con **desarrollo**, sección 4), sustituye la ruta, `TEAM_ID` y `KEY_ID_DEV`:

```powershell
$key = (Get-Content -Raw "RUTA\AuthKey_KEY_ID_DEV.p8") -replace "\r?\n", "\n"
```

```powershell
supabase secrets set APPLE_TEAM_ID=TEAM_ID APPLE_KEY_ID=KEY_ID_DEV APPLE_CLIENT_ID=com.jotamarcar.habitos.dev "APPLE_PRIVATE_KEY=$key"
```

El primer comando deja la clave en una sola línea, con los saltos escritos como `\n`; la función la entiende así. Para producción, con su clave y su Key ID:

```powershell
$key = (Get-Content -Raw "RUTA\AuthKey_KEY_ID_PROD.p8") -replace "\r?\n", "\n"
```

```powershell
supabase secrets set --remote=REF_PROD APPLE_TEAM_ID=TEAM_ID APPLE_KEY_ID=KEY_ID_PROD APPLE_CLIENT_ID=com.jotamarcar.habitos "APPLE_PRIVATE_KEY=$key"
```

Comprueba los nombres con `supabase secrets list` (y `--remote=REF_PROD`): muestra un resumen del valor, nunca el valor. Después, borra el `.p8` de la carpeta de descargas: ya está en tu gestor de contraseñas y en Supabase.

### 9.3 Desplegar la función

```powershell
supabase functions deploy delete-account --use-api
```

`--use-api` empaqueta la función en los servidores de Supabase, sin Docker. Toma `verify_jwt = false` de `supabase/config.toml`: la función comprueba ella misma al usuario. Para producción, antes de publicar la versión de la app que la usa, sea un build o una actualización OTA:

```powershell
supabase functions deploy delete-account --use-api --remote=REF_PROD
```

Repite el despliegue cada vez que cambie algo en `supabase/functions/delete-account/`.

### 9.4 Probarlo

No necesita un build nuevo. Con el development build instalado y `npm start` en marcha:

1. Entra con **Google** y crea algún hábito.
2. **Ajustes → Eliminar cuenta → Eliminar cuenta.** La app vuelve a la pantalla de inicio de sesión.
3. En **Authentication → Users** de `habitos-dev`, el usuario ya no está, y en **Table Editor** no quedan filas suyas.
4. En [myaccount.google.com/connections](https://myaccount.google.com/connections), Hábitos Dev ya no aparece.
5. Con **Apple**, cuando su inicio de sesión funcione: la app pide confirmar con Apple antes de borrar. Después, en **Ajustes del iPhone → [tu nombre] → Iniciar sesión con Apple**, Hábitos Dev ya no aparece.

Si algo falla, el registro de la función está en **Edge Functions → delete-account → Logs** del panel de Supabase.

## Qué no hay que hacer

- No subas a git las contraseñas de las bases de datos, ni la `service_role` o claves secretas del proyecto, ni las claves `.p8` de Apple. La app solo usa la clave pública (*publishable key*), que llega por las variables de entorno de EAS (sección 8).
- No edites una migración ya aplicada a un proyecto: el cambio va en una migración nueva.
- No cambies el esquema desde el panel de Supabase (Table Editor o SQL Editor). Lo que no está en `supabase/migrations` se pierde al recrear un proyecto y no lo prueba la CI.

## Pendiente para los siguientes PR

- **Automatizar `db push` desde la CI**, si aplicar las migraciones a mano empieza a repetirse.
