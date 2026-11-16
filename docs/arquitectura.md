# Arquitectura

Cómo se construye la aplicación descrita en la [especificación funcional](especificacion-funcional.md). Las decisiones importantes se justifican en los [ADR](adr/); este documento resume el resultado.

## 1. Objetivos de calidad

Derivados de los principios de la especificación funcional:

| Prioridad | Objetivo | Qué implica |
|-----------|----------|-------------|
| 1 | **Recordatorios fiables** | Se generan en el propio dispositivo; no dependen de conexión ni de un servidor. |
| 2 | **Funciona sin conexión** | El dispositivo guarda los datos y es la fuente de verdad para la interfaz. La nube es copia y sincronización. |
| 3 | **Respuesta inmediata** | Marcar un hábito no espera a la red. |
| 4 | **Simplicidad** | Mínimo número de piezas, servicios gestionados, nada de servidores propios. |
| 5 | **Coste cero o casi** | Solo el Apple Developer Program es de pago. |

## 2. Visión general

```mermaid
flowchart LR
    subgraph iPhone["App en el iPhone"]
        UI["Interfaz<br/>(pantallas)"]
        Dom["Dominio<br/>(reglas puras)"]
        DB[("Base de datos local")]
        Sync["Sincronización"]
        Notif["Planificador de<br/>recordatorios"]
        UI --> Dom
        UI --> DB
        Notif --> Dom
        Notif --> DB
        Sync --> DB
    end

    iOS["Notificaciones<br/>locales de iOS"]
    subgraph Nube["Supabase"]
        Auth["Autenticación<br/>(Apple, Google)"]
        PG[("Postgres<br/>+ Row Level Security")]
    end

    Notif -->|programa| iOS
    iOS -->|"Hecho / +incremento / Posponer"| UI
    Sync <-->|"push / pull"| PG
    UI -->|inicio de sesión| Auth
```

- La **interfaz** solo lee y escribe en la base de datos local, así que nunca espera a la red.
- El **dominio** no accede a la base de datos ni a ninguna otra pieza: recibe los datos que le pasan la interfaz o el planificador y devuelve el resultado.
- La **sincronización** copia los cambios entre la base local y Supabase en segundo plano.
- El **planificador de recordatorios** calcula qué avisos tocan y los programa como notificaciones locales de iOS.

## 3. Tecnologías

| Área | Elección | Decisión |
|------|----------|----------|
| Plataforma | Expo (React Native) con TypeScript en modo estricto | [ADR-0002](adr/0002-expo-como-plataforma.md) |
| Navegación | Expo Router (rutas basadas en ficheros): el día como única pantalla principal, sin cabecera, y los formularios como modales | [ADR-0010](adr/0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md) |
| Gestos y animaciones | `react-native-gesture-handler` y `react-native-reanimated`: el calendario, el menú y las opciones de un hábito son capas de la pantalla principal | [ADR-0010](adr/0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md) |
| Datos en la interfaz | Hooks propios sobre una conexión única de `expo-sqlite`, sin caché ni store global | [ADR-0010](adr/0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md), [ADR-0012](adr/0012-botones-de-los-recordatorios-en-segundo-plano-con-javascript.md) |
| Estilos | `StyleSheet` con tokens propios, sin librería de UI; solo modo oscuro, con acento violeta y una paleta aparte para los colores de los hábitos | [ADR-0010](adr/0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md), [ADR-0013](adr/0013-estetica-oscura-unica-con-acento-violeta.md), [ADR-0014](adr/0014-colores-de-habito-como-dato-del-usuario-guardados-como-clave-de-paleta.md) |
| Iconos | SF Symbols con `expo-symbols`, con un sustituto sencillo donde no hay | [ADR-0011](adr/0011-sf-symbols-con-expo-symbols-para-los-iconos.md) |
| Base de datos local | SQLite (`expo-sqlite`), con SQL directo y migraciones propias | [ADR-0004](adr/0004-offline-first-con-sincronizacion.md), [ADR-0009](adr/0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md) |
| Backend y autenticación | Supabase (Postgres, Auth) | [ADR-0003](adr/0003-supabase-como-backend.md) |
| Inicio de sesión | Sign in with Apple y Google nativos, con el token enviado a Supabase | [ADR-0003](adr/0003-supabase-como-backend.md) |
| Recordatorios | Notificaciones locales (`expo-notifications`) y tarea en segundo plano (`expo-background-task`) | [ADR-0005](adr/0005-recordatorios-locales-en-ventana-deslizante.md) |
| Compilación y publicación | EAS Build, EAS Submit y TestFlight | [ADR-0002](adr/0002-expo-como-plataforma.md) |
| Tests | Jest y React Native Testing Library | Estándar de Expo |
| Calidad de código | ESLint y Prettier | Estándar de Expo |
| Variantes | Desarrollo y producción, con identidad propia cada una | [ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md) |
| Idioma | Código en inglés, documentación en español | [ADR-0007](adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md) |

