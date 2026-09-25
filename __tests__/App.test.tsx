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

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: jest.fn(),
        reload: jest.fn(),
        clearCache: jest.fn(),
      }));
      return React.createElement(View, { testID: 'webview-mock', ...props });
    }),
  };
});

jest.mock('@notifee/react-native', () => ({
  requestPermission: jest.fn().mockResolvedValue({}),
  createChannel: jest.fn().mockResolvedValue('channel'),
  createTriggerNotification: jest.fn().mockResolvedValue('notif'),
  cancelNotification: jest.fn().mockResolvedValue(undefined),
  cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('@react-native-cookies/cookies', () => ({
  clearAll: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue({}),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }) => React.createElement(View, props, children),
    },
    View: ({ children, ...props }) => React.createElement(View, props, children),
    FadeInDown: { duration: jest.fn().mockReturnThis() },
    FadeOut: { duration: jest.fn().mockReturnThis() },
    LinearTransition: { duration: jest.fn().mockReturnThis() },
    ZoomIn: { duration: jest.fn().mockReturnThis() },
  };
});

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
