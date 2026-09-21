/**
 * Utility functions for fetching course-level data from FEeLS (Moodle).
 */

const BASE_URL = 'https://feels.pdn.ac.lk';

/**
 * Parses the Moodle /my/ dashboard HTML to extract an array of available semester block titles
 * along with their corresponding DOM container selectors or IDs.
 * 
 * @param {string} html - Raw HTML of the /my/ dashboard.
 * @returns {Array<{id: string, title: string, selector: string}>}
 */
export const extractAvailableSemestersFromHtml = (html) => {
  try {
    if (!html || typeof html !== 'string') return [];
    const semesters = [];
    const seenIds = new Set();

    const semesterBlockMatch = html.match(/courses\s+by\s+semester/i);
    const targetHtml = semesterBlockMatch ? html.slice(semesterBlockMatch.index) : html;

    // Regex 1: Match collapsible cards / headers with data-toggle / href or ID attributes
    const cardRegex = /<[^>]+(?:data-toggle=["']collapse["']|class=["'][^"']*collapse-trigger[^"']*["'])[^>]*href=["']#?([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let match;
    while ((match = cardRegex.exec(targetHtml)) !== null) {
      const rawId = (match[1] || '').replace(/^#/, '').trim();
      const rawTitle = (match[2] || '').replace(/<[^>]+>/g, '').trim();
      if (rawTitle && !seenIds.has(rawId || rawTitle)) {
        const id = rawId || `sem-${semesters.length + 1}`;
        seenIds.add(id);
        semesters.push({
          id,
          title: rawTitle,
          selector: `#${id}`,
        });
      }
    }

    // Regex 2: Match header/container patterns
    if (semesters.length === 0) {
      const headerRegex = /<(?:h[1-6]|div|span|strong|b)[^>]*class=["'][^"']*(?:card-header|semester-title|collapse-header|header)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|div|span|strong|b)>/gi;
      let hMatch;
      while ((hMatch = headerRegex.exec(targetHtml)) !== null) {
        const text = (hMatch[1] || '').replace(/<[^>]+>/g, '').trim();
        if (/semesters?|september|march|\bsem\b/i.test(text) && text.length < 80) {
          const id = `sem-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            semesters.push({
              id,
              title: text,
              selector: `[data-semester-id="${id}"], #${id}`,
            });
          }
        }
      }
    }

    // Regex 3: Match general semester patterns
    if (semesters.length === 0) {
      const patternRegex = /(?:Semesters?\s+commenced\s+in\s+[A-Za-z]+\s*\d{4}|Semester\s*\d+[^<\n\r]{0,40}\d{4})/gi;
      let pMatch;
      while ((pMatch = patternRegex.exec(targetHtml)) !== null) {
        const text = (pMatch[0] || '').trim();
        const id = `sem-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          semesters.push({
            id,
            title: text,
            selector: `#${id}`,
          });
        }
      }
    }

    // Log the extracted semester list to console
    console.log('=== [FEeLS] EXTRACTED AVAILABLE SEMESTER LIST ===');
    console.log(JSON.stringify(semesters, null, 2));

    return semesters;
  } catch (error) {
    console.error('[FEeLS] Error extracting available semesters from HTML:', error);
    return [];
  }
};

/**
 * Extracts unique enrolled course URLs and IDs from the /my/ dashboard HTML,
 * exclusively from within the specified selected semester's container.
 * 
 * @param {string} html - Raw HTML content of the dashboard.
 * @param {string} [selectedSemesterId] - Identifier, selector, or title of the selected semester.
 * @param {string} [baseUrl=BASE_URL] - Base URL of the Moodle instance.
 * @returns {Array<{id: string, url: string}>} List of active enrolled course IDs and URLs.
 */
