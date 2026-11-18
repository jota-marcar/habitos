// Jest for the tests of supabase/, which only run in the CI against a local Supabase
// (`npm run test:schema`, ADR-0015). They run on plain Node, without the preset of Expo: its
// runtime replaces fetch with a stub, and these tests need the real one to reach Supabase.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/supabase/tests"],
  transform: {
    "\.ts$": ["babel-jest", { presets: ["babel-preset-expo"] }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
