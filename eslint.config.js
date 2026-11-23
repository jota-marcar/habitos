// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

// The layers, from the bottom up (ADR-0025): each one can only depend on those before it.
const LAYERS = [
  "domain",
  "data",
  "shared",
  "sync",
  "notifications",
  "auth",
  "ui",
  "app",
];

function layerRule(layer) {
  const above = LAYERS.slice(LAYERS.indexOf(layer) + 1);
  return {
    files: [`src/${layer}/**`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: `^(@/|(\\.\\./)+)(${above.join("|")})(/|$)`,
              message: `The ${layer} layer cannot depend on the layers above it (${above.join(", ")}).`,
            },
          ],
        },
      ],
    },
  };
}

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
              regex:
                "^(\\.\\./)+(app|data|shared|sync|notifications|auth|ui)(/|$)",
              message:
                "The domain does not depend on other layers: it can only import from src/domain.",
            },
          ],
        },
      ],
    },
  },
  ...["data", "shared", "sync", "notifications", "auth", "ui"].map(layerRule),
]);
