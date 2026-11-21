# ADR-0021: Carrusel de horizontes con ScrollView horizontal paginado

- **Estado:** Propuesto
- **Fecha:** 2026-11-22

## Contexto

- La pantalla principal pasa a tener una página por horizonte: Hábitos, Objetivos semanales y, más adelante, Objetivos a largo plazo. Se cambia de una a otra deslizando el recuadro hacia los lados (RF-33), el gesto que [ADR-0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md) dejó reservado y cuya implementación aplazó.
- Solo se desplaza el recuadro. El título no se mueve: el anterior desaparece y aparece el nuevo a medida que avanza el desplazamiento.
- El carrusel tiene que convivir con los gestos que ya existen: el scroll vertical de la lista, el calendario que se despliega desde la lista y el menú. Los gestos verticales de las hojas ya se cancelan al detectar un movimiento lateral.
- Un deslizamiento que empiece sobre una fila no debe registrar ese hábito: prevenir ese error es parte de la decisión (principio 5 de la especificación).
- El usuario prioriza el acabado nativo de iOS, y cada dependencia con código nativo gasta un build de EAS.

## Opciones consideradas

### Cómo implementar el paginado

**`ScrollView` horizontal con `pagingEnabled`, de `react-native-gesture-handler`**
- ✅ Usa el paginado nativo de iOS: la inercia, el rebote y el ajuste a cada página son los del sistema.
- ✅ iOS cancela el toque sobre el contenido cuando empieza el desplazamiento, que es lo que evita registrar un hábito sin querer.
- ✅ Sin dependencias nuevas ni build: llega con una actualización OTA.
- ❌ La convivencia con el scroll vertical y con los gestos de las hojas solo se puede comprobar en el iPhone.

**`react-native-pager-view`**
- ✅ Componente nativo pensado para páginas.
- ❌ Añade una dependencia con código nativo y gasta un build, sin un acabado mejor que el del paginado de iOS.
- ❌ Es una pieza más que coordinar con los gestos propios.

**Gesto propio con `usePanGesture` y Reanimated, como los meses del calendario**
- ✅ Control total del movimiento y patrón ya presente en el proyecto.
- ❌ Imita a mano la física que iOS ya da hecha.
- ❌ Más código propio de umbrales y animación.

### Orden de las páginas

**Lineal**
- ✅ Va de lo cercano a lo lejano y siempre se sabe dónde se está.
- ✅ Es lo que da el paginado nativo, sin código adicional.
- ❌ Para ir de la última página a la primera hay que pasar por las intermedias.

**Circular**
- ✅ Desde la última página se vuelve a Hábitos con un solo gesto.
- ❌ El paginado nativo no da la vuelta: habría que duplicar páginas y saltar sin que se note, con riesgo de parpadeos y de estado duplicado.

## Decisión

- **`ScrollView` horizontal paginado** de `react-native-gesture-handler`, porque da el tacto nativo sin dependencias ni build.
- **Carrusel lineal.** El circular queda anotado como mejora en la sección 4 de la especificación.
- **Solo el recuadro forma parte del carrusel.** El título, la franja del menú y las hojas quedan fuera de él. Las hojas se dibujan sobre el carrusel, así que mientras hay una abierta no se puede cambiar de página.
- **El título sigue la posición del carrusel**: cada título se desvanece en la primera mitad del recorrido y el nuevo aparece en la segunda.
- **Una sola fecha para todos los horizontes.** La semana no es un estado aparte: se deriva del día que se está viendo (RF-41).

## Consecuencias

- No hace falta un build: el cambio llega con una actualización OTA.
- La posición del carrusel se lee desde el evento de scroll en JavaScript, con el mismo patrón que la lista. Si el fundido del título no fuese fluido en el iPhone, se pasaría al hilo de interfaz.
- Los tests comprueban qué página está activa y qué muestra. El tacto, la convivencia de los gestos y que un deslizamiento no registre un hábito se comprueban en el iPhone.
- Añadir la página de largo plazo consiste en añadir un horizonte a la lista.
- Si se adopta el carrusel circular, habrá que revisar esta decisión.
