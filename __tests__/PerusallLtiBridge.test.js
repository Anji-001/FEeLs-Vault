import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PerusallLtiBridge from '../src/components/PerusallLtiBridge';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-cookies/cookies', () => ({
  get: jest.fn(),
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
      }));
      return React.createElement(View, { testID: 'perusall-lti-webview', ...props });
    }),
  };
});

describe('PerusallLtiBridge', () => {
  const mockLtiUrl = 'https://feels.pdn.ac.lk/mod/lti/view.php?id=12345';

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('renders hidden WebView with injected auto-submit script', () => {
    const mockOnAuthSuccess = jest.fn();
    const { getByTestId } = render(
      <PerusallLtiBridge url={mockLtiUrl} onAuthSuccess={mockOnAuthSuccess} />
    );

    const container = getByTestId('perusall-lti-bridge-container');
    expect(container.props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        width: 0,
        height: 0,
        opacity: 0,
      })
    );

    const webview = getByTestId('perusall-lti-webview');
    expect(webview.props.source).toEqual({ uri: mockLtiUrl });
    expect(webview.props.injectedJavaScript).toContain('form[action*="perusall"], #ltiLaunchForm');
    expect(webview.props.javaScriptEnabled).toBe(true);
    expect(webview.props.thirdPartyCookiesEnabled).toBe(true);
  });

  test('returns null if url prop is not provided', () => {
    const mockOnAuthSuccess = jest.fn();
    const { queryByTestId } = render(
      <PerusallLtiBridge url="" onAuthSuccess={mockOnAuthSuccess} />
    );
    expect(queryByTestId('perusall-lti-bridge-container')).toBeNull();
  });

  test('does not trigger onAuthSuccess while on Moodle domain', async () => {
    const mockOnAuthSuccess = jest.fn();
    const { getByTestId } = render(
      <PerusallLtiBridge url={mockLtiUrl} onAuthSuccess={mockOnAuthSuccess} />
    );

    const webview = getByTestId('perusall-lti-webview');

    // Simulate navigation within Moodle
    webview.props.onNavigationStateChange({
      url: 'https://feels.pdn.ac.lk/mod/lti/launch.php',
      loading: false,
    });

    expect(mockOnAuthSuccess).not.toHaveBeenCalled();
    expect(CookieManager.get).not.toHaveBeenCalled();
  });

  test('extracts cookies via CookieManager, persists @perusall_cookies in AsyncStorage, and triggers onAuthSuccess', async () => {
    const mockOnAuthSuccess = jest.fn();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

    CookieManager.get.mockResolvedValue({
      perusall_session: { value: 'test_token_abc' },
      user_auth: { value: 'user_xyz' },
    });

    const { getByTestId } = render(
      <PerusallLtiBridge url={mockLtiUrl} onAuthSuccess={mockOnAuthSuccess} />
    );

    const webview = getByTestId('perusall-lti-webview');

    // Simulate redirect landing on Perusall domain
    webview.props.onNavigationStateChange({
      url: 'https://app.perusall.com/courses/c123/assignments',
      loading: false,
    });

    await waitFor(() => {
      expect(CookieManager.get).toHaveBeenCalledWith('https://app.perusall.com');
      expect(mockOnAuthSuccess).toHaveBeenCalledTimes(1);
    });

    // Check that cookies and base URL were persisted in AsyncStorage
    const savedBaseUrl = await AsyncStorage.getItem('@perusall_base_url');
    expect(savedBaseUrl).toBe('https://app.perusall.com');

    const savedCookies = await AsyncStorage.getItem('@perusall_cookies');
    expect(savedCookies).toContain('perusall_session=test_token_abc');
    expect(savedCookies).toContain('user_auth=user_xyz');

    consoleLogSpy.mockRestore();
  });
});
