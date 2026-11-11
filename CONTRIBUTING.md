# Guía de contribución

Metodología de trabajo con git para este proyecto. Aunque es una aplicación de uso personal, se sigue un flujo profesional: cada cambio pasa por una rama y un Pull Request antes de llegar a producción.

## 1. Modelo de ramas

Usamos **GitHub Flow**: una única rama permanente (`main`) y ramas cortas para cada cambio.

| Rama | Propósito | Vida |
|------|-----------|------|
| `main` | Código en producción. Siempre estable y desplegable. | Permanente |
| `<tipo>/<descripcion>` | Un cambio concreto (funcionalidad, corrección, refactor…). | Horas o pocos días |

### Reglas

- **Nunca se hace commit directamente en `main`.** Todo entra mediante Pull Request.
- Cada rama sale de `main` actualizada y vuelve a `main`.
- Una rama = un objetivo. Si aparece otro cambio no relacionado, va en otra rama.
- Las ramas se borran después del merge.

### ¿Por qué no Git Flow (`develop`, `release/*`, `hotfix/*`)?

Git Flow está pensado para equipos con versiones planificadas y varias versiones en mantenimiento a la vez. En un proyecto con un único desarrollador y despliegue continuo añade ceremonia sin aportar nada. Con GitHub Flow, `main` cumple el papel de "producción" y las versiones se marcan con tags (ver sección 5).

## 2. Nomenclatura de ramas

```
<tipo>/<descripcion-corta>
```

- `tipo`: uno de los tipos de commit de la sección 3.
- `descripcion-corta`: en minúsculas, palabras separadas por guiones, sin tildes ni ñ.

Ejemplos:

```
feat/crear-habito
fix/racha-no-se-reinicia
refactor/servicio-habitos
docs/especificacion-funcional
chore/configurar-eslint
```

## 3. Mensajes de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en su forma simple:

```
<tipo>: <descripción>

[cuerpo opcional: el porqué del cambio]
```

### Tipos

| Tipo | Cuándo usarlo |
|------|---------------|
| `feat` | Nueva funcionalidad visible para el usuario. |
| `fix` | Corrección de un error. |
| `refactor` | Cambio de código que no añade funcionalidad ni corrige errores. |
| `docs` | Solo documentación. |
| `test` | Añadir o corregir tests. |
| `style` | Formato, espacios, punto y coma… (sin cambios de lógica). |
| `chore` | Mantenimiento: dependencias, configuración, scripts. |
| `ci` | Pipelines y automatizaciones de CI/CD. |

Si dudas entre dos tipos, elige el que mejor describa el **efecto** del cambio para quien use la aplicación.

### Reglas del mensaje

- Descripción en **español**, en **imperativo** y en minúscula: "añade", "corrige", "elimina" (no "añadido" ni "añadiendo").
- Sin punto final y con un máximo de unos 72 caracteres.
- El cuerpo es opcional: úsalo para explicar el **porqué**, no el qué (el qué ya lo cuenta el diff).
- Un cambio que rompe compatibilidad (por ejemplo, de datos guardados) lleva `!` tras el tipo: `feat!: cambia el formato de exportación`.

Ejemplos:

```
feat: permite marcar un hábito como completado
fix: reinicia la racha al saltarse un día
refactor: extrae el cálculo de rachas a un servicio
docs: añade la especificación funcional
chore: actualiza dependencias
```

## 4. Flujo de trabajo paso a paso

```bash
# 1. Partir de main actualizada
git switch main
git pull

# 2. Crear la rama
git switch -c feat/crear-habito

# 3. Trabajar con commits pequeños y descriptivos
git add .
git commit -m "feat: añade formulario de creación de hábitos"

# 4. Subir la rama
git push -u origin feat/crear-habito

# 5. Abrir el Pull Request hacia main
gh pr create --fill

# 6. Revisar el PR, esperar a que pase la CI y hacer merge (squash)
gh pr merge --squash --delete-branch

# 7. Volver a main
git switch main
git pull
```

### Pull Requests

- El **título del PR** sigue el mismo formato que un commit (`feat: …`, `fix: …`), porque se convierte en el commit final en `main`.
- La descripción usa la plantilla de `.github/pull_request_template.md`.
- Aunque no haya otra persona revisando, el PR se revisa antes del merge: leer el diff completo, comprobar los tests y verificar el cambio en local.

### Estrategia de merge: squash

Todos los PR se integran con **squash merge**: los commits de la rama se combinan en un único commit en `main`. Así:

- En la rama puedes hacer commits intermedios sin preocuparte demasiado.
- `main` tiene un historial limpio: un commit por cambio, con un mensaje convencional.

## 5. Versiones y releases

