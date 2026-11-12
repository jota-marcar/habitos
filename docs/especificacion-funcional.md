# Especificación funcional

Qué hace la aplicación y cómo se comporta, desde el punto de vista de quien la usa. Este documento no trata de tecnologías ni de cómo se construye; eso se describe en la documentación de arquitectura.

## 1. Visión

Una aplicación móvil para registrar cada día qué hábitos se han cumplido.

El problema que resuelve no es la falta de motivación, sino el **olvido**: con el ajetreo diario se pasan cosas que uno quiere hacer. Apuntar lo que se hace genera conciencia, y los recordatorios evitan que se olvide.

A futuro, la aplicación podría ampliarse a objetivos semanales y a largo plazo (ver [6. Visión a futuro](#6-visión-a-futuro-tres-horizontes)). El MVP se centra solo en los hábitos diarios.

### Principios

1. **Minimalismo.** Solo lo imprescindible. Cada funcionalidad nueva debe justificar su presencia.
2. **Usabilidad directa.** Las acciones frecuentes (marcar un hábito, atender un recordatorio) se hacen con un solo toque.
3. **El recordatorio es el centro.** Si la aplicación no recuerda bien, no cumple su objetivo.
4. **El registro es fiable.** Lo que se apunta no se pierde y está disponible siempre, también sin conexión.

### Usuarios

- **Fase inicial:** uso personal, una sola persona.
- **Futuro:** amigos con su propia cuenta. Cada usuario ve únicamente sus hábitos; no hay funciones sociales.

## 2. Glosario

| Término | En el código | Significado |
|---------|--------------|-------------|
| **Hábito** | `Habit` | Algo que el usuario quiere hacer de forma periódica (por ejemplo, "Meditar" o "Beber agua"). |
| **Hábito booleano** | `boolean` | Se cumple o no se cumple (por ejemplo, "Meditar"). |
| **Hábito cuantitativo** | `quantitative` | Tiene una meta numérica con unidad (por ejemplo, "Beber agua: 2 L"). |
| **Meta** | `target` | Cantidad que hay que alcanzar en un día para cumplir un hábito cuantitativo. |
| **Incremento** | `increment` | Cantidad que se suma con cada toque en un hábito cuantitativo (por ejemplo, 250 ml). |
| **Unidad** | `unit` | Texto corto que acompaña a las cantidades de un hábito cuantitativo (por ejemplo, "L" o "páginas"). |
| **Días programados** | `scheduledDays` | Días de la semana en los que toca un hábito. |
| **Registro** | `Entry` | Lo que se ha apuntado de un hábito en un día concreto: cumplido o no, o la cantidad acumulada. |
| **Día** | `day` | Periodo de 00:00 a 23:59 en la hora local del dispositivo. |
| **Recordatorio** | `Reminder` | Aviso a una hora concreta para que el usuario no olvide un hábito. |
| **Posponer** | `snooze` | Aplazar un recordatorio para recibirlo de nuevo más tarde. |
| **Archivar** | `archive` | Retirar un hábito de uso sin borrar su historial. |

La columna "En el código" es el nombre en inglés con el que cada término aparece en el código y en el modelo de datos ([ADR-0007](adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)). Cada término se traduce siempre igual; uno nuevo se añade aquí antes de usarlo en el código. `goal` queda reservado para los objetivos de la [visión a futuro](#6-visión-a-futuro-tres-horizontes), y `Record` se evita porque ya tiene otro significado en el lenguaje de programación.

## 3. Funcionalidades del MVP

### 3.1 Cuenta de usuario

- **RF-01.** El usuario inicia sesión con su cuenta de Apple o de Google. No hay registro con email y contraseña.
- **RF-02.** La sesión se mantiene abierta hasta que el usuario la cierra.
- **RF-03.** El usuario puede cerrar sesión.
- **RF-04.** El usuario puede eliminar su cuenta. Esto borra de forma permanente todos sus datos, tras una confirmación explícita.
- **RF-05.** Si el usuario inicia sesión en otro dispositivo, encuentra todos sus hábitos e historial.

### 3.2 Gestión de hábitos

- **RF-06.** El usuario puede crear un hábito con estos datos:

  | Dato | Obligatorio | Notas |
  |------|-------------|-------|
  | Nombre | Sí | Texto corto, de 40 caracteres como máximo. |
  | Tipo | Sí | Booleano o cuantitativo. No se puede cambiar después de crearlo. |
  | Meta | Solo cuantitativo | Número mayor que 0, con 2 decimales como máximo. |
  | Unidad | Solo cuantitativo | Texto libre corto, de 10 caracteres como máximo: "L", "páginas", "min"… |
  | Incremento | Solo cuantitativo | Número mayor que 0, con 2 decimales como máximo. Por defecto, 1. |
  | Días programados | Sí | Al menos un día. Por defecto, todos. |
  | Recordatorios | No | Cero o más horas del día (ver 3.5). |

- **RF-07.** El usuario puede ver el listado de todos sus hábitos activos, en el mismo orden que la vista de un día (RF-12).
- **RF-08.** El usuario puede editar cualquier dato de un hábito salvo el tipo.
- **RF-09.** Los cambios en un hábito (meta, días programados…) se aplican desde el día actual en adelante. Los días pasados conservan lo que se registró.
- **RF-10.** El usuario puede archivar un hábito: deja de aparecer en los días siguientes y deja de recordarse, pero su historial se conserva y sigue visible en los días pasados. El día en que se archiva solo aparece si ya tenía algo registrado.
- **RF-11.** El usuario puede eliminar un hábito de forma permanente, junto con todo su historial, tras una confirmación explícita.

### 3.3 Vista de un día

Es la pantalla principal de la aplicación.

- **RF-12.** Al abrir la aplicación se muestra el **día actual**, con la lista de hábitos programados para ese día de la semana. Los hábitos se ordenan por la hora de su primer recordatorio, como una agenda; los que no tienen recordatorio van al final y, a igualdad, se mantiene el orden de creación. Un hábito cumplido se queda en su sitio, para que la lista no se mueva al marcarlo.
- **RF-13.** Cada hábito de la lista muestra su nombre y su estado:
  - Booleano: cumplido o pendiente.
  - Cuantitativo: cantidad acumulada y meta (por ejemplo, "1,25 / 2 L").
- **RF-14.** Un hábito booleano se marca y desmarca con un toque.
- **RF-15.** Un hábito cuantitativo suma su incremento con un toque. También se puede restar el incremento o escribir la cantidad exacta. La cantidad nunca baja de 0 y admite 2 decimales como máximo.
- **RF-16.** Un hábito cuantitativo cuenta como cumplido cuando la cantidad acumulada alcanza la meta. Se puede superar la meta.
- **RF-17.** Un hábito aparece en los días programados a partir de la fecha en que se creó, nunca en días anteriores.

### 3.4 Navegación entre días

- **RF-18.** El usuario puede cambiar de día de dos formas: pasando al día anterior o siguiente, o eligiendo cualquier fecha en un calendario.
- **RF-19.** Los **días pasados** se pueden consultar y editar sin límite de antigüedad, con las mismas acciones que el día actual.
- **RF-20.** Los **días futuros** se pueden consultar (qué hábitos tocarán), pero no se pueden marcar.
- **RF-21.** Siempre hay una forma directa de volver al día actual.

### 3.5 Recordatorios

- **RF-22.** Cada hábito puede tener cero, una o varias horas de recordatorio. Cada hora se fija con precisión de minuto y un hábito no puede repetir la misma hora.
- **RF-23.** Un recordatorio solo se envía los días programados del hábito.
- **RF-24.** Si el hábito ya está cumplido ese día, sus recordatorios pendientes de ese día no se envían, tampoco los pospuestos. Un hábito cuantitativo que ha avanzado sin llegar a la meta sí se recuerda, y el recordatorio indica lo que lleva y la meta (por ejemplo, "llevas 1 de 2 L").
- **RF-25.** Desde el propio recordatorio, sin abrir la aplicación, el usuario puede:
  - **Booleano:** marcarlo como cumplido.
  - **Cuantitativo:** sumar el incremento.
  - **Ambos:** posponerlo 1 hora. El tiempo es el mismo para todos los hábitos. Un recordatorio no sale del día de su hábito: si al posponerlo caería en el día siguiente, no se vuelve a enviar.
- **RF-26.** Al tocar el recordatorio (fuera de sus botones), se abre la aplicación en el día actual.
- **RF-27.** Los recordatorios funcionan sin conexión.

### 3.6 Disponibilidad y datos

- **RF-28.** Todas las funciones de registro (marcar, sumar, consultar días) funcionan sin conexión. Los cambios se sincronizan con la cuenta cuando vuelve la conexión.
- **RF-29.** Se conserva el historial completo de registros desde el primer día, aunque en el MVP no se muestren estadísticas.

## 4. Fuera del alcance del MVP

Funcionalidades descartadas por ahora, en orden aproximado de interés:

1. Estadísticas: rachas, porcentaje de cumplimiento, calendario de actividad.
2. Widget en la pantalla de inicio para marcar hábitos.
3. Más tipos de frecuencia (por ejemplo, "3 veces por semana"). Encaja con los objetivos semanales de la [visión a futuro](#6-visión-a-futuro-tres-horizontes).
4. Más tipos de hábito.
5. Reordenar manualmente los hábitos.
6. Automatizaciones (registrar hábitos sin intervención del usuario).
7. Compartir o comparar hábitos con amigos.
8. Reloj inteligente.

## 5. Preguntas abiertas

Puntos a decidir antes de implementar la parte correspondiente:

- **Resumen del día:** ¿un aviso al final del día con los hábitos pendientes?

## 6. Visión a futuro: tres horizontes

> **Solo es una idea.** No forma parte del MVP, no tiene requisitos ni tareas y se concretará cuando el desarrollo avance. Se apunta para no perderla y para construir a partir de ella.

La aplicación podría organizarse en tres partes, una por cada horizonte de tiempo. Cada una responde a una pregunta distinta:

| Horizonte | Parte | Pregunta | Para qué sirve | Ejemplo |
|-----------|-------|----------|----------------|---------|
| Diario | **Hábitos** | ¿Qué hago hoy? | Mantener un orden en el día | Tomar el sol, leer 20 minutos |
| Corto plazo | **Objetivos semanales** | ¿Cómo voy esta semana? | Ver el progreso de la semana | Dedicar 5 horas a proyectos personales |
| Largo plazo | **Objetivos a largo plazo** | ¿Hacia dónde voy? | Mantener el foco y no desviarse del camino | Correr una media maratón, terminar una aplicación antes de una fecha |

### Hábitos

Es lo que define el MVP (secciones 3.1 a 3.6) y la base de las otras dos partes. Se empieza por aquí.

### Objetivos semanales

- La referencia es la **semana completa**, no cada día: las 5 horas cuentan igual si se hacen en un día, en tres o en cinco.
- Pueden ser **recurrentes** (todas las semanas, como "5 horas a la semana en proyectos personales") o **puntuales** (solo una semana concreta). De momento se contemplan los dos; ya se verá cómo encajan.
- Se parecen a un hábito cuantitativo cuya meta se mide por semana en lugar de por día: lo que se apunta cada día se suma al total de la semana. Incluyen la frecuencia "N veces por semana" de la sección 4.

### Objetivos a largo plazo

- Tienen un resultado claro y una **fecha concreta**.
- Sirven para mantener el foco en el largo plazo, no para el registro diario.

### Vínculo entre horizontes

Los tres horizontes podrían relacionarse: un objetivo a largo plazo se consigue con objetivos semanales y hábitos (la media maratón se prepara corriendo varias veces por semana). Vincularlos daría sentido al registro diario, porque mostraría **para qué** se hace cada cosa. El vínculo sería opcional. Es una idea valorada, pendiente de definir.

### Puntos a tener en cuenta

- **Recordatorios en cada horizonte.** Siguiendo el principio de que el recordatorio es el centro, cada parte podría tener los suyos: a una hora para los hábitos, de progreso para la semana ("llevas 2 de 5 horas y es jueves") y de cuenta atrás para el largo plazo ("quedan 40 días").
- **Minimalismo.** Cada parte nueva tendrá que justificar su presencia cuando llegue, como cualquier otra funcionalidad.
- **Visión del producto.** Hoy el problema que se resuelve es el olvido. Con los tres horizontes se ampliaría a no perder de vista lo que uno quiere hacer, hoy, esta semana y a largo plazo. Si se adopta, habrá que revisar la sección 1.
- **Nombres.** "Meta" ya significa la cantidad diaria de un hábito cuantitativo (ver el glosario), así que la tercera parte no debe llamarse "metas". Por ahora: "Objetivos a largo plazo" (alternativa: "Propósitos").

### Preguntas abiertas

- ¿Cómo se vinculan los horizontes y qué se ve de ese vínculo?
- ¿Cómo conviven los objetivos semanales recurrentes y los puntuales?
- ¿Qué día empieza la semana?
- ¿Cómo se mide el progreso de un objetivo a largo plazo: hitos intermedios, avance calculado a partir de lo vinculado, o solo cumplido o no en la fecha?
