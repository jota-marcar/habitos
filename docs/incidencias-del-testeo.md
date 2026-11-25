# Incidencias del testeo

Lo que se encuentra al probar la aplicación en el iPhone (la variante de producción en TestFlight o la de desarrollo) y queda por mejorar o corregir. Cada incidencia tiene un número que no se reutiliza, su estado y, cuando se resuelve, cómo se ha resuelto.

Una incidencia que cambia el comportamiento descrito en la [especificación funcional](especificacion-funcional.md) se resuelve actualizándola en el mismo Pull Request.

**Estados:** pendiente, resuelta (corregida en una rama o ya fusionada, pero aún no llega a los probadores), publicada (en un build de TestFlight o en una actualización OTA de producción) y cancelada (se descarta, al menos de momento, con el motivo).

## INC-01. Un hábito creado desde un día futuro empieza hoy

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** con el calendario en un día posterior a hoy (por ejemplo, mañana), al crear un hábito este aparece desde hoy.
- **Qué se espera:** el hábito aparece a partir del día que se estaba viendo, para poder planificar hábitos nuevos que empiecen un día concreto.
- **Cómo se resuelve:** el formulario de creación recibe el día que se está viendo. Si es futuro, el hábito empieza ese día (su `created_on` y el `effective_from` de su primera versión) y el formulario lo indica con "Empieza el …"; desde hoy o un día pasado, empieza hoy. Los cambios a un hábito que aún no ha empezado se aplican desde el día en que empieza, no desde hoy. Se actualizan RF-06 y RF-09.

## INC-02. Los campos de cantidad no sobrescriben lo escrito

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** al tocar Meta, Unidad o Incremento en el formulario del hábito, el cursor queda al final del texto. Si la meta es 2 y se escribe 3, queda 23.
- **Qué se espera:** al tocar el campo se selecciona su contenido, de modo que lo que se escriba lo sustituya.
- **Cómo se resuelve:** los tres campos seleccionan todo su contenido al recibir el foco (`selectTextOnFocus`), tanto al crear como al editar un hábito. El nombre no: tocarlo suele ser para corregirlo.

