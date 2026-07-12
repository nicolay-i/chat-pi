module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/test/jestSetup.js'],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/src/test/mocks/lucide-react-native.tsx',
  },
};
