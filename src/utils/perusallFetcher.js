import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DESKTOP_UA } from '../constants/perusallConstants';

export const PERUSALL_BASE_URL = 'https://app.perusall.com';

/**
 * Reads the dynamically saved Perusall base URL from AsyncStorage, fallback to PERUSALL_BASE_URL.
 *
 * @returns {Promise<string>}
 */
export const getPerusallBaseUrl = async () => {
  try {
    const savedBase = await AsyncStorage.getItem('@perusall_base_url');
    return savedBase || PERUSALL_BASE_URL;
  } catch (e) {
    return PERUSALL_BASE_URL;
  }
};

/**
 * Converts a cookie object or map from CookieManager into a standardized Cookie header string.
 * Supports both { name: { value: '...' } } and { name: 'value' } structures.
 *
 * @param {Object|string} cookies - Raw cookies from CookieManager or raw cookie string.
 * @returns {string} Cookie header formatted string.
 */
export const formatCookieHeader = (cookies) => {
  if (!cookies) return '';
  if (typeof cookies === 'string') return cookies;

  if (typeof cookies === 'object') {
    return Object.entries(cookies)
      .map(([key, item]) => {
        if (!item) return '';
        if (typeof item === 'object' && item.value !== undefined) {
          return `${key}=${item.value}`;
        }
        return `${key}=${item}`;
      })
      .filter(Boolean)
      .join('; ');
  }

  return '';
};

/**
 * Finds a CSRF-style token in a cookie header without assuming its exact name.
 * Perusall (or an intermediary) may not literally call it "perusall_csrf" — this
 * checks a handful of common variants and logs what it actually saw so you can
 * confirm the right one in your device logs.
 *
 * @param {string} cookieHeader
 * @returns {string|null}
 */
