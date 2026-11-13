# ADR-0010: Interfaz por gestos, hooks propios sobre expo-sqlite y estilos sin librería

- **Estado:** Aceptado
- **Fecha:** 2026-11-13

## Contexto

- La interfaz del MVP gira en torno a una sola pantalla principal, la vista de un día (RF-12), con tres zonas: la fecha, un recuadro con la lista de hábitos y una franja que indica el menú (RF-30). No tiene botones fijos: lo demás se despliega con gestos.
  - Deslizar hacia abajo desde la fecha, o desde la lista cuando está arriba del todo, despliega el calendario desde arriba (RF-31).
  - Deslizar hacia arriba desde la franja despliega el menú desde abajo (RF-32).
  - Mantener pulsado un hábito abre sus opciones (RF-34).
  - Deslizar hacia los lados queda reservado para cambiar de horizonte en el futuro (RF-33).
- Aparte de la pantalla principal solo hay formularios: crear y editar un hábito (RF-06, RF-08) y los ajustes de la cuenta (RF-03, RF-04).
- La primera versión de este ADR proponía una navegación con Stack y botones en la cabecera, con un listado de hábitos como pantalla aparte. Se revisó antes de aceptarse, tras probar la app en el iPhone: el listado se retiró (RF-07) y la estructura pasó a ser la descrita arriba.
- iOS reserva los bordes de la pantalla para sus propios gestos: desde el borde superior se abren el Centro de notificaciones y el Centro de control, y desde el inferior se vuelve al inicio o se cambia de app. Los gestos de la app tienen que empezar dentro del contenido.
- La base local es la fuente de verdad de la interfaz, que nunca espera a la red ([ADR-0004](0004-offline-first-con-sincronizacion.md)). Los repositorios dependen de la interfaz `Database`, no de `expo-sqlite` ([ADR-0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)).
- Expo Router ya está instalado y cada fichero de `src/app` es una ruta. `react-native-gesture-handler` y `react-native-reanimated` vienen con la plantilla de Expo y ya están en el último development build.
- Cada dependencia nueva añade mantenimiento, y si tiene código nativo, también un build de EAS.

## Opciones consideradas

### Navegación y capas

**Stack con cabecera y botones**
- ✅ Es la navegación por defecto de Expo Router y no necesita código propio.
- ❌ Contradice la estructura decidida: botones fijos en la cabecera y una pantalla por cada cosa.

**Hojas nativas de iOS (`presentation: "formSheet"` de Expo Router) para el menú y el calendario**
- ✅ Aspecto y gestos de cierre nativos, sin código de animación propio.
- ❌ iOS no tiene hojas que salgan desde arriba: el calendario tendría que salir desde abajo, y se perdería la idea de "arriba, cuándo; abajo, qué hago".
- ❌ Se abren al terminar el gesto, no siguen al dedo mientras se desliza.

**Capas propias en la pantalla principal con `react-native-gesture-handler` y `react-native-reanimated`**
- ✅ El calendario y el menú siguen al dedo y se abren o se cierran según hasta dónde y con qué velocidad se suelte.
- ✅ Un mismo componente de hoja inferior sirve para el menú y para las opciones de un hábito.
- ✅ Las dos librerías ya están instaladas y en el build: no hace falta un build nuevo.
- ✅ Encaja con la reserva de los gestos laterales para los horizontes: la pantalla principal decide qué hace cada dirección.
- ❌ Más código propio: umbrales, animaciones y convivencia con el scroll de la lista.
- ❌ El tacto de los gestos solo se puede comprobar en el iPhone; los tests prueban la lógica, no la sensación.

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

- **Una pantalla principal con capas por gestos.** El día es la ruta inicial (`src/app/index.tsx`) y no tiene cabecera. El calendario (arriba) y el menú (abajo) son capas de esa misma pantalla, movidas con `react-native-gesture-handler` y animadas con `react-native-reanimated`. Las opciones de un hábito usan el mismo componente de hoja inferior que el menú. El día que se está viendo es estado de la pantalla principal, no un parámetro de la ruta.
- **Los gestos empiezan dentro del contenido**, nunca en los bordes que usa iOS. El calendario se abre desde la fecha o desde la lista cuando ya no puede subir más, y el menú, desde la franja situada bajo el recuadro.
- **Los gestos laterales quedan libres** en la pantalla principal para el futuro paso entre horizontes. Cómo se implemente ese carrusel se decidirá cuando llegue.
- **Formularios como modales del Stack de Expo Router.** Crear y editar un hábito, y los ajustes, son rutas que se presentan como modal sobre la pantalla principal. El Stack sigue existiendo, pero solo para eso.
- **Datos con hooks propios sobre `SQLiteProvider`.** El proveedor abre la base y aplica las migraciones antes de mostrar las pantallas. Un adaptador convierte la base de `expo-sqlite` en la interfaz `Database`, que es lo único que reciben los repositorios. Las pantallas leen con hooks que consultan la base al ganar el foco y vuelven a leer tras cada cambio que hacen.
- **Estilos con `StyleSheet` y tokens propios** en `src/ui`, con colores para el modo claro y el oscuro (según `useColorScheme`). Los componentes reutilizables viven también en `src/ui`.
- **Los textos que ve el usuario** viven en las pantallas y en `src/ui`, en español; los códigos de error del dominio se traducen allí a mensajes.

## Consecuencias

- La interfaz no añade dependencias aparte de `expo-sqlite`, que la capa de datos ya necesitaba: las librerías de gestos y animación ya estaban en el proyecto. No hace falta un build nuevo para esta estructura.
- La raíz de la app se envuelve en `GestureHandlerRootView`, que exige `react-native-gesture-handler`.
- La lógica de las pantallas se puede probar con React Native Testing Library, sustituyendo la base de `expo-sqlite` por la de Node que ya usan los tests de la capa de datos. Los gestos se prueban con las utilidades de test de `react-native-gesture-handler`; su tacto se comprueba en el iPhone.
- El adaptador de `expo-sqlite` solo se prueba en el dispositivo; es una capa fina sin lógica propia.
- La pantalla del listado de hábitos (`src/app/habits/index.tsx`) desaparece al implementar esta estructura.
- Sin botones visibles, la app no es usable con VoiceOver. Queda fuera del alcance del MVP; si se añade, se hará con acciones de accesibilidad equivalentes a cada gesto, sin cambiar lo que se ve.
- Si más adelante la sincronización cambia datos mientras una pantalla está abierta, habrá que avisar a esa pantalla para que vuelva a leer (por ejemplo, con un evento tras cada sincronización). Hoy no hace falta.
- Si la interfaz crece y los componentes propios se vuelven costosos de mantener, se puede revisar la decisión sobre la librería de UI.
