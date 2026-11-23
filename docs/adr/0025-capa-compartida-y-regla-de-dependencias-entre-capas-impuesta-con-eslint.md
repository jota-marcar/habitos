# ADR-0025: Capa compartida y regla de dependencias entre capas impuesta con ESLint

- **Estado:** Aceptado
- **Fecha:** 2026-11-23

## Contexto

`docs/arquitectura.md` describe capas, pero ESLint solo protegía `src/domain` y `src/data`. La auditoría del 2026-11-22 (punto C3) comprobó que las demás se cruzaban:

- `notifications` importaba de `ui` el reloj, el formato de cantidades, los horizontes y la base de datos, aunque ninguna de esas piezas es de interfaz. La tarea en segundo plano y los botones de los recordatorios (ADR-0012) dependían así de la capa de pantallas.
- `sync` importaba el cliente de Supabase de `auth`, y `auth` importaba de `sync` para suspenderla al cerrar sesión: las dos capas dependían una de otra.

Conviene resolverlo antes del tercer horizonte, porque cada función nueva añade más cruces y los recordatorios son el punto fuerte del producto.

## Opciones consideradas

### Dónde poner lo que usan varias capas

- **Una capa `src/shared` (elegida).** ✅ Un solo sitio, con un nombre que dice para qué está. ✅ Mover ficheros no cambia ningún comportamiento. ❌ Una carpeta "compartida" puede convertirse en un cajón de sastre: por eso solo puede depender de `domain` y `data`.
- **Mover cada pieza a la capa que más la usa.** ✅ Sin capa nueva. ❌ El reloj o el cliente de Supabase no pertenecen a ninguna, y los cruces seguirían existiendo.
- **Inyectar las dependencias desde `app`.** ✅ Es lo más desacoplado. ❌ Mucho más código para unas pocas funciones, y `notifications/startup.ts` se ejecuta antes que Expo Router.

### Cómo imponer la regla

- **`no-restricted-imports` de ESLint, generada a partir de una lista ordenada de capas (elegida).** ✅ Ya se usa en el proyecto, sin dependencias nuevas. ✅ Falla en `npm run verify` y en el hook de edición. ❌ No detecta ciclos dentro de una misma capa.
- **Una herramienta de arquitectura (dependency-cruiser o similar).** ✅ Reglas más ricas. ❌ Una dependencia y una configuración más para un problema que hoy resuelve una regla.
- **Solo documentarlo.** ❌ Es lo que había, y las capas se cruzaron.

## Decisión

Las capas quedan ordenadas de abajo arriba, y cada una solo puede depender de las anteriores:

`domain` → `data` → `shared` → `sync` → `notifications` → `auth` → `ui` → `app`

`src/shared` contiene lo que usan varias capas y no es de ninguna: el reloj, el formato, la petición de horizonte, la apertura de la base de datos y el cliente de Supabase con su configuración. ESLint impone el orden en todas las capas; `app`, la última, puede usar todas las demás.

## Consecuencias

- ✅ Los recordatorios ya no dependen de las pantallas, y `sync` y `auth` dejan de depender una de otra.
- ✅ Un import en sentido contrario falla en `npm run verify`.
- ✅ No cambia el comportamiento ni el código nativo: llega con una actualización OTA.
- ❌ `src/shared` hay que vigilarla: solo entra lo que usen al menos dos capas y no pertenezca a ninguna.
- Pendiente: el núcleo común de hábitos y objetivos (C4 de la auditoría) se hará después de publicar la versión 0.2.0.
