# Registros de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión técnica importante: el contexto, las opciones consideradas y por qué se eligió una. Ver [ADR-0001](0001-registrar-decisiones-con-adr.md).

| ADR | Decisión | Estado |
|-----|----------|--------|
| [0001](0001-registrar-decisiones-con-adr.md) | Registrar las decisiones de arquitectura con ADR | Aceptado |
| [0002](0002-expo-como-plataforma.md) | Expo (React Native + TypeScript) como plataforma | Aceptado |
| [0003](0003-supabase-como-backend.md) | Supabase como backend y autenticación | Aceptado |
| [0004](0004-offline-first-con-sincronizacion.md) | Offline-first: SQLite local y sincronización propia | Aceptado |
| [0005](0005-recordatorios-locales-en-ventana-deslizante.md) | Recordatorios locales en ventana deslizante | Aceptado |
| [0006](0006-configuracion-de-habitos-con-vigencia.md) | Configuración de hábitos con fecha de vigencia | Aceptado |
| [0007](0007-codigo-en-ingles-y-documentacion-en-espanol.md) | Código en inglés y documentación en español | Aceptado |
| [0008](0008-variantes-de-desarrollo-y-produccion.md) | Variantes de desarrollo y producción | Aceptado |
| [0009](0009-sql-directo-y-migraciones-propias-en-la-capa-de-datos-local.md) | SQL directo y migraciones propias en la capa de datos local | Aceptado |
| [0010](0010-interfaz-por-gestos-hooks-propios-sobre-expo-sqlite-y-estilos-sin-libreria.md) | Interfaz por gestos, hooks propios sobre expo-sqlite y estilos sin librería | Aceptado |
| [0011](0011-sf-symbols-con-expo-symbols-para-los-iconos.md) | SF Symbols con expo-symbols para los iconos | Aceptado |
| [0012](0012-botones-de-los-recordatorios-en-segundo-plano-con-javascript.md) | Botones de los recordatorios en segundo plano con JavaScript | Aceptado |
| [0013](0013-estetica-oscura-unica-con-acento-violeta.md) | Estética oscura única con acento violeta | Aceptado |
| [0014](0014-colores-de-habito-como-dato-del-usuario-guardados-como-clave-de-paleta.md) | Colores de hábito como dato del usuario, guardados como clave de paleta | Aceptado |
| [0015](0015-pruebas-del-esquema-de-supabase-con-pgtap-en-la-ci.md) | Pruebas del esquema de Supabase con pgTAP en la CI | Propuesto |
| [0016](0016-cursor-de-sincronizacion-serializado-por-usuario.md) | Cursor de sincronización serializado por usuario | Propuesto |
| [0017](0017-inicio-de-sesion-nativo-con-apple-y-google-y-sesion-en-el-llavero.md) | Inicio de sesión nativo con Apple y Google y sesión en el llavero | Propuesto |
| [0018](0018-sincronizacion-con-pull-antes-que-push-y-union-por-clave-natural.md) | Sincronización con pull antes que push y unión por clave natural | Propuesto |
| [0019](0019-eliminacion-de-la-cuenta-con-una-edge-function-que-revoca-sign-in-with-apple-antes-de-borrar-al-usuario.md) | Eliminación de la cuenta con una Edge Function que revoca Sign in with Apple antes de borrar al usuario | Propuesto |

## Plantilla

```markdown
# ADR-NNNN: Título en forma de decisión

- **Estado:** Propuesto | Aceptado | Sustituido por ADR-XXXX
- **Fecha:** AAAA-MM-DD

## Contexto
Qué problema hay que resolver y qué condiciona la decisión.

## Opciones consideradas
Cada opción con sus ventajas e inconvenientes.

## Decisión
Qué se elige y por qué.

## Consecuencias
Qué implica: lo bueno, lo malo y lo que queda pendiente.
```

## Reglas

- Los ADR se numeran de forma correlativa y no se reutilizan números.
- Un ADR aceptado no se edita salvo para corregir erratas. Si la decisión cambia, se escribe un ADR nuevo y el antiguo pasa a "Sustituido por ADR-XXXX".
