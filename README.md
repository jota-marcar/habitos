# Hábitos

Aplicación móvil para registrar los hábitos de cada día, con los recordatorios como punto fuerte.

Proyecto de aprendizaje: se desarrolla con Claude Code e irá incorporando agentes, skills y servidores MCP solo cuando aporten valor real.

## Estado

La aplicación funciona en local, sin cuenta: los datos se guardan solo en el dispositivo.

- Ya se puede crear, editar, archivar y eliminar hábitos (con su color), ver los de cada día ordenados por lo vencido y el próximo recordatorio, marcarlos o registrar la cantidad, y recorrer los días con el calendario.
- Los recordatorios son notificaciones locales con el progreso del hábito, y tocarlas abre la aplicación. Además, a las 17:00 y a las 22:00 un aviso nombra los hábitos del día que siguen pendientes.
- Queda por probar en el iPhone que los botones de los recordatorios funcionan con la app en segundo plano y cerrada, y que los avisos de pendientes llegan bien. Se probará en un testeo general al terminar el MVP.
- Falta la cuenta (inicio de sesión obligatorio con Apple o Google) y la sincronización entre dispositivos.

La aplicación tiene dos variantes, desarrollo y producción, que se compilan con EAS. La CI comprueba el formato, el lint, los tipos y los tests en cada Pull Request.

## Desarrollo

Requisitos: Node.js 24.15 o posterior (ver `.nvmrc`) y npm.

```bash
npm install
npm start
npm run verify
```

Para probar en un iPhone hace falta un development build (`npm run build:dev`); `npm start` se conecta a él.

Los comandos completos están en [CLAUDE.md](CLAUDE.md#desarrollo).

## Documentación

- [Especificación funcional](docs/especificacion-funcional.md): qué hace la aplicación.
- [Arquitectura](docs/arquitectura.md): cómo se construye.
- [Decisiones de arquitectura (ADR)](docs/adr/): por qué se construye así.
- [Supabase](docs/supabase.md): puesta en marcha de los proyectos de la nube y cómo aplicarles las migraciones.
- [Ecosistema de IA](docs/ecosistema-ia.md): cómo está configurado Claude Code para trabajar en el proyecto.

## Cómo se trabaja

- `main` contiene el código en producción; los cambios entran solo mediante Pull Request.
- Ramas `<tipo>/<descripcion>` y commits con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat: …`, `fix: …`).
- El código se escribe en inglés y la documentación en español ([ADR-0007](docs/adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)).

La metodología completa está en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Copyright © 2026 jota_marcar.

El código es público para que cualquiera pueda leerlo y aprender de él, pero no es software libre. Se publica bajo la [PolyForm Strict License 1.0.0](LICENSE.md): permite usarlo con fines no comerciales, y no permite el uso comercial, modificarlo ni redistribuirlo.
