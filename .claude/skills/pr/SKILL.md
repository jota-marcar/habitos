---
name: pr
description: Sube la rama actual y abre un Pull Request hacia main siguiendo CONTRIBUTING.md (título en Conventional Commits, plantilla de PR rellenada). Úsala cuando el usuario pida abrir, crear o preparar un PR o subir la rama para revisión.
argument-hint: "[notas opcionales para la descripción]"
---

# Abrir un Pull Request

Sigue estos pasos en orden. No hagas merge del PR: eso lo decide el usuario.

## 1. Comprobar el estado

Ejecuta:

```bash
node .claude/skills/pr/context.mjs
```

- Si termina con **BLOCKERS**, detente, explica al usuario qué falta y cómo resolverlo. No hagas commits, rebases ni merges por tu cuenta para desbloquearlo.
- Si hay **WARNINGS**, menciónalos. Si la rama va por detrás de `main` o ya existe un PR, pregunta al usuario antes de seguir.

## 2. Escribir el título

Formato Conventional Commits, en español e imperativo, minúscula y sin punto final (ver `CONTRIBUTING.md`):

```
<tipo>: <descripción>
```

- El tipo debe coincidir con el de la rama, salvo que los commits muestren claramente otro efecto principal.
- Si hay un solo commit, su mensaje suele servir tal cual.
- Si hay varios, resume el cambio en conjunto: el título será el mensaje del commit en `main` tras el squash.

## 3. Escribir la descripción

Usa la estructura de `.github/pull_request_template.md`:

- **Qué cambia:** resumen breve del cambio y su motivo, con los ficheros o áreas principales. Si el usuario pasó notas (`$ARGUMENTS`), incorpóralas.
- **Cómo se ha probado:** solo lo que se ha verificado de verdad en esta sesión o en los commits (tests ejecutados, pruebas manuales). Si no se ha probado algo, dilo.
- **Checklist:** marca `[x]` solo lo que sea cierto. Para lo que no aplique, déjalo sin marcar y añade "(no aplica: motivo)".
- Termina con una línea en blanco y `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Escribe la descripción en un fichero temporal (el directorio scratchpad de la sesión si existe), no en el repositorio.

## 4. Subir y abrir el PR

Usa la ruta de GitHub CLI que indicó el informe del paso 1 (en Windows puede ser `"C:/Program Files/GitHub CLI/gh.exe"`):

```bash
git push -u origin <rama>
gh pr create --base main --head <rama> --title "<título>" --body-file <fichero>
```

Si `gh` espera entrada interactiva, añade `< /dev/null` al comando.

## 5. Informar

Devuelve al usuario el enlace del PR, el título usado y cualquier aviso pendiente. Recuérdale que el merge se hace con **Squash and merge**.
