import {
  formatCookieHeader,
  getPerusallBaseUrl,
  getPerusallCookies,
  formatPerusallDeadline,
  fetchPerusallCourses,
  fetchPerusallAssignmentsForCourse,
  parsePerusallAssignment,
  fetchPerusallAssignments,
  PERUSALL_BASE_URL,
} from '../src/utils/perusallFetcher';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-cookies/cookies', () => ({
  get: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('perusallFetcher', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('getPerusallBaseUrl', () => {
    test('returns PERUSALL_BASE_URL default when not saved in AsyncStorage', async () => {
      const baseUrl = await getPerusallBaseUrl();
      expect(baseUrl).toBe(PERUSALL_BASE_URL);
    });

    test('returns saved dynamic base URL when present in AsyncStorage', async () => {
      await AsyncStorage.setItem('@perusall_base_url', 'https://custom.perusall.com');
      const baseUrl = await getPerusallBaseUrl();
      expect(baseUrl).toBe('https://custom.perusall.com');
    });
  });

  describe('formatCookieHeader', () => {
    test('formats object with value properties properly', () => {
      const cookies = {
        session_id: { value: 'abc123xyz' },
        remember_token: { value: 'tok_456' },
      };
      expect(formatCookieHeader(cookies)).toBe('session_id=abc123xyz; remember_token=tok_456');
    });

    test('formats object with direct string values', () => {
      const cookies = {
        session_id: 'abc123xyz',
        auth: 'tok789',
      };
      expect(formatCookieHeader(cookies)).toBe('session_id=abc123xyz; auth=tok789');
    });

    test('returns plain string as is', () => {
      expect(formatCookieHeader('custom_cookie=value')).toBe('custom_cookie=value');
    });

    test('handles empty or null values', () => {
      expect(formatCookieHeader(null)).toBe('');
      expect(formatCookieHeader({})).toBe('');
    });
  });

  describe('getPerusallCookies', () => {
    test('fetches cookies from CookieManager and returns formatted header', async () => {
      CookieManager.get.mockResolvedValue({
        perusall_session: { value: 'secret_session' },
      });

      const header = await getPerusallCookies('https://app.perusall.com');
      expect(CookieManager.get).toHaveBeenCalledWith('https://app.perusall.com');
      expect(header).toBe('perusall_session=secret_session');
    });

    test('retrieves cached cookies from AsyncStorage if available', async () => {
      await AsyncStorage.setItem('@perusall_cookies', 'cached_session_tok=999');
      const header = await getPerusallCookies();
      expect(header).toBe('cached_session_tok=999');
    });

    test('handles CookieManager errors gracefully', async () => {
      CookieManager.get.mockRejectedValue(new Error('CookieManager failed'));
      const header = await getPerusallCookies();
      expect(header).toBe('');
    });
  });

  describe('formatPerusallDeadline', () => {
    test('formats valid ISO date string correctly', () => {
      const dateStr = '2026-10-15T23:59:00Z';
      const result = formatPerusallDeadline(dateStr);
      expect(result.formattedDeadline).toBeDefined();
      expect(result.targetDate).not.toBeNull();
      expect(typeof result.remaining).toBe('string');
    });

    test('handles null or empty date string gracefully', () => {
      const result = formatPerusallDeadline(null);
      expect(result.formattedDeadline).toBe('Unknown Date');
      expect(result.remaining).toBe('Unknown');
      expect(result.targetDate).toBeNull();
    });
  });

  describe('fetchPerusallCourses', () => {
    test('fetches and normalizes courses list', async () => {
      const mockCourses = [
        { id: 'c1', name: 'CO544 Machine Learning', courseCode: 'CO544' },
        { _id: 'c2', name: 'CO322 Data Structures' },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockCourses),
      });

      const courses = await fetchPerusallCourses('session=123; perusall_csrf=token_xyz%3D%3D');
      expect(courses).toHaveLength(2);
      expect(courses[0]).toEqual({
        id: 'c1',
        name: 'CO544 Machine Learning',
        code: 'CO544',
      });
      expect(courses[1]).toEqual({
        id: 'c2',
        name: 'CO322 Data Structures',
        code: 'CO322',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.perusall.com/api/v1/courses',
        expect.objectContaining({
          headers: expect.objectContaining({
            Origin: 'https://app.perusall.com',
            Referer: 'https://app.perusall.com/',
            Accept: 'application/json, text/plain, */*',
            DNT: '1',
            Cookie: 'session=123; perusall_csrf=token_xyz%3D%3D',
            'x-csrf-token': 'token_xyz==',
          }),
        })
      );
    });

    test('handles unauthorized (401/403) gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const courses = await fetchPerusallCourses('session=invalid');
      expect(courses).toEqual([]);
    });
  });

  describe('fetchPerusallAssignmentsForCourse', () => {
    test('fetches assignment list for a course', async () => {
      const mockAssignments = [
        {
          id: 'asg_1',
          title: 'Chapter 1: Neural Networks Reading',
          deadline: '2026-10-20T23:59:00Z',
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAssignments),
      });

      const assignments = await fetchPerusallAssignmentsForCourse('c1', 'session=123');
      expect(assignments).toHaveLength(1);
      expect(assignments[0].title).toBe('Chapter 1: Neural Networks Reading');
    });
  });

  describe('parsePerusallAssignment', () => {
    test('transforms Perusall assignment to application task schema', () => {
      const raw = {
        id: 'a99',
        title: 'Deep Learning Review',
        deadline: '2026-11-01T18:30:00Z',
        isLocked: false,
      };
      const course = { id: 'c1', code: 'CO544', name: 'CO544 Machine Learning' };

      const task = parsePerusallAssignment(raw, course);
      expect(task).toEqual(
        expect.objectContaining({
          id: 'perusall-a99',
          subject: 'CO544',
          description: 'Deep Learning Review',
          source: 'perusall',
          isLocked: false,
        })
      );
      expect(task.deadline).toBeDefined();
    });
  });

  describe('fetchPerusallAssignments (Full Flow)', () => {
    test('fetches courses and assignments concurrently via Promise.all and flattens results', async () => {
      const mockCourses = [
        { id: 'c1', name: 'CO544 Machine Learning', courseCode: 'CO544' },
        { id: 'c2', name: 'CO322 Data Structures', courseCode: 'CO322' },
      ];

      const mockAsg1 = [
        { id: 'a1', title: 'ML Reading 1', deadline: '2026-10-10T23:59:00Z' },
      ];
      const mockAsg2 = [
        { id: 'a2', title: 'DS Trees Reading', deadline: '2026-10-12T23:59:00Z' },
      ];

      global.fetch = jest.fn((url) => {
        if (url.includes('/api/v1/courses/c1/assignments')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockAsg1),
          });
        }
        if (url.includes('/api/v1/courses/c2/assignments')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockAsg2),
          });
        }
        if (url.includes('/api/v1/courses')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCourses),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const results = await fetchPerusallAssignments({
        cookies: 'session_token=valid123',
      });

      expect(results).toHaveLength(2);
      expect(results[0].subject).toBe('CO544');
      expect(results[0].description).toBe('ML Reading 1');
      expect(results[1].subject).toBe('CO322');
      expect(results[1].description).toBe('DS Trees Reading');
    });

    test('returns empty array if no cookies are available', async () => {
      CookieManager.get.mockResolvedValue({});
      const results = await fetchPerusallAssignments();
      expect(results).toEqual([]);
    });
  });
});
