# ADR-0027: Metas en dos tablas propias, sin versiones, con un total por meta

- **Estado:** Aceptado
- **Fecha:** 2026-11-25

## Contexto

- Las metas (RF-55 a RF-61) son el tercer horizonte: algo que se quiere conseguir antes de una fecha límite. Son de sí o no o de cantidad, con **un único total** sin el día en que se hizo, y no se dividen en periodos.
- Al editar una meta, los cambios se aplican a toda ella (RF-56): si cambia la cantidad, la meta pasa a estar conseguida o pendiente según lo acumulado. No hay pasado que conservar, a diferencia de los hábitos ([ADR-0006](0006-configuracion-de-habitos-con-vigencia.md)) y de los objetivos semanales ([ADR-0022](0022-objetivos-semanales-en-tablas-propias-con-un-total-por-semana.md)).
- Las metas no se archivan: terminan en su fecha límite (RF-57, RF-61).
- La sincronización resuelve los conflictos **fila a fila**: gana el último cambio en llegar a la cuenta ([ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)). Las filas borradas se vacían y el borrado es definitivo ([ADR-0023](0023-vaciar-las-filas-borradas-y-hacer-definitivo-el-borrado.md)).
- El núcleo común de hábitos y objetivos (`domain/tracked.ts`) ya valida el nombre, el tipo, el color y las cantidades.

## Opciones consideradas

### Dónde guardar el total

**Una tabla aparte, `long_term_goal_entries`, con una fila por meta**
- ✅ La configuración y el total son filas distintas: editar el nombre en un dispositivo y apuntar en otro conserva los dos cambios.
- ✅ Repite la forma de los registros de los objetivos semanales, que la sincronización ya une por clave natural.
- ❌ Una tabla más en las dos bases, con sus políticas y sus tests.

**Una columna `value` en la propia meta**
- ✅ Una sola tabla y una sola fila por meta.
- ❌ Un cambio de configuración y uno del total en dos dispositivos chocan en la misma fila, y uno de los dos se pierde.

### Cómo guardar la configuración

**En la propia meta, sin versiones**
- ✅ Es lo que pide el requisito: un cambio se aplica a toda la meta.
- ✅ Leer una meta no necesita buscar la versión vigente.
- ❌ Si algún día se quisiera conservar la configuración anterior, habría que añadir versiones.

**Con una tabla de versiones, como los objetivos semanales**
- ✅ Misma forma que los otros dos horizontes.
- ❌ Una tabla y una regla de vigencia para algo que el producto ha decidido no tener.

### Cómo evitar dos totales de la misma meta

**Clave natural `long_term_goal_id`**
- ✅ Dos dispositivos que apuntan la misma meta sin conexión se unen con el mecanismo de ADR-0018, sin código nuevo.
- ❌ Una subida que choca por una carrera entre dispositivos falla esa sincronización, como en las demás tablas, y la siguiente lo resuelve.

**El total con el mismo `id` que su meta**
- ✅ Nunca hay dos totales: los dos dispositivos escriben la misma fila.
- ❌ Es la única tabla con un `id` que no es propio, un caso especial para la sincronización y para quien lea el código.

## Decisión

- **Dos tablas propias:**
  - `long_term_goals`: nombre, tipo, color, cantidad, unidad, incremento, primer día (`first_day`) y fecha límite (`deadline`). Sin versiones y sin archivado.
  - `long_term_goal_entries`: una fila por meta con su total (`value`), creada al apuntar por primera vez.
- **Clave natural de la entrada: `long_term_goal_id`**, con un índice único sobre las filas vivas en las dos bases.
- **`deadline > first_day`** se comprueba en las dos bases. Que la fecha límite no sea anterior al día actual (RF-56) depende de "hoy" y solo lo comprueba el dominio.
- **Las cantidades no se comprueban en las bases de datos**, igual que en los hábitos y los objetivos: las valida el dominio.
- **Una meta borrada se vacía** con `first_day = 1970-01-05` y `deadline = 1970-01-06`, para que la fila vacía cumpla también la restricción de fechas. El total borrado queda a 0.
- El tipo y el primer día no cambian tras crear la meta.

## Consecuencias

- La sincronización gana dos tablas. Una versión anterior de la app las ignora.
- **Orden de despliegue.** Como en ADR-0022, la migración de la nube debe aplicarse antes de publicar la versión que la usa. Sin las tablas, la sincronización fallaría al llegar a ellas y dejaría de subir los cambios de los otros horizontes.
- **La OTA no se puede deshacer.** Lleva una migración local, así que una versión anterior no abriría la base. En producción, las tablas salen **junto con la interfaz** de las metas, en la `0.4.0`, y un fallo se corrige hacia delante ([despliegue.md](../despliegue.md#actualizaciones-con-una-migración-local)).
- El orden de creación se aproxima con el orden de las filas en el dispositivo (`rowid`). En otro dispositivo es el orden de bajada, como ya pasa con los hábitos y los objetivos.
- El vínculo con los otros horizontes y los hitos (fuera del alcance) podrán añadirse después con columnas o tablas nuevas, sin rehacer estas.
