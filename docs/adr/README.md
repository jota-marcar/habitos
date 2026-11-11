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
| [0008](0008-variantes-de-desarrollo-y-produccion.md) | Variantes de desarrollo y producción | Propuesto |

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
