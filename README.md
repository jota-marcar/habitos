# Hábitos

Aplicación móvil para registrar los hábitos de cada día, con los recordatorios como punto fuerte.

Proyecto de aprendizaje: se desarrolla con Claude Code e irá incorporando agentes, skills y servidores MCP solo cuando aporten valor real.

## Estado

La aplicación está en TestFlight, con un grupo de probadores. Qué versión hay publicada y qué viene después está en [docs/estado.md](docs/estado.md).

- **Hábitos diarios** con color, días programados, cantidad o sí/no, y un calendario para recorrer los días.
- **Objetivos semanales**, recurrentes o de una sola semana, en su propia página.
- **Recordatorios** locales con botones, avisos de lo que queda pendiente y avisos de progreso de la semana.
- **Sin conexión:** los datos viven en el dispositivo y se sincronizan con la cuenta de Apple o Google al recuperarla.

## Desarrollo

Requisitos: Node.js 24 (ver `.nvmrc`) y npm.

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

- [Estado del proyecto](docs/estado.md): qué hay publicado, qué viene ahora y qué falta por decidir.
- [Especificación funcional](docs/especificacion-funcional.md): qué hace la aplicación.
- [Arquitectura](docs/arquitectura.md): cómo se construye.
- [Decisiones de arquitectura (ADR)](docs/adr/): por qué se construye así.
- [Supabase](docs/supabase.md): puesta en marcha de los proyectos de la nube y cómo aplicarles las migraciones.
- [Despliegue](docs/despliegue.md): qué comando usar para llevar un cambio al iPhone y a los probadores.
- [Build de producción y TestFlight](docs/testflight.md): cómo se compila la variante de producción y se publica en TestFlight.
- [Incidencias del testeo](docs/incidencias-del-testeo.md): lo encontrado al probar la aplicación y su estado.
- [Ideas por debatir](docs/ideas.md): propuestas sobre la aplicación aún sin decidir, y cómo diferenciarse de la competencia.
- [Ecosistema de IA](docs/ecosistema-ia.md): cómo está configurado Claude Code para trabajar en el proyecto.

## Cómo se trabaja

- `main` contiene el código en producción; los cambios entran solo mediante Pull Request.
- Ramas `<tipo>/<descripcion>` y commits con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat: …`, `fix: …`).
- El código se escribe en inglés y la documentación en español ([ADR-0007](docs/adr/0007-codigo-en-ingles-y-documentacion-en-espanol.md)).

La metodología completa está en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Copyright © 2026 jota_marcar.

El código es público para que cualquiera pueda leerlo y aprender de él, pero no es software libre. Se publica bajo la [PolyForm Strict License 1.0.0](LICENSE.md): permite usarlo con fines no comerciales, y no permite el uso comercial, modificarlo ni redistribuirlo.
