/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Coverage is only measured, and required in full, for the domain: pure rules where
  // every branch is a business rule (see docs/arquitectura.md).
  collectCoverageFrom: ["src/domain/**/*.ts", "!src/domain/**/*.test.ts"],
  coverageThreshold: {
    "./src/domain/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
