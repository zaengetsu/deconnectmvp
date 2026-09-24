/** Deux projets : unitaires (rapides, sans base) et intégration (Postgres réel, base jetable). */
const transform = { '^.+\\.(t|j)s$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' } }] };

module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts', '!src/worker.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'text', 'lcov'],
  coverageThreshold: { global: { lines: 90, functions: 90, statements: 90, branches: 75 } },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      globalSetup: '<rootDir>/test/support/global-setup.ts',
      globalTeardown: '<rootDir>/test/support/global-teardown.ts',
      setupFiles: ['<rootDir>/test/support/env.ts'],
      testTimeout: 30000,
    },
  ],
};
