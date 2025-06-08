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
    '^@com\\.silencelaboratories\/two-party-ecdsa-js$': '<rootDir>/tests/__mocks__/@com.silencelaboratories/two-party-ecdsa-js.ts',
    '^sigpair-admin-v2$': '<rootDir>/tests/__mocks__/sigpair-admin-v2.ts'
    '^@com\\.silencelaboratories\\/two-party-ecdsa-js$': '<rootDir>/tests/stubs/silence.ts',
    '^sigpair-admin-v2$': '<rootDir>/tests/stubs/sigpairAdmin.ts',
    '^@orb-labs\\/orby-ethers6$': '<rootDir>/tests/stubs/orby-ethers6.ts',
    '^@orb-labs\\/orby-core$': '<rootDir>/tests/stubs/orby-core.ts'

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
      diagnostics: false,
      isolatedModules: true
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(thirdweb)/)'
  ],
  testTimeout: 30000
};
