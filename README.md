# Hábitos

Aplicación móvil para registrar los hábitos de cada día, con los recordatorios como punto fuerte.

Proyecto de aprendizaje: se desarrolla con Claude Code e irá incorporando agentes, skills y servidores MCP solo cuando aporten valor real.

## Estado

Para usar la aplicación hay que iniciar sesión con Apple o Google. Los datos se guardan en el dispositivo y se sincronizan con la cuenta: la aplicación funciona sin conexión y sube los cambios cuando vuelve a tenerla.

- Ya se puede crear, editar, archivar y eliminar hábitos (con su color), ver los de cada día ordenados por lo vencido y el próximo recordatorio, marcarlos o registrar la cantidad, y recorrer los días con el calendario.
- Los recordatorios son notificaciones locales con el progreso del hábito, y tocarlas abre la aplicación. Además, a las 17:00 y a las 22:00 un aviso nombra los hábitos del día que siguen pendientes.
- Probado en el iPhone: los botones de los recordatorios y los avisos de pendientes funcionan.
- Ya se puede iniciar y cerrar sesión. En el iPhone, el inicio de sesión con Google funciona y el de Apple falla; se corregirá tras el testeo general.
- Los datos se sincronizan con la cuenta al abrir la aplicación, al volver a ella, poco después de cada cambio y, sin conexión, en reintentos cada vez más espaciados. Al iniciar sesión por primera vez, los hábitos del dispositivo se juntan con los de la cuenta. Falta probarlo en el iPhone.
- Falta eliminar la cuenta.

Para cerrar el MVP, el orden es: eliminar la cuenta, un único development build, un testeo general en el iPhone y la publicación en producción. Lo que falle en el testeo se apunta y se corrige al final, uno por uno, sin interrumpir las pruebas.

La aplicación tiene dos variantes, desarrollo y producción, que se compilan con EAS. La CI comprueba el formato, el lint, los tipos y los tests en cada Pull Request, y la sincronización de punta a punta contra un Supabase local.

## Desarrollo

Requisitos: Node.js 24.15 o posterior (ver `.nvmrc`) y npm.

```bash
npm install
eas env:pull --environment development
npm start
npm run verify
```

`eas env:pull` escribe en `.env.local` (que git ignora) la configuración de Supabase y de Google del entorno de desarrollo. Sin ella, la app arranca en una pantalla de error que nombra las variables que faltan. Ver [docs/supabase.md](docs/supabase.md#8-inicio-de-sesión-con-apple-y-google).

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
