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
- **Estado:** aprobada el 2026-11-26. Está en RF-37 de la especificación.
- **Qué se propuso:** sustituir los dos avisos de pendientes de cada día (17:00 y 22:00) por uno solo, que el usuario pudiera desactivar y cambiar de hora desde Ajustes. Por defecto estaría a una hora fija, por ejemplo las 18:00. Dos avisos al día suponen demasiadas notificaciones.
- **Qué se debatió:**
  - **Opciones.** Dejarlo como estaba, un único aviso fijo sin ajustes, o un único aviso configurable en Ajustes.
  - **La hora por defecto.** Los dos avisos tenían fines distintos: el de las 17:00 recordaba lo que quedaba por hacer y el de las 22:00, apuntar lo hecho. A las 18:00 se quedaría sin apuntar lo que se hace por la tarde, en contra del principio 4.
  - **Dónde se guarda la elección.** En la cuenta pediría una migración de Supabase y sincronización solo para una preferencia.
  - **El aviso de progreso semanal (RF-49).** Son dos avisos a la semana y nadie se ha quejado de él.
- **Qué se decidió:** un único aviso, configurable en Ajustes.
  - Por defecto, a las 21:00: aún da tiempo a hacer algo y cubre casi todo lo que hay que apuntar.
  - Al desactivarlo, Ajustes lo dice con una línea discreta.
  - La elección se guarda en el dispositivo, como la ayuda del gesto.
  - El aviso de progreso semanal sigue fijo.
  - Los probadores pasan de dos avisos a uno: hay que decirlo al publicarlo.

## IDEA-02. Un ejemplo más claro para la cantidad del hábito

- **Propuesta:** el 2026-11-25, por el usuario.
- **Estado:** aprobada el 2026-11-26. Saldrá con la `0.4.0`.
- **Qué se propuso:** al crear un hábito, los ejemplos de Cantidad y Unidad eran "2" y "L", poco intuitivos. Se propuso cambiarlos por "3" y "veces", con incremento 1.
- **Qué se debatió:**
  - **"Veces" puede confundir el hábito con un objetivo semanal.** Sugiere una frecuencia, y lo de "3 veces por semana" se cubre con un objetivo semanal (sección 4, punto 3). Alguien podría crear un hábito diario de "3 veces" queriendo decir "3 veces por semana" (principio 5).
  - **Alternativas.** Se valoraron "8 vasos", "20 páginas" y "30 min". Las dos últimas, con incremento 1, piden muchos toques.
- **Qué se decidió:** se mantiene el ejemplo del agua, pero con la unidad escrita entera: "2" y "litros", en minúscula como "libros" en las metas. "L" era lo que no se entendía. El incremento ya era 1, y los ejemplos de los objetivos semanales ("5 h") y de las metas ("24 libros") no cambian.

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
- **Estado:** aprobada el 2026-11-26. Está en RF-62 y RF-63 de la especificación: son los avisos de las metas, que estaban por definir.
- **Qué se propuso:** avisos que comparan lo acumulado con lo que debería llevarse a estas alturas: "Llevas 8 de 24 libros: vas 2 por detrás del ritmo". Recordatorios solo sabe que algo vence a una hora, así que este es el aviso que más diferencia a la aplicación.
- **Qué se debatió:**
  - **Cómo se calcula el ritmo.** Un reparto uniforme es lo más simple. No sirve para metas que no avanzan de forma lineal, pero calcularlo de otra forma pediría más datos en cada meta.
  - **Las metas de sí o no.** No tienen ritmo: para ellas solo cabe una cuenta atrás.
  - **Opciones.** Mostrar el ritmo solo en la página de Metas, con un aviso semanal solo si alguna meta va por detrás, con un aviso justo al quedarse por detrás, o con avisos en hitos del plazo. El aviso justo al quedarse por detrás depende del momento exacto en que llegan los datos de otros dispositivos, así que es más fácil que muestre cifras viejas. Los hitos llegan de tarde en tarde y no dicen si se va bien.
  - **El tono y la carga de notificaciones.** El aviso tiene que informar sin culpabilizar. La IDEA-01 quita siete avisos de pendientes a la semana, así que un aviso semanal de metas deja la carga total por debajo de la de antes.
- **Qué se decidió:** el ritmo en la página y un aviso semanal.
  - **En la página de Metas (RF-62):** el ritmo se ve junto a lo que queda, solo viendo el día actual, porque lo acumulado no guarda el día en que se hizo. Se dice "por detrás" o "por delante" solo a partir de un incremento entero, para que un día sin apuntar no parezca un retraso.
  - **Un aviso de metas los lunes a las 20:00 (RF-63):** solo si alguna meta de cantidad va por detrás o a alguna de sí o no le quedan 7 días o menos. No se avisa de ir por delante.
  - **El aviso de progreso semanal (RF-49):** no cambia.

## Orden sugerido

Es una propuesta, pendiente de debate:

1. **IDEA-02.** Aprobada: sale con la `0.4.0`.
2. **IDEA-07 e IDEA-01.** Aprobadas juntas, porque ambas tratan de los avisos y de cuántos recibe el usuario.
3. **IDEA-06.**
4. **IDEA-04 e IDEA-03.** Juntas, en el mismo build, con lo que digan los probadores.
