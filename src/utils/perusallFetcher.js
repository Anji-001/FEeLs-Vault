import ICAL from 'ical.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_SAVED_COURSES = 'SAVED_COURSES';
export const STORAGE_PERUSALL_CALENDAR_URL = 'PERUSALL_CALENDAR_URL';

/**
 * Cleans a calendar URL by trimming whitespace and replacing webcal:// protocol with https://.
 * 
 * @param {string} url - Raw calendar URL.
 * @returns {string} Cleaned URL with https protocol.
 */
export function cleanPerusallCalendarUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let cleaned = url.trim();
  if (cleaned.toLowerCase().startsWith('webcal://')) {
    cleaned = 'https://' + cleaned.slice(9);
  } else if (cleaned.toLowerCase().startsWith('webcal:')) {
    cleaned = 'https:' + cleaned.slice(7);
  }
  return cleaned;
}

/**
 * Retrieves all saved courses from AsyncStorage.
 * 
 * @returns {Promise<Array<{id: string, name: string, calendarUrl: string}>>}
 */
export async function getCourses() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_SAVED_COURSES);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to get courses from storage:', error);
    return [];
  }
}

/**
 * Adds or updates a course in AsyncStorage. Sanitizes the calendarUrl with https://.
 * 
 * @param {{id?: string, name: string, calendarUrl: string}} course - Course to add.
 * @returns {Promise<{id: string, name: string, calendarUrl: string}>} The saved course.
 */
export async function addCourse(course) {
  try {
    if (!course || typeof course !== 'object') {
      throw new Error('Invalid course object provided.');
    }

    const sanitizedUrl = cleanPerusallCalendarUrl(course.calendarUrl || '');
    const courseId = course.id ? String(course.id) : Date.now().toString();
    const courseName = course.name ? String(course.name).trim() : '';

    const newCourse = {
      id: courseId,
      name: courseName,
      calendarUrl: sanitizedUrl,
    };

    const currentCourses = await getCourses();
    const existingIndex = currentCourses.findIndex((c) => c.id === courseId);

    let updatedCourses;
    if (existingIndex >= 0) {
      updatedCourses = [...currentCourses];
      updatedCourses[existingIndex] = newCourse;
    } else {
      updatedCourses = [...currentCourses, newCourse];
    }

    await AsyncStorage.setItem(STORAGE_SAVED_COURSES, JSON.stringify(updatedCourses));
    return newCourse;
  } catch (error) {
    console.error('Failed to add course to storage:', error);
    throw error;
  }
}

/**
 * Deletes a course by ID from AsyncStorage.
 * 
 * @param {string} id - The ID of the course to remove.
 * @returns {Promise<Array<{id: string, name: string, calendarUrl: string}>>} The remaining courses.
 */
export async function deleteCourse(id) {
  try {
    if (!id) return await getCourses();
    const currentCourses = await getCourses();
    const updatedCourses = currentCourses.filter((c) => c.id !== String(id));
    await AsyncStorage.setItem(STORAGE_SAVED_COURSES, JSON.stringify(updatedCourses));
    return updatedCourses;
  } catch (error) {
    console.error('Failed to delete course from storage:', error);
    throw error;
  }
}

/**
 * Saves the Perusall calendar URL persistently after cleaning it (legacy single-URL support).
 * 
 * @param {string} url - Raw calendar URL.
 * @returns {Promise<string>} The cleaned URL that was saved.
 */
export async function savePerusallCalendarUrl(url) {
  const cleanedUrl = cleanPerusallCalendarUrl(url);
  if (cleanedUrl) {
    await AsyncStorage.setItem(STORAGE_PERUSALL_CALENDAR_URL, cleanedUrl);
  } else {
    await AsyncStorage.removeItem(STORAGE_PERUSALL_CALENDAR_URL);
  }
  return cleanedUrl;
}

/**
 * Retrieves the stored Perusall calendar URL (legacy single-URL support).
 * 
 * @returns {Promise<string|null>}
 */
export async function getPerusallCalendarUrl() {
  try {
    return await AsyncStorage.getItem(STORAGE_PERUSALL_CALENDAR_URL);
  } catch (error) {
    console.error('Failed to get Perusall calendar URL from storage:', error);
    return null;
  }
}

/**
 * Parses an individual iCalendar feed string and extracts deadline objects.
 * 
 * @param {string} icsData - Raw iCalendar string.
 * @param {{id?: string, name?: string}} [courseMeta] - Metadata for the course.
 * @returns {Array<{id: string, courseId: string, courseName: string, title: string, deadline: Date | null, description: string}>}
 */
