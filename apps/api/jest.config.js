/** @type {import('jest').Config} */
const base = {
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/support/env.ts'],
};

module.exports = {
  // Integration suites share one test database, so run serially.
  maxWorkers: 1,
  testTimeout: 30000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/support/global-setup.ts',
    },
  ],
};
