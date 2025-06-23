module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@silencelaboratories/ecdsa-tss$': '<rootDir>/tests/__mocks__/@silencelaboratories/ecdsa-tss.ts',
    '^@com\\.silencelaboratories/two-party-ecdsa-js$': '<rootDir>/tests/__mocks__/@com.silencelaboratories/two-party-ecdsa-js.ts',
    '^sigpair-admin-v2$': '<rootDir>/tests/__mocks__/sigpair-admin-v2.ts',
    '^@orb-labs/orby-ethers6$': '<rootDir>/tests/__mocks__/@orb-labs/orby-ethers6.ts',
    '^@orb-labs/orby-core$': '<rootDir>/tests/stubs/orby-core.ts'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
    '!src/types/**/*'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: false
    }]
  },
  testTimeout: 30000,
  // Run tests sequentially to avoid database deadlocks
  maxWorkers: 1,
  // Disable parallel runs within test files
  testRunner: 'jest-circus/runner'
};
