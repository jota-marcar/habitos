# Hábitos

Aplicación móvil para registrar los hábitos de cada día, centrada en los recordatorios.

Proyecto de aprendizaje: se desarrolla con Claude Code e irá incorporando agentes, skills y servidores MCP solo cuando aporten valor real.

## Estado

Fase 1: proyecto Expo creado, con formato, lint, tipos y tests configurados. Todavía no hay funcionalidades ni compilación para el iPhone.

## Desarrollo

Requisitos: Node.js 24 (ver `.nvmrc`) y npm.

```bash
npm install
npm start
npm run verify
```

Los comandos completos están en [CLAUDE.md](CLAUDE.md#desarrollo).

## Documentación

- [Especificación funcional](docs/especificacion-funcional.md): qué hace la aplicación.
- [Arquitectura](docs/arquitectura.md): cómo se construye.
- [Decisiones de arquitectura (ADR)](docs/adr/): por qué se construye así.
- [Ecosistema de IA](docs/ecosistema-ia.md): cómo está configurado Claude Code para trabajar en el proyecto.

## Cómo se trabaja

- `main` contiene el código en producción; los cambios entran solo mediante Pull Request.
- Ramas `<tipo>/<descripcion>` y commits con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat: …`, `fix: …`).

- El código se escribe en inglés y la documentación en español ([ADR-0007](docs/adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)).

La metodología completa está en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Copyright © 2026 jota_marcar.

El código es público para que cualquiera pueda leerlo y aprender de él, pero no es software libre. Se publica bajo la [PolyForm Strict License 1.0.0](LICENSE.md): permite usarlo con fines no comerciales, y no permite el uso comercial, modificarlo ni redistribuirlo.
