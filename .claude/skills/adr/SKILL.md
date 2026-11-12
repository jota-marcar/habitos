---
name: adr
description: Crea un nuevo registro de decisión de arquitectura (ADR) en docs/adr con el siguiente número, la plantilla del proyecto y el índice actualizado, o marca como aceptado uno existente. Úsala cuando se tome o se vaya a proponer una decisión técnica importante, cuando el usuario pida documentar una decisión o cuando diga que acepta un ADR.
argument-hint: "<título de la decisión>"
---

# Crear un ADR

El título es `$ARGUMENTS`. Si está vacío, pide al usuario la decisión que quiere registrar.

## 1. Comprobar que merece un ADR

Un ADR es para decisiones técnicas **importantes y difíciles de revertir**: plataforma, librerías estructurales, modelo de datos, estrategia de sincronización, seguridad… No para detalles de implementación. Si dudas, pregunta al usuario.

Lee `docs/adr/README.md` y los ADR existentes: si la decisión ya está cubierta o contradice un ADR aceptado, avisa al usuario antes de seguir.

## 2. Calcular número y fichero

Formula el título como una decisión ("Supabase como backend", no "Elegir backend") y ejecuta:

```bash
node .claude/skills/adr/next.mjs "<título>"
```

Usa el número, la ruta y la fecha que devuelve.

## 3. Redactar el ADR

Sigue la plantilla de `docs/adr/README.md` y el estilo de los ADR existentes:

- **Estado:** `Propuesto`. Solo el usuario lo cambia a `Aceptado`.
- **Contexto:** el problema y lo que condiciona la decisión. Cita los requisitos de `docs/especificacion-funcional.md` (RF-xx) y los ADR relacionados cuando aplique.
- **Opciones consideradas:** al menos dos, con ventajas (✅) e inconvenientes (❌) concretos. Incluye las que se descartaron y por qué.
- **Decisión:** qué se elige y el motivo principal.
- **Consecuencias:** lo bueno, lo malo y lo que queda pendiente.

Usa solo información de la conversación, del repositorio o de fuentes que hayas consultado. Si falta algo para justificar la decisión, pregúntalo en lugar de inventarlo.

## 4. Actualizar el resto

- Añade una fila al índice de `docs/adr/README.md`.
- Si sustituye a otro ADR, cambia el estado del antiguo a `Sustituido por ADR-NNNN` (en el fichero y en el índice). No modifiques nada más del antiguo.
- Si la decisión cambia algo descrito en `docs/arquitectura.md`, actualízalo y enlaza el ADR.

## 5. Informar

Resume al usuario la decisión y las opciones descartadas, y pídele que la revise para pasarla a `Aceptado`. El ADR va en el mismo Pull Request que el cambio que introduce la decisión.

## Aceptar un ADR

Solo cuando el usuario lo diga de forma expresa ("acepto el ADR-0008"). Que apruebe el plan o haga el merge del PR no cuenta como aceptación.

```bash
node .claude/skills/adr/accept.mjs <número> [<número>…]
```

Cambia el estado a `Aceptado` en el fichero del ADR y en el índice. Si alguno no está en `Propuesto`, no cambia nada y lo dice. El cambio va en una rama y un Pull Request, como cualquier otro; si el PR que introduce el ADR sigue abierto, añádelo ahí.
