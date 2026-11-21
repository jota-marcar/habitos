# ADR-0021: Tareas puntuales en una tabla propia con vencimiento en fecha y hora locales

- **Estado:** Propuesto
- **Fecha:** 2026-11-21

## Contexto

Los probadores piden poder apuntar cosas puntuales, no solo hábitos (RF-40 a RF-46). Una tarea tiene nombre, color y tipo como un hábito, pero no tiene días programados ni recordatorios propios: tiene un vencimiento con día y hora. Antes de vencer se avisa 2 horas y 1 hora antes; al vencer sin cumplirse queda como no realizada, en ese día, y no se repite.

Condicionan la decisión:

- Los hábitos se configuran con versiones por fecha de vigencia ([ADR-0006](0006-configuracion-de-habitos-con-vigencia.md)) y sus registros van por día. Una tarea no tiene ni una cosa ni la otra: tiene un único progreso.
- La app funciona sin conexión y sincroniza fila a fila ([ADR-0004](0004-offline-first-con-sincronizacion.md), [ADR-0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)).
- Los avisos son notificaciones locales programadas de antemano, con un máximo de 60 en la ventana ([ADR-0005](0005-recordatorios-locales-en-ventana-deslizante.md)).
- Las fechas y horas del modelo son locales y sin zona horaria.

## Opciones consideradas

### Dónde se guarda la tarea

**Reutilizar `habits` con una marca de tarea y un vencimiento**
- ✅ Aprovecha la tabla y parte de la sincronización.
- ❌ También exige migración, y deja columnas y versiones sin sentido para las tareas.
- ❌ Obliga a excluir las tareas de los días programados, el archivado, las versiones y los recordatorios en todo el código, con riesgo de regresiones en lo que ya funciona.

**Tabla `tasks` propia**
- ✅ Los hábitos y sus reglas no cambian. Cada concepto tiene un modelo que se puede leer y probar por separado.
- ✅ Una fila contiene todo el estado de la tarea, así que sincroniza sin claves naturales ni dependencias entre tablas.
- ❌ Repite algunas columnas de los hábitos (nombre, tipo, color, cantidades) y añade una tabla más a sincronizar.

### Cómo se guarda el vencimiento

**Un instante absoluto (`timestamptz`)**
- ✅ Es inequívoco entre zonas horarias.
- ❌ Si el usuario viaja, una tarea "a las 22:00" pasaría a vencer a otra hora local y podría cambiar de día, al contrario que el resto del modelo.

**Fecha y hora locales (`due_on`, `due_time`)**
- ✅ Es coherente con los hábitos y los recordatorios, y la tarea sigue en su día aunque se cambie de zona horaria.
- ❌ El instante real de vencimiento depende de la zona del dispositivo. Se acepta, como en los recordatorios.

### Cómo se guarda el estado

**Una columna de estado (pendiente, cumplida, no realizada)**
- ❌ Pasar a no realizada exigiría escribir en la base al llegar la hora, algo que no se puede garantizar con la app cerrada, y podría desincronizarse entre dispositivos.

**Estado derivado**
- ✅ Se calcula con el valor, la meta, `completed_on`, el vencimiento y la hora actual. Es siempre correcto, también sin conexión y con la app cerrada.
- ❌ Cada lectura necesita la hora actual.

## Decisión

- **Tabla `tasks` propia**, local y en la nube, con `id`, `name`, `type`, `color`, `target`, `unit`, `increment`, `due_on`, `due_time`, `value`, `completed_on` y los campos de sincronización. Sigue las reglas del resto de tablas: Row Level Security, trigger `set_updated_at` y borrado lógico.
- **El vencimiento es una fecha y una hora locales**, y el estado se deriva: una tarea con `completed_on` está cumplida; sin él, está pendiente hasta su vencimiento y no realizada a partir de ese momento. `completed_on` es el día en que se cumplió, que decide en qué día aparece.
- **Los avisos de tarea son notificaciones locales** con identificador `task.<tarea>.<momento>` (`2h`, `1h` o `due`). Comparten la ventana de 60 con los recordatorios y los avisos de pendientes, por cercanía.
- **El aviso de pendientes de las 17:00** incluye a diario las tareas pendientes. El de las 22:00 no.
- **El rojo de la tarea no realizada** es el token `danger` de [ADR-0013](0013-estetica-oscura-unica-con-acento-violeta.md): no añade colores a la paleta.

## Consecuencias

- Hay que aplicar la migración de Supabase a cada proyecto antes de publicar la versión que la usa, primero en desarrollo y después en producción (ver [docs/supabase.md](../supabase.md)). Las versiones anteriores de la app ignoran la tabla nueva.
- No hay cambios nativos: la funcionalidad llega con una actualización OTA ([ADR-0020](0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md)).
- Los avisos dependen de la última vez que la app refrescó la ventana. Una tarea lejana puede quedar fuera de los 60 hasta el siguiente refresco, y un cambio hecho en otro dispositivo no cancela los avisos hasta sincronizar. Son las mismas limitaciones aceptadas para los recordatorios.
- Compartir la lista con los hábitos es provisional: se revisará con el rediseño de la pantalla principal.