export const extractCourseUrlsFromHtml = (html, selectedSemesterId = null, baseUrl = BASE_URL) => {
  try {
    if (!html || typeof html !== 'string') return [];

    // Extract all available semester blocks from HTML
    const availableSemesters = extractAvailableSemestersFromHtml(html);

    // Target specifically the 'Courses by Semester' block
    const semesterBlockMatch = html.match(/courses\s+by\s+semester/i);
    const fromSemesterBlock = semesterBlockMatch ? html.slice(semesterBlockMatch.index) : html;

    let containerHtml = '';

    // Find the specific container for the selected semester
    if (selectedSemesterId) {
      const selectedCleanId = selectedSemesterId.replace(/^#/, '').trim();
      const matchedSem = availableSemesters.find(
        s => s.id === selectedCleanId || s.title.toLowerCase().includes(selectedCleanId.toLowerCase()) || s.selector === selectedSemesterId
      );

      const searchKey = matchedSem ? matchedSem.title : selectedCleanId;

      // Locate the start of the semester container
      const semIndex = fromSemesterBlock.indexOf(searchKey);
      if (semIndex !== -1) {
        const fromMatch = fromSemesterBlock.slice(semIndex);
        // Scope until the next semester heading or end of block container
        const nextSem = fromMatch.slice(searchKey.length).match(/(?:Semesters?\s+commenced|Semester\s*\d+|March\s*\d{4}|September\s*\d{4}|class=["'][^"']*card-header)/i);
        if (nextSem) {
          containerHtml = fromMatch.slice(0, searchKey.length + nextSem.index);
        } else {
          containerHtml = fromMatch.slice(0, 4000);
        }
      } else {
        // Look for ID attribute in HTML
        const idMatch = fromSemesterBlock.match(new RegExp(`id=["']${selectedCleanId}["'][^>]*>([\\s\\S]*?)(?:<div class=["']card|<div class=["']collapse|$)`, 'i'));
        if (idMatch) {
          containerHtml = idMatch[1];
        }
      }
    } else if (availableSemesters.length > 0) {
      // Default to the first available semester if none specified
      const firstTitle = availableSemesters[0].title;
      const semIndex = fromSemesterBlock.indexOf(firstTitle);
      if (semIndex !== -1) {
        const fromMatch = fromSemesterBlock.slice(semIndex);
        const nextSem = fromMatch.slice(firstTitle.length).match(/(?:Semesters?\s+commenced|Semester\s*\d+|March\s*\d{4}|September\s*\d{4})/i);
        containerHtml = nextSem ? fromMatch.slice(0, firstTitle.length + nextSem.index) : fromMatch.slice(0, 4000);
      }
    }

    // If no specific semester container was found, do not fall back to global HTML
    if (!containerHtml) {
      console.log(`[FEeLS] No container found for semester "${selectedSemesterId}". Returning 0 courses.`);
      return [];
    }

    // Extract course links exclusively from within that specific container
    const courseMap = new Map();
    const targetedRegex = /href=["']([^"']*\/course\/view\.php\?id=(\d+)[^"']*)["']/gi;
    let match;
    while ((match = targetedRegex.exec(containerHtml)) !== null) {
      const id = match[2];
      if (id && id !== '1' && !courseMap.has(id)) {
        courseMap.set(id, {
          id,
          url: `${baseUrl}/course/view.php?id=${id}`,
        });
      }
    }

    const activeCourses = Array.from(courseMap.values());

    // Log the extracted semester list and the final filtered course count
    console.log(`[FEeLS] Extracted ${availableSemesters.length} available semester blocks.`);
    console.log(`[FEeLS] Final filtered course count: ${activeCourses.length} courses extracted for semester "${selectedSemesterId || (availableSemesters[0]?.title || 'Default')}".`);

    return activeCourses;
  } catch (error) {
    console.error('[FEeLS] Error extracting course URLs from HTML:', error);
    return [];
  }
};

/**
 * Fetches the list of enrolled course URLs or IDs for the authenticated user for the selected semester.
 * Includes a 10-second timeout.
 * 
 * @param {string} [selectedSemesterId] - Identifier or title of the selected semester.
 * @param {string} [baseUrl=BASE_URL] - Base URL of the Moodle instance.
 * @returns {Promise<Array<{id: string, url: string}>>}
 */
export const fetchEnrolledCourseUrls = async (selectedSemesterId = null, baseUrl = BASE_URL) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, 10000);

  try {
    const response = await fetch(`${baseUrl}/my/`, {
      method: 'GET',
      credentials: 'include',
      signal: controller ? controller.signal : undefined,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard: HTTP ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    return extractCourseUrlsFromHtml(html, selectedSemesterId, baseUrl);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Network request timed out after 10 seconds: ${baseUrl}/my/`);
    }
    throw err;
  }
};

/**
 * Asynchronously iterates through the list of course URLs to fetch raw HTML for each course page.
 * Utilizes Promise.all for non-blocking, concurrent network requests with a 10-second timeout per request.
 * 
 * @param {Array<{id: string, url: string}|string>} courses - List of course URLs or objects with url/id.
 * @param {number} [timeoutMs=10000] - Timeout in milliseconds for each fetch.
 * @returns {Promise<Array<{id: string, url: string, html: string, success: boolean, error?: string}>>}
 */
export const fetchCoursePages = async (courses, timeoutMs = 10000) => {
  if (!Array.isArray(courses) || courses.length === 0) {
    return [];
  }

  console.log(`[FEeLS] Starting non-blocking fetch for ${courses.length} courses in selected semester.`);

  const fetchPromises = courses.map(async (courseItem) => {
    const url = typeof courseItem === 'string' ? courseItem : courseItem?.url;
    const id = typeof courseItem === 'string' ? (url?.match(/id=(\d+)/)?.[1] || url) : courseItem?.id;

    if (!url) {
      return { id: id || 'unknown', url: '', html: '', success: false, error: 'Invalid course URL' };
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      if (controller) controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller ? controller.signal : undefined,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();
      return { id, url, html, success: true };
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timed out');
      const errorMessage = isTimeout
        ? `Request timed out after ${timeoutMs / 1000}s on course URL: ${url}`
        : (err.message || 'Fetch failed');
      return { id, url, html: '', success: false, error: errorMessage };
    }
  });

  try {
    const results = await Promise.all(fetchPromises);

    const firstSuccessful = results.find(r => r.success && r.html);
    if (firstSuccessful) {
      console.log(`\n==================== [DEBUG] RAW HTML OF FETCHED COURSE PAGE (ID: ${firstSuccessful.id}) ====================`);
      console.log(firstSuccessful.html);
      console.log(`==================== [DEBUG] END RAW HTML (Length: ${firstSuccessful.html.length} chars) ====================\n`);
    }

    console.log(`[FEeLS] Finished fetching course pages. Final successful course count: ${results.filter(r => r.success).length}/${results.length}`);

    return results;
  } catch (err) {
    console.error('[FEeLS] Error in fetchCoursePages Promise.all:', err);
    throw err;
  }
};

/**
 * Returns an executable JavaScript string for WebView injection.
 * Wraps DOM querying in try/catch blocks with strict null checks and explicit selector error throwing.
 * Implements a 10-second timeout on all asynchronous fetch requests.
 * 
 * @param {string} [selectedSemesterId] - Identifier or title of the selected semester.
 */
export const getCourseScraperScript = (selectedSemesterId = null) => `
(async function() {
  try {
    var selectedSemesterParam = ${JSON.stringify(selectedSemesterId)};

    // Helper for safe DOM queries with strict null checks & explicit error throwing
    function safeQuery(parent, selector, isRequired) {
      if (!parent) {
        if (isRequired) throw new Error('DOM Query Error: Parent element is null when searching for selector "' + selector + '".');
        return null;
      }
      try {
        var el = parent.querySelector(selector);
        if (isRequired && !el) {
          throw new Error('DOM Query Error: Required selector "' + selector + '" failed to match any element.');
        }
        return el;
      } catch (e) {
        if (isRequired) throw e;
        return null;
      }
    }

    function safeQueryAll(parent, selector) {
      if (!parent) return [];
      try {
        return Array.from(parent.querySelectorAll(selector));
      } catch (e) {
        return [];
      }
    }

    // Helper for loading course page HTML via hidden iframe to bypass fetch() blocking/empty shells
    function fetchHTMLViaIframe(url, timeoutMs) {
      timeoutMs = timeoutMs || 15000;
      return new Promise(function(resolve, reject) {
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        var timer = null;

        function cleanup() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }

        timer = setTimeout(function() {
          cleanup();
          reject(new Error('Iframe load timed out after ' + (timeoutMs / 1000) + 's: ' + url));
        }, timeoutMs);

        iframe.onload = function() {
          try {
            const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            if (!doc || !doc.body) return;
            if (doc.body.innerHTML.length < 100) {
              // Ignore initial about:blank or empty load
              return;
            }
            var html = doc.documentElement.outerHTML || '';
            cleanup();
            resolve(html);
          } catch (e) {
            cleanup();
            reject(new Error('Iframe read error: ' + (e.message || e)));
          }
        };

        iframe.onerror = function(err) {
          cleanup();
          reject(new Error('Iframe failed to load URL: ' + url));
        };

        document.body.appendChild(iframe);
        iframe.src = url;
      });
    }

    // 1. Discover available semester block titles and corresponding DOM container selectors/IDs
    function extractAvailableSemestersFromDOM() {
      var semesters = [];
      var seenIds = {};

      var headings = safeQueryAll(document, 'h1, h2, h3, h4, h5, h6, .card-title, .block-title, .header, strong, b, div, span');
      var semesterHeading = headings.find(function(el) {
        if (!el) return false;
        var txt = (el.innerText || el.textContent || '').trim();
        return /courses\\s+by\\s+semester/i.test(txt) && txt.length < 60;
      });

      var semesterBlock = semesterHeading ? semesterHeading.closest('.block, .card, [data-block], .content, .block-region, .region-main, div') : null;
      var searchRoot = semesterBlock || document;

      // Check Moodle block_filtered_course_list tabs / rubrics
      var fclTabs = safeQueryAll(searchRoot, '[role="tab"], .block-fcl__rubric, .fcl-rubric, [data-toggle="tab"]');
      fclTabs.forEach(function(tab, idx) {
        if (!tab) return;
        var rawTitle = (tab.innerText || tab.textContent || '').trim();
        var targetId = (tab.getAttribute ? tab.getAttribute('aria-controls') : '') || tab.id || ('fcl-tab-' + (idx + 1));
        if (rawTitle && !seenIds[targetId]) {
          seenIds[targetId] = true;
          semesters.push({
            id: targetId,
            title: rawTitle,
            selector: '#' + targetId
          });
        }
      });

      // Check collapsible cards / accordions
      var cards = safeQueryAll(searchRoot, '.card, .accordion-group, .panel, fieldset, [data-toggle="collapse"]');
      
      cards.forEach(function(card, idx) {
        if (!card) return;
        var trigger = safeQuery(card, '[data-toggle="collapse"], a[href^="#"], button[data-target^="#"], .card-header') || (card.hasAttribute && card.hasAttribute('data-toggle') ? card : null);
        var titleEl = safeQuery(card, '.card-header, h5, h6, .header, strong, b, a, button') || trigger || card;
        var rawTitle = (titleEl ? (titleEl.innerText || titleEl.textContent || '') : '').trim();

        if (rawTitle && /semesters?|september|march|sem\\s*\\d+/i.test(rawTitle) && rawTitle.length < 100) {
          var targetId = '';
          if (trigger && typeof trigger.getAttribute === 'function') {
            var href = trigger.getAttribute('href') || '';
            var dataTarget = trigger.getAttribute('data-target') || '';
            targetId = (href.replace(/^#/, '') || dataTarget.replace(/^#/, '')).trim();
          }
          if (!targetId) {
            var collapseDiv = safeQuery(card, '.collapse, .card-body, .panel-collapse');
            if (collapseDiv && collapseDiv.id) targetId = collapseDiv.id;
          }
          if (!targetId) targetId = 'semester-block-' + (idx + 1);

          if (!seenIds[targetId]) {
            seenIds[targetId] = true;
            semesters.push({
              id: targetId,
              title: rawTitle,
              selector: '#' + targetId
            });
          }
        }
      });

      // Fallback regex matching on text nodes if structure is custom
      if (semesters.length === 0) {
        var elements = safeQueryAll(searchRoot, 'a, button, div, span, h5, h6');
        elements.forEach(function(el) {
          if (!el) return;
          var txt = (el.innerText || el.textContent || '').trim();
          if (/^Semesters?\\s+commenced\\s+in\\s+[A-Za-z]+\\s*\\d{4}$/i.test(txt) || /^Semester\\s*\\d+.*\\d{4}$/i.test(txt)) {
            var id = 'sem-' + txt.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (!seenIds[id]) {
              seenIds[id] = true;
              semesters.push({
                id: id,
                title: txt,
                selector: '#' + id
              });
            }
          }
        });
      }

      return semesters;
    }

    var availableSemesters = extractAvailableSemestersFromDOM();

    // Log the extracted semester list to the console
    console.log('=== [FEeLS] EXTRACTED AVAILABLE SEMESTER LIST ===');
    console.log(JSON.stringify(availableSemesters, null, 2));

    var dashboardOuterHtml = document.documentElement ? document.documentElement.outerHTML : '';

    // If no specific semester is selected, notify React Native with the extracted list
    if (!selectedSemesterParam && availableSemesters.length > 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'SEMESTERS_DISCOVERED',
        availableSemesters: availableSemesters,
        dashboardHtml: dashboardOuterHtml.slice(0, 50000)
      }));
      return;
    }

    // 2. Locate the specific DOM container node for the selected semester
    function findSemesterDOMNode(param, semList) {
      if (!param) return null;
      var cleanParam = param.replace(/^#/, '').trim().toLowerCase();

      var semInfo = semList ? semList.find(function(s) {
        return s.id.toLowerCase() === cleanParam || s.title.toLowerCase() === cleanParam || s.title.toLowerCase().includes(cleanParam);
      }) : null;

      var targetTitle = semInfo ? semInfo.title.toLowerCase() : cleanParam;

      // 1. Find the HTML node containing the selected semester text
      var allNodes = safeQueryAll(document, 'a, button, span, div, h1, h2, h3, h4, h5, h6, strong, b, li');
      var matchedTextNode = allNodes.find(function(el) {
        if (!el) return false;
        var txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (txt === targetTitle || (targetTitle.length > 3 && txt.includes(targetTitle))) {
          var hasMatchingChild = Array.from(el.children || []).some(function(child) {
            var cTxt = (child.innerText || child.textContent || '').trim().toLowerCase();
            return cTxt === targetTitle || (targetTitle.length > 3 && cTxt.includes(targetTitle));
          });
          return !hasMatchingChild;
        }
        return false;
      });

      if (matchedTextNode) {
        // 2. From that text node, traverse up to its parent tab element using .closest('[role="tab"], .block-fcl__rubric')
        var parentTab = matchedTextNode.closest ? matchedTextNode.closest('[role="tab"], .block-fcl__rubric') : null;
        if (!parentTab && (matchedTextNode.getAttribute && (matchedTextNode.getAttribute('role') === 'tab' || (matchedTextNode.classList && matchedTextNode.classList.contains('block-fcl__rubric'))))) {
          parentTab = matchedTextNode;
        }

        if (parentTab) {
          // 3. Read the aria-controls attribute from this parent tab, and use document.getElementById() with that value
          var ariaControls = parentTab.getAttribute ? parentTab.getAttribute('aria-controls') : null;
          if (ariaControls) {
            var targetPanel = document.getElementById(ariaControls) || safeQuery(document, '#' + ariaControls);
            if (targetPanel) return targetPanel;
          }
          // 4. If aria-controls is missing, return the tab's .nextElementSibling
          if (parentTab.nextElementSibling) {
            return parentTab.nextElementSibling;
          }
          return parentTab;
        }
      }

      // Fallback: Direct ID search if semInfo.id provided
      if (semInfo && semInfo.id) {
        var elById = document.getElementById(semInfo.id) || safeQuery(document, '#' + semInfo.id);
        if (elById) {
          var ac = elById.getAttribute ? elById.getAttribute('aria-controls') : null;
          if (ac) {
            var targetP = document.getElementById(ac);
            if (targetP) return targetP;
          }
          return elById;
        }
      }

      // Fallback: General headings and parent card/collapse containers
      var allHeaders = safeQueryAll(document, 'h1, h2, h3, h4, h5, h6, .card-header, a, button, strong, b, div, span');
      var headerNode = allHeaders.find(function(el) {
        if (!el) return false;
        var txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (txt === targetTitle || txt.includes(targetTitle)) && txt.length < 120;
      });

      if (headerNode) {
        var tabElement = headerNode.closest ? headerNode.closest('[role="tab"], .block-fcl__rubric, .card, .panel, .accordion-group, fieldset, li, div') : null;
        if (tabElement) {
          var panelId = tabElement.getAttribute ? tabElement.getAttribute('aria-controls') : null;
          if (panelId) {
            var pNode = document.getElementById(panelId);
            if (pNode) return pNode;
          }
          if (tabElement.nextElementSibling) {
            return tabElement.nextElementSibling;
          }
          return tabElement;
        }
      }

      return null;
    }

    var selectedContainer = findSemesterDOMNode(selectedSemesterParam, availableSemesters);

    // Fallback: use first available semester container if none specified
    if (!selectedContainer && !selectedSemesterParam && availableSemesters.length > 0) {
      selectedContainer = findSemesterDOMNode(availableSemesters[0].id || availableSemesters[0].title, availableSemesters);
    }

    if (!selectedContainer && selectedSemesterParam) {
      console.warn('Selector warning: Could not find container for semester ' + selectedSemesterParam);
    }

    // CRITICAL: Query course links STRICTLY on the selected container DOM node, NEVER on the global document
    var courseLinks = selectedContainer ? safeQueryAll(selectedContainer, 'a[href*="/course/view.php?id="]') : [];
    var courseMap = {};

    courseLinks.forEach(function(a) {
      if (!a) return;
      var href = a.href || (a.getAttribute ? a.getAttribute('href') : '') || '';
      var match = href.match(/id=(\\d+)/);
      if (match && match[1] && match[1] !== '1') {
        var id = match[1];
        if (!courseMap[id]) {
          courseMap[id] = { id: id, url: 'https://feels.pdn.ac.lk/course/view.php?id=' + id };
        }
      }
    });

    var activeCourses = Object.values(courseMap);

    // Log the final filtered course count
    console.log('=== [FEeLS] FINAL FILTERED COURSE COUNT ===');
    console.log('Selected Semester: ' + (selectedSemesterParam || (availableSemesters[0] ? availableSemesters[0].title : 'Default')));
    console.log('Final Filtered Course Count: ' + activeCourses.length);

    // 3. Asynchronously fetch raw HTML for each course page via iframe with 15-second timeout
    var fetchPromises = activeCourses.map(async function(course) {
      try {
        if (!course || !course.url) throw new Error('Invalid course object');
        var html = await fetchHTMLViaIframe(course.url, 15000);
        return { id: course.id, url: course.url, html: html, success: true };
      } catch (err) {
        return { id: course.id, url: course.url, html: '', success: false, error: err.message || 'Fetch failed' };
      }
    });

    var courseResults = await Promise.all(fetchPromises);

    // Temporary console log for a single fetched course page payload verification
    var sampleCourse = courseResults.find(function(c) { return c.success && c.html; });
    if (sampleCourse) {
      console.log('=== [DEBUG] RAW HTML OF FETCHED COURSE PAGE (ID: ' + sampleCourse.id + ') ===');
      console.log(sampleCourse.html);
      console.log('=== [DEBUG] END OF COURSE HTML ===');
    }

    var selectedSemesterObj = availableSemesters.find(function(s) {
      var param = (selectedSemesterParam || '').replace(/^#/, '').toLowerCase();
      return s.id.toLowerCase() === param || s.title.toLowerCase() === param || s.title.toLowerCase().includes(param);
    }) || (selectedSemesterParam ? { id: selectedSemesterParam, title: selectedSemesterParam } : (availableSemesters[0] || null));

    // Send payload back to React Native
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'COURSE_PAGES_FETCHED',
      availableSemesters: availableSemesters,
      selectedSemester: selectedSemesterObj,
      coursesCount: courseResults.length,
      sampleCourse: sampleCourse ? { id: sampleCourse.id, url: sampleCourse.url, html: sampleCourse.html } : null,
      coursePages: courseResults.filter(function(c) { return c.success; }).map(function(c) { return { id: c.id, url: c.url, html: c.html }; }),
      courseList: courseResults.map(function(c) { return { id: c.id, url: c.url, success: c.success, error: c.error }; }),
      dashboardHtml: dashboardOuterHtml.slice(0, 50000)
    }));

  } catch (err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'ERROR',
      message: err.message || 'Unknown error during semester-targeted course scraping'
    }));
  }
})();
true;
`;

