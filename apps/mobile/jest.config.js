module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^mobx$': '<rootDir>/src/test/mocks/mobx.ts',
    '^@/lib/observer$': '<rootDir>/src/test/mocks/observer.ts',
    '^lucide-react-native$': '<rootDir>/src/test/mocks/lucide-react-native.tsx',
  },
};