const extractCsrfToken = (cookieHeader) => {
  if (!cookieHeader) return null;

  const candidateNames = [
    'perusall_csrf',
    'csrf',
    '_csrf',
    'csrf_token',
    'CSRF-TOKEN',
    'XSRF-TOKEN',
  ];

  for (const name of candidateNames) {
    const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`, 'i'));
    if (match && match[1]) {
      console.log(`[PerusallFetcher] Found CSRF-like cookie "${name}"`);
      return decodeURIComponent(match[1]);
    }
  }

  console.warn(
    '[PerusallFetcher] No CSRF-like cookie found. Cookie names present:',
    cookieHeader.split(';').map((c) => c.trim().split('=')[0])
  );
  return null;
};

/**
 * Retrieves stored cookies for Perusall using AsyncStorage or CookieManager.
 *
 * @param {string} [baseUrl] - Base URL for Perusall. Defaults to dynamic stored base URL or PERUSALL_BASE_URL.
 * @returns {Promise<string>} Formatted cookie header string.
 */
export const getPerusallCookies = async (baseUrl) => {
  try {
    const effectiveBaseUrl = baseUrl || (await getPerusallBaseUrl());

    // 1. Skip AsyncStorage cache if the fetcher previously flagged the session as expired.
    //    Returning a stale cookie here is the direct cause of the 401 loop.
    const isAuthExpired = await AsyncStorage.getItem('@perusall_auth_expired');
    if (isAuthExpired !== 'true') {
      const cachedCookies = await AsyncStorage.getItem('@perusall_cookies');
      if (cachedCookies && typeof cachedCookies === 'string' && cachedCookies.trim().length > 0) {
        return cachedCookies.trim();
      }
    } else {
      console.log('[PerusallFetcher] Auth flagged as expired — skipping stale AsyncStorage cookie cache.');
    }

    // 2. Check CookieManager for live cookies
    if (CookieManager && typeof CookieManager.get === 'function') {
      const cookieMap = await CookieManager.get(effectiveBaseUrl);
      const header = formatCookieHeader(cookieMap);
      if (header) {
        await AsyncStorage.setItem('@perusall_cookies', header);
        return header;
      }
    }

    return '';
  } catch (error) {
    console.warn('[PerusallFetcher] Could not retrieve cookies:', error?.message || error);
    try {
      // Only fall back to cached cookies if auth is NOT expired
      const isAuthExpired = await AsyncStorage.getItem('@perusall_auth_expired');
      if (isAuthExpired !== 'true') {
        return (await AsyncStorage.getItem('@perusall_cookies')) || '';
      }
      return '';
    } catch (e) {
      return '';
    }
  }
};

/**
 * Formats a Date object or date string into standard M/D/YYYY H:MM AM/PM string and calculates remaining time.
 *
 * @param {string|number|Date} dateInput - Date input from Perusall API.
 * @returns {{formattedDeadline: string, remaining: string, targetDate: Date|null}}
 */
export const formatPerusallDeadline = (dateInput) => {
  if (!dateInput) {
    return { formattedDeadline: 'Unknown Date', remaining: 'Unknown', targetDate: null };
  }

  const targetDate = new Date(dateInput);
  if (isNaN(targetDate.getTime())) {
    return { formattedDeadline: String(dateInput), remaining: 'Unknown', targetDate: null };
  }

  const displayMinutes = targetDate.getMinutes() < 10 ? `0${targetDate.getMinutes()}` : targetDate.getMinutes();
  const ampm = targetDate.getHours() >= 12 ? 'PM' : 'AM';
  let dispHours = targetDate.getHours() % 12;
  dispHours = dispHours ? dispHours : 12;

  const formattedDeadline = `${targetDate.getMonth() + 1}/${targetDate.getDate()}/${targetDate.getFullYear()} ${dispHours}:${displayMinutes} ${ampm}`;

  const diffMs = targetDate.getTime() - Date.now();
  let remaining = 'Unknown';
  if (diffMs < 0) {
    remaining = 'Overdue 🚨';
  } else {
    const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    remaining = `${daysLeft} days ${hoursLeft} hours`;
  }

  return { formattedDeadline, remaining, targetDate };
};

/**
 * Builds the shared headers used by every Perusall API call, including a CSRF
 * token (if one can be found) and a User-Agent that matches the WebView that
 * originally established the session.
 *
 * @param {string} effectiveBaseUrl
 * @param {string} cookieHeader
 * @returns {Object}
 */
const buildHeaders = (effectiveBaseUrl, cookieHeader) => {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Origin: effectiveBaseUrl,
    Referer: `${effectiveBaseUrl}/`,
    DNT: '1',
    // IMPORTANT: this MUST match the userAgent prop on the WebView in
    // PerusallLtiBridge.js. A mismatch between the UA that created the
    // session and the UA used to call the API is a common cause of a
    // 401/403 even when the cookies themselves are valid.
    'User-Agent': DESKTOP_UA,
  };

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;

    const csrfToken = extractCsrfToken(cookieHeader);
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

  return headers;
};

/**
 * Fetches enrolled courses from Perusall API.
 *
 * @param {string} cookieHeader - Formatted cookie header string.
 * @param {string} [baseUrl] - Base URL for Perusall.
 * @param {number} [timeoutMs=10000] - Request timeout in milliseconds.
 * @returns {Promise<Array<{id: string, name: string, code: string}>>}
 */
export const fetchPerusallCourses = async (cookieHeader, baseUrl, timeoutMs = 10000) => {
  const effectiveBaseUrl = baseUrl || (await getPerusallBaseUrl());
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, timeoutMs);

  try {
    const headers = buildHeaders(effectiveBaseUrl, cookieHeader);
    console.log('[PerusallFetcher] GET /api/v1/courses — headers:', JSON.stringify(headers));

    const response = await fetch(`${effectiveBaseUrl}/api/v1/courses`, {
      method: 'GET',
      headers,
      signal: controller ? controller.signal : undefined,
    });
    clearTimeout(timeoutId);

    console.log('[PerusallFetcher] /api/v1/courses response status:', response.status, response.statusText);

    if (!response.ok) {
      if (response.status === 401) {
        // Genuinely no valid session — safe to purge and force a re-login.
        console.log('[PerusallFetcher] 401 Unauthorized — session invalid. Purging dead cookies...');
        await AsyncStorage.removeItem('@perusall_cookies');
        await AsyncStorage.setItem('@perusall_auth_expired', 'true');
        return [];
      }

      if (response.status === 403) {
        // Session is very likely fine — this is almost always a CSRF/header
        // mismatch, not an expired login. DO NOT purge cookies here, or
        // you'll loop forever relaunching the LTI bridge for no reason.
        const bodyText = await response.text().catch(() => '');
        console.warn(
          '[PerusallFetcher] 403 Forbidden — NOT treating as expired session. ' +
            'This usually means a missing/incorrect CSRF token or header mismatch. Response body:',
          bodyText
        );
        return [];
      }

      throw new Error(`Failed to fetch Perusall courses: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const courseList = Array.isArray(data) ? data : (data?.courses || []);

    return courseList.map((c) => {
      const code = c.code || c.courseCode || c.courseNumber || (c.name ? c.name.match(/\b([A-Z]{2,4}\s*\d{3})\b/i)?.[1]?.toUpperCase() : null) || 'PERUSALL';
      return {
        id: String(c.id || c._id || code),
        name: c.name || c.title || code,
        code: code.replace(/\s+/g, ''),
      };
    });
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[PerusallFetcher] Error fetching courses:', error?.message || error);
    return [];
  }
};

/**
 * Fetches assignments for a single Perusall course.
 *
 * @param {string} courseId - The course ID.
 * @param {string} cookieHeader - Formatted cookie header string.
 * @param {string} [baseUrl] - Base URL for Perusall.
 * @param {number} [timeoutMs=10000] - Request timeout in milliseconds.
 * @returns {Promise<Array<Object>>}
 */
export const fetchPerusallAssignmentsForCourse = async (courseId, cookieHeader, baseUrl, timeoutMs = 10000) => {
  if (!courseId) return [];

  const effectiveBaseUrl = baseUrl || (await getPerusallBaseUrl());
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, timeoutMs);

  try {
    const headers = buildHeaders(effectiveBaseUrl, cookieHeader);

    const response = await fetch(`${effectiveBaseUrl}/api/v1/courses/${encodeURIComponent(courseId)}/assignments`, {
      method: 'GET',
      headers,
      signal: controller ? controller.signal : undefined,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        console.warn(
          `[PerusallFetcher] Course ${courseId} assignments request failed with ${response.status}. Skipping this course.`
        );
        return [];
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data?.assignments || []);
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`[PerusallFetcher] Error fetching assignments for course ${courseId}:`, error?.message || error);
    return [];
  }
};

