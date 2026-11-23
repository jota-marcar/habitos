# Arquitectura de la sincronización

Cómo se copian los datos entre el dispositivo y la cuenta. Forma parte de la [arquitectura](arquitectura.md).

## Sincronización

Cada sincronización (`src/sync/synchronize.ts`) hace primero el pull y después el push, tabla a tabla y con los hábitos antes que sus versiones, registros y recordatorios, que dependen de ellos por clave foránea ([ADR-0018](adr/0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md)):

1. **Dueño de los datos:** la primera sincronización apunta en `sync_account` la cuenta de la sesión, y lo que había en el dispositivo pasa a ser de ella (RF-38). Si sincroniza otra cuenta, porque una sesión terminó sin cerrarla, los datos del dispositivo se borran antes de seguir.
2. **Pull:**
   - Se descargan las filas que el servidor ha modificado desde el cursor de cada tabla (`sync_cursors`), por páginas en orden de `(updated_at, id)`. El servidor pone en fila las escrituras de cada usuario antes de asignar `updated_at`, así que ninguna fila se confirma con una marca anterior a otra ya vista ([ADR-0016](adr/0016-cursor-de-sincronizacion-serializado-por-usuario.md)). Las filas de una misma transacción pueden compartir marca, por eso el cursor incluye el `id`.
   - Aplicar una fila no toca las que tienen cambios sin subir: esos cambios ganan y suben a continuación.
   - Si una fila de la cuenta tiene la misma clave natural que una local pendiente (el mismo hábito y día, por ejemplo), la local toma el `id` de la cuenta y conserva sus valores.
3. **Push:**
   - Se suben las filas con `pending_sync = 1` y se guarda el `updated_at` que asigna el servidor.
   - En cada tabla, las borradas van primero. El servidor comprueba las claves únicas fila a fila: un recordatorio quitado y vuelto a poner a la misma hora chocaría con el anterior si llegara antes que su borrado.
   - Una fila que ha cambiado mientras subía sigue pendiente.
4. **Sin transacciones largas:** cada página se escribe en una transacción corta, que nunca espera a la red, y la bajada guarda en ella también su cursor, que así solo avanza con la página entera en el dispositivo. Cada paso se puede repetir sin daño, y una sincronización que falla a medias la completa la siguiente.
5. **Conflictos:** gana el último cambio en llegar a la cuenta. Es aceptable porque cada cuenta tiene un solo usuario. La excepción es borrar, que es definitivo: una fila borrada no vuelve aunque un dispositivo la suba como viva, y una fila nueva de un padre borrado nace borrada ([ADR-0023](adr/0023-vaciar-las-filas-borradas-y-hacer-definitivo-el-borrado.md)).
6. **Cuándo se lanza** (`src/sync/app-sync.ts` y `src/sync/scheduler.ts`):
   - al abrir la app o iniciar sesión y al volver a primer plano;
   - 2 segundos después de un cambio local, para subir juntos los toques seguidos;
   - en cuanto un botón de un recordatorio apunta algo;
   - en la tarea en segundo plano, entre dos refrescos de los recordatorios y con un límite de 20 s.

   Nunca hay dos a la vez: las peticiones que llegan mientras una se ejecuta se juntan en una ejecución más. No hay detector de conexión, que necesitaría un módulo nativo. Una sincronización que falla, por ejemplo sin conexión, se reintenta a los 30 s, 1 min, 2 min y después cada 5 min mientras la app está abierta, y volver a la app la lanza de nuevo.
7. **Después de una bajada que cambia algo,** se refrescan los recordatorios y la pantalla vuelve a leer el día sin reordenarlo, como tras un botón de un recordatorio.
8. **Estado de la copia (RF-53):** cada ejecución guarda cómo terminó (`src/sync/sync-record.ts`): la última que acabó bien y desde cuándo falla. Va en el almacén clave-valor de `expo-sqlite`, solo en el dispositivo y sin migración, y se borra al cerrar sesión o eliminar la cuenta. El dominio lo combina con los cambios pendientes (`syncStatusOf`): un fallo sin nada pendiente no pierde nada y no se avisa, y solo tras 3 días fallando con cambios por copiar aparece el aviso en la pantalla principal, para no alarmar por un corte breve. Los errores no salen del dispositivo: un servicio de informes de errores queda para el siguiente build, porque añade una dependencia nativa.

El motor depende de la interfaz `Remote`, no de Supabase. En los tests, la implementa una cuenta en memoria. En la app, `supabase-remote.ts`, que se prueba de punta a punta en la CI contra un Supabase local con dos dispositivos.
