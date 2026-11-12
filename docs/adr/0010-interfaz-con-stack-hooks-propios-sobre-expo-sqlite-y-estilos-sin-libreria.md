# ADR-0010: Interfaz con Stack, hooks propios sobre expo-sqlite y estilos sin librería

- **Estado:** Propuesto
- **Fecha:** 2026-11-12

## Contexto

- La interfaz del MVP es pequeña. La pantalla principal es la vista de un día (RF-12) y, además, hay un formulario para crear y editar hábitos (RF-06, RF-08) y un listado de hábitos (RF-07).
- La vista del día es el centro: las acciones frecuentes se hacen con un solo toque, y el principio de minimalismo pide que cada pieza justifique su presencia.
- La base local es la fuente de verdad de la interfaz, que nunca espera a la red ([ADR-0004](0004-offline-first-con-sincronizacion.md)). Los repositorios dependen de la interfaz `Database`, no de `expo-sqlite` ([ADR-0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)).
- Expo Router ya está instalado y cada fichero de `src/app` es una ruta.
- Cada dependencia nueva añade mantenimiento, y si tiene código nativo, también un build de EAS.

## Opciones consideradas

### Navegación

**Pestañas (Hoy, Hábitos)**
- ✅ Patrón conocido en iOS y acceso directo a las dos pantallas.
- ❌ Dos pestañas apenas justifican la barra, que además ocupa espacio en todas las pantallas.
- ❌ Gestionar hábitos es una tarea ocasional; no merece el mismo peso que el día.

**Stack con el día como pantalla principal**
- ✅ La app se abre en el día (RF-12) y todo lo demás sale de ahí: el botón "+" abre el formulario como modal y el botón "Hábitos", el listado.
- ✅ Es la navegación por defecto de Expo Router y no añade dependencias.
- ❌ Para llegar al listado hace falta un toque más que con pestañas.

### Acceso a los datos desde las pantallas

**TanStack Query**
- ✅ Caché, invalidación y estados de carga resueltos.
- ❌ Está pensado para datos remotos (reintentos, caducidad, peticiones en segundo plano), que aquí no hay: la base local responde al instante.
- ❌ Es una dependencia más y una capa que aprender.

**Store global (por ejemplo, zustand)**
- ✅ Un único estado compartido entre pantallas.
- ❌ Duplica en memoria lo que ya está en la base local, y habría que mantener las dos copias alineadas.

**Hooks propios sobre `SQLiteProvider`**
- ✅ Sin dependencias: `SQLiteProvider` y `useSQLiteContext` son parte de `expo-sqlite`.
- ✅ La base sigue siendo la única fuente de verdad: cada pantalla lee al ganar el foco y vuelve a leer tras cada cambio.
- ❌ Sin caché: cada pantalla repite sus consultas al volver a ella. Con cuatro tablas pequeñas y una base local es despreciable.
- ❌ Los estados de carga y error se escriben a mano.

### Estilos

**Librería de UI o de estilos (NativeWind, Tamagui, gluestack)**
- ✅ Componentes y tema ya hechos.
- ❌ Dependencias, configuración del bundler y, en algunos casos, código nativo, para una interfaz de pocas pantallas.

**`StyleSheet` con tokens propios**
- ✅ Sin dependencias y con la API estándar de React Native.
- ✅ Los colores, espacios y tamaños salen de un único fichero de tokens, con un juego de colores claro y otro oscuro.
- ❌ Los componentes reutilizables (botones, campos) se escriben a mano.

## Decisión

- **Navegación con Stack.** El día es la ruta inicial (`src/app/index.tsx`). El formulario de hábito se presenta como modal y el listado de hábitos, como una pantalla más del Stack. Los botones de la cabecera usan la opción estable `headerRight` de Expo Router.
- **Datos con hooks propios sobre `SQLiteProvider`.** El proveedor abre la base y aplica las migraciones antes de mostrar las pantallas. Un adaptador convierte la base de `expo-sqlite` en la interfaz `Database`, que es lo único que reciben los repositorios. Las pantallas leen con hooks que consultan la base al ganar el foco y vuelven a leer tras cada cambio que hacen.
- **Estilos con `StyleSheet` y tokens propios** en `src/ui`, con colores para el modo claro y el oscuro (según `useColorScheme`). Los componentes reutilizables viven también en `src/ui`.
- **Los textos que ve el usuario** viven en las pantallas y en `src/ui`, en español; los códigos de error del dominio se traducen allí a mensajes.

## Consecuencias

- La interfaz no añade dependencias aparte de `expo-sqlite`, que la capa de datos ya necesitaba.
- La lógica de las pantallas se puede probar con React Native Testing Library, sustituyendo la base de `expo-sqlite` por la de Node que ya usan los tests de la capa de datos.
- El adaptador de `expo-sqlite` solo se prueba en el dispositivo; es una capa fina sin lógica propia.
- Si más adelante la sincronización cambia datos mientras una pantalla está abierta, habrá que avisar a esa pantalla para que vuelva a leer (por ejemplo, con un evento tras cada sincronización). Hoy no hace falta.
- Si la interfaz crece y los componentes propios se vuelven costosos de mantener, se puede revisar la decisión sobre la librería de UI.