/**
 * Normalizes a raw Perusall assignment object into the app's standard task schema.
 *
 * @param {Object} rawAssignment - Assignment object returned by Perusall API.
 * @param {Object} [courseInfo={}] - Parent course details { id, name, code }.
 * @param {string} [baseUrl=PERUSALL_BASE_URL] - Base URL for Perusall.
 * @returns {Object} Standardized task object.
 */
export const parsePerusallAssignment = (rawAssignment, courseInfo = {}, baseUrl = PERUSALL_BASE_URL) => {
  if (!rawAssignment) return null;

  const effectiveBase = baseUrl || PERUSALL_BASE_URL;
  const rawDeadline = rawAssignment.deadline || rawAssignment.dueDate || rawAssignment.submissionDeadline || rawAssignment.scoringDeadline || rawAssignment.due;
  const { formattedDeadline, remaining } = formatPerusallDeadline(rawDeadline);

  const subject = courseInfo.code || rawAssignment.courseCode || 'PERUSALL';
  const description = rawAssignment.title || rawAssignment.name || rawAssignment.description || 'Perusall Reading Assignment';

  const opensDate = rawAssignment.opens || rawAssignment.availableFrom || rawAssignment.availableAt;
  const isOpensFuture = opensDate ? new Date(opensDate) > new Date() : false;
  const isLocked = Boolean(rawAssignment.isLocked || rawAssignment.locked || isOpensFuture);
  const lockReason = rawAssignment.lockReason || (isOpensFuture ? `Opens ${new Date(opensDate).toLocaleDateString()}` : '');

  const id = rawAssignment.id
    ? `perusall-${rawAssignment.id}`
    : `perusall-${subject}-${description}-${formattedDeadline}`.replace(/\s+/g, '-');

  return {
    id,
    subject: subject.toUpperCase(),
    description,
    deadline: formattedDeadline,
    remaining,
    isLocked,
    lockReason,
    source: 'perusall',
    url: rawAssignment.url || (courseInfo.id && rawAssignment.id ? `${effectiveBase}/courses/${courseInfo.id}/assignments/${rawAssignment.id}` : effectiveBase),
  };
};

/**
 * Main export: Retrieves Perusall cookies, fetches all enrolled courses and their assignments concurrently,
 * and parses them into standardized deadline tasks.
 *
 * @param {Object} [options={}]
 * @param {string|Object} [options.cookies] - Optional cookie override.
 * @param {string} [options.baseUrl] - Base URL for Perusall API.
 * @param {number} [options.timeoutMs=10000] - Timeout in milliseconds.
 * @returns {Promise<Array<Object>>} Normalized assignment list from Perusall.
 */
export const fetchPerusallAssignments = async (options = {}) => {
  const {
    cookies: customCookies,
    baseUrl: customBaseUrl,
    timeoutMs = 10000,
  } = options;

  try {
    const baseUrl = customBaseUrl || (await getPerusallBaseUrl());
    const cookieHeader = customCookies
      ? formatCookieHeader(customCookies)
      : await getPerusallCookies(baseUrl);

    // If no cookies are found, return empty array without errors
    if (!cookieHeader) {
      console.log('[PerusallFetcher] No Perusall session cookies found. Skipping Perusall sync.');
      return [];
    }

    console.log('[PerusallFetcher] Fetching enrolled courses from Perusall API...');
    const courses = await fetchPerusallCourses(cookieHeader, baseUrl, timeoutMs);

    if (!Array.isArray(courses) || courses.length === 0) {
      console.log('[PerusallFetcher] No Perusall courses found.');
      return [];
    }

    console.log(`[PerusallFetcher] Found ${courses.length} Perusall courses. Fetching assignments concurrently...`);

    // Fetch assignments for all courses concurrently via Promise.all
    const courseAssignmentPromises = courses.map(async (course) => {
      try {
        const rawAssignments = await fetchPerusallAssignmentsForCourse(course.id, cookieHeader, baseUrl, timeoutMs);
        return rawAssignments
          .map((assignment) => parsePerusallAssignment(assignment, course, baseUrl))
          .filter(Boolean);
      } catch (err) {
        console.warn(`[PerusallFetcher] Failed fetching assignments for course ${course.id}:`, err?.message || err);
        return [];
      }
    });

    const assignmentArrays = await Promise.all(courseAssignmentPromises);
    const allAssignments = assignmentArrays.flat();

    console.log(`[PerusallFetcher] Successfully extracted ${allAssignments.length} assignments from Perusall.`);
    return allAssignments;
  } catch (error) {
    console.error('[PerusallFetcher] Unexpected error in fetchPerusallAssignments:', error);
    return [];
  }
};
