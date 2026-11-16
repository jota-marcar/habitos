# ADR-0013: Estética oscura única con acento violeta

- **Estado:** Aceptado
- **Fecha:** 2026-11-16

## Contexto

- La app ha usado hasta ahora la paleta estándar de iOS: grises del sistema, el azul `#208AEF` de la plantilla de Expo y un juego de colores claro y otro oscuro según la apariencia del sistema ([ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md)). El icono y la pantalla de inicio eran también los de la plantilla.
- El usuario quiere una estética simple, minimalista y moderna, con colores oscuros, en la línea de Notion u Obsidian.
- Los colores de la interfaz salen de un único fichero de tokens (`src/ui/theme.ts`), así que el cambio de paleta no toca las pantallas.
- Las piezas nativas que la app no pinta (diálogos del sistema, selector de hora, teclado, barra de estado) siguen la apariencia que declara la app (`userInterfaceStyle`), no los tokens.
- El icono y la pantalla de inicio son nativos: cambiarlos exige un build de EAS. Desde iOS 26 el icono se define con Icon Composer (`assets/expo.icon`), que añade el efecto Liquid Glass a partir de capas.

## Opciones consideradas

### Apariencia

**Seguir la apariencia del sistema (claro y oscuro)**
- ✅ Respeta la preferencia de cada usuario.
- ❌ Hay que diseñar y mantener dos paletas, y la identidad oscura que se busca solo se ve con el teléfono en modo oscuro.

**Solo oscuro**
- ✅ Una sola paleta: identidad visual coherente y la mitad de combinaciones que revisar.
- ✅ Declarando `userInterfaceStyle: "dark"`, las piezas nativas también salen oscuras, aunque el teléfono esté en modo claro.
- ❌ Quien prefiera el modo claro no lo tiene. Hoy la app es de uso personal.

### Base

**Negro puro (`#000000`) con texto blanco**
- ✅ Aprovecha las pantallas OLED.
- ❌ El contraste máximo cansa y queda menos refinado; las superficies no se distinguen del fondo.

**Gris casi negro y frío, con texto blanco roto**
- ✅ Es el enfoque de Notion y Obsidian: capas que se distinguen por pequeños saltos de luminosidad, sin sombras.
- ❌ Ninguno relevante.

### Acento

**Monocromo (texto blanco como acento)**
- ✅ El más sobrio.
- ❌ Los botones principales y el día elegido en el calendario pierden jerarquía frente al texto.

**Menta (`#5EEAD4`)**
- ✅ Fresco y muy legible.
- ❌ Recuerda más a apps de salud o de finanzas.

**Violeta (`#8B7CF6`)**
- ✅ Aire moderno y futurista, se distingue del texto y se lee bien sobre el gris.
- ❌ Hay que vigilar el contraste del texto sobre el violeta: se usa el fondo oscuro como color de texto encima.

### Icono

Se valoraron tres símbolos sobre el fondo de la app: un anillo de progreso con un check, el anillo solo y tres puntos en fila. Se elige **el anillo con check** porque resume los dos tipos de hábito (el check es el booleano y el anillo, el progreso de uno cuantitativo) y se reconoce bien en tamaño pequeño. Los puntos se pierden en pequeño y el anillo solo es demasiado abstracto.

## Decisión

- **Solo modo oscuro.** `app.json` declara `userInterfaceStyle: "dark"` y `src/ui/theme.ts` tiene un único juego de colores. Esto sustituye al juego claro y oscuro que describía el ADR-0010; el resto de ese ADR sigue vigente.
- **Paleta:**

  | Token | Color | Uso |
  |-------|-------|-----|
  | `background` | `#0F0F11` | Fondo de las pantallas |
  | `surface` | `#18181B` | Recuadro de la lista, hojas y campos |
  | `border` | `#27272A` | Bordes y separadores |
  | `text` | `#EDEDEF` | Texto principal |
  | `textSecondary` | `#8A8A93` | Texto secundario |
  | `primary` | `#8B7CF6` | Acento: botones, selección, día actual |
  | `onPrimary` | `#0F0F11` | Texto sobre el acento |
  | `danger` | `#F2555A` | Acciones destructivas y errores |

- **Icono:** anillo de progreso violeta con un check blanco roto, sobre el fondo de la app. Para iOS 26 se define en Icon Composer (`assets/expo.icon`); los PNG del resto de plataformas se exportan de los SVG de `assets/brand/`.
- **Pantalla de inicio:** el fondo de la app con el mismo símbolo, pequeño y centrado, para que no haya un destello al abrir la app.

## Consecuencias

- Cambiar el icono y la pantalla de inicio exige un build de EAS; se agrupa con los recordatorios, que aún no se han probado en el iPhone.
- El efecto Liquid Glass del icono lo genera iOS a partir de las capas: el resultado final solo se puede comprobar en el iPhone.
- Si algún día se quiere el modo claro, basta con volver a añadir un juego de colores en `theme.ts` y cambiar `userInterfaceStyle` a `automatic`: las pantallas no usan colores fuera de los tokens.
- Las variantes de desarrollo y producción comparten icono. Si cuesta distinguirlas en el iPhone, se puede dar a la de desarrollo un icono propio desde `app.config.ts` ([ADR-0008](0008-variantes-de-desarrollo-y-produccion.md)).
