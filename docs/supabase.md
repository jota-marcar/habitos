# Supabase: puesta en marcha y migraciones

Guía de los pasos que se hacen fuera del repositorio: crear los proyectos de Supabase, enlazarlos con la CLI y aplicarles el esquema. Lo técnico está en [arquitectura.md](arquitectura.md) y en los ADR [0003](adr/0003-supabase-como-backend.md), [0015](adr/0015-pruebas-del-esquema-de-supabase-con-pgtap-en-la-ci.md) y [0016](adr/0016-cursor-de-sincronizacion-serializado-por-usuario.md).

## Qué hay en el repositorio

| Ruta | Qué es |
|------|--------|
| `supabase/config.toml` | Configuración del proyecto para la CLI (la que crea `supabase init`) |
| `supabase/migrations/` | El esquema de la nube, como migraciones SQL que se aplican en orden |
| `supabase/tests/database/` | Tests pgTAP de Row Level Security y restricciones. Corren en la CI |
| `supabase/tests/schema-alignment.test.ts` | Comprueba que la nube y el dispositivo tienen las mismas columnas. Corre en la CI |

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

Muestra las migraciones que va a aplicar, sin aplicarlas. Debe aparecer `20261117120000_initial_schema.sql`. Si todo cuadra:

```powershell
supabase db push --remote
```

Pide confirmación: la respuesta por defecto es **No**, así que escribe `y` y pulsa Intro.

### Producción

Como la app todavía no usa la nube, puedes aplicar ya el esquema inicial a producción:

```powershell
supabase db push --remote=REF_PROD --dry-run
supabase db push --remote=REF_PROD
```

Sustituye `REF_PROD` por el identificador de `habitos` (producción), igual que antes: sin comillas ni `< >`.

Pedirá la contraseña de la base de datos de `habitos` (la de producción, no la de desarrollo) y la confirmación.

A partir de ahora, cada migración nueva se aplica **primero a desarrollo**, y a producción solo cuando la versión de la app que la necesita vaya a llegar a TestFlight.

## 6. Comprobar que ha ido bien

En el panel de cada proyecto:

1. **Table Editor:** aparecen `habits`, `habit_versions`, `entries` y `reminders`, vacías.
2. Cada tabla muestra que tiene **RLS enabled** y tres políticas (leer, crear y actualizar).
3. **Advisors → Security Advisor:** no debe haber avisos sobre estas tablas. Si aparece alguno, cópialo en la conversación para analizarlo antes de seguir.

## 7. Hacer obligatorio el check de la base en GitHub (una sola vez)

En el repositorio de GitHub, **Settings → Rules** (o **Branches**, según cómo esté configurada la protección de `main`), edita la regla de `main` y añade **Database** a los checks obligatorios, junto a **Verify**. El check solo aparece en la lista después de que la CI lo haya ejecutado al menos una vez, en el PR que lo introduce.

## Qué no hay que hacer

- No subas a git las contraseñas de las bases de datos, ni la `service_role` o claves secretas del proyecto. La app solo usará la clave pública, y llegará por variables de entorno de EAS (en el PR del inicio de sesión).
- No edites una migración ya aplicada a un proyecto: el cambio va en una migración nueva.
- No cambies el esquema desde el panel de Supabase (Table Editor o SQL Editor). Lo que no está en `supabase/migrations` se pierde al recrear un proyecto y no lo prueba la CI.

## Pendiente para los siguientes PR

- **Inicio de sesión:** activar los proveedores Apple y Google en **Authentication → Sign In / Providers** de cada proyecto y pasar a EAS la URL y la clave pública de cada uno.
- **Eliminar la cuenta:** desplegar la Edge Function con `supabase functions deploy`.
- **Automatizar `db push` desde la CI**, si aplicar las migraciones a mano empieza a repetirse.
