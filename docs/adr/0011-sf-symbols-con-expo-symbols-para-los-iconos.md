# ADR-0011: SF Symbols con expo-symbols para los iconos

- **Estado:** Propuesto
- **Fecha:** 2026-11-13

## Contexto

- La interfaz no tiene botones fijos ([ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md)). Las opciones del menú inferior llevan cada una su icono (RF-32), y las opciones de un hábito (RF-34) probablemente también los usarán.
- La app es para iOS, y la estética y el estilo nativo pesan más que ahorrar builds de EAS: es la prioridad que ha fijado el usuario al tomar esta decisión.
- El plan gratuito de EAS da 15 builds de iOS. Una dependencia con código nativo exige un build nuevo para verla en el iPhone; una solo JS, no.
- `expo-font` ya está en el development build: es dependencia del paquete `expo` y se enlaza sola.

## Opciones consideradas

**`@expo/vector-icons` (por ejemplo, Ionicons)**
- ✅ Solo JS sobre `expo-font`: no hace falta un build nuevo.
- ✅ Muchas familias de iconos, iguales en iOS, Android y web.
- ❌ Imitan a iOS, pero no son los iconos del sistema: el grosor y las proporciones no casan del todo con el texto de San Francisco.

**`expo-symbols` (SF Symbols)**
- ✅ Son los iconos nativos de iOS: se alinean con el texto del sistema, admiten pesos, escalas y variantes, y siguen al sistema en futuras versiones.
- ✅ Paquete oficial de Expo, versionado con el SDK.
- ❌ Tiene código nativo: hasta el siguiente build, el iPhone no lo tiene. Mientras tanto, `SymbolView` muestra el contenido de su `fallback`.
- ❌ En Android y web no hay SF Symbols: se usa el `fallback` (o un símbolo de Material, que exige darlo aparte). Hoy la app es solo para iOS.

**Sin librería (iconos dibujados con `View`)**
- ✅ Ninguna dependencia.
- ❌ Solo es viable para formas simples como "+"; un engranaje para "Ajustes" o los iconos de las opciones de un hábito obligarían a decidir de nuevo.

## Decisión

- **Los iconos son SF Symbols mostrados con `SymbolView` de `expo-symbols`.** Se elige por estética: son los iconos del propio iOS y encajan con el resto del sistema.
- **Cada icono lleva un `fallback`** sencillo (un texto o una forma con los tokens del tema), que se ve en Android, en web y en un build que aún no incluya el módulo.

## Consecuencias

- Matiza una consecuencia del ADR-0010: la interfaz sí añade una dependencia con código nativo, y hace falta un build nuevo para ver los iconos en el iPhone. Hasta entonces la app funciona con el `fallback`.
- Elegir una dependencia nativa por estética, aun gastando un build, queda como criterio para decisiones parecidas (por ejemplo, la vibración con `expo-haptics`).
- Los tests no tienen el módulo nativo y ven el `fallback`: comprueban la acción, no el icono.
- Si algún día la app llega a Android, cada icono necesitará su equivalente de Material.
