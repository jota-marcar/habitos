# ADR-0012: Botones de los recordatorios en segundo plano con JavaScript

- **Estado:** Propuesto
- **Fecha:** 2026-11-16

## Contexto

- Desde el propio recordatorio, sin abrir la aplicación, el usuario puede marcar un hábito booleano, sumar el incremento de uno cuantitativo o posponer el aviso una hora (RF-25). Al tocar el recordatorio fuera de sus botones, se abre la app en el día actual (RF-26).
- Los recordatorios son notificaciones locales con fecha concreta ([ADR-0005](0005-recordatorios-locales-en-ventana-deslizante.md)), y sus botones se registran como categorías.
- La documentación de `expo-notifications` (SDK 58) solo garantiza en Android que el código de la app se ejecute al pulsar un botón con la app en segundo plano o cerrada. En iOS no hay una forma documentada. Sí se sabe que iOS arranca la app en segundo plano para entregarle la respuesta, y que `expo-notifications` la pasa a JavaScript mediante su listener o como "última respuesta".
- El simulador no reproduce bien las notificaciones: solo el iPhone puede confirmar si funciona.

## Opciones consideradas

### Atender los botones en JavaScript, sin abrir la app
- ✅ Cumple RF-25 sin código nativo propio.
- ✅ Reutiliza el dominio y la capa de datos: el botón hace lo mismo que un toque en la lista.
- ❌ No está documentado en iOS. Puede fallar con la app cerrada, o si iOS suspende la app antes de que termine de escribir en la base.

### Botones que abren la app
- ✅ Funciona seguro: la app pasa a primer plano y atiende el botón.
- ❌ Incumple RF-25: abrir la app interrumpe al usuario justo en la acción que debería ser de un solo toque.

### Módulo nativo propio (Swift)
- ✅ Cumple RF-25 de forma garantizada: el delegado de notificaciones escribe directamente en SQLite.
- ❌ Hay que mantener código nativo, duplicar en Swift reglas del dominio (qué es cumplido, el incremento) y añadir un plugin de configuración.

## Decisión

Se elige **atender los botones en JavaScript, sin abrir la app**, y comprobarlo en el iPhone con el próximo development build.

Para que funcione aunque iOS arranque la app solo para entregar un botón:

- La app tiene una entrada propia (`index.ts`) que empieza a escuchar las respuestas **antes** de cargar Expo Router y las pantallas.
- La base de datos se abre una sola vez (`openAppDatabase`). La comparten las pantallas y los botones, y se puede abrir sin que se monte ninguna pantalla. Esto sustituye al `SQLiteProvider` del [ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md), que solo abre la base al montarse la interfaz. El resto del ADR-0010 se mantiene: hooks propios, sin caché ni store global.
- Cada respuesta se atiende una sola vez, aunque llegue por el listener y también como última respuesta. Al atenderla, se borra la última respuesta para que el siguiente arranque no la repita.

**Plan B:** si en el iPhone los botones no apuntan nada con la app cerrada o en segundo plano, se pasan a `opensAppToForeground: true`. Las categorías se registran desde JavaScript, así que el cambio no necesita otro build. Solo habría que decidir si se acepta cambiar RF-25 o se pasa al módulo nativo.

## Consecuencias

- RF-25 queda cubierto en el código, pero **sin verificar hasta el build**. Es lo primero que hay que probar en el iPhone: con la app abierta, en segundo plano y cerrada.
- Los cuantitativos tienen una categoría por hábito, porque el botón muestra su incremento ("+0,25 L"). Se vuelve a registrar si el incremento cambia.
- "Hecho" desde el recordatorio nunca desmarca, a diferencia del toque en la lista.
- Si la app está en pantalla cuando se pulsa un botón, el día se vuelve a leer sin reordenarse, como tras cualquier cambio.