## INC-03. El selector de hora del recordatorio se abre fuera de la vista

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)` (reabierta y corregida el 2026-11-21).
- **Qué pasa:** al pulsar "Añadir recordatorio", el selector de horas y minutos se despliega hacia abajo y queda en parte fuera de la pantalla: hay que desplazarse a mano para verlo y confirmar.
- **Qué se espera:** el formulario se desplaza solo, lo justo para que el selector y sus botones se vean enteros.
- **Primer intento (no basta):** al abrir el selector se cierra el teclado, si estaba abierto (lo taparía), y en cuanto el formulario crece para hacerle sitio se desplaza con animación hasta el final, donde quedan el selector y sus botones. Los recordatorios son la última sección del formulario, así que el final es justo lo que hay que mostrar. Solo se desplaza esa vez: el resto de cambios deja el formulario donde lo ponga el usuario.
- **Por qué se reabre:** al probar en el iPhone la versión con este arreglo (Hábitos Dev, 2026-11-21), al crear un hábito el selector sigue abriéndose fuera de la pantalla. El test automático solo comprueba que se pide el desplazamiento, con un selector simulado.
- **Causa (según el código de las librerías, sin reproducirla en el iPhone):** el selector nativo se coloca primero sin altura y se mide en una pasada posterior. El desplazamiento se lanzaba una sola vez, con el primer cambio de tamaño del formulario, así que podía quedarse corto por casi toda la altura del selector. Además, tenía en cuenta el teclado, que al crear un hábito está abierto y cerrándose en ese momento.
- **Cómo se resuelve:** el formulario espera a que el propio selector tenga su altura real y a un fotograma más, para conocer ya su tamaño final. Entonces se desplaza con animación justo hasta su final, donde acaban el selector y sus botones, sin contar el teclado. Si ya se ve entero, no se mueve.
- **Ajuste tras probarlo:** los botones quedaban casi pegados al borde inferior. El final del formulario deja ahora libre la zona del indicador de inicio de iOS y 16 pt más, así que el desplazamiento llega algo más abajo y los botones quedan con un margen.

## INC-04. El mensaje inicial no explica cómo abrir el calendario

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** sin hábitos, el mensaje inicial solo explica el menú inferior ("Desliza hacia arriba desde la franja de abajo para crear uno."). No dice que deslizando hacia abajo desde arriba se abre el calendario.
- **Qué se espera:** el mensaje inicial explica también el gesto del calendario, sin dejar de ser breve. Relacionada con INC-09.
- **Cómo se resuelve:** el mensaje pasa a ser "Desliza desde abajo para crear uno y desde arriba para abrir el calendario.": explica los dos gestos en una sola frase, igual de breve que la anterior.

## INC-05. No es evidente que los valores por defecto de la cantidad se pueden cambiar

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** en el formulario del hábito, Meta, Unidad e Incremento vienen rellenos con valores por defecto que se muestran con menos opacidad. Un usuario nuevo no ve con claridad que son campos que puede tocar y modificar.
- **Qué se espera:** los tres campos se reconocen a simple vista como editables (por ejemplo, con un marco o un fondo sutil), sin romper el aspecto minimalista.
- **Cómo se resuelve:** el valor de cada uno de los tres campos va en una caja redondeada con un fondo algo más claro que el de la sección (el color de los bordes del tema), alineada a la derecha y del mismo ancho en los tres, para que queden en columna. En Meta y Unidad lo atenuado no es un valor por defecto, sino un ejemplo ("2", "L") que desaparece al escribir; solo Incremento trae un valor real (1). La caja deja claro en los dos casos que es un campo. El nombre no cambia: ocupa toda la fila y ya se reconoce como campo.

## INC-06. El punto de color no muestra el progreso del hábito

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** el indicador de color delante de cada hábito de la lista es un círculo relleno, igual sea cual sea el progreso del día.
- **Qué se espera:** el indicador es una circunferencia (solo el borde) del color del hábito que se va rellenando a medida que avanza el progreso del día, y queda completa al cumplir la meta. Cambia lo descrito en RF-13 de la especificación funcional.
- **Cómo se resuelve:** el indicador pasa a ser una circunferencia de 14 pt (antes, un punto de 10 pt) con un borde de 1,5 pt, que se rellena por sectores, como las agujas de un reloj desde las 12. Un hábito booleano la tiene vacía o llena; uno cuantitativo, en proporción a la cantidad sobre la meta, y llena al alcanzarla o superarla. Al tocar el hábito, el relleno avanza con una animación breve (250 ms). Los hábitos sin color ya no llevan un aro gris vacío, que se confundiría con el 0 % de uno con color: dejan el hueco vacío, para que los nombres sigan alineados. Se dibuja con vistas de React Native (dos mitades que giran tras un recorte), sin dependencias nuevas ni build nuevo. Se actualiza RF-13.

## INC-07. Al completar un hábito, no se ve por qué cambia de sitio

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)` (reabierta y corregida el 2026-11-21).
- **Qué pasa:** al completar un hábito, este se marca como completado, pero el usuario no lo ve moverse a la parte de completados. Al volver a la aplicación lo encuentra abajo y no sabe por qué ha cambiado de sitio.
- **Qué se espera:** al completarlo, además de marcarse, el hábito pasa en ese momento a la lista de completados con una transición suave, de modo que el usuario vea el cambio y lo entienda. Puede ser un desplazamiento o que desaparezca levemente y aparezca en el otro lugar.
- **Por qué se reabre:** al probar en el iPhone la versión con este arreglo (Hábitos Dev, 2026-11-21), la pausa de 1 s funciona, pero después el hábito se teletransporta de un grupo a otro, sin transición.
- **Causa:** los dos grupos se pintaban como dos listas dentro del contenedor, y React identifica cada fila también por la lista en la que está. Al cambiar de grupo, la fila se destruía y se creaba otra en su destino, de modo que no había nada que desplazar, mientras las demás sí se movían. Un test lo reproduce. La transición también se la salta iOS con "Reducir movimiento" activado.
- **Cómo se resuelve:** los pendientes, el hueco y los cumplidos forman una sola lista, así que la fila conserva su vista al cambiar de grupo y la animación de 350 ms prevista la desplaza de un sitio a otro. No hace falta un fundido ni un build nuevo.
- **Ajuste tras probarlo:** la espera de 1 s se hacía algo lenta y pasa a 600 ms. La opacidad ya no cambia de golpe al tocar: el hábito se atenúa, o recupera su brillo, gradualmente durante esos 600 ms, y después se desliza. Se actualiza RF-12.
- **Primer intento (no basta):** hasta ahora, RF-12 dejaba el hábito en su sitio mientras se veía el día, para que la lista no se moviera bajo el dedo. Moverlo al instante haría que el siguiente toque de una ráfaga cayera en otro hábito (por ejemplo, al sumar a uno cuantitativo que acaba de alcanzar la meta). Por eso se mueve tras una pausa: el hábito se marca al momento y, tras 1 s sin tocar ningún hábito, se desliza en 350 ms hasta su grupo. Lo mismo ocurre al dejar de estar cumplido, que vuelve a los pendientes. Cada toque reinicia la espera, así que, si se marcan varios seguidos, se mueven todos juntos al terminar. En el grupo de llegada ocupa el lugar que le corresponde por sus recordatorios, y el resto no se reordena. Los dos grupos pasan a estar en un mismo contenedor para que la fila conserve su vista y se desplace, en lugar de desaparecer arriba y aparecer abajo. La animación es una transición de Reanimated, que ya estaba instalado, así que no hace falta un build nuevo. Con "Reducir movimiento" activado, iOS se la salta. Se actualiza RF-12.

