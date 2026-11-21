# Especificación funcional

Qué hace la aplicación y cómo se comporta, desde el punto de vista de quien la usa. Este documento no trata de tecnologías ni de cómo se construye; eso se describe en la documentación de arquitectura.

## 1. Visión

Una aplicación móvil para registrar cada día qué hábitos se han cumplido.

El problema que resuelve no es la falta de motivación, sino el **olvido**: con el ajetreo diario se pasan cosas que uno quiere hacer. Apuntar lo que se hace genera conciencia, y los recordatorios evitan que se olvide.

A futuro, la aplicación podría ampliarse a objetivos semanales y a largo plazo (ver [6. Visión a futuro](#6-visión-a-futuro-tres-horizontes)). El MVP se centra solo en los hábitos diarios.

### Principios

1. **Minimalismo.** Solo lo imprescindible. Cada funcionalidad nueva debe justificar su presencia. La pantalla principal no tiene botones fijos ni textos de ayuda: se maneja tocando el contenido y deslizando (ver [3.1](#31-estructura-de-la-interfaz)). La estética es oscura, sobria y moderna, con un único color de acento; el único otro color es el que el usuario da a sus hábitos para distinguirlos (RF-06).
2. **Usabilidad directa.** Las acciones frecuentes (marcar un hábito, atender un recordatorio) se hacen con un solo toque.
3. **El seguimiento es el centro y el recordatorio, su punto fuerte.** Lo esencial es seguir los hábitos: crearlos, apuntar el progreso y consultar cualquier día. Los recordatorios son lo que distingue a la aplicación: si no avisan bien, lo que se quiere hacer se vuelve a olvidar.
4. **El registro es fiable.** Lo que se apunta no se pierde y está disponible siempre, también sin conexión.
5. **Prevenir los errores, no deshacerlos.** Es el principio de fondo de todo el diseño. La aplicación está pensada para que el usuario no cometa errores, o casi nunca. Si un usuario se equivoca, no se añade una forma de deshacerlo: se repiensa lo que ya existe para que no vuelva a equivocarse. Un botón o un aviso de "Deshacer" contradiría además el minimalismo. Toda funcionalidad nueva, toda incidencia y toda idea se valoran también con este criterio.

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
| **Aviso de pendientes** | `PendingDigest` | Aviso a una hora fija del día que nombra los hábitos de ese día que siguen sin cumplir. |
| **Color** | `color` | Color que el usuario da a un hábito, de entre los de una paleta, para agruparlo con otros o distinguirlo de ellos. |
| **Archivar** | `archive` | Retirar un hábito de uso sin borrar su historial. |
| **Calendario** | `calendar` | Cuadrícula de un mes con la que se elige el día que se quiere ver. |
| **Cuenta** | `account` | Identidad del usuario en la aplicación, a la que pertenecen sus datos. Se crea al iniciar sesión por primera vez con Apple o Google. |
| **Sesión** | `session` | Estado en el que el dispositivo tiene una cuenta iniciada y puede usar sus datos. |
| **Iniciar sesión** | `signIn` | Entrar en la cuenta con Apple o Google desde el dispositivo. |
| **Cerrar sesión** | `signOut` | Salir de la cuenta en el dispositivo: sus datos se borran de él, pero siguen en la cuenta. |
| **Eliminar la cuenta** | `deleteAccount` | Borrar para siempre la cuenta y todos sus datos, en la cuenta y en el dispositivo, y desconectar la aplicación de Apple o de Google. |
| **Cambios pendientes** | `pendingChanges` | Cambios hechos en el dispositivo que aún no se han copiado en la cuenta. |
| **Ajustes** | `settings` | Pantalla con las opciones de la cuenta, que se abre desde el menú. |
| **Opciones** | `options` | Acciones sobre un hábito que se abren al mantenerlo pulsado: corregir la cantidad, editar, archivar y eliminar. |

La columna "En el código" es el nombre en inglés con el que cada término aparece en el código y en el modelo de datos ([ADR-0007](adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)). Cada término se traduce siempre igual; uno nuevo se añade aquí antes de usarlo en el código. `goal` queda reservado para los objetivos de la [visión a futuro](#6-visión-a-futuro-tres-horizontes), y `Record` se evita porque ya tiene otro significado en el lenguaje de programación.

## 3. Funcionalidades del MVP

Cada requisito conserva su número aunque cambie de sección, y el número de uno retirado no se reutiliza, porque el código y los tests los citan.

### 3.1 Estructura de la interfaz

La aplicación tiene una sola pantalla principal: la vista de un día (3.4). Todo lo demás se despliega desde ella con gestos.

```
  Hoy                          ← fecha
┌──────────────────────────┐
│ Meditar                  │
│ Beber agua    1,25 / 2 L │   ← recuadro con la lista de hábitos
│ Leer              2 / 20 │
│                          │
└──────────────────────────┘
            ───                ← franja del menú
                               ← margen hasta el borde de la pantalla
```

- **RF-30.** La pantalla principal tiene tres zonas, de arriba abajo:
  - **La fecha** del día que se está viendo, pequeña y discreta: "Hoy" si es el día actual o, si no, el día de la semana y la fecha (por ejemplo, "Martes, 10 nov"). Si el día es de otro año, también lo indica ("Domingo, 3 ene 2027").
  - **Un recuadro con la lista de hábitos** de ese día, que ocupa casi toda la pantalla.
  - **Una franja fina** justo debajo del recuadro, que indica que desde ahí se despliega el menú. Queda bien separada del borde inferior de la pantalla, para no confundirse con los gestos del propio teléfono.
- **RF-31.** Al deslizar hacia abajo desde la fecha, o desde la lista cuando ya está arriba del todo, se despliega el **calendario** desde arriba (RF-18). Se cierra deslizándolo hacia arriba o tocando fuera de él.
- **RF-32.** Al deslizar hacia arriba desde la franja se despliega el **menú** desde abajo. Se cierra deslizándolo hacia abajo o tocando fuera de él. Tiene dos opciones, cada una con su icono:
  - **Crear**, que en el MVP crea un hábito (RF-06). Cuando haya más horizontes ([sección 6](#6-visión-a-futuro-tres-horizontes)), creará un elemento del horizonte que se esté viendo.
  - **Ajustes**, con las opciones de la cuenta (RF-03, RF-04).
- **RF-33.** Deslizar hacia la izquierda o hacia la derecha en la pantalla principal queda reservado para cambiar de horizonte ([sección 6](#6-visión-a-futuro-tres-horizontes)). En el MVP no hace nada.

### 3.2 Cuenta de usuario

- **RF-01.** Para usar la aplicación hay que iniciar sesión con la cuenta de Apple o de Google. No hay registro con email y contraseña. Sin sesión, la aplicación solo muestra la pantalla de inicio de sesión.
  - Iniciar sesión necesita conexión. Una vez iniciada, la aplicación funciona sin ella (RF-28).
- **RF-02.** La sesión se mantiene abierta hasta que el usuario la cierra.
- **RF-03.** El usuario puede cerrar sesión. Al cerrarla, sus datos se borran del dispositivo pero siguen en su cuenta. Así, en el mismo teléfono puede iniciarse otra cuenta sin que se mezclen los datos.
  - Si quedan cambios que aún no se han copiado en la cuenta (por ejemplo, por falta de conexión), se avisa de que se perderán antes de cerrar la sesión.
- **RF-04.** El usuario puede eliminar su cuenta, tras una confirmación explícita. Se borran de forma permanente todos sus datos, en la cuenta y en el dispositivo, y la aplicación deja de estar conectada a su cuenta de Apple o de Google. La cuenta de Apple o de Google no se elimina.
  - Necesita conexión.
- **RF-05.** Si el usuario inicia sesión en otro dispositivo, encuentra todos sus hábitos e historial.
- **RF-38.** Si al iniciar sesión hay en el dispositivo hábitos creados antes de que existiera la cuenta, pasan a la cuenta del usuario. Si la cuenta ya tenía hábitos de otro dispositivo, se juntan: el usuario encuentra los de los dos.

### 3.3 Gestión de hábitos

- **RF-06.** El usuario puede crear un hábito con estos datos:

  | Dato | Obligatorio | Notas |
  |------|-------------|-------|
  | Nombre | Sí | Texto corto, de 40 caracteres como máximo. |
  | Tipo | Sí | Booleano o cuantitativo. No se puede cambiar después de crearlo. |
  | Meta | Solo cuantitativo | Número mayor que 0, con 2 decimales como máximo. |
  | Unidad | Solo cuantitativo | Texto libre corto, de 10 caracteres como máximo: "L", "páginas", "min"… |
  | Incremento | Solo cuantitativo | Número mayor que 0, con 2 decimales como máximo. Por defecto, 1. |
  | Días programados | Sí | Al menos un día. Por defecto, todos. |
  | Recordatorios | No | Cero o más horas del día (ver 3.6). |
  | Color | No | Uno de una paleta de 12 colores, o ninguno. Por defecto, ninguno. Tocar el color elegido lo quita. |

  El hábito empieza el día que se está viendo al crearlo si es un día futuro, para poder planificar hábitos que empiecen un día concreto; el formulario lo indica con una línea discreta: "Empieza el 20 de noviembre de 2026". Creado desde el día actual o desde un día pasado, empieza el día actual. No aparece en los días anteriores a su inicio.

- **RF-07.** *Retirado.* Los hábitos se gestionan desde un día en que tocan (RF-08). El listado de todos los hábitos queda fuera del alcance (sección 4).
- **RF-08.** El usuario puede editar cualquier dato de un hábito salvo el tipo. Se edita desde sus opciones (RF-34), en cualquier día en que aparezca: pasado, actual o futuro.
- **RF-09.** Los cambios en un hábito (nombre, meta, días programados, recordatorios…) se aplican desde el día actual en adelante, se edite desde el día que se edite. Los días pasados conservan lo que se registró. Si se edita desde un día distinto del actual, el formulario lo indica con una línea discreta: "Los cambios se aplican desde hoy". Un hábito que aún no ha empezado (RF-06) es la excepción: sus cambios se aplican desde el día en que empieza, y el formulario lo indica si se edita desde otro día ("Los cambios se aplican desde el 20 de noviembre de 2026"). El nombre y el color son la excepción: identifican al hábito, así que cambian también en los días pasados.
- **RF-10.** El usuario puede archivar un hábito. Archivar sirve para dejar de seguir un hábito sin perder lo que se hizo; por ejemplo, uno que ya forma parte de la rutina.
  - Deja de aparecer en los días siguientes y deja de recordarse, pero su historial se conserva y sigue visible en los días pasados. El día en que se archiva solo aparece si ya tenía algo registrado.
  - Archivar pide confirmación, porque no se puede deshacer: para retomar el hábito se crea uno nuevo.
  - En los días en que aparece, lo registrado se puede seguir corrigiendo, pero el hábito ya no se puede editar ni archivar (RF-34).
- **RF-11.** El usuario puede eliminar un hábito de forma permanente, tras una confirmación explícita. Eliminar sirve para borrarlo como si no hubiera existido: desaparece de todos los días, también de los pasados, junto con todo su historial.

### 3.4 Vista de un día

Es la pantalla principal de la aplicación (ver 3.1).

- **RF-12.** Al abrir la aplicación se muestra el **día actual**, con la lista de hábitos programados para ese día de la semana.
  - Los hábitos se muestran en dos grupos separados: los pendientes, pegados a la parte superior del recuadro, y los cumplidos, pegados a la parte inferior. El espacio libre que queda entre los dos los separa. Si no caben, el recuadro se desplaza con scroll y los grupos siguen separados por un hueco.
  - Dentro de cada grupo, los hábitos se ordenan por sus recordatorios, como una agenda, para que arriba queden los que ya deberían estar hechos y los que tocan pronto:
    - En el día actual, primero van los hábitos cuyos recordatorios de hoy ya han sonado todos, por la hora del último. Después, los demás, por la hora de su próximo recordatorio: un hábito con varios recordatorios avanza al siguiente cada vez que suena uno.
    - En cualquier otro día, por la hora de su primer recordatorio.
    - Los que no tienen recordatorio van al final y, a igualdad, se mantiene el orden de creación.
    - El orden se calcula con la hora en que se muestra el día; con la aplicación abierta, la lista no se reordena sola al pasar las horas.
  - Un hábito que se cumple, o que deja de estar cumplido, se marca al momento y se queda en su sitio un instante (algo más de medio segundo), durante el cual se atenúa o recupera su brillo poco a poco. Pasado ese tiempo sin tocar ningún hábito, se desplaza con una breve animación hasta el otro grupo, de modo que se vea por qué cambia de sitio. Cada toque vuelve a empezar la espera: mientras se siguen tocando hábitos, la lista no se mueve bajo el dedo. En el grupo de llegada ocupa el lugar que le corresponde por sus recordatorios, y el resto de la lista no se reordena.
  - Los cambios que llegan de fuera mientras se ve el día (desde un recordatorio o desde otro dispositivo) no mueven la lista: los hábitos pasan a su grupo la próxima vez que se muestra el día o tras la siguiente pausa en los toques.
  - Si llega la medianoche con la aplicación abierta, la pantalla pasa sola al nuevo día actual. Si se estaba viendo otro día (RF-18), se queda en él.
  - Al volver a la aplicación después de haber salido de ella se muestra de nuevo el día actual, aunque se estuviera viendo otro.
- **RF-13.** Cada hábito de la lista muestra su nombre y su estado:
  - Booleano: solo el nombre.
  - Cuantitativo: el nombre, la cantidad acumulada y la meta (por ejemplo, "1,25 / 2 L").
  - En los dos, un hábito cumplido se muestra atenuado.
  - Un hábito con color lleva delante del nombre una circunferencia de ese color que se va rellenando, como las agujas de un reloj desde las 12, a medida que avanza el progreso del día. Un hábito booleano la tiene vacía o llena; uno cuantitativo, en proporción a la cantidad acumulada sobre la meta, y llena al alcanzarla o superarla. Si algún hábito del día tiene color, los que no lo tienen dejan ese hueco vacío, para que los nombres queden alineados; si ninguno lo tiene, no hay circunferencias.
- **RF-14.** Un hábito booleano se marca y desmarca con un toque.
- **RF-15.** Un hábito cuantitativo suma su incremento con un toque. Desde sus opciones (RF-34) también se puede restar el incremento o escribir la cantidad exacta. La cantidad nunca baja de 0 y admite 2 decimales como máximo.
- **RF-16.** Un hábito cuantitativo cuenta como cumplido cuando la cantidad acumulada alcanza la meta. Se puede superar la meta.
- **RF-39.** Los toques sobre la lista se notan en la mano, con las mismas vibraciones que usa el propio sistema del teléfono:
  - El toque que cumple un hábito (marcar uno booleano o alcanzar la meta de uno cuantitativo) da la vibración de tarea terminada.
  - Cualquier otro toque que apunta algo (sumar sin llegar a la meta, superarla o desmarcar) da un toque sutil.
  - Mantener pulsado un hábito para abrir sus opciones (RF-34) da un golpe ligero, como los menús del sistema.
  - Nada más vibra: ni el menú, ni el calendario, ni lo que se hace desde las opciones. Si el usuario ha desactivado las vibraciones del sistema, la aplicación tampoco vibra.
- **RF-17.** Un hábito aparece en los días programados a partir de la fecha en que se creó, nunca en días anteriores.
- **RF-34.** Al mantener pulsado un hábito se abren sus opciones. Las que aparecen dependen del día y del hábito:

  | Opción | Hoy y días pasados | Días futuros | Hábito archivado |
  |--------|--------------------|--------------|------------------|
  | Restar el incremento (solo cuantitativo) | Sí | No | Sí |
  | Escribir la cantidad exacta (solo cuantitativo) | Sí | No | Sí |
  | Editar (RF-08) | Sí | Sí | No |
  | Archivar (RF-10) | Sí | Sí | No |
  | Eliminar (RF-11) | Sí | Sí | Sí |

  - Las opciones se despliegan desde abajo, como el menú (RF-32), y se cierran igual. Arriba muestran el nombre del hábito y, si es cuantitativo, lo que lleva.
  - Al restar el incremento, las opciones siguen abiertas para poder repetirlo; las demás las cierran.
  - La cantidad exacta se escribe en un diálogo del sistema, que parte de lo que lleva el hábito. Si lo escrito no es una cantidad válida, el diálogo vuelve a pedirla e indica el motivo.

### 3.5 Navegación entre días

- **RF-18.** El usuario cambia de día eligiendo una fecha en el calendario (RF-31):
  - El calendario muestra un mes en cuadrícula, solo con el número de cada día. Encima van el mes y el año y, sobre cada columna, la inicial del día de la semana. Las semanas empiezan en lunes.
  - Se abre en el mes del día que se está viendo.
  - Deslizar hacia la izquierda o hacia la derecha dentro del calendario cambia de mes.
  - El día actual y el día que se está viendo se distinguen del resto.
  - Al tocar un día, el calendario se cierra y la pantalla principal muestra ese día. Se puede elegir cualquier día, pasado o futuro.

  No hay otra forma de pasar al día anterior o al siguiente: consultar otros días es algo puntual, y lo habitual es el día actual.
- **RF-19.** Los **días pasados** se pueden consultar y editar sin límite de antigüedad, con las mismas acciones que el día actual.
- **RF-20.** Los **días futuros** se pueden consultar (qué hábitos tocarán), pero no se pueden marcar.
- **RF-21.** Al tocar la fecha mientras se está viendo otro día, se vuelve al día actual.

### 3.6 Recordatorios

- **RF-22.** Cada hábito puede tener cero, una o varias horas de recordatorio. Cada hora se fija con precisión de minuto y un hábito no puede repetir la misma hora.
- **RF-23.** Un recordatorio solo se envía los días programados del hábito.
- **RF-24.** Si el hábito ya está cumplido ese día, sus recordatorios pendientes de ese día no se envían, tampoco los pospuestos. Un hábito cuantitativo que ha avanzado sin llegar a la meta sí se recuerda, y el recordatorio indica lo que lleva y la meta (por ejemplo, "llevas 1 de 2 L").
- **RF-25.** Desde el propio recordatorio, sin abrir la aplicación, el usuario puede:
  - **Booleano:** marcarlo como cumplido.
  - **Cuantitativo:** sumar el incremento.
  - **Ambos:** posponerlo 1 hora. El tiempo es el mismo para todos los hábitos. Un recordatorio no sale del día de su hábito: si al posponerlo caería en el día siguiente, no se vuelve a enviar.
- **RF-26.** Al tocar el recordatorio (fuera de sus botones), se abre la aplicación en el día actual.
- **RF-27.** Los recordatorios funcionan sin conexión.
- **RF-37.** Además de los recordatorios de cada hábito, la aplicación envía cada día dos avisos de pendientes, a las 17:00 y a las 22:00. Así el usuario no se olvida de registrar lo que ya ha hecho, y se le recuerda lo que aún no ha hecho, también los hábitos que no tienen recordatorios.
  - Un aviso solo se envía si a esa hora quedan hábitos del día sin cumplir. Cuentan todos los pendientes, también los cuantitativos a medias y los que aún tienen un recordatorio más tarde.
  - El aviso dice cuántos hábitos quedan y los nombra en el orden de la vista del día (RF-12). Si son muchos o tienen nombres largos, la lista se recorta (por ejemplo, "Leer, Beber agua, Correr y 2 más").
  - Al tocarlo se abre la aplicación en el día actual, como un recordatorio (RF-26). No tiene botones, porque reúne varios hábitos.
  - Las horas son fijas y los avisos no se pueden desactivar (ver sección 4).
- **RF-35.** La aplicación pide permiso para enviar recordatorios la primera vez que se abre. Si el usuario lo deniega, no se le vuelve a pedir al abrirla.
- **RF-36.** Si los recordatorios no están permitidos, al guardar un hábito con recordatorios (al crearlo o al editarlo) se avisa al usuario con un diálogo del sistema, que explica que no los recibirá y ofrece abrir los ajustes del teléfono para activarlos. El hábito se guarda igualmente, con sus recordatorios, y estos empiezan a funcionar en cuanto se da el permiso, sin tener que volver a editarlo.

  En general, si una acción necesita un permiso que el usuario ha denegado, el aviso aparece en ese momento, no al abrir la aplicación.

### 3.7 Disponibilidad y datos

- **RF-28.** Todas las funciones de registro (marcar, sumar, consultar días) funcionan sin conexión. Los cambios se sincronizan con la cuenta cuando vuelve la conexión.
- **RF-29.** Se conserva el historial completo de registros desde el primer día, aunque en el MVP no se muestren estadísticas.

## 4. Fuera del alcance del MVP

Funcionalidades descartadas por ahora, en orden aproximado de interés:

1. Estadísticas: rachas, porcentaje de cumplimiento, calendario de actividad. Cuando existan, tendrán su opción en el menú (RF-32); hasta entonces el menú no la muestra.
2. Widget en la pantalla de inicio para marcar hábitos.
3. Más tipos de frecuencia (por ejemplo, "3 veces por semana"). Encaja con los objetivos semanales de la [visión a futuro](#6-visión-a-futuro-tres-horizontes).
4. Más tipos de hábito.
5. Reordenar manualmente los hábitos.
6. Automatizaciones (registrar hábitos sin intervención del usuario).
7. Compartir o comparar hábitos con amigos.
8. Reloj inteligente.
9. Reactivar un hábito archivado conservando su historial. Hoy se crea un hábito nuevo (RF-10).
10. Un listado de todos los hábitos, independiente del día. Solo haría falta si aparecen acciones que no encajan en las opciones de un hábito (RF-34), como reactivar archivados o reordenar.
11. Pasar al día anterior o al siguiente sin abrir el calendario.
12. Accesibilidad con lector de pantalla (VoiceOver): acciones equivalentes a los gestos para quien no puede verlos.
13. Cambiar las horas de los avisos de pendientes (RF-37) o desactivarlos, desde los ajustes (RF-32).

## 5. Preguntas abiertas

Puntos a decidir antes de implementar la parte correspondiente. Ahora mismo no queda ninguno: los últimos, si la cuenta es obligatoria y qué pasa con los datos del dispositivo al iniciar y cerrar sesión, se resolvieron en RF-01, RF-03 y RF-38.

## 6. Visión a futuro: tres horizontes

> **Solo es una idea.** No forma parte del MVP, no tiene requisitos ni tareas y se concretará cuando el desarrollo avance. Se apunta para no perderla y para construir a partir de ella.

La aplicación podría organizarse en tres partes, una por cada horizonte de tiempo. Cada una responde a una pregunta distinta:

| Horizonte | Parte | Pregunta | Para qué sirve | Ejemplo |
|-----------|-------|----------|----------------|---------|
| Diario | **Hábitos** | ¿Qué hago hoy? | Mantener un orden en el día | Tomar el sol, leer 20 minutos |
| Corto plazo | **Objetivos semanales** | ¿Cómo voy esta semana? | Ver el progreso de la semana | Dedicar 5 horas a proyectos personales |
| Largo plazo | **Objetivos a largo plazo** | ¿Hacia dónde voy? | Mantener el foco y no desviarse del camino | Correr una media maratón, terminar una aplicación antes de una fecha |

### Hábitos

Es lo que define el MVP (secciones 3.1 a 3.7) y la base de las otras dos partes. Se empieza por aquí.

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

- **Estructura.** Cada horizonte sería una página de la pantalla principal, y se pasaría de una a otra deslizando hacia los lados, gesto que ya queda reservado (RF-33). Todas seguirían la estructura de la sección 3.1: arriba el periodo (el día, la semana…), en el centro el recuadro con la lista y debajo el menú, cuya opción "Crear" crearía un elemento del horizonte que se esté viendo.
- **Recordatorios en cada horizonte.** Siguiendo el principio de que el recordatorio es el punto fuerte, cada parte podría tener los suyos: a una hora para los hábitos, de progreso para la semana ("llevas 2 de 5 horas y es jueves") y de cuenta atrás para el largo plazo ("quedan 40 días").
- **Minimalismo.** Cada parte nueva tendrá que justificar su presencia cuando llegue, como cualquier otra funcionalidad.
- **Visión del producto.** Hoy el problema que se resuelve es el olvido. Con los tres horizontes se ampliaría a no perder de vista lo que uno quiere hacer, hoy, esta semana y a largo plazo. Si se adopta, habrá que revisar la sección 1.
- **Nombres.** "Meta" ya significa la cantidad diaria de un hábito cuantitativo (ver el glosario), así que la tercera parte no debe llamarse "metas". Por ahora: "Objetivos a largo plazo" (alternativa: "Propósitos").

### Preguntas abiertas

- ¿Cómo se vinculan los horizontes y qué se ve de ese vínculo?
- ¿Cómo conviven los objetivos semanales recurrentes y los puntuales?
- ¿Qué día empieza la semana?
- ¿Cómo se mide el progreso de un objetivo a largo plazo: hitos intermedios, avance calculado a partir de lo vinculado, o solo cumplido o no en la fecha?