function parseIcsPayload(icsData, courseMeta = {}) {
  try {
    if (!icsData || !icsData.trim()) return [];

    const jcalData = ICAL.parse(icsData);
    const vcalendar = new ICAL.Component(jcalData);

    const feedCalName = vcalendar.getFirstPropertyValue('x-wr-calname') || vcalendar.getFirstPropertyValue('calname') || '';
    const courseName = (courseMeta.name && String(courseMeta.name).trim()) || feedCalName || 'Perusall';
    const courseId = courseMeta.id ? String(courseMeta.id) : '';

    const vevents = vcalendar.getAllSubcomponents('vevent') || [];

    return vevents.map((veventComp) => {
      const event = new ICAL.Event(veventComp);

      const id = event.uid || veventComp.getFirstPropertyValue('uid') || '';
      const title = event.summary || veventComp.getFirstPropertyValue('summary') || '';
      const description = event.description || veventComp.getFirstPropertyValue('description') || '';

      let deadline = null;
      if (event.endDate) {
        deadline = typeof event.endDate.toJSDate === 'function' ? event.endDate.toJSDate() : new Date(event.endDate);
      } else {
        const dtend = veventComp.getFirstPropertyValue('dtend');
        if (dtend) {
          deadline = typeof dtend.toJSDate === 'function' ? dtend.toJSDate() : new Date(dtend);
        }
      }

      return {
        id,
        courseId,
        courseName,
        title,
        deadline,
        description,
      };
    });
  } catch (error) {
    console.error('Error parsing iCalendar payload:', error);
    return [];
  }
}

/**
 * Fetches and parses iCalendar (.ics) deadlines from a single course, a list of courses, or a URL string.
 * 
 * @param {string|{id?: string, name?: string, calendarUrl: string}|Array<{id?: string, name?: string, calendarUrl: string}>} coursesInput - Single course, courses array, or calendar URL string.
 * @returns {Promise<Array<{id: string, courseId: string, courseName: string, title: string, deadline: Date | null, description: string}>>}
 */
export async function fetchPerusallDeadlines(coursesInput) {
  try {
    if (!coursesInput) return [];

    let coursesList = [];
    if (Array.isArray(coursesInput)) {
      coursesList = coursesInput;
    } else if (typeof coursesInput === 'string') {
      coursesList = [{ id: '', name: '', calendarUrl: coursesInput }];
    } else if (typeof coursesInput === 'object' && coursesInput !== null) {
      coursesList = [coursesInput];
    }

    if (coursesList.length === 0) return [];

    const fetchedLists = await Promise.all(
      coursesList.map(async (course) => {
        const url = course?.calendarUrl;
        if (!url || typeof url !== 'string') return [];

        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.error(`Failed to fetch iCalendar data for ${course.name || url}: ${response.status} ${response.statusText}`);
            return [];
          }

          const icsData = await response.text();
          return parseIcsPayload(icsData, course);
        } catch (fetchError) {
          console.error(`Error fetching Perusall deadlines for ${course.name || url}:`, fetchError);
          return [];
        }
      })
    );

    const allDeadlines = fetchedLists.flat();

    // Sort chronologically ascending by deadline
    allDeadlines.sort((a, b) => {
      const timeA = a.deadline instanceof Date && !isNaN(a.deadline)
        ? a.deadline.getTime()
        : (a.deadline ? new Date(a.deadline).getTime() : Infinity);
      const timeB = b.deadline instanceof Date && !isNaN(b.deadline)
        ? b.deadline.getTime()
        : (b.deadline ? new Date(b.deadline).getTime() : Infinity);

      const valA = isNaN(timeA) ? Infinity : timeA;
      const valB = isNaN(timeB) ? Infinity : timeB;

      return valA - valB;
    });

    return allDeadlines;
  } catch (error) {
    console.error('Error in fetchPerusallDeadlines:', error);
    return [];
  }
}

/**
 * Fetches deadlines across multiple saved course modules.
 * 
 * @param {Array<{id: string, name: string, calendarUrl: string}>} [coursesList] - Optional courses list.
 * @returns {Promise<Array<{id: string, courseId: string, courseName: string, title: string, deadline: Date | null, description: string}>>}
 */
export async function fetchAllCoursesDeadlines(coursesList) {
  const courses = Array.isArray(coursesList) ? coursesList : await getCourses();
  return fetchPerusallDeadlines(courses);
}

export default fetchPerusallDeadlines;
