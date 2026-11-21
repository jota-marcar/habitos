# Despliegue

Qué comando usar para llevar un cambio al iPhone y a los probadores. El detalle de cada paso está en [testflight.md](testflight.md) y los motivos, en los ADR [0008](adr/0008-variantes-de-desarrollo-y-produccion.md) y [0020](adr/0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md).

## Las dos partes de la aplicación

| Parte | Qué es | Cómo cambia |
|-------|--------|-------------|
| **Binario nativo** | El programa de iOS compilado: nombre, icono, permisos y módulos que hablan con el sistema (notificaciones, SQLite, inicio de sesión, vibración, actualizaciones) | Solo con un **build** |
| **JavaScript** | El código de `src/`: pantallas, reglas y sincronización | Con **Metro** en desarrollo o con una **actualización OTA** |

El JavaScript solo puede usar lo que el binario trae. Por eso, un cambio nativo siempre necesita un build.

## Qué comando usar

| Quiero… | Comando | Gasta un build | Quién lo recibe |
|---------|---------|----------------|-----------------|
| Ver en Hábitos Dev la rama en la que estoy | `npm start` | No | Mi iPhone, por wifi |
| Instalar en Hábitos Dev un cambio nativo | `npm run build:dev` | **Sí** | Mi iPhone, desde un enlace |
| Probar el paquete exacto que recibirán los probadores | `npm run update:dev` | No | Hábitos Dev, al abrirlo desde el lanzador |
| Entregar un cambio solo de JavaScript | `npm run update:prod` | No | **Todos** los que tengan un build compatible, sin hacer nada |
| Entregar un cambio nativo | `npm run build:prod` | **Sí** | Team (Expo) al procesarse; **Amigos**, cuando lo añado a su grupo y Apple lo aprueba |

Un cambio es **nativo** si añade o actualiza una dependencia con código nativo, o si toca `app.json` o `app.config.ts`. Todo lo demás es solo JavaScript.

## Los dos caminos

### Cambio solo de JavaScript

1. Probarlo con `npm start` en Hábitos Dev.
2. Con el código en una rama o en `main`, publicar con `npm run update:dev` y probarlo en Hábitos Dev desde el lanzador ([testflight.md, 6.1](testflight.md#61-probarla-en-hábitos-dev)).
3. Fusionar el PR y poner `main` al día (`/sync`).
4. Si necesita una migración, aplicarla antes a producción ([supabase.md](supabase.md#5-aplicar-el-esquema)).
5. `npm run update:prod`. Los probadores la descargan al abrir la aplicación y la usan la siguiente vez que la abren.

### Cambio nativo

1. Fusionar el PR y poner `main` al día (`/sync`).
2. `npm run build:dev`, instalarlo y probarlo con `npm start`.
3. Si necesita una migración, aplicarla antes a producción.
4. `npm run build:prod`. Se compila y se envía solo a TestFlight.
5. Cuando App Store Connect lo procese, añadirlo al grupo **Amigos** y esperar la revisión beta si la pide ([testflight.md, 3.1](testflight.md#31-probadores-externos)).

## Antes de lanzar nada

- **`main` al día.** `build:prod` y `update:prod` lo comprueban y se niegan a seguir. `build:dev` y `update:dev` no: usan la rama en la que estés, tal como esté en tu PC. Un `build:dev` desde una rama atrasada gasta un build en un binario sin los últimos cambios nativos.
- **Sin cambios pendientes.** Los cuatro comandos se detienen si hay cambios sin commit.
- **Comprobar sin lanzar.** Con `-- --check` solo se hacen las comprobaciones, por ejemplo `npm run build:dev -- --check`.

## Límites

- **Los builds son limitados:** 15 de iOS en el plan gratuito de EAS. Conviene agrupar los cambios nativos.
- **Un build de TestFlight caduca a los 90 días.** Antes hay que subir otro, aunque no haya cambios nativos.
- **Una actualización solo llega a los builds con su mismo código nativo.** Si no coincide, no llega y tampoco rompe nada. El build `0.1.0 (1)`, anterior a `expo-updates`, nunca recibe actualizaciones.

## Si algo sale mal

Si una actualización falla al arrancar, `expo-updates` vuelve sola a la anterior. Para deshacerla en los demás casos:

```powershell
eas update:rollback
```

Más opciones en [testflight.md, 6.3](testflight.md#63-si-falla).
