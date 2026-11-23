# ADR-0018: Sincronización con pull antes que push y unión por clave natural

- **Estado:** Aceptado
- **Fecha:** 2026-11-18

## Contexto

- La base local es la fuente de verdad y la sincronización con Supabase es propia ([ADR-0004](0004-offline-first-con-sincronizacion.md)): cada fila lleva un UUID generado en el dispositivo, `deleted` para los borrados y, en local, `pending_sync` para los cambios sin subir ([ADR-0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)). El servidor asigna `updated_at` en orden de confirmación por usuario ([ADR-0016](0016-cursor-de-sincronizacion-serializado-por-usuario.md)).
- Los datos tienen que llegar a la cuenta y bajar a los demás dispositivos (RF-05, RF-28). Al iniciar sesión por primera vez, lo que hay en el dispositivo se une a lo que ya tenía la cuenta (RF-38).
- Tres tablas tienen claves únicas hechas de datos y no del `id`: un registro por hábito y día, un recordatorio por hábito y hora y una versión por hábito y fecha de vigencia. Dos dispositivos sin conexión pueden crear la misma cosa con dos `id` distintos, por ejemplo un registro del mismo hábito el mismo día. En la nube, el segundo choca con la clave única.
- `expo-sqlite` no tiene transacciones exclusivas en la conexión de la app: otra escritura hecha a la vez entra en la transacción abierta y se perdería si esta se deshiciera ([ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md)).
- La sesión puede terminar sin pasar por "Cerrar sesión" (por ejemplo, si el token de renovación deja de valer), y entonces los datos de esa cuenta siguen en el dispositivo cuando otra cuenta inicia sesión.

## Opciones consideradas

### Orden de cada sincronización

**Push y después pull**
- ✅ Es lo más habitual: los cambios locales llegan cuanto antes.
- ❌ Una fila creada en los dos dispositivos con la misma clave natural hace fallar la subida del segundo, y sigue fallando en cada intento hasta que algo la resuelva.

**Pull y después push**
- ✅ Antes de subir nada, el dispositivo ya ha visto la fila de la cuenta y puede unir la suya con ella.
- ✅ El primer inicio de sesión (RF-38) no necesita un caso aparte: baja lo de la cuenta, y lo local, que nace con `pending_sync = 1`, sube a continuación.
- ❌ Los cambios locales tardan lo que tarde la bajada en llegar a la cuenta.

### Choque por clave natural

**Gana la fila de la cuenta y la local se descarta**
- ✅ Lo más sencillo.
- ❌ Se pierde el cambio local, que es el más reciente.

**Lo resuelve el servidor, con una función RPC que hace la subida**
- ✅ Atómico y en un solo viaje.
- ❌ Lógica nueva en la nube, con sus migraciones y tests, para un caso raro.

**La fila local toma el `id` de la de la cuenta y conserva sus valores**
- ✅ No se pierde el cambio local: la subida actualiza la fila de la cuenta en lugar de chocar con ella.
- ✅ Es seguro porque esas tres tablas no tienen filas hijas que apunten a su `id`.
- ❌ Un `id` local cambia. Los recordatorios usan el suyo en el identificador de la notificación, así que hay que refrescarlos después de una bajada que cambie algo.

### Transacciones

**Cada página de la bajada en una transacción**
- ✅ La página entra entera o no entra.
- ❌ Si falla, se deshacen también las escrituras del usuario hechas a la vez.

**Sentencias idempotentes y cursor guardado al final de cada página**
- ✅ Una sincronización que falla a medias se completa con la siguiente, que repite la página sin daño.
- ❌ Cada fila se confirma por separado. Con cientos de filas, la primera bajada es algo más lenta.

## Decisión

- **Cada sincronización hace pull y después push**, tabla a tabla y con los hábitos antes que sus versiones, registros y recordatorios, que dependen de ellos por clave foránea.
- **Pull:** pagina por `(updated_at, id)` desde un cursor guardado por tabla (`sync_cursors`). Aplicar una fila es un *upsert* idempotente que no toca las filas con `pending_sync = 1`: el cambio local, aún sin subir, gana y sube a continuación. Los borrados se guardan aunque la fila no estuviera en el dispositivo, para que una fila hija de un hábito borrado no deje la bajada atascada en su clave foránea.
- **Unión por clave natural:** si la fila que baja tiene la misma clave natural que una fila local viva y pendiente, la local toma el `id` de la de la cuenta y conserva sus valores.
- **Push:** sube las filas pendientes, también las borradas, y guarda el `updated_at` que devuelve el servidor. Solo desmarca `pending_sync` si la fila no ha cambiado mientras subía, con una comparación de todas sus columnas en la misma sentencia.
- **Sin transacciones largas:** las sentencias son idempotentes y el cursor solo avanza cuando toda la página está en el dispositivo.
- **Dueño de los datos (`sync_account`):** la primera sincronización apunta la cuenta de la sesión (RF-38). Si después sincroniza otra cuenta, los datos del dispositivo se borran antes, para no mezclarlos.
- **Cuándo se lanza:**
  - al abrir la app, al volver a ella, poco después de cada cambio local y en la tarea en segundo plano;
  - nunca dos a la vez;
  - sin detector de conexión, que es un módulo nativo y gastaría un build: una sincronización fallida se reintenta con esperas crecientes (30 s, 1, 2 y 5 min) mientras la app está abierta;
  - se suspende mientras se cierra la sesión.
- **Pruebas:** el motor se prueba con una cuenta en memoria que reproduce lo que importa del esquema (marcas compartidas por subida, claves foráneas y claves únicas). El adaptador de Supabase se prueba de punta a punta en la CI, con dos dispositivos contra un Supabase local ([ADR-0015](0015-pruebas-del-esquema-de-supabase-con-pgtap-en-la-ci.md)).

## Consecuencias

- **Un conflicto lo gana el último cambio en llegar a la cuenta, no el último en hacerse.** Un cambio hecho sin conexión hace horas puede pisar otro más reciente de otro dispositivo. Evitarlo exigiría usar el reloj de cada dispositivo, algo que el ADR-0004 descarta. Con un usuario por cuenta se acepta.
- **Cuando dos dispositivos registran el mismo hábito el mismo día sin conexión, queda el valor del que sincroniza el último.** Es la pérdida que el ADR-0004 ya acepta.
- **Una subida que choca por una carrera entre dispositivos falla esa sincronización:** la siguiente baja la fila de la otra y las une.
- **La bajada de una fila hija cuyo hábito aún no ha bajado falla:** pasa si otro dispositivo crea los dos entre la bajada de los hábitos y la de los registros. La sincronización siguiente lo resuelve.
- **Una fila que nunca pudiera aplicarse en local atascaría su tabla.** Por ejemplo, si los esquemas local y de la nube se desalinean, algo que impide el test de alineación de la CI.
- **Las filas que el propio dispositivo acaba de subir vuelven en la siguiente bajada.** Como ya tienen el mismo `updated_at`, no cuentan como cambio.
- **Al cambiar de cuenta se pierden los cambios que la anterior no llegó a subir.** Solo ocurre si su sesión terminó sin cerrarla.
- **Las tablas `sync_cursors` y `sync_account` solo existen en el dispositivo** y se vacían al cerrar sesión, junto con los datos.
- **No cambia el esquema de la nube.**
- **Tras recuperar la conexión, la subida puede tardar hasta 5 minutos** si la app sigue abierta y no se toca nada más. Volver a ella o hacer un cambio la lanza en el momento. Si algún día se añade un build con otros cambios nativos, un detector de conexión (`expo-network`) lo eliminaría.