Las versiones concretas se fijan al crear el proyecto y quedan registradas en `package.json`.

## 4. Capas y estructura del código

```
src/
  app/            Pantallas y navegación (Expo Router: cada fichero es una ruta)
  domain/         Reglas de negocio puras, sin dependencias de React ni de la base de datos
  data/           Acceso a la base de datos local (esquema, migraciones, repositorios)
  sync/           Sincronización con Supabase
  notifications/  Planificador de recordatorios y gestión de acciones
  auth/           Inicio y cierre de sesión, eliminación de cuenta
  ui/             Componentes visuales reutilizables, tokens de estilo y hooks de datos de las pantallas
supabase/         Migraciones SQL y políticas de seguridad del backend
```

Regla de dependencias: `app` y `ui` pueden usar todo; `domain` no depende de nada. Así las reglas más delicadas (qué hábitos tocan un día, cuándo está cumplido, qué recordatorios hay que programar) son funciones puras que se prueban con tests unitarios rápidos. ESLint impone esta regla en `src/domain`.

Convenciones del dominio:

- **No consulta el reloj ni genera identificadores.** "Hoy" y los UUID se le pasan como datos, así que el mismo dato de entrada da siempre el mismo resultado.
- **Las reglas que pueden rechazar una operación devuelven códigos de error** (por ejemplo, `name_empty`), no textos. La interfaz decide el mensaje.
- **Los tests van junto al código** (`dates.ts` y `dates.test.ts`) y la cobertura del dominio y de la capa de datos debe ser del 100 %: `npm run verify` falla si baja.
- **La capa de datos** (`src/data`) solo depende del dominio, y sus repositorios usan una interfaz mínima de base de datos en lugar de `expo-sqlite`. Así los tests ejecutan el SQL real con el SQLite integrado en Node ([ADR-0009](adr/0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md)). ESLint impone también esta dependencia.

Las pantallas están en `src/app/` porque es la ubicación de la plantilla de Expo; dentro solo van rutas, y los tests van fuera (en `src/__tests__/` o junto al código que prueban, fuera de `src/app/`). Los imports usan el alias `@/` → `src/`.

## 5. Modelo de datos

La especificación exige que los cambios en un hábito se apliquen solo hacia delante (RF-09) y que los días pasados muestren lo que tocaba entonces. Por eso la configuración de un hábito se guarda con **fecha de vigencia** ([ADR-0006](adr/0006-configuracion-de-habitos-con-vigencia.md)).

