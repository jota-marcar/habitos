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
    // Dependency rule from docs/arquitectura.md: the domain is pure rules and
    // depends on nothing. It is an allowlist: it can only import from src/domain,
    // through relative paths or the @/domain alias.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Any package or alias other than @/domain.
              regex: "^(?!\\.{1,2}/|@/domain(/|$))",
              message:
                "The domain is pure rules: it cannot depend on packages or on other layers.",
            },
            {
              // Relative paths that leave src/domain towards another layer.
              regex: "^(\\.\\./)+(app|data|sync|notifications|auth|ui)(/|$)",
              message:
                "The domain does not depend on other layers: it can only import from src/domain.",
            },
          ],
        },
      ],
    },
  },
  {
    // The data layer only knows the domain: it does not depend on the screens or on the
    // layers that use it.
    files: ["src/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(@/|(\.\./)+)(app|sync|notifications|auth|ui)(/|$)",
              message:
                "The data layer can only depend on the domain, not on other layers.",
            },
          ],
        },
      ],
    },
  },
]);
