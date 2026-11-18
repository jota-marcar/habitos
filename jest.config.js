/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Loads the web implementation of Reanimated and Worklets, as Reanimated's testing guide
  // describes. Without it, the Reanimated mock of expo-router/testing-library fails to load.
  resolver: "react-native-reanimated/jest/resolver",
  // The tests of supabase/tests need the local Supabase: they only run in the CI, with their
  // own configuration (`npm run test:schema`, jest.supabase.config.js, ADR-0015). Those of
  // the Edge Functions (supabase/functions) do not, and run here.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/supabase/tests/"],
  // Coverage is only measured, and required in full, for the domain (pure rules where
  // every branch is a business rule), the data layer (where a wrong query loses data), the
  // synchronization (where a wrong step loses data too) and the Edge Functions (where a
  // wrong step deletes an account or leaves it connected to Apple). The adapter of Supabase
  // and the entry points of the functions are tested against a real Supabase in the CI
  // instead (ADR-0018, ADR-0019). See docs/arquitectura.md.
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/data/**/*.ts",
    "src/sync/**/*.ts",
    "supabase/functions/**/*.ts",
    "!src/**/*.test.ts",
    "!supabase/functions/**/*.test.ts",
    "!supabase/functions/*/index.ts",
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
    "./supabase/functions/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
