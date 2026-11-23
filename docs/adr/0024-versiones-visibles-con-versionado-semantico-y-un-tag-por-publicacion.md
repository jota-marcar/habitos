# ADR-0024: Versiones visibles con versionado semántico y un tag por publicación

- **Estado:** Propuesto
- **Fecha:** 2026-11-23

## Contexto

El segundo build de producción salió como `0.1.0 (2)`: la misma versión que el primero. Ni el usuario ni los probadores podían ver a simple vista que la aplicación había cambiado, y en git no quedaba marcado qué commit estaba en producción, aunque `CONTRIBUTING.md` decía que las versiones se marcan con tags.

Lo que condiciona la decisión:

- **Una actualización OTA no cambia la versión del binario.** TestFlight sigue mostrando la del último build, así que hace falta otro lugar donde ver la versión que está funcionando ([ADR-0020](0020-actualizaciones-ota-con-eas-update-primero-en-desarrollo-y-despues-en-produccion.md)).
- **Subir `version` en `app.json` no cambia la huella nativa.** Comprobado: con `0.2.0` la huella es la misma que con `0.1.0`, de modo que la actualización sigue llegando a los builds instalados.
- **Los `scripts` de `package.json` sí forman parte de la huella.** Añadir un comando de npm impediría que la próxima OTA llegara al build actual, así que las herramientas nuevas se ejecutan con `node scripts/…`.
- **`main` está protegida.** Un script de publicación no puede hacer commit en ella: la versión tiene que subirse en un Pull Request.

## Opciones consideradas

### Dónde ve el usuario la versión

**A. Solo la versión del binario (TestFlight).**

- ✅ No hay que construir nada.
- ❌ Una OTA sería invisible, que es justo el problema.

**B. `Constants.expoConfig.version`, del manifiesto de la actualización en marcha.**

- ✅ Es la vía habitual de Expo.
- ❌ Depende de cómo cada versión de Expo resuelve el manifiesto, y solo se puede comprobar publicando en el iPhone.

**C. Importar `version` de `app.json` en el código (elegida).**

- ✅ Queda fijada en el paquete de JavaScript al generarlo, así que cada OTA lleva la suya, y un test puede comprobarlo.
- ✅ `app.json` sigue siendo el único sitio donde se decide la versión.
- ❌ El paquete incluye `app.json`, que no contiene secretos.

### Cómo se sube la versión

**D. A mano en cada publicación.**

- ✅ Sin herramientas.
- ❌ Se puede olvidar, que es lo que pasó con el segundo build.

**E. La sube el propio script de publicación.**

- ✅ No se olvida.
- ❌ No puede hacer commit en `main`, y lo publicado dejaría de ser exactamente lo que hay en git.

**F. Un script la calcula en un Pull Request, y publicar exige una versión nueva (elegida).**

- ✅ El olvido es imposible: `build:prod` y `update:prod` se niegan a publicar una versión que ya tiene tag.
- ✅ El cambio de versión se revisa como cualquier otro.
- ❌ Es un paso más antes de publicar.

## Decisión

- **Versionado semántico** `MAYOR.MENOR.PARCHE`, calculado con los commits desde la última publicación:
  - `feat` sube la **menor**.
  - El resto (`fix`, `docs`, `chore`…) sube el **parche**.
  - Un cambio incompatible (`feat!`, `fix!`) sube la **mayor**, salvo antes de la `1.0.0`, donde sube la menor.
- **Cada publicación de producción, build u OTA, tiene una versión nueva** y nunca se repite.
- **Un tag anotado por publicación** (`v0.2.0`), que crean `build:prod` y `update:prod` cuando la publicación termina bien. Si falla, no hay tag y se puede reintentar con la misma versión.
- **`node scripts/bump-version.mjs`** prepara la versión en una rama: actualiza `app.json`, `package.json` y `package-lock.json`.
- **Ajustes muestra la versión** que está funcionando (RF-54).
- **Historial:** el primer build es `v0.1.0` y el segundo, `v0.1.0+2`, porque su binario dice `0.1.0 (2)` y eso ya no se puede cambiar. La siguiente publicación, que trae los objetivos semanales, es la **`0.2.0`**.

## Consecuencias

- ✅ Mirando Ajustes se sabe si una actualización ya ha llegado, y con los tags, qué commit hay en cada versión.
- ✅ No se puede volver a publicar dos veces la misma versión.
- ❌ Tras una OTA, TestFlight sigue mostrando la versión del último build. Las dos solo coinciden después de un build nuevo.
- ❌ Como cada build lleva una versión nueva, conviene contar con la revisión beta de Apple para los probadores externos en cada uno. Las OTA no pasan por ella.
- ❌ El número de build lo sigue llevando EAS y no se muestra en la aplicación.
