# ADR-0022: Objetivos semanales en tablas propias con un total por semana

- **Estado:** Propuesto
- **Fecha:** 2026-11-22

## Contexto

- Los objetivos semanales (RF-42 a RF-49) se miden por la semana completa: no importa qué día se haga cada parte. Pueden repetirse todas las semanas o ser de una sola semana, y son de sí o no o de cantidad.
- Los hábitos ya tienen un modelo probado: identidad, configuración con vigencia ([ADR-0006](0006-configuracion-de-habitos-con-vigencia.md)), registros y sincronización por tablas ([ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)). Los días programados, los recordatorios y los avisos de pendientes dependen de él.
- Cambiar la meta de un objetivo no debe alterar lo que se consiguió en semanas pasadas, igual que en los hábitos (RF-09).
- El vínculo entre objetivos y hábitos queda aplazado: se valorará con lo que digan los probadores.

## Opciones consideradas

### Dónde guardar los objetivos

**Tablas propias: `weekly_goals`, `weekly_goal_versions` y `weekly_goal_entries`**
- ✅ No toca el modelo de los hábitos, ni sus recordatorios ni sus avisos.
- ✅ Repite una estructura conocida y la sincronización la trata como cualquier otra tabla.
- ❌ Tres tablas más en las dos bases, con sus políticas y sus tests.

**Una nueva frecuencia dentro de los hábitos**
- ✅ Reutiliza tablas y parte del código.
- ❌ Todo lo que depende de los días programados tendría que distinguir los dos casos, con riesgo para lo que ya funciona.
- ❌ Un objetivo puntual no encaja en un modelo pensado para repetirse.

**Un total calculado a partir de hábitos vinculados**
- ✅ Evita apuntar dos veces lo mismo.
- ❌ Obliga a cuadrar unidades y no sirve para objetivos sin hábito.
- ❌ Depende del vínculo entre horizontes, que aún no está definido.

### Cómo guardar el progreso

**Un total por objetivo y semana**
- ✅ Es lo que pide el requisito: la semana es la unidad.
- ✅ Corregir la cantidad es sobrescribir un número.
- ❌ No se puede saber después qué día se hizo cada parte.

**Un registro por objetivo y día, sumado al mostrarlo**
- ✅ Conserva el detalle por día.
- ❌ Al corregir el total habría que decidir a qué día se atribuye la diferencia.
- ❌ Guarda un dato que el producto ha decidido que no importa.

### Cómo distinguir recurrentes y puntuales

**Un campo `recurring` que no cambia tras crear el objetivo**
- ✅ Es explícito y simple de consultar.
- ✅ Evita estados intermedios, como convertir en puntual un objetivo con historial de varias semanas.
- ❌ Para cambiarlo hay que crear otro objetivo.

**Una semana final opcional**
- ✅ Un solo campo cubre puntual, recurrente y archivado.
- ❌ Un recurrente archivado en su primera semana sería indistinguible de uno puntual.

## Decisión

- **Tablas propias** con la misma forma que los hábitos: identidad, versiones con vigencia y registros.
- **Un total por objetivo y semana** (clave única `weekly_goal_id + week`).
- **Las semanas se guardan por su lunes**, y las dos bases rechazan cualquier otra fecha en esas columnas.
- **`recurring` no cambia** tras crear el objetivo, igual que el tipo.
- **Solo un objetivo recurrente se archiva.** Uno puntual termina con su semana.

## Consecuencias

- La sincronización gana tres tablas, y `recurring` es un segundo campo booleano que viaja entre las dos bases.
- **Orden de despliegue.** La migración de la nube debe aplicarse antes de publicar la versión que la usa. Sin las tablas, la sincronización fallaría al llegar a ellas y dejaría de subir también los cambios de los hábitos.
- **Deshacer la actualización.** Es la primera migración local que llegaría por OTA. El arranque se niega a abrir una base con un esquema más nuevo que la app, así que volver a una versión anterior dejaría de abrir la aplicación a quien ya la hubiera recibido. Hay que resolverlo antes de publicarla en producción.
- El vínculo con los hábitos podrá añadirse después con una columna opcional, sin rehacer estas tablas.
