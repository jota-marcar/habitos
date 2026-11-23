/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Loads the web implementation of Reanimated and Worklets, as Reanimated's testing guide
  // describes. Without it, the Reanimated mock of expo-router/testing-library fails to load.
  resolver: "react-native-reanimated/jest/resolver",
  // Only the code of this checkout: by default Jest walks all of <rootDir>, which in the main
  // checkout includes the worktrees of .claude/worktrees. An ignore pattern for that folder
  // would leave no tests when running from a worktree, whose path contains it.
  roots: ["<rootDir>/src", "<rootDir>/supabase"],
  // The tests of supabase/tests need the local Supabase: they only run in the CI, with their
  // own configuration (`npm run test:schema`, jest.supabase.config.js, ADR-0015). Those of
  // the Edge Functions (supabase/functions) do not, and run here. These patterns are regular
  // expressions and Jest inserts <rootDir> unescaped: on Windows, the "\." of a folder like
  // .claude stops matching a separator, so they must not use <rootDir>.
  testPathIgnorePatterns: ["/node_modules/", "/supabase/tests/"],
  // Coverage is only measured, and required in full, for the domain (pure rules where
  // every branch is a business rule), the data layer (where a wrong query loses data), the
  // synchronization (where a wrong step loses data too), the notifications (a reminder that
  // fails does so in silence) and the Edge Functions (where a wrong step deletes an account or
  // leaves it connected to Apple). The adapter of Supabase and the entry points of the
  // functions are tested against a real Supabase in the CI instead (ADR-0018, ADR-0019). See
  // docs/arquitectura.md.
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/data/**/*.ts",
    "src/sync/**/*.ts",
    "src/notifications/**/*.ts",
    "supabase/functions/**/*.ts",
    "!src/**/*.test.ts",
    "!supabase/functions/**/*.test.ts",
    "!supabase/functions/*/index.ts",
    "!src/*/testing/**",
    "!src/sync/remote.ts",
    "!src/sync/supabase-remote.ts",
    // Only types, and only the wiring that runs as the app starts.
    "!src/notifications/notifier.ts",
    "!src/notifications/startup.ts",
  ],
  coverageThreshold: {
    "./src/notifications/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
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
