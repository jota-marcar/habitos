# ADR-0017: Inicio de sesión nativo con Apple y Google y sesión en el llavero

- **Estado:** Aceptado
- **Fecha:** 2026-11-17

## Contexto

- **Requisitos:**
  - Para usar la app hay que iniciar sesión con Apple o Google (RF-01).
  - La sesión dura hasta que el usuario la cierra (RF-02).
  - Al cerrarla, los datos se borran del dispositivo (RF-03).
- **ADR-0003:** fijó Supabase Auth con el inicio de sesión **nativo**: el token obtenido en el dispositivo se envía a Supabase con `signInWithIdToken`.
- **Lo que queda por decidir:** con qué librerías se obtiene el token, cómo se protege frente a la reutilización y dónde se guarda la sesión.
- **Nonce.** Un *nonce* es un valor aleatorio de un solo uso que el proveedor mete en el token. Supabase comprueba que coincide con el que envía la app, así que un token interceptado no sirve para iniciar sesión en otro lado. Sin nonce, Supabase sigue comprobando la firma, la caducidad y el destinatario del token.
- **Qué contiene la sesión de Supabase:**
  - un token de acceso que caduca en una hora;
  - un token de renovación, que da acceso indefinido a los datos de la cuenta;
  - los datos del usuario.

  El conjunto suele pasar de 2 KB.
- **Sincronización en segundo plano:** la tarea en segundo plano ([ADR-0005](0005-recordatorios-locales-en-ventana-deslizante.md)) y los botones de los recordatorios ([ADR-0012](0012-botones-de-los-recordatorios-en-segundo-plano-con-javascript.md)) se ejecutan a veces con el iPhone bloqueado. Si en el futuro sincronizan, necesitarán leer la sesión en ese momento.
- **Variantes:** las dos variantes son apps distintas con su propio proyecto de Supabase ([ADR-0008](0008-variantes-de-desarrollo-y-produccion.md)), y no deben mezclar nunca sus valores.

## Opciones consideradas

### Apple

Solo hay una opción nativa: `expo-apple-authentication`, el módulo oficial de Expo. Admite nonce.

### Google

#### `@react-native-google-signin/google-signin`, versión gratuita ("Original")
- ✅ Es la que recomienda Expo. Muestra el selector de cuenta nativo de iOS y no necesita Firebase.
- ❌ No admite nonce: esa opción solo existe en la versión de pago. Supabase exige activar "Skip nonce check" en el proveedor de Google.

#### La misma librería, versión de pago ("Universal")
- ✅ Admite nonce.
- ❌ Es una licencia de pago y se instala desde un registro privado con token, lo que complica la CI y EAS.

#### OAuth en el navegador (`signInWithOAuth` de Supabase)
- ✅ Admite nonce y PKCE, sin librería nativa.
- ❌ No es nativo: abre una hoja del navegador. Contradice el ADR-0003 y la preferencia por lo nativo de iOS.

### Almacenamiento de la sesión

#### `localStorage` de `expo-sqlite` (la guía de Supabase de Expo)
- ✅ No añade dependencias nativas.
- ❌ El token de renovación queda sin cifrar en un fichero de la app y entra en las copias de iCloud.

#### `LargeSecureStore` (el tutorial de Expo de Supabase)
- ✅ Guarda en el llavero una clave AES y en AsyncStorage la sesión cifrada con ella.
- ❌ Necesita tres dependencias más (`aes-js`, `react-native-get-random-values` y AsyncStorage) para resolver solo el límite de tamaño.

#### `expo-secure-store` (llavero de iOS), con la sesión troceada
- ✅ El token de renovación vive en el llavero, cifrado por el sistema y fuera de las copias sin cifrar.
- ✅ No añade más dependencias que la propia `expo-secure-store`.
- ❌ Algunas versiones de iOS rechazaban valores de más de unos 2 KB. Hay que trocear la sesión, unas pocas líneas con tests.
- ❌ El llavero sobrevive a la desinstalación de la app. Al reinstalarla, la sesión sigue abierta con la base local vacía, que la sincronización rellenará.

## Decisión

- **Apple:** se usa `expo-apple-authentication` **con nonce**.
  - La app genera un valor aleatorio con `expo-crypto`.
  - A Apple le pasa su hash SHA-256 y a Supabase el valor original.
- **Google:** se usa `@react-native-google-signin/google-signin` en su **versión gratuita**, con "Skip nonce check" activado en Supabase.
  - El riesgo que se asume es el de un token de Google interceptado y reutilizado durante su hora de validez.
  - Es bajo para una app personal en la que Row Level Security aísla los datos de cada usuario.
  - Si la app se abre a más usuarios, se reconsiderará la versión de pago.
- **Sesión:** se guarda en el llavero con `expo-secure-store`, troceada en fragmentos de menos de 2 KB.
  - La accesibilidad es `AFTER_FIRST_UNLOCK`, para que el código en segundo plano pueda leerla con el iPhone bloqueado tras el primer desbloqueo.
  - Es la misma protección que tiene la base local.
  - Se pierde la de `WHEN_UNLOCKED`, que solo permite leerla con el iPhone desbloqueado.
- **Configuración por entorno:** la URL de Supabase, su clave pública (*publishable key*) y los identificadores de cliente de Google llegan como variables `EXPO_PUBLIC_*` de los entornos de EAS (`development` y `production`).
  - Cada perfil de `eas.json` declara su `environment`, y un test comprueba que coincide con su `APP_VARIANT`.
  - En el PC, `eas env:pull` las escribe en `.env.local`, que git ignora.
  - Son públicas, porque van dentro de la app, pero quedan fuera del repositorio, como ya decía la arquitectura.

## Consecuencias

- **Build nuevo.** Tres dependencias nativas nuevas (`expo-apple-authentication`, `@react-native-google-signin/google-signin` y `expo-secure-store`) obligan a hacer un build de EAS. Como el inicio de sesión es obligatorio, una configuración incorrecta deja la app inutilizable. Conviene probarlo en el iPhone en cuanto exista el build.
- **Configuración por variante.** Cada variante necesita lo suyo:
  - su App ID con Sign in with Apple;
  - sus clientes OAuth de Google, en un proyecto de Google Cloud propio;
  - su configuración de proveedores en su proyecto de Supabase.

  Los pasos están en [docs/supabase.md](../supabase.md).
- **Nonce en Google.** Los tokens de Google se aceptan sin nonce. Si se pasa a la versión de pago, solo cambia el código del botón de Google y se desactiva "Skip nonce check".
- **Cerrar sesión.** Cierra solo la sesión de este dispositivo (`scope: "local"`). Por defecto, Supabase la cerraría en todos.
- **Pendiente para eliminar la cuenta (RF-04).** Apple pide revocar su token. La app volverá a pedir el inicio de sesión con Apple justo antes de borrar la cuenta, así que no hace falta guardar ahora ningún código de autorización.
