# Ideas por debatir

Este documento recoge las ideas sobre la aplicación que aún no están decididas. Se revisa de vez en cuando, a medida que avanza el desarrollo. Cada idea conserva su número, que no se reutiliza, y tiene un estado.

Una idea aprobada se convierte en requisitos en la [especificación funcional](especificacion-funcional.md) y en un paso de [Qué viene después](estado.md#qué-viene-después) del estado, en el mismo Pull Request en que se apruebe. A partir de ese momento, aquí solo se deja constancia de que se aprobó.

**Estados:**

- **Por debatir:** propuesta, sin decidir.
- **Aprobada:** ya está en la especificación o en el estado.
- **Aplazada:** se retomará más adelante; se indica el motivo o qué la desbloquea.
- **Descartada:** se indica el motivo.

## Contexto: cómo diferenciarse

Este contexto sale del análisis del 2026-11-25 frente a Recordatorios de Apple y Google Tasks.

**El sustituto real.** Recordatorios y Google Tasks son gestores de tareas, no registros de hábitos. Aun así, son lo que usa quien no instala una aplicación de hábitos: le basta un recordatorio que se repite cada día. La pregunta que hay que responder es por qué no basta un recordatorio diario en Recordatorios. Los competidores directos son las aplicaciones de hábitos, como Streaks, Habitify o Habitica.

**Ventajas propias.** La aplicación sabe qué se ha hecho, y Recordatorios no:

- El recordatorio no salta si el hábito ya está cumplido y muestra lo que llevas.
- Los avisos de pendientes reúnen lo que queda por hacer.
- Hay hábitos cuantitativos y un historial por día que se puede corregir.
- Tiene tres horizontes: el día, la semana y las metas.

**Desventajas.**

- Recordatorios y Google Tasks son gratuitos, vienen instalados y no piden cuenta.
- Desde iOS 26.2, Recordatorios tiene recordatorios urgentes que suenan como una alarma, aunque el teléfono esté en silencio o en un modo de concentración.
- Recordatorios se puede marcar sin abrir la aplicación: con widgets, con Siri o desde el reloj.
- La aplicación registra, pero no muestra nada de lo registrado: no hay estadísticas.

**Hacia dónde ir.** No conviene competir en integración con el sistema ni en IA, porque ahí la aplicación siempre irá por detrás. Su terreno es lo que solo ella sabe: el progreso. Encajan en ese terreno los avisos de ritmo (IDEA-07) y devolver lo registrado (IDEA-06). Los widgets (IDEA-04) y las alarmas (IDEA-03) quitan desventajas, pero no diferencian.

## IDEA-01. Un único aviso de pendientes, configurable en Ajustes

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** por debatir.
- **Qué se propone:** sustituir los dos avisos de pendientes de cada día (17:00 y 22:00, RF-37) por uno solo. Desde Ajustes, el usuario elegiría si lo quiere y a qué hora. Por defecto estaría a una hora fija, por ejemplo las 18:00. Dos avisos al día suponen demasiadas notificaciones.
- **Puntos a debatir:**
  - **Los dos avisos tienen fines distintos.** El de las 17:00 recuerda lo que queda por hacer y el de las 22:00 recuerda apuntar lo que ya se ha hecho. Un aviso a las 18:00 no cubre lo que se hace después, que puede quedarse sin apuntar. Eso va contra el principio 4: el registro tiene que ser fiable. Una hora por defecto más tardía, hacia las 21:00, cubriría mejor los dos fines.
  - **Desactivarlo.** Desactivar el aviso es decisión del usuario. Aun así, Ajustes podría indicar con una línea qué deja de recibir.
  - **Dónde se guarda la elección:** en el dispositivo, como la ayuda de los recordatorios (INC-10), o en la cuenta. En el dispositivo es más sencillo, pero se pierde al reinstalar la aplicación.
  - **Coherencia con el aviso de progreso semanal (RF-49).** Si uno se configura, cabe preguntarse si el otro también debería.
  - **Ventaja técnica.** Un aviso menos al día deja hueco a más recordatorios preparados, así que el aviso final (RF-51) llega más tarde.
- **Relación con la especificación:** cambia RF-37 y sacaría de "Fuera del alcance" el punto 13.
- **Coste aproximado:** cabe en una actualización OTA. El selector de hora ya va en el binario.

## IDEA-02. Un ejemplo más claro para la cantidad del hábito

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** por debatir.
- **Qué se propone:** al crear un hábito, los ejemplos de Cantidad y Unidad son "2" y "L", poco intuitivos. Se cambiarían por "3" y "veces", con incremento 1.
- **Puntos a debatir:**
  - **"Veces" puede confundir el hábito con un objetivo semanal.** Sugiere una frecuencia, y lo de "3 veces por semana" se cubre con un objetivo semanal (sección 4, punto 3). Alguien podría crear un hábito diario de "3 veces" queriendo decir "3 veces por semana". Unidades que no se pueden confundir, como "vasos" (8), "páginas" (20) o "min" (30), evitarían ese error (principio 5).
  - **Las minúsculas.** La unidad se muestra tras la cantidad ("1 / 3 veces"), así que iría en minúscula, como "libros" en las metas.
  - **Los otros formularios.** Conviene revisar a la vez el ejemplo del objetivo semanal ("5 h").
- **Coste aproximado:** mínimo. Cabe en una actualización OTA.

## IDEA-03. Recordatorios urgentes, con alarma

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** aplazada. De momento solo se deja apuntada.
- **Qué se propone:** que un recordatorio pueda sonar como una alarma, por encima del silencio y de los modos de concentración, como los recordatorios urgentes de Recordatorios desde iOS 26.2. Una alarma se hace notar más que una notificación, siempre que se use con control.
- **Puntos a debatir:**
  - **El uso tiene que estar acotado.** Cada recordatorio tendría que marcarse como urgente a propósito, y quizá con un número máximo de recordatorios urgentes.
  - **La alarma tiene que ofrecer "Hecho".** No debe obligar a abrir la aplicación, y tiene que cancelarse si el hábito ya está cumplido (RF-24), también si se marcó desde otro dispositivo.
  - **Por qué se descartó en la INC-10.** Pesaron el coste, el riesgo para los datos y la intrusividad. Hay que ver qué ha cambiado desde entonces.
- **Coste aproximado:** necesita un build, un permiso nuevo y probablemente un módulo nativo (AlarmKit, de iOS 26 en adelante). Conviene agruparlo con otros cambios nativos, como IDEA-04.

## IDEA-04. Widgets

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** por debatir. Antes hay que preguntar a los probadores qué usarían.
- **Qué se propone:** widgets de la aplicación. Falta concretar qué deben hacer exactamente.
- **Puntos a debatir:**
  - **Qué tipo de widget.** Hay varias posibilidades:
    - solo ver la lista del día,
    - marcar y sumar desde el widget (interactivo),
    - un widget en la pantalla de bloqueo,
    - un control en el Centro de control.
  - **El riesgo para los datos.** Marcar desde el widget significa escribir los datos desde fuera de la aplicación, y eso afecta a la sincronización y al principio 4 (el registro es fiable). Un widget que solo muestra el día es mucho más sencillo.
  - **Qué horizontes cubre.** Puede ser solo el de los hábitos o también los demás.
- **Relación con la especificación:** sacaría de "Fuera del alcance" el punto 2.
- **Coste aproximado:** necesita un build y código nativo propio del widget.

## IDEA-05. Versión sin número de build

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** por debatir. Se propone descartarla.
- **Qué se propone:** que la versión se vea como `0.3.0` en lugar de `0.3.0 (3)`. Es un cambio solo estético.
- **Puntos a debatir:**
  - **Ajustes ya cumple la propuesta.** Dentro de la aplicación, Ajustes ya muestra solo la versión ("Versión 0.3.0", RF-54).
  - **Lo demás no se puede cambiar.** El `(3)` es el número de build: lo muestran TestFlight y los ajustes de iOS, y no se controla desde la aplicación. Apple exige que cada build subido tenga uno distinto, así que tampoco se puede quitar.
  - **Lo único que cabe es reiniciarlo.** El número de build podría volver a 1 en cada versión, pero lo lleva EAS y no aporta nada.

## IDEA-06. Estadísticas

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** por debatir.
- **Qué se propone:** mostrar lo registrado. Hay que valorar su alcance, cómo hacerlas y qué gráficos mostrar.
- **Puntos a debatir:**
  - **Alcance.** Hay varias opciones:
    - por hábito o de todos a la vez,
    - solo los hábitos o también los objetivos semanales y las metas,
    - qué periodo mostrar: semana, mes, año o desde el principio.
  - **Qué mostrar.** Hay varias opciones:
    - un calendario de cumplimiento por hábito (cada día, cumplido o no),
    - el porcentaje de cumplimiento,
    - las rachas,
    - gráficos de cantidad para los cuantitativos.
    Las rachas motivan, pero romper una puede desanimar.
  - **Cómo se cuenta.** El porcentaje tiene que contar solo los días programados de cada momento: los días programados cambian con el tiempo (RF-09). También hay que decidir qué pasa con los hábitos archivados.
  - **Dónde se ven.** Puede ser una opción del menú, como prevé el punto 1 de "Fuera del alcance", o la opción de cada hábito (RF-34).
  - **El minimalismo.** Una sola vista sencilla puede bastar para cerrar el ciclo de "apunto y me doy cuenta" de la visión.
- **Datos:** el historial completo ya se guarda (RF-29).
- **Coste aproximado:** depende de los gráficos. Si necesitan una librería nativa nueva, hace falta un build.

## IDEA-07. Avisos de ritmo

- **Propuesta:** el 2026-11-25, al analizar la competencia.
- **Estado:** por debatir.
- **Qué se propone:** avisos que comparan lo acumulado con lo que debería llevarse a estas alturas: "Llevas 8 de 24 libros: vas 2 por detrás del ritmo". Recordatorios solo sabe que algo vence a una hora, así que este es el aviso que más diferencia a la aplicación. Serían los avisos de las metas, que están por definir (sección 3.9), y quizá también enriquecerían el aviso de progreso semanal (RF-49).
- **Puntos a debatir:**
  - **Cómo se calcula el ritmo.** Lo más simple es un reparto uniforme: la cantidad multiplicada por la parte del plazo transcurrido. No sirve para metas que no avanzan de forma lineal, como un entrenamiento que va de menos a más.
  - **Las metas de sí o no.** No tienen ritmo; para ellas solo cabe una cuenta atrás.
  - **Cuándo se envían.** Puede ser con una frecuencia fija (semanal), al quedarse por detrás o al llegar a hitos del plazo. También hay que decidir si se avisa al ir por delante.
  - **El tono.** El aviso debe informar sin culpabilizar.
  - **La carga de notificaciones.** Se suma a la que se quiere reducir en IDEA-01.
  - **Una alternativa sin notificación.** El ritmo podría mostrarse solo en la página de metas ("vas 2 por detrás").
- **Coste aproximado:** cabe en una actualización OTA, siempre que use las notificaciones que ya existen.

## Orden sugerido

Es una propuesta, pendiente de debate:

1. **IDEA-02.** Es mínima y puede salir con la `0.4.0`.
2. **IDEA-07 e IDEA-01.** Ambas tratan de los avisos y de cuántos recibe el usuario, así que conviene debatirlas juntas.
3. **IDEA-06.**
4. **IDEA-04 e IDEA-03.** Juntas, en el mismo build, con lo que digan los probadores.
