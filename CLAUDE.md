# CLAUDE.md

Instrucciones para Claude Code en este repositorio.

## Proyecto

Aplicación móvil para registrar hábitos diarios, centrada en los recordatorios. Proyecto personal desarrollado con prácticas profesionales. La especificación funcional está en `docs/especificacion-funcional.md`.

## Forma de trabajar

Responde siempre en español.

**Idioma.** El código va en inglés y la documentación en español ([ADR-0007](docs/adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)):

- En inglés: todo lo que está dentro de un fichero de código o de configuración (nombres, comentarios, nombres de tests, códigos de error, tablas y columnas, scripts, hooks y flujos de CI).
- En español: documentación, ADR, mensajes de commit, Pull Requests, nombres de rama y los textos que ve el usuario en la aplicación.
- Los términos del dominio se traducen con la columna "En el código" del glosario de `docs/especificacion-funcional.md`. No improvises una traducción: si falta un término, añádelo antes al glosario.

**Fase de debate (antes de decidir).** Cuando haya que tomar una decisión (funcional, de arquitectura, de herramientas o de enfoque):

- Debate antes de actuar: presenta las opciones con sus ventajas e inconvenientes y da una recomendación argumentada.
- Sé crítico: señala riesgos, supuestos dudosos y alternativas mejores, aunque contradigan lo que propone el usuario.
- Explica qué vas a hacer y en qué pasos, para que el usuario no pierda ningún paso. No empieces a implementar hasta que el usuario dé su visto bueno.

**Fase de desarrollo (decisión tomada).** Automatiza al máximo:

- Implementa, prueba, haz commit, sube la rama y abre el PR sin pedir confirmación en cada paso.
- Para solo cuando haga falta una decisión nueva del usuario, algo contradiga la especificación o un ADR, o una acción sea irreversible o afecte a algo fuera del repositorio.
- El merge de los PR lo hace siempre el usuario.

**Resumen en cada PR.** La descripción del PR y el mensaje final al usuario resumen todo lo hecho: qué cambia y por qué, decisiones tomadas durante la implementación, cómo se ha probado y qué queda pendiente o sin verificar. El usuario no debe perder contexto de ningún cambio.

## Desarrollo

Proyecto Expo (SDK 58) con TypeScript estricto y npm. Comandos:

```bash
npm start                    # servidor de desarrollo (Metro)
npm run verify               # formato, lint, tipos y tests con cobertura: ejecútalo antes de cada commit
npm run lint                 # ESLint (eslint-config-expo)
npm run typecheck            # tsc --noEmit
npm test                     # Jest (jest-expo + React Native Testing Library)
npm run format               # Prettier sobre todo el código
npx expo install <paquete>   # añadir dependencias (elige la versión compatible con el SDK); nunca npm install <paquete>
npx expo-doctor              # diagnosticar dependencias y configuración
npm run audit-deps           # avisos de seguridad frente a los aceptados (necesita red)
```

- Tras añadir o actualizar dependencias, ejecuta `npm run audit-deps` y sigue la sección "Dependencias y seguridad" de `CONTRIBUTING.md`. Nunca aceptes un aviso de seguridad ni apruebes un script de instalación sin plantearlo antes al usuario.

- Expo cambia mucho entre versiones de SDK: antes de usar una API de Expo o React Native, consulta la documentación de la versión instalada (`https://docs.expo.dev/versions/v58.0.0/`) en lugar de fiarte de la memoria.
- Las pantallas viven en `src/app/` (Expo Router: cada fichero es una ruta). Fuera de ahí va todo lo demás, también los tests.
- `src/domain` son reglas puras: no importa paquetes ni otras capas (lo impone ESLint) y su cobertura de tests debe ser del 100 %. Los tests van junto al código (`x.ts` y `x.test.ts`).
- Imports con el alias `@/` → `src/` (por ejemplo, `@/domain/habitos`).
- Las carpetas `ios/` y `android/` se generan; no se crean ni se editan a mano. La configuración nativa va en `app.json`.
- Tras cada edición, un hook formatea el fichero y pasa ESLint (ver `docs/ecosistema-ia.md`). Si te devuelve errores, corrígelos.

## Arquitectura

- La arquitectura está en `docs/arquitectura.md` y las decisiones en `docs/adr/`. Respeta los ADR aceptados; si un cambio contradice uno, avisa al usuario antes de seguir.
- Toda decisión técnica importante nueva lleva su ADR en el mismo Pull Request.
- `docs/especificacion-funcional.md` no menciona tecnologías: lo técnico va en la documentación de arquitectura.

## Git

Sigue la metodología de `CONTRIBUTING.md`. En resumen:

- Nunca hagas commit ni push directamente en `main`. Crea una rama `<tipo>/<descripcion>` desde `main` actualizada.
- Mensajes de commit con Conventional Commits, en español e imperativo: `feat: añade …`, `fix: corrige …`.
- Tipos permitidos: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `chore`, `ci`.
- Los cambios llegan a `main` solo mediante Pull Request con squash merge. El título del PR sigue el mismo formato que los commits.
- Push y PR forman parte del flujo automático de la fase de desarrollo (ver "Forma de trabajar"). Nunca hagas merge: lo hace el usuario.
- Los commits no llevan la línea `Co-Authored-By`.
- El hook `.claude/hooks/protect-main.mjs` bloquea commit y push en `main`. Si te bloquea, crea una rama; no intentes rodearlo.

## Ecosistema de IA

- Las piezas de Claude Code de este repo (permisos, hooks, skills, agentes, MCP) se describen en `docs/ecosistema-ia.md`.
- Al añadir, cambiar o quitar una pieza, actualiza ese documento en el mismo Pull Request.
