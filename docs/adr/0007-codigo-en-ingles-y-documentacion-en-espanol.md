# ADR-0007: Código en inglés y documentación en español

- **Estado:** Propuesto
- **Fecha:** 2026-11-10

## Contexto

- Hasta ahora el idioma no estaba decidido: la documentación, los scripts, los hooks y el poco código que había estaban en español, mezclados con el inglés de TypeScript, React y las librerías.
- La capa de dominio está a punto de empezar. Es el último momento en que cambiar de idioma cuesta poco: después habría que renombrar tipos, funciones, tablas y columnas ya sincronizadas.
- El repositorio es público.
- Las decisiones se debaten y se revisan en español, que es el idioma del autor.

## Opciones consideradas

### Todo en español
- ✅ El código usa las mismas palabras que la especificación funcional.
- ❌ Siempre queda mezclado con el inglés del lenguaje y de las librerías (`useState`, `render`).
- ❌ Los identificadores no pueden llevar tildes ni ñ sin fricción, así que tampoco sería español correcto.
- ❌ Menos legible para quien llegue al repositorio sin hablar español.

### Todo en inglés
- ✅ Un solo idioma en todo el repositorio.
- ❌ Obliga a traducir la especificación, la arquitectura y los ADR ya aceptados.
- ❌ Debatir y revisar decisiones en un idioma que no es el propio empeora la calidad de esas decisiones.

### Código en inglés y documentación en español
- ✅ El código es coherente con el lenguaje y las librerías, y legible para cualquiera.
- ✅ Las decisiones se siguen razonando en español.
- ❌ La especificación y el código nombran lo mismo con palabras distintas: hace falta una tabla de equivalencias y disciplina para no improvisar traducciones.

## Decisión

Se elige **código en inglés y documentación en español**, con esta frontera: lo que está dentro de un fichero de código o de configuración va en inglés; la prosa para personas va en español.

| En inglés | En español |
|-----------|------------|
| Nombres de variables, funciones, tipos y ficheros de código | Especificación funcional, arquitectura, ADR, README, `CONTRIBUTING.md` y `CLAUDE.md` |
| Tablas y columnas de las bases de datos | Mensajes de commit, títulos y descripciones de Pull Request |
| Comentarios del código | Nombres de rama |
| Nombres de los tests y códigos de error | Textos que ve el usuario en la aplicación |
| Scripts, hooks y flujos de CI: nombres, comentarios y mensajes | Instrucciones de las skills de Claude Code |

- **Los textos de la aplicación van en español** aunque estén dentro del código: son contenido para el usuario, no código. Se mantienen separados de la lógica para poder traducirlos más adelante.
- **Los términos del dominio se traducen siempre igual.** La equivalencia de cada término está en la columna "En el código" del glosario de la [especificación funcional](../especificacion-funcional.md#2-glosario). Un término nuevo se añade al glosario antes de usarlo en el código.

## Consecuencias

- Se renombran las herramientas que estaban en español: `npm run verificar` pasa a `npm run verify`, `npm run auditar` a `npm run audit-deps`, los hooks `proteger-main` y `formatear` a `protect-main` y `format`, y los checks de la CI a `Verify` y `Audit`. El check obligatorio de `main` cambia de nombre.
- El modelo de datos de `docs/arquitectura.md` pasa a usar los nombres en inglés.
- Los ADR anteriores no se editan: los nombres en español que aparecen en ellos (por ejemplo, `vigente_desde` en el [ADR-0006](0006-configuracion-de-habitos-con-vigencia.md)) se leen con la equivalencia del glosario.
- Quien lea la especificación y el código necesita el glosario para pasar de una a otro. Es el coste que se acepta.