Las versiones se marcan con tags de [versionado semántico](https://semver.org/lang/es/) sobre `main`: `vMAYOR.MENOR.PARCHE`.

| Parte | Se incrementa cuando… | Relación con los commits |
|-------|-----------------------|--------------------------|
| MAYOR | Hay cambios incompatibles. | `feat!`, `fix!` |
| MENOR | Hay funcionalidad nueva compatible. | `feat` |
| PARCHE | Solo hay correcciones. | `fix` |

Mientras la aplicación no tenga una primera versión estable, usamos `0.x.y`.

```bash
git switch main
git pull
git tag -a v0.1.0 -m "v0.1.0: primera versión del MVP"
git push origin v0.1.0
gh release create v0.1.0 --generate-notes
```

## 6. Protección de `main` en GitHub

Para que la regla "nunca commit directo en `main`" no dependa solo de la disciplina, se configura en GitHub (Settings → Branches/Rules):

- Exigir Pull Request para hacer merge en `main`.
- Exigir que pase el check **Verify** de la CI (ver sección 8).
- Bloquear force push y borrado de `main`.
- Permitir solo squash merge y borrar ramas automáticamente tras el merge (Settings → General).

## 7. Dependencias y seguridad

### Añadir dependencias

- Usa `npx expo install <paquete>`, que elige la versión compatible con el SDK de Expo. Nunca `npm install <paquete>`.
- Tras añadir o actualizar dependencias, ejecuta `npm run audit-deps`.

### Scripts de instalación

npm solo ejecuta los scripts de instalación (`install`, `postinstall`…) de los paquetes que se aprueban en `allowScripts` de `package.json`. Si npm avisa de un paquete con scripts pendientes:

1. Lee el script en `node_modules/<paquete>/` y averigua para qué sirve.
2. Apruébalo (`npm install-scripts approve <paquete>`) solo si hace falta para que el paquete funcione, o deniégalo (`npm install-scripts deny <paquete>`) si no.
3. Explica la decisión en el Pull Request.

Paquetes denegados:

| Paquete | Script | Por qué no hace falta |
|---------|--------|-----------------------|
| `@parcel/watcher` | Compila desde el código fuente | Solo actúa si se pide compilar desde el código fuente; el binario precompilado llega como dependencia opcional |
| `unrs-resolver` | Descarga el binario nativo | Solo actúa si falta el binario, que ya llega como dependencia opcional |

### Avisos de seguridad

`npm audit` no permite ignorar avisos concretos, así que se usa `npm run audit-deps` ([scripts/audit-deps.mjs](scripts/audit-deps.mjs)). El script compara los avisos con los aceptados en [scripts/accepted-advisories.json](scripts/accepted-advisories.json) y falla si:

- aparece un aviso que no está aceptado,
- un aviso aceptado ya no aparece (hay que quitarlo de la lista), o
- se ha pasado la fecha de revisión de un aviso aceptado.

Ante un aviso nuevo, por este orden:

1. Actualizar la dependencia a una versión corregida, con `npx expo install --fix` si es del SDK.
2. Si no hay versión corregida compatible, comprobar si el código vulnerable llega a la app o solo a las herramientas de desarrollo, y si se puede explotar.
3. Solo si no se puede explotar, aceptarlo en `accepted-advisories.json` con el motivo (`reason`, en inglés) y una fecha de revisión de, como mucho, tres meses. La aceptación se decide en el Pull Request.

No se usa `npm audit fix --force`: cambia versiones mayores sin respetar el SDK de Expo.

## 8. Integración continua

GitHub Actions comprueba cada cambio. Los flujos están en `.github/workflows/`.

| Flujo | Cuándo | Qué ejecuta | ¿Bloquea el merge? |
|-------|--------|-------------|--------------------|
| **CI → Verify** | En cada Pull Request hacia `main` y en cada commit de `main` | `npm run verify`: formato, lint, tipos y tests, con cobertura del 100 % en el dominio y en la capa de datos | Sí |
| **CI → Audit** | Igual | `npm run audit-deps`: avisos de seguridad | No, solo informa |
| **Weekly review** | Cada lunes a las 07:00 UTC, o a mano desde la pestaña Actions | `npm run audit-deps` y `npx expo-doctor` | No aplica; si falla, GitHub avisa por correo |

- **Audit no bloquea** porque un aviso de seguridad nuevo puede publicarse cualquier día y no debe frenar un PR que no tiene que ver. Si sale en rojo, se resuelve en un PR propio siguiendo la sección 7.
- **`expo-doctor` solo va en la revisión semanal** porque falla cada vez que Expo publica un parche. Se corrige con `npx expo install --fix` en un PR.
- **Las acciones de terceros se fijan a un commit exacto**, con la versión en un comentario, y los flujos solo tienen permiso de lectura. Para actualizar una acción se cambia el commit en un PR.
- La versión de Node de la CI es la de `.nvmrc`.

## 9. Idioma

El código se escribe en inglés y la documentación en español ([ADR-0007](docs/adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)). La regla: lo que está dentro de un fichero de código o de configuración va en inglés; la prosa para personas va en español.

| En inglés | En español |
|-----------|------------|
| Nombres de variables, funciones, tipos y ficheros de código | Documentación (`docs/`, README, este fichero, `CLAUDE.md`) y ADR |
| Tablas y columnas de las bases de datos | Mensajes de commit, títulos y descripciones de Pull Request |
| Comentarios del código | Nombres de rama |
| Nombres de los tests y códigos de error | Textos que ve el usuario en la aplicación |
| Scripts, hooks y flujos de CI: nombres, comentarios y mensajes | Instrucciones de las skills de Claude Code |

- **Textos de la aplicación:** van en español aunque estén dentro del código, y separados de la lógica.
- **Términos del dominio:** se traducen con la columna "En el código" del [glosario](docs/especificacion-funcional.md#2-glosario). Si falta un término, se añade al glosario en el mismo Pull Request, antes de usarlo.
