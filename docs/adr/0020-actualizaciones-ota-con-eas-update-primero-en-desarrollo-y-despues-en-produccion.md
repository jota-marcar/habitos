# ADR-0020: Actualizaciones OTA con EAS Update, primero en desarrollo y después en producción

- **Estado:** Propuesto
- **Fecha:** 2026-11-20

## Contexto

- Desde el 2026-11-19 la aplicación la usan en TestFlight el usuario y unos amigos. Cada incidencia del testeo que se corrige ([incidencias-del-testeo.md](../incidencias-del-testeo.md)) solo les llega con un build nuevo, aunque sea un cambio solo de JavaScript, como lo fueron las ocho primeras.
- Los builds de iOS en EAS son limitados (15 en el plan gratuito), y cada uno pasa por la compilación y por TestFlight ([ADR-0002](0002-expo-como-plataforma.md)).
- La [arquitectura](../arquitectura.md#8-entornos-y-publicación) preveía desde el principio que los cambios de JavaScript llegarían a producción con EAS Update, pero `expo-updates` no se instaló en el primer build de producción.
- Una actualización que llega a todos los probadores a la vez también les lleva cualquier fallo a la vez: el usuario quiere probarla antes que nadie.
- Ningún valor de desarrollo puede acabar en producción, ni al revés ([ADR-0008](0008-variantes-de-desarrollo-y-produccion.md)). Al publicar una actualización, la configuración y las variables `EXPO_PUBLIC_*` se resuelven en el PC, no en EAS Build: el `env` de los perfiles de `eas.json` (`APP_VARIANT`) no se aplica, y Expo lee `.env.local`, que tiene los valores de desarrollo. Comprobado: sin desactivar `.env.local`, la configuración de producción toma el cliente de Google de desarrollo.
- Una actualización de JavaScript que llegue a un binario sin el código nativo que necesita (por ejemplo, una dependencia nativa nueva) hace fallar la aplicación.

## Opciones consideradas

### Solo builds, como hasta ahora
- ✅ Nada nuevo que configurar ni que vigilar.
- ❌ Cada corrección gasta un build y espera a la compilación y a TestFlight.
- ❌ Las correcciones se acumulan sin llegar a los probadores, que siguen viendo los fallos que ya reportaron.

### EAS Update directo a producción
- ✅ Lo más rápido: una orden y llega a todos.
- ❌ Nadie prueba antes el paquete exacto que se publica: con Metro se prueba el código, no el paquete exportado ni su configuración.

### EAS Update, primero en Hábitos Dev y después en producción (elegida)
- ✅ El usuario prueba en su iPhone el paquete exportado, igual que lo recibirá producción, antes que los probadores.
- ✅ La prueba usa la nube de desarrollo: nunca se prueba un paquete de desarrollo contra datos reales.
- ✅ Cada variante tiene su canal, así que una actualización de una nunca llega a la otra.
- ❌ Dos publicaciones por cambio. Lo que cambia entre ellas son los valores de cada entorno, no el código.
- ❌ En un development build, la actualización se abre a mano desde el lanzador de desarrollo.

### Un canal de pruebas en el binario de producción
- ✅ Prueba el mismo binario que los probadores.
- ❌ Necesita un interruptor oculto en la aplicación para cambiar de canal: más pantalla y más complejidad, en contra del minimalismo.
- ❌ La prueba se haría con los datos reales de la cuenta.

### Una tercera variante de pruebas (build interno)
- ✅ Un binario casi de producción solo para el usuario.
- ❌ Gasta un build más por cada cambio nativo y necesita su propio backend, lo que ya descartó el [ADR-0008](0008-variantes-de-desarrollo-y-produccion.md).

### Versión de runtime: `fingerprint` frente a `appVersion`
- `fingerprint` (elegida): Expo calcula una huella del código nativo y la configuración. Una actualización solo llega a los builds con la misma huella, así que nunca llega a un binario incompatible. Si algo cambia la huella sin querer, la actualización no llega, que es un fallo seguro y se detecta en la prueba en Hábitos Dev.
- `appVersion`: la versión de runtime es `version` de `app.json`. Es sencilla, pero obliga a recordar subirla en cada cambio nativo. Si se olvida, una actualización llega a un binario incompatible y la aplicación falla a los probadores.

## Decisión

Se usa EAS Update (`expo-updates`) con estas reglas:

- **Versión de runtime por `fingerprint`** (`runtimeVersion` en `app.json`) y la URL de actualizaciones del proyecto de EAS.
- **Un canal por variante:** `development` y `production`, fijados en cada perfil de `eas.json`. Un test comprueba que cada perfil usa el canal de su variante.
- **Primero en Hábitos Dev:** `npm run update:dev` publica en el canal `development` desde cualquier rama sin cambios pendientes. El usuario la abre en Hábitos Dev desde el lanzador de desarrollo y la prueba.
- **Después en producción:** `npm run update:prod` publica en el canal `production`. Solo funciona desde `main` al día con GitHub y pide confirmar que se ha probado en Hábitos Dev.
- **La separación de variantes la imponen los scripts** (`scripts/update.mjs`): fijan `APP_VARIANT`, toman las variables solo del entorno de EAS de la variante (`--environment`) y no leen `.env.local` (`EXPO_NO_DOTENV=1`). Publican solo para iOS.
- Los ajustes de `expo-updates` quedan por defecto: busca la actualización al abrir la aplicación y la aplica la siguiente vez que se abre, nunca en mitad del uso.

## Consecuencias

- ✅ Las correcciones de JavaScript llegan a los probadores en minutos y sin gastar builds.
- ✅ Hay prueba previa, y una actualización que falla al arrancar vuelve sola a la anterior (recuperación de errores de `expo-updates`, que Expo advierte que puede cambiar). Una actualización se puede deshacer con `eas update:rollback`, salvo si añade una migración local ([despliegue.md](../despliegue.md#si-algo-sale-mal)).
- ❌ Instalarlo es un cambio nativo: hace falta un build de cada variante para que empiecen a recibir actualizaciones. Las anteriores no las reciben nunca.
- ❌ Los cambios nativos (dependencias con código nativo, `app.json`, `app.config.ts`) siguen necesitando un build. La huella no avisa al publicar: la actualización simplemente no llega a los builds antiguos.
- ❌ Una actualización que necesita una migración de la nube exige aplicarla antes a producción, igual que con los builds.
- Pendiente: si la huella no coincide entre el build y la actualización (la calcula el PC con Windows al publicar y EAS Build en macOS al compilar), Hábitos Dev no verá la actualización. Se comprobará con la primera publicación; si pasa, `eas fingerprint:compare` muestra la diferencia.
