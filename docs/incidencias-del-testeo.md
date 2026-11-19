# Incidencias del testeo

Lo que se encuentra al probar la aplicación en el iPhone (la variante de producción en TestFlight o la de desarrollo) y queda por mejorar o corregir. Cada incidencia tiene un número que no se reutiliza, su estado y, cuando se resuelve, cómo se ha resuelto.

Una incidencia que cambia el comportamiento descrito en la [especificación funcional](especificacion-funcional.md) se resuelve actualizándola en el mismo Pull Request.

**Estados:** pendiente, resuelta (en una rama o PR sin fusionar) y publicada (en un build de TestFlight).

## INC-01. Un hábito creado desde un día futuro empieza hoy

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** resuelta.
- **Qué pasa:** con el calendario en un día posterior a hoy (por ejemplo, mañana), al crear un hábito este aparece desde hoy.
- **Qué se espera:** el hábito aparece a partir del día que se estaba viendo, para poder planificar hábitos nuevos que empiecen un día concreto.
- **Cómo se resuelve:** el formulario de creación recibe el día que se está viendo. Si es futuro, el hábito empieza ese día (su `created_on` y el `effective_from` de su primera versión) y el formulario lo indica con "Empieza el …"; desde hoy o un día pasado, empieza hoy. Los cambios a un hábito que aún no ha empezado se aplican desde el día en que empieza, no desde hoy. Se actualizan RF-06 y RF-09.

## INC-02. Los campos de cantidad no sobrescriben lo escrito

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** resuelta.
- **Qué pasa:** al tocar Meta, Unidad o Incremento en el formulario del hábito, el cursor queda al final del texto. Si la meta es 2 y se escribe 3, queda 23.
- **Qué se espera:** al tocar el campo se selecciona su contenido, de modo que lo que se escriba lo sustituya.
- **Cómo se resuelve:** los tres campos seleccionan todo su contenido al recibir el foco (`selectTextOnFocus`), tanto al crear como al editar un hábito. El nombre no: tocarlo suele ser para corregirlo.

## INC-03. El selector de hora del recordatorio se abre fuera de la vista

- **Encontrada:** 2026-11-19, en producción (TestFlight).
- **Estado:** resuelta.
- **Qué pasa:** al pulsar "Añadir recordatorio", el selector de horas y minutos se despliega hacia abajo y queda en parte fuera de la pantalla: hay que desplazarse a mano para verlo y confirmar.
- **Qué se espera:** el formulario se desplaza solo hasta que el selector y sus botones se ven enteros.
- **Cómo se resuelve:** al abrir el selector se cierra el teclado, si estaba abierto (lo taparía), y en cuanto el formulario crece para hacerle sitio se desplaza con animación hasta el final, donde quedan el selector y sus botones. Los recordatorios son la última sección del formulario, así que el final es justo lo que hay que mostrar. Solo se desplaza esa vez: el resto de cambios deja el formulario donde lo ponga el usuario.
