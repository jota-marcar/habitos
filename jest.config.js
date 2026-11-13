/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Loads the web implementation of Reanimated and Worklets, as Reanimated's testing guide
  // describes. Without it, the Reanimated mock of expo-router/testing-library fails to load.
  resolver: "react-native-reanimated/jest/resolver",
  // Coverage is only measured, and required in full, for the domain (pure rules where
  // every branch is a business rule) and for the data layer (where a wrong query loses
  // data). See docs/arquitectura.md.
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/data/**/*.ts",
    "!src/**/*.test.ts",
    "!src/data/testing/**",
  ],
  coverageThreshold: {
    "./src/data/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    "./src/domain/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