## INC-08. El texto de la lista de hábitos es algo pequeño

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** publicada en el build `0.1.0 (2)`.
- **Qué pasa:** los nombres y el progreso de los hábitos de la lista se leen algo pequeños.
- **Qué se espera:** un tamaño de letra ligeramente mayor en la lista de hábitos (solo un poco).
- **Cómo se resuelve:** el nombre y el progreso de los hábitos de la lista pasan de 17 a 18 pt, y la fecha de arriba, de 19 a 20 pt, para que siga destacando sobre la lista. El resto de textos de la aplicación no cambia.

## INC-09. Nada indica que hay un calendario arriba

- **Encontrada:** 2026-11-20, en producción (TestFlight).
- **Estado:** cancelada.
- **Qué pasa:** el menú inferior tiene una franja que indica que se puede deslizar para abrirlo, pero el calendario de arriba no tiene ninguna señal.
- **Qué se espera:** a valorar una franja arriba, idéntica a la de abajo, que indique que se puede deslizar para abrir el calendario. Antes de decidir, hay que comprobar que no recarga la pantalla ni le resta minimalismo. Relacionada con INC-04.
- **Por qué se cancela:** de momento basta con el mensaje inicial de INC-04, que ya explica que deslizando desde arriba se abre el calendario. Se evita añadir otra franja a la pantalla. Si los probadores siguen sin encontrar el calendario, se puede retomar.

## INC-10. Los botones del recordatorio no se ven sin mantenerlo pulsado

- **Encontrada:** 2026-11-21, en producción (TestFlight).
- **Estado:** resuelta.
- **Qué pasa:** los botones para marcar o posponer un hábito solo aparecen al mantener pulsada la notificación, y nada lo indica.
- **Qué se espera:** poder usar los botones directamente desde la notificación.
- **Por qué no se hace así:** iOS no permite mostrar los botones de una notificación normal sin mantenerla pulsada. Las alternativas con botones visibles (Live Activity, AlarmKit) se descartan de momento por su coste, su riesgo para los datos o porque resultarían intrusivas.
- **Cómo se resuelve:** los recordatorios explican el gesto con una línea ("Mantén pulsado para marcarlo o posponerlo", o "para sumar o posponerlo" en un cuantitativo). Deja de aparecer al usar un botón por primera vez y, como mucho, a los 7 días del primer recordatorio. Se guarda solo en el dispositivo, fuera de la base de datos, para que la actualización OTA se pueda deshacer sin riesgo. Además, un recordatorio que cambia se sustituye sin cancelarlo antes, para que iOS no pueda dejarlo sin programar si suspende la app a mitad. Se actualiza RF-25.

## INC-11. Los botones Cancelar y Guardar del formulario se ven grises y violeta

- **Encontrada:** 2026-11-25, en el iPhone, tras actualizar iOS.
- **Estado:** pendiente.
- **Qué pasa:** en el formulario de creación, los botones Cancelar y Guardar aparecen con un fondo gris y el texto en violeta, que no corresponden al aspecto de la aplicación. Antes de la actualización de iOS se veían bien, y la aplicación no ha cambiado en ese aspecto.
- **Qué se espera:** los botones se ven como antes de la actualización, con los colores de la aplicación.
- **Por confirmar:** la versión de iOS exacta, si pasa en las dos variantes (Hábitos Dev y producción) y si afecta también al formulario de edición y al de las metas.
