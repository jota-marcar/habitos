/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Loads the web implementation of Reanimated and Worklets, as Reanimated's testing guide
  // describes. Without it, the Reanimated mock of expo-router/testing-library fails to load.
  resolver: "react-native-reanimated/jest/resolver",
  // The tests of supabase/ need the local Supabase database: they only run in the CI, with
  // `npm run test:schema` (ADR-0015).
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/supabase/"],
  // Coverage is only measured, and required in full, for the domain (pure rules where
  // every branch is a business rule), the data layer (where a wrong query loses data) and
  // the synchronization (where a wrong step loses data too). The adapter of Supabase is tested
  // against a real Supabase in the CI instead (ADR-0018). See docs/arquitectura.md.
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/data/**/*.ts",
    "src/sync/**/*.ts",
    "!src/**/*.test.ts",
    "!src/*/testing/**",
    "!src/sync/remote.ts",
    "!src/sync/supabase-remote.ts",
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
    "./src/sync/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
