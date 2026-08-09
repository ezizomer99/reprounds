// Runs before every suite.
//
// Pure-logic tests under src/lib never needed this, but any test that renders a
// component pulls in ThemeContext, which imports AsyncStorage — and the native
// module is null under Jest. The package ships its own mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
