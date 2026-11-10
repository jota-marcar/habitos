// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ["dist/*", "coverage/*", ".expo/*"],
  },
  {
    // Regla de dependencias de docs/arquitectura.md: el dominio son reglas puras
    // y no depende de nada. Es una lista de permitidos: solo puede importar de
    // src/domain, con rutas relativas o con el alias @/domain.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Cualquier paquete o alias que no sea @/domain.
              regex: "^(?!\\.{1,2}/|@/domain(/|$))",
              message:
                "El dominio son reglas puras: no puede depender de paquetes ni de otras capas.",
            },
            {
              // Rutas relativas que salen de src/domain hacia otra capa.
              regex: "^(\\.\\./)+(app|data|sync|notifications|auth|ui)(/|$)",
              message:
                "El dominio no depende de otras capas: solo puede importar de src/domain.",
            },
          ],
        },
      ],
    },
  },
]);
