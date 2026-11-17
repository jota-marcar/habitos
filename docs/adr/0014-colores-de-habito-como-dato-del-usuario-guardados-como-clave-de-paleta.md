# ADR-0014: Colores de hábito como dato del usuario, guardados como clave de paleta

- **Estado:** Aceptado
- **Fecha:** 2026-11-16

## Contexto

- El usuario quiere dar un color a cada hábito al crearlo, para agrupar o distinguir tipos de hábitos en el listado (RF-06, RF-13).
- El [ADR-0013](0013-estetica-oscura-unica-con-acento-violeta.md) fija una estética con un único color de acento, el violeta, y la especificación lo recoge como principio. Varios colores en la pantalla principal parecen contradecirlo.
- Todos los colores de la interfaz salen de los tokens de `src/ui/theme.ts` ([ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md)).
- El hábito separa su identidad (nombre, tipo, fechas) de su configuración con vigencia ([ADR-0006](0006-configuracion-de-habitos-con-vigencia.md)). Hay que decidir a cuál de las dos pertenece el color.
- El modelo de datos se replicará en el servidor ([ADR-0003](0003-supabase-como-backend.md), [ADR-0004](0004-offline-first-con-sincronizacion.md)): lo que se guarde hoy en la base local es lo que se sincronizará.
- La lista atenúa los hábitos cumplidos (RF-13) y el fondo es casi negro: no cualquier tono se lee bien.

## Opciones consideradas

### Relación con el acento único

**Sustituir el ADR-0013 por una estética de varios colores**
- ❌ La decisión de fondo no cambia: los botones, la selección y el día actual siguen siendo violetas.

**Mantener el acento único y tratar el color del hábito como un dato del usuario**
- ✅ La interfaz sigue teniendo un solo color propio. Los colores de los hábitos son contenido, como el nombre: los elige el usuario y solo aparecen donde aparece el hábito.
- ❌ Si se usan muchos colores, la pantalla principal pierde sobriedad. Lo limita la forma de mostrarlos (un punto, no la fila entera).

### Qué se guarda

**El valor del color (`#60A5FA`)**
- ✅ No hace falta traducirlo para pintarlo.
- ❌ Retocar un tono exige migrar los datos, en el dispositivo y en el servidor.
- ❌ Ata el dato a la estética oscura: con un modo claro, el mismo valor no serviría.
- ❌ Admite cualquier color, también uno ilegible sobre el fondo.

**La clave de un color de la paleta (`blue`)**
- ✅ Los tonos se ajustan en `theme.ts` sin tocar los datos, y otra apariencia puede dar otro tono a la misma clave.
- ✅ Solo existen los colores que la paleta define, todos comprobados sobre el fondo.
- ❌ Quitar una clave de la paleta dejaría hábitos con un color desconocido. Se resuelve leyéndolos como hábitos sin color.

### Dónde se guarda

**En las versiones de configuración (con vigencia)**
- ✅ Los días pasados conservarían el color que tenía el hábito entonces.
- ❌ El color sirve para reconocer el hábito, no para decidir si se cumplió: que cambie de un día a otro confunde más que ayuda.

**En el hábito (sin vigencia), como el nombre**
- ✅ Coherente con el nombre, que tampoco tiene versiones (ADR-0006): cambiarlo lo cambia en todo el historial.
- ✅ Una columna que admite nulos: los hábitos que ya existen quedan sin color sin tocar sus filas.
- ❌ No se puede saber qué color tenía un hábito en el pasado. No hace falta.

### Cuántos colores

**Unos 20**
- ✅ Más grupos posibles.
- ❌ Sobre un fondo oscuro y en un punto pequeño, varios tonos vecinos se confunden.

**12**
- ✅ Tonos bien separados entre sí, que caben en dos filas de seis en el formulario.
- ❌ Menos grupos; para un uso personal sobran.

### Cómo se muestra en el listado

**El nombre en el color del hábito**
- ✅ No añade ningún elemento.
- ❌ La legibilidad del nombre depende de cada tono, y atenuado se distingue peor.

**Una barra lateral en la fila**
- ✅ Muy visible.
- ❌ Pesa más de lo que pide una estética sobria.

**Un punto delante del nombre**
- ✅ El nombre se lee siempre igual y el color agrupa de un vistazo.
- ❌ Añade un elemento a cada fila, y los hábitos sin color necesitan un punto vacío para que los nombres queden alineados.

## Decisión

- **El violeta sigue siendo el único color de acento de la interfaz** (ADR-0013, que no cambia). El color de un hábito es un dato del usuario y solo se pinta junto a ese hábito.
- **Se guarda la clave de la paleta**, en una columna nueva `color` de `habits` que admite nulos. No tiene versiones. La base no restringe los valores: el dominio define las claves válidas y una clave desconocida se lee como "sin color", de modo que ampliar o reducir la paleta no exige una migración.
- **Paleta de 12 colores**, de tonos claros para que se lean sobre el fondo, definida en `src/ui/theme.ts`:

  | Clave | Color | | Clave | Color |
  |-------|-------|-|-------|-------|
  | `red` | `#F87171` | | `cyan` | `#22D3EE` |
  | `orange` | `#FB923C` | | `blue` | `#60A5FA` |
  | `amber` | `#FBBF24` | | `violet` | `#A78BFA` |
  | `lime` | `#A3E635` | | `fuchsia` | `#E879F9` |
  | `green` | `#4ADE80` | | `pink` | `#F472B6` |
  | `teal` | `#2DD4BF` | | `gray` | `#A1A1AA` |

- **El color es opcional** y por defecto no hay ninguno.
- **En el listado se muestra como un punto delante del nombre.** Si ningún hábito del día tiene color, no se dibuja ningún punto y la lista queda como antes.

## Consecuencias

- Es la primera migración de la base local después del esquema inicial ([ADR-0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)).
- Cuando exista el servidor, la tabla de hábitos tendrá la misma columna de texto. Dos versiones de la app con paletas distintas pueden convivir: la más antigua muestra sin color lo que no conoce, y no lo pierde mientras no guarde cambios en ese hábito (editarlo o archivarlo).
- Añadir un color es añadir su clave al dominio, su tono a `theme.ts` y su nombre a los textos; el compilador exige las tres cosas.
- El violeta de la paleta (`#A78BFA`) se parece al de acento (`#8B7CF6`). Se acepta: uno aparece como punto junto a un hábito y el otro en botones y selección.
- El color no se usa en los recordatorios: iOS no permite colorear una notificación.
- Solo el color no comunica nada a quien usa un lector de pantalla. En el formulario cada color tiene su nombre; en el listado, el punto es decorativo.
