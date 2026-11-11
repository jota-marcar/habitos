# ADR-0008: Variantes de desarrollo y producción

- **Estado:** Propuesto
- **Fecha:** 2026-11-11

## Contexto

- La arquitectura prevé dos entornos, desarrollo y producción, cada uno con su backend ([arquitectura, sección 8](../arquitectura.md#8-entornos-y-publicación)).
- Regla del proyecto: ningún valor de desarrollo puede acabar en producción, ni al revés.
- La aplicación se usa a diario en el mismo iPhone con el que se desarrolla. Si las dos versiones comparten identidad, instalar una borra la otra y sus datos.
- Los recordatorios ([ADR-0005](0005-recordatorios-locales-en-ventana-deslizante.md)) hay que probarlos en un iPhone real, y eso exige un development build: Expo Go no sirve.
- No hay Mac: las compilaciones de iOS se hacen en EAS Build ([ADR-0002](0002-expo-como-plataforma.md)).

## Opciones consideradas

### Una sola aplicación, con la configuración cambiada por entorno
- ✅ Un solo identificador y un solo juego de credenciales de firma.
- ❌ Solo puede haber una instalada: probar un cambio obliga a sustituir la aplicación de uso diario.
- ❌ Las dos versiones comparten los datos locales y los permisos del dispositivo, así que un build de desarrollo puede estropear datos reales.
- ❌ Nada distingue a simple vista qué versión se está usando.

### Dos variantes con identidad propia: desarrollo y producción
- ✅ Conviven en el mismo iPhone, cada una con sus datos, sus notificaciones y su enlace (`scheme`).
- ✅ La identidad sale de un único valor (`APP_VARIANT`), fácil de comprobar con tests.
- ✅ El nombre ("Hábitos Dev") deja claro cuál se está usando.
- ❌ Dos identificadores que registrar y firmar en Apple.
- ❌ Lo que dependa del identificador (notificaciones push, inicio de sesión con terceros) habrá que configurarlo dos veces.

### Tres variantes: desarrollo, preview y producción
- ✅ Permite probar un build casi de producción sin tocar la aplicación real.
- ❌ Ese papel ya lo cubre TestFlight para un proyecto de una sola persona.
- ❌ Un tercer entorno pide un tercer backend o compartir uno, que es justo lo que se quiere evitar.

### Dos proyectos de Expo separados
- ✅ Separación total, también de permisos y de historial de compilaciones.
- ❌ Duplica la configuración y obliga a mantenerla igual a mano.
- ❌ Excesivo para un solo desarrollador.

## Decisión

Dos variantes, **desarrollo** y **producción**, dentro del mismo proyecto de Expo:

| | Desarrollo | Producción |
|---|---|---|
| `APP_VARIANT` | `development` | `production` |
| Nombre visible | Hábitos Dev | Hábitos |
| Nombre interno | Habitos Dev | Habitos |
| Bundle identifier | `com.jotamarcar.habitos.dev` | `com.jotamarcar.habitos` |
| Scheme | `habitos-dev` | `habitos` |
| Perfil de EAS | `development` (development build, distribución interna) | `production` (tienda y TestFlight) |

- Todo lo que cambia entre variantes vive en `app.config.ts`. `app.json` guarda solo lo común.
- Cada perfil de `eas.json` fija su `APP_VARIANT`. No hay más perfiles que esos dos.
- **Si falta `APP_VARIANT`, la variante es desarrollo.** Así, arrancar el servidor en el PC no necesita configuración y producción solo se compila cuando se pide de forma expresa.
- **Un valor desconocido es un error**, no una vuelta silenciosa a una variante por defecto.
- La configuración por entorno que llegue después (por ejemplo, la URL de Supabase) seguirá la misma regla: sale de la variante o de variables de entorno de EAS, nunca de un valor compartido ni de git.

## Consecuencias

- Las dos aplicaciones pueden estar instaladas a la vez en el iPhone sin compartir datos.
- `expo-dev-client` pasa a ser una dependencia. Sus herramientas de desarrollo solo se compilan en la configuración de depuración, así que no entran en el build de producción.
- Los tests de `app.config.ts` comprueban que las variantes no comparten nombre, scheme ni identificador.
- Compilar para el iPhone exige una cuenta de pago del Apple Developer Program.
- El nombre interno, del que sale el nombre del proyecto de Xcode, va sin tilde: EAS y Expo lo calculan de forma distinta cuando lleva letras no ASCII y la compilación falla. La tilde va solo en el nombre visible.
- El número de compilación lo lleva EAS (`appVersionSource: remote`), no el repositorio.
- Queda pendiente decidir cómo se guardan las variables de cada entorno cuando exista el backend ([ADR-0003](0003-supabase-como-backend.md)).
