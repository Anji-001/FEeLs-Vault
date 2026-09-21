/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(true),
  isVisible: jest.fn().mockResolvedValue(false),
  useHideAnimation: jest.fn().mockReturnValue({ container: {}, logo: { width: 100, height: 100 } }),
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue(null),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
