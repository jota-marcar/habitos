# Arquitectura de la sesión

Cómo se inicia y se cierra la sesión y cómo se elimina la cuenta. Forma parte de la [arquitectura](arquitectura.md).

## Inicio y cierre de sesión

1. Sin sesión, la app solo muestra la pantalla de inicio de sesión (RF-01): las rutas protegidas de Expo Router (`Stack.Protected`) dejan fuera las demás, también si se llega a ellas por un enlace. El inicio de sesión nativo de Apple o Google devuelve un token, que se envía a Supabase con `signInWithIdToken` ([ADR-0017](adr/0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md)):
   - **Apple:** con nonce. La app pasa a Apple el hash SHA-256 de un valor aleatorio y a Supabase el valor, para que un token interceptado no sirva.
   - **Google:** sin nonce, porque la versión gratuita de la librería no lo admite ("Skip nonce check" en Supabase).
   - Una cancelación no muestra nada. Cualquier otro fallo pide comprobar la conexión e intentarlo de nuevo.
2. **La sesión (RF-02)** la guarda el cliente de Supabase en el llavero de iOS, troceada en fragmentos de menos de 2 KB y legible tras el primer desbloqueo, también en segundo plano. El cliente renueva el token solo con la app en primer plano. Al abrir la app no se muestra nada hasta leer la sesión, para que la pantalla de inicio de sesión no aparezca un instante.
3. Las filas locales no llevan `user_id`: el dispositivo solo tiene los datos de una cuenta a la vez. Al subirlas, Supabase les asigna el usuario de la sesión.
4. **Primer inicio de sesión (RF-38):** la primera sincronización sube todo lo que hay en la base local y baja lo que ya tenía la cuenta. Como los identificadores son UUID generados en cada dispositivo, no chocan, y el resultado es la unión de los dos.
5. **Cerrar sesión (RF-03),** desde **Ajustes** en el menú: primero se intenta sincronizar durante 5 segundos como mucho. Si aun así quedan filas con `pending_sync = 1` (salvo las creadas y eliminadas sin llegar a subirse), la interfaz avisa de que se perderán. Mientras se cierra la sesión, la sincronización espera: una bajada que terminara después de vaciar la base devolvería los datos. Después se vacía la base local, se cancelan las notificaciones programadas y se retiran las ya mostradas, se olvida la cuenta de Google del dispositivo y se cierra la sesión de Supabase **solo en este dispositivo** (`scope: "local"`; por defecto la cerraría en todos). Los datos se borran antes de cerrar la sesión: si algo falla a medias, la sesión sigue abierta y se puede reintentar.
6. **Eliminar la cuenta (RF-04),** desde **Ajustes**, tras una alerta de confirmación ([ADR-0019](adr/0019-eliminacion-de-la-cuenta-con-una-edge-function-que-revoca-sign-in-with-apple-antes-de-borrar-al-usuario.md)):
   1. Si la cuenta usa Apple, la app vuelve a pedir el inicio de sesión con Apple, sin pedir datos, para obtener un código de autorización nuevo.
   2. La sincronización espera y la app llama a la Edge Function `delete-account` con el token de la sesión y, si lo hay, el código.
   3. La función comprueba al usuario con Auth. Si tiene identidad de Apple, cambia el código por un token, comprueba que es del mismo Apple ID y lo revoca. Después borra al usuario, y la cascada borra sus datos. En este orden, un fallo siempre se puede reintentar.
   4. Solo si la función confirma el borrado, la app vacía la base local, cancela y retira las notificaciones, revoca el acceso de Google si se entró con Google en el dispositivo y cierra la sesión local. Lo intenta todo aunque falle un paso: la cuenta ya no existe.