Los nombres del modelo están en inglés ([ADR-0007](adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)); su equivalencia con los términos de la especificación está en el [glosario](especificacion-funcional.md#2-glosario).

```mermaid
erDiagram
    USER ||--o{ HABIT : tiene
    HABIT ||--|{ HABIT_VERSION : "se configura con"
    HABIT ||--o{ ENTRY : "se registra en"
    HABIT ||--o{ REMINDER : "avisa con"

    HABIT {
        uuid id
        uuid user_id
        text name
        text type "boolean | quantitative"
        text color "nullable, clave de paleta"
        date created_on
        date archived_on "nullable"
    }
    HABIT_VERSION {
        uuid id
        uuid habit_id
        date effective_from
        int scheduled_days "máscara de días de la semana"
        numeric target "nullable"
        text unit "nullable"
        numeric increment "nullable"
    }
    ENTRY {
        uuid id
        uuid habit_id
        date date "fecha local, sin hora"
        numeric value "1/0 en booleanos"
    }
    REMINDER {
        uuid id
        uuid habit_id
        time time "hora local, sin segundos"
    }
```

Decisiones del modelo:

- **Las fechas son fechas de calendario** (`2026-10-28`), no instantes con hora. El día va de 00:00 a 23:59 en la hora local del dispositivo y no cambia si el usuario viaja a otra zona horaria.
- **Qué hábitos tocan el día D:** los que se crearon como mucho en D, no están retirados por archivado en D y, según la versión vigente en D (la de mayor `effective_from` que sea ≤ D), están programados para ese día de la semana.
- **Archivado:** un hábito archivado deja de tocar a partir del día siguiente al archivado. El propio día del archivado solo toca si ya tiene algo registrado (RF-10). Archivar no se deshace: `archived_on` es una sola fecha, y reactivar exigiría guardar periodos de actividad para que los días intermedios no aparezcan como incumplidos (fuera del alcance del MVP).
- **Edición desde cualquier día:** la configuración nueva siempre entra en vigor el día actual (`effective_from` = hoy), aunque se edite desde un día pasado o futuro (RF-09). Lo que pertenece al día que se está viendo es su registro.
- **Color:** `color` guarda la clave de un color de la paleta (`blue`, `teal`…) o nada, no su valor; el tono de cada clave lo decide la interfaz ([ADR-0014](adr/0014-colores-de-habito-como-dato-del-usuario-guardados-como-clave-de-paleta.md)). Como el nombre, no tiene versiones: cambia en todo el historial.
- **Días programados:** máscara de 7 bits en `scheduled_days`, con el lunes en el bit 0 y el domingo en el bit 6.
- **Cantidades:** `target`, `increment` y `value` tienen 2 decimales como máximo y nunca son negativas. Un registro con valor 0 equivale a no tener registro.
- **Un registro por hábito y día** (clave única `habit_id + date`). Si no hay registro, el hábito está pendiente.
- **Las horas son horas del día** (`08:30`), con precisión de minuto y sin zona horaria, igual que las fechas.
- **Los recordatorios no tienen versiones**: solo afectan al futuro. Un hábito no puede tener dos a la misma hora (clave única `habit_id + time`).
- **Qué recordatorios se programan:** a partir de ahora y por cercanía, los de cada hábito en sus días programados, salvo que el hábito esté cumplido ese día o archivado. Como mucho 60 ([ADR-0005](adr/0005-recordatorios-locales-en-ventana-deslizante.md)). Cada aviso lleva el progreso del hábito ese día para poder mostrarlo.
- **Campos de sincronización** en todas las tablas: identificador generado en el dispositivo (UUID), `updated_at` asignado por el servidor y `deleted` (borrado lógico) para propagar eliminaciones.
- **En la base local** no existe `user_id` (es de un solo usuario) y cada tabla añade `pending_sync`, que marca las filas con cambios sin subir. Las claves únicas ignoran las filas borradas.
- **Migraciones locales:** lista ordenada en `src/data/migrations.ts`; la base guarda su versión y al abrir se aplican las que faltan. Una migración publicada no se edita.

## 6. Flujos principales

### Marcar un hábito

1. La interfaz escribe el registro en la base local y se actualiza al instante. Solo cambia el estado de la fila: la pantalla conserva los grupos (pendientes arriba, cumplidos abajo) y el orden que calculó al mostrar el día, y la lista se reagrupa la próxima vez que se muestra (RF-12).
2. El planificador cancela los recordatorios restantes de ese hábito para hoy si ya está cumplido (RF-24).
3. La sincronización sube el cambio cuando hay conexión.

### Cambiar de día

1. El día que se ve es estado de la pantalla principal ([ADR-0010](adr/0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md)). El calendario es una hoja que baja desde arriba con el mismo componente que el menú, que sale desde abajo.
2. La lista solo tira del calendario cuando está arriba del todo: su gesto convive con el scroll y se ignora si la lista puede seguir subiendo.
3. Los meses se colocan uno junto a otro y la fila se desplaza con el dedo. El dominio da las semanas de cada mes, que empiezan en lunes.
4. Al elegir un día se lee ese día de la base y se calculan sus grupos y su orden. Volver de un formulario conserva el día; volver a la app desde el segundo plano muestra el día actual; a medianoche la pantalla solo cambia de día si se estaba viendo el actual (RF-12).

### Opciones de un hábito

1. El dominio decide qué opciones tiene un hábito según el día que se ve y si está archivado (RF-34). La interfaz las muestra en la misma hoja inferior que el menú.
2. Restar el incremento y escribir la cantidad exacta siguen el flujo de "Marcar un hábito". La cantidad se pide con el diálogo nativo de iOS (`Alert.prompt`), y archivar y eliminar se confirman con una alerta nativa.
3. Editar abre el formulario como modal, el mismo que el de crear. Al guardar, el nombre y el color cambian en el hábito y la configuración entra en vigor hoy: se añade una versión nueva o, si ya había una de hoy, se actualiza. Los recordatorios añadidos y quitados se guardan en la misma transacción.

### Programar los recordatorios

1. Al abrir la app se pide el permiso de notificaciones si aún no se ha pedido (RF-35). iOS solo lo pregunta una vez: después, solo se cambia desde los ajustes del teléfono.
2. El planificador (`src/notifications`) se ejecuta al abrir la app, al volver a primer plano, tras cada cambio en hábitos, registros o recordatorios y, con la app cerrada, en una tarea en segundo plano (`expo-background-task`). Esa tarea se pide a iOS cada 12 horas como mínimo, pero iOS decide si la ejecuta y cuándo; sirve para que la ventana no se agote si la app no se abre en días. El dominio calcula los próximos 60 avisos, y el planificador los compara con las notificaciones ya programadas: solo cancela las que ya no tocan o han cambiado y solo programa las que faltan. Así, refrescar tras cada toque es barato.
3. Cada aviso tiene un identificador estable (`reminder.<recordatorio>.<fecha>`) y guarda en sus datos el día, la hora y una firma con la hora, el texto y la categoría. Al leerla de vuelta, iOS devuelve la fecha programada como un intervalo, así que la comparación se hace con la firma. Las pospuestas se tratan aparte (ver "Acción desde un recordatorio").
4. Las ejecuciones van una detrás de otra, y las peticiones que llegan mientras otra espera se agrupan en una sola. Si una falla, se reintenta en la siguiente.
5. Al guardar un hábito con recordatorios sin permiso, un diálogo lo avisa y ofrece abrir los ajustes (RF-36). El hábito se guarda igualmente: como la app refresca al volver a primer plano, los recordatorios se programan en cuanto el usuario da el permiso.
6. Los recordatorios que llegan con la app abierta también se muestran.

El planificador usa el dominio, la capa de datos y, de la interfaz, solo el reloj y el formato de cantidades. Su lógica depende de la interfaz `Notifier`, y no de `expo-notifications`, para que los tests se ejecuten sin iOS.

### Acción desde un recordatorio

1. iOS muestra la notificación con sus botones: "Hecho" en los booleanos o "+incremento" en los cuantitativos (por ejemplo, "+0,25 L"), y "Posponer 1 h". Los booleanos comparten una categoría y cada cuantitativo tiene la suya, porque el botón muestra su incremento. Las categorías se registran al refrescar los recordatorios.
2. La respuesta se atiende en JavaScript sin abrir la app ([ADR-0012](adr/0012-botones-de-los-recordatorios-en-segundo-plano-con-javascript.md)). Por si iOS arranca la app solo para entregarla, la entrada propia (`index.ts`) empieza a escuchar antes que Expo Router y abre la misma conexión a la base que usan las pantallas.
3. "Hecho" y "+incremento" apuntan en el día del recordatorio, con las mismas reglas que un toque en la lista, salvo que "Hecho" nunca desmarca. Después se refrescan los recordatorios, lo que cancela los que quedan del día si el hábito ya está cumplido (RF-24). Si la app está en pantalla, el día se vuelve a leer sin reordenarse.
4. "Posponer" programa una notificación nueva (`snooze.<hábito>.<fecha>.<hora>`) para una hora después, con el mismo contenido. Si esa hora cae en el día siguiente, no programa nada. Las pospuestas no forman parte de la ventana de 60: usan el margen que deja hasta las 64 de iOS. Al refrescar, se cancelan las de hábitos ya cumplidos, archivados o eliminados, y las de otros días.
5. Tocar el recordatorio fuera de sus botones solo abre la app, que muestra el día actual (RF-26).

### Sincronización

1. **Push:** se suben las filas modificadas en el dispositivo desde la última sincronización.
2. **Pull:** se descargan las filas que el servidor ha modificado desde el último `updated_at` recibido.
3. En caso de conflicto, gana la última escritura. Es aceptable porque cada cuenta tiene un solo usuario.
4. Se lanza al abrir la app, al volver a primer plano, tras cada cambio local y al recuperar la conexión.

## 7. Seguridad y privacidad

- Cada fila de Supabase lleva `user_id`, y las políticas de **Row Level Security** impiden que un usuario lea o modifique datos de otro.
- La app usa solo la clave pública (`anon`) de Supabase. Ninguna clave privada vive en la app ni en el repositorio.
- Los secretos y la configuración por entorno van en variables de entorno de EAS, nunca en git (ver `.gitignore`).
- Eliminar la cuenta (RF-04) borra al usuario y, en cascada, todos sus datos.

## 8. Entornos y publicación

| Entorno | Aplicación | Uso | Backend |
|---------|------------|-----|---------|
| Desarrollo | Hábitos Dev (`com.jotamarcar.habitos.dev`) | Development build en el iPhone, conectado al servidor de desarrollo del PC por wifi | Proyecto Supabase de desarrollo |
| Producción | Hábitos (`com.jotamarcar.habitos`) | Build de producción distribuido por TestFlight (y, más adelante, la App Store) | Proyecto Supabase de producción |

- Cada entorno es una variante de la aplicación con su propio nombre, identificador y scheme, así que las dos conviven en el mismo iPhone sin compartir datos ([ADR-0008](adr/0008-variantes-de-desarrollo-y-produccion.md)).
- La variante la decide `APP_VARIANT`, que fija cada perfil de `eas.json`. Si falta, es desarrollo; un valor desconocido detiene la compilación.
- Lo que cambia entre variantes está en `app.config.ts`; lo común, en `app.json`.

- Los cambios solo de JavaScript pueden llegar a producción con **EAS Update**, sin pasar por una nueva compilación.
- Los cambios nativos (dependencias nuevas, permisos) requieren una compilación con EAS Build y una nueva versión en TestFlight.
- La CI (GitHub Actions) verifica cada Pull Request: formato, lint, tipos y tests (ver [CONTRIBUTING.md](../CONTRIBUTING.md#8-integración-continua)). Compilar y publicar desde la CI queda para más adelante.

## 9. Riesgos conocidos

| Riesgo | Mitigación |
|--------|------------|
| iOS solo mantiene 64 notificaciones locales pendientes por app | Ventana deslizante de recordatorios, que se recalcula en cada apertura y cambio ([ADR-0005](adr/0005-recordatorios-locales-en-ventana-deslizante.md)) |
| Si la app no se abre en varios días, la ventana de recordatorios se agota | Tarea en segundo plano que la rellena; aviso en la app si los permisos están desactivados |
| El plan gratuito de Supabase pausa el proyecto tras 7 días sin peticiones | Con el uso diario de la app no ocurre; si ocurre, se reactiva desde el panel sin perder datos |
| Dependencia de EAS para compilar iOS (no hay Mac) | Asumida en [ADR-0002](adr/0002-expo-como-plataforma.md); alternativa: alquilar un Mac en la nube |
| Hecho en un dispositivo, recordatorio en otro | El recordatorio del otro dispositivo puede sonar si no ha sincronizado. Aceptable con un solo dispositivo por usuario |
