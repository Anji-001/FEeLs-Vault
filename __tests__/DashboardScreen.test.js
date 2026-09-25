import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../src/screens/DashboardScreen';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Mock dependencies
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue({
    username: 'e19999',
    password: 'MockPassword123',
  }),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@notifee/react-native', () => ({
  requestPermission: jest.fn().mockResolvedValue({}),
  createChannel: jest.fn().mockResolvedValue('deadline-reminders'),
  createTriggerNotification: jest.fn().mockResolvedValue('notif-id-1'),
  cancelNotification: jest.fn().mockResolvedValue(undefined),
  cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return jest.fn().mockImplementation((props) => React.createElement(View, props));
});

jest.mock('@react-native-cookies/cookies', () => ({
  clearAll: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue({}),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
}));

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(true),
  isVisible: jest.fn().mockResolvedValue(false),
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Swipeable: ({ children }) => React.createElement(View, null, children),
  };
});

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

// Mock react-native-webview with testID
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
      return React.createElement(View, { testID: 'feels-webview', ...props });
    }),
  };
});

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('DashboardScreen WebView Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('receives COURSE_PAGES_FETCHED message from WebView and renders extracted assignments', async () => {
    const mockOnLogout = jest.fn();
    const mockNavigation = { navigate: jest.fn() };

    const mockCourseHtml = `
      <html>
        <body>
          <h1>CO544 Machine Learning</h1>
          <div class="activity-item">
            <span class="instancename">Neural Networks Assignment 1</span>
            <div class="activity-dates">Due: Friday, 25 September 2026, 11:59 PM</div>
          </div>
        </body>
      </html>
    `;

    const { getByTestId, findByText } = render(
      <DashboardScreen onLogout={mockOnLogout} navigation={mockNavigation} />
    );

    // Wait for credentials to load and WebView to render
    const webView = await waitFor(() => getByTestId('feels-webview'));
    expect(webView).toBeTruthy();

    // Trigger onMessage on WebView simulating COURSE_PAGES_FETCHED event
    const eventPayload = {
      type: 'COURSE_PAGES_FETCHED',
      availableSemesters: [
        { id: 'sem-sep-2026', title: 'Semesters commenced in September 2026' }
      ],
      selectedSemester: {
        id: 'sem-sep-2026',
        title: 'Semesters commenced in September 2026'
      },
      coursesCount: 1,
      coursePages: [
        {
          id: '701',
          url: 'https://feels.pdn.ac.lk/course/view.php?id=701',
          html: mockCourseHtml,
        },
      ],
    };

    fireEvent(webView, 'message', {
      nativeEvent: { data: JSON.stringify(eventPayload) },
    });

    // Assert that the parsed assignment description appears on screen
    const assignmentTitle = await findByText('Neural Networks Assignment 1');
    expect(assignmentTitle).toBeTruthy();

    // Assert that the subject code CO544 is also displayed
    const subjectBadge = await findByText('CO544');
    expect(subjectBadge).toBeTruthy();

    // Assert that @cached_tasks was saved to AsyncStorage
    const cachedTasks = await AsyncStorage.getItem('@cached_tasks');
    expect(cachedTasks).toBeTruthy();
    expect(JSON.parse(cachedTasks)[0].description).toBe('Neural Networks Assignment 1');
  });

  test('immediately retrieves and displays @cached_tasks on boot for offline visibility', async () => {
    const mockOnLogout = jest.fn();
    const mockNavigation = { navigate: jest.fn() };

    const preCachedTasks = [
      {
        id: 'CO322-Lab-1',
        subject: 'CO322',
        description: 'Offline Cached Lab 1',
        deadline: '10/15/2026 11:59 PM',
        remaining: '24 days 5 hours',
        isLocked: false,
        lockReason: '',
        source: 'feels',
      },
    ];

    await AsyncStorage.setItem('@cached_tasks', JSON.stringify(preCachedTasks));

    const { findByText } = render(
      <DashboardScreen onLogout={mockOnLogout} navigation={mockNavigation} />
    );

    const offlineTask = await findByText('Offline Cached Lab 1');
    expect(offlineTask).toBeTruthy();
  });
});


