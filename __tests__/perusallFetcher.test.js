import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STORAGE_SAVED_COURSES,
  STORAGE_PERUSALL_CALENDAR_URL,
  cleanPerusallCalendarUrl,
  savePerusallCalendarUrl,
  getPerusallCalendarUrl,
  getCourses,
  addCourse,
  deleteCourse,
  fetchPerusallDeadlines,
  fetchAllCoursesDeadlines,
} from '../src/utils/perusallFetcher';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('perusallFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  describe('cleanPerusallCalendarUrl', () => {
    it('should replace webcal:// protocol with https://', () => {
      const rawUrl = 'webcal://app.perusall.com/api/v1/calendar/feed.ics';
      const cleaned = cleanPerusallCalendarUrl(rawUrl);
      expect(cleaned).toBe('https://app.perusall.com/api/v1/calendar/feed.ics');
    });

    it('should replace uppercase WEBCAL:// protocol with https://', () => {
      const rawUrl = 'WEBCAL://app.perusall.com/api/v1/calendar/feed.ics';
      const cleaned = cleanPerusallCalendarUrl(rawUrl);
      expect(cleaned).toBe('https://app.perusall.com/api/v1/calendar/feed.ics');
    });

    it('should handle webcal: without double slash', () => {
      const rawUrl = 'webcal:app.perusall.com/api/v1/calendar/feed.ics';
      const cleaned = cleanPerusallCalendarUrl(rawUrl);
      expect(cleaned).toBe('https:app.perusall.com/api/v1/calendar/feed.ics');
    });

    it('should preserve https:// protocol and trim spaces', () => {
      const rawUrl = '  https://app.perusall.com/api/v1/calendar/feed.ics  ';
      const cleaned = cleanPerusallCalendarUrl(rawUrl);
      expect(cleaned).toBe('https://app.perusall.com/api/v1/calendar/feed.ics');
    });

    it('should return empty string for invalid inputs', () => {
      expect(cleanPerusallCalendarUrl('')).toBe('');
      expect(cleanPerusallCalendarUrl(null)).toBe('');
      expect(cleanPerusallCalendarUrl(undefined)).toBe('');
    });
  });

  describe('Multiple Course CRUD Operations (SAVED_COURSES)', () => {
    it('getCourses should return empty array when no courses are saved', async () => {
      const courses = await getCourses();
      expect(courses).toEqual([]);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_SAVED_COURSES);
    });

    it('addCourse should sanitize webcal:// to https:// and persist course', async () => {
      const course = await addCourse({
        name: 'Quantum Physics',
        calendarUrl: 'webcal://app.perusall.com/courses/qp/feed.ics',
      });

      expect(course).toEqual({
        id: expect.any(String),
        name: 'Quantum Physics',
        calendarUrl: 'https://app.perusall.com/courses/qp/feed.ics',
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_SAVED_COURSES,
        JSON.stringify([course])
      );

      const savedCourses = await getCourses();
      expect(savedCourses).toHaveLength(1);
      expect(savedCourses[0].name).toBe('Quantum Physics');
      expect(savedCourses[0].calendarUrl).toBe('https://app.perusall.com/courses/qp/feed.ics');
    });

    it('addCourse should update existing course if matching id is provided', async () => {
      const course1 = await addCourse({
        id: 'course-1',
        name: 'Machine Learning',
        calendarUrl: 'webcal://app.perusall.com/ml/feed.ics',
      });

      expect(course1.id).toBe('course-1');

      // Update name and URL
      const updatedCourse = await addCourse({
        id: 'course-1',
        name: 'Advanced Machine Learning',
        calendarUrl: 'https://app.perusall.com/adv-ml/feed.ics',
      });

      expect(updatedCourse.name).toBe('Advanced Machine Learning');
      expect(updatedCourse.calendarUrl).toBe('https://app.perusall.com/adv-ml/feed.ics');

      const all = await getCourses();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Advanced Machine Learning');
    });

    it('deleteCourse should remove course by id and return remaining courses', async () => {
      await addCourse({
        id: 'c-1',
        name: 'Course 1',
        calendarUrl: 'https://perusall.com/1.ics',
      });
      await addCourse({
        id: 'c-2',
        name: 'Course 2',
        calendarUrl: 'https://perusall.com/2.ics',
      });

      const remaining = await deleteCourse('c-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('c-2');

      const inStorage = await getCourses();
      expect(inStorage).toHaveLength(1);
      expect(inStorage[0].id).toBe('c-2');
    });
  });

  describe('savePerusallCalendarUrl and getPerusallCalendarUrl (legacy)', () => {
    it('should clean and store the URL in AsyncStorage under PERUSALL_CALENDAR_URL', async () => {
      const rawUrl = 'webcal://app.perusall.com/calendar/user/123/feed.ics';
      const saved = await savePerusallCalendarUrl(rawUrl);

      expect(saved).toBe('https://app.perusall.com/calendar/user/123/feed.ics');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_PERUSALL_CALENDAR_URL,
        'https://app.perusall.com/calendar/user/123/feed.ics'
      );

      const retrieved = await getPerusallCalendarUrl();
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_PERUSALL_CALENDAR_URL);
      expect(retrieved).toBe('https://app.perusall.com/calendar/user/123/feed.ics');
    });

    it('should remove item from storage if URL is empty', async () => {
      await savePerusallCalendarUrl('');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_PERUSALL_CALENDAR_URL);
    });
  });

  describe('fetchPerusallDeadlines multi-course handling and parsing', () => {
    const sampleICS1 = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Perusall//EN
X-WR-CALNAME:Physics 101
BEGIN:VEVENT
UID:assign-later
SUMMARY:Chapter 5 Reading
DESCRIPTION:Annotate pages 80-120
DTEND:20261115T235900Z
END:VEVENT
END:VCALENDAR`;

    const sampleICS2 = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Perusall//EN
X-WR-CALNAME:Chemistry 201
BEGIN:VEVENT
UID:assign-earlier
SUMMARY:Lab Prep Chapter 2
DESCRIPTION:Read safety instructions
DTEND:20261105T180000Z
END:VEVENT
END:VCALENDAR`;

    it('should accept a single course object and attach courseId and courseName', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => sampleICS1,
      });

      const deadlines = await fetchPerusallDeadlines({
        id: 'phys-101',
        name: 'Manual Physics Name',
        calendarUrl: 'https://app.perusall.com/phys.ics',
      });

      expect(deadlines).toHaveLength(1);
      expect(deadlines[0]).toEqual({
        id: 'assign-later',
        courseId: 'phys-101',
        courseName: 'Manual Physics Name',
        title: 'Chapter 5 Reading',
        description: 'Annotate pages 80-120',
        deadline: new Date('2026-11-15T23:59:00.000Z'),
      });
    });

    it('should fall back to x-wr-calname if no manual course name is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => sampleICS1,
      });

      const deadlines = await fetchPerusallDeadlines({
        id: 'phys-101',
        calendarUrl: 'https://app.perusall.com/phys.ics',
      });

      expect(deadlines).toHaveLength(1);
      expect(deadlines[0].courseName).toBe('Physics 101');
    });

    it('should accept an array of course objects, aggregate results, and sort chronologically ascending', async () => {
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url.includes('phys')) {
          return { ok: true, text: async () => sampleICS1 };
        }
        return { ok: true, text: async () => sampleICS2 };
      });

      const courses = [
        { id: 'course-1', name: 'Physics', calendarUrl: 'https://app.perusall.com/phys.ics' }, // Due Nov 15
        { id: 'course-2', name: 'Chemistry', calendarUrl: 'https://app.perusall.com/chem.ics' }, // Due Nov 5
      ];

      const deadlines = await fetchPerusallDeadlines(courses);

      expect(deadlines).toHaveLength(2);
      // Earliest (Nov 5) should be first
      expect(deadlines[0].id).toBe('assign-earlier');
      expect(deadlines[0].courseName).toBe('Chemistry');
      expect(deadlines[0].deadline).toEqual(new Date('2026-11-05T18:00:00.000Z'));

      // Later (Nov 15) should be second
      expect(deadlines[1].id).toBe('assign-later');
      expect(deadlines[1].courseName).toBe('Physics');
      expect(deadlines[1].deadline).toEqual(new Date('2026-11-15T23:59:00.000Z'));
    });

    it('fetchAllCoursesDeadlines should fetch deadlines across courses and tag courseName', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => sampleICS1,
      });

      const courses = [
        { id: '1', name: 'CO544 ML', calendarUrl: 'https://perusall.com/feed1.ics' },
      ];

      const allDeadlines = await fetchAllCoursesDeadlines(courses);
      expect(allDeadlines).toHaveLength(1);
      expect(allDeadlines[0].courseName).toBe('CO544 ML');
    });

    it('should safely return empty array on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const deadlines = await fetchPerusallDeadlines('https://app.perusall.com/feed.ics');
      expect(deadlines).toEqual([]);
    });
  });
});
