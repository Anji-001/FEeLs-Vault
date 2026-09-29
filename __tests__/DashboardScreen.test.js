import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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
    Swipeable: ({ children, renderRightActions }) =>
      React.createElement(
        View,
        null,
        children,
        renderRightActions ? renderRightActions() : null
      ),
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
            <div class="activity-dates">Due: Friday, 25 October 2026, 11:59 PM</div>
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

  test('displays Undo button on delete and auto-hides after 4000ms', async () => {
    jest.useFakeTimers();
    const mockOnLogout = jest.fn();
    const mockNavigation = { navigate: jest.fn() };

    const initialTasks = [
      {
        id: 'task-to-delete',
        subject: 'CO322',
        description: 'Task To Delete',
        deadline: '10/15/2026 11:59 PM',
        remaining: '24 days 5 hours',
        isLocked: false,
        lockReason: '',
        source: 'custom',
      },
    ];

    await AsyncStorage.setItem('@custom_deadlines', JSON.stringify(initialTasks));

    const { findByText, queryByText, getByText } = render(
      <DashboardScreen onLogout={mockOnLogout} navigation={mockNavigation} />
    );

    const taskText = await findByText('Task To Delete');
    expect(taskText).toBeTruthy();

    // Click the delete button rendered in swipe action
    const deleteBtn = getByText('Delete');
    fireEvent.press(deleteBtn);

    // Undo banner should be visible immediately
    expect(getByText('UNDO')).toBeTruthy();
    expect(getByText('Task deleted')).toBeTruthy();

    // Fast-forward 3999ms - should still be visible
    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(queryByText('UNDO')).toBeTruthy();

    // Advance 1ms more to hit 4000ms
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(queryByText('UNDO')).toBeNull();

    jest.useRealTimers();
  });

  test('deleting a Perusall deadline persists deletion to @hidden_perusall_tasks and prevents reappearance', async () => {
    const mockOnLogout = jest.fn();
    const mockNavigation = { navigate: jest.fn() };

    // Setup a mock course feed with a Perusall deadline
    const initialSavedCourses = [
      {
        id: 'c-perusall-1',
        name: 'CO544',
        calendarUrl: 'https://app.perusall.com/api/v1/calendar/feed.ics',
      },
    ];
    await AsyncStorage.setItem('SAVED_COURSES', JSON.stringify(initialSavedCourses));

    const mockIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Perusall//Calendar//EN
BEGIN:VEVENT
UID:perusall-uid-assignment-123
SUMMARY:Perusall Chapter 1 Reading
DESCRIPTION:Please read Chapter 1
DTEND:20261015T182900Z
END:VEVENT
END:VCALENDAR`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockIcs),
    });

    const { findByText, getByText, queryByText } = render(
      <DashboardScreen onLogout={mockOnLogout} navigation={mockNavigation} />
    );

    // Verify the Perusall deadline is initially fetched and rendered
    const taskText = await findByText('Perusall Chapter 1 Reading');
    expect(taskText).toBeTruthy();

    // Delete the Perusall deadline
    const deleteBtn = getByText('Delete');
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    // Verify it is removed from UI
    expect(queryByText('Perusall Chapter 1 Reading')).toBeNull();

    // Verify it was blacklisted in @hidden_perusall_tasks in AsyncStorage
    await waitFor(async () => {
      const hiddenTasksStr = await AsyncStorage.getItem('@hidden_perusall_tasks');
      expect(hiddenTasksStr).toBeTruthy();
      const hiddenTasks = JSON.parse(hiddenTasksStr);
      expect(hiddenTasks).toContain('perusall-uid-assignment-123');
      expect(hiddenTasks).toContain('CO544-Perusall Chapter 1 Reading');
    });
  });

  test('saving settings preserves Perusall course module deadlines', async () => {
    const mockOnLogout = jest.fn();
    const mockNavigation = { navigate: jest.fn() };

    const initialSavedCourses = [
      {
        id: 'c-perusall-2',
        name: 'CO544',
        calendarUrl: 'https://app.perusall.com/api/v1/calendar/feed.ics',
      },
    ];
    await AsyncStorage.setItem('SAVED_COURSES', JSON.stringify(initialSavedCourses));

    const mockIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Perusall//Calendar//EN
BEGIN:VEVENT
UID:perusall-uid-preserved
SUMMARY:Preserved Chapter 2 Reading
DESCRIPTION:Please read Chapter 2
DTEND:20261020T182900Z
END:VEVENT
END:VCALENDAR`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockIcs),
    });

    const { findByText, getByText, getByTestId } = render(
      <DashboardScreen onLogout={mockOnLogout} navigation={mockNavigation} />
    );

    // Initial render
    const taskText = await findByText('Preserved Chapter 2 Reading');
    expect(taskText).toBeTruthy();

    // Open settings modal
    const settingsBtn = getByTestId('settings-button');
    await act(async () => {
      fireEvent.press(settingsBtn);
    });

    // Click settings Save button
    const saveSettingsBtn = getByText('Save');
    await act(async () => {
      fireEvent.press(saveSettingsBtn);
    });

    // Verify task is still present after saving settings
    const taskAfterSave = await findByText('Preserved Chapter 2 Reading');
    expect(taskAfterSave).toBeTruthy();
  });
});


