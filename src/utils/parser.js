/**
 * Parser utilities for deadline reminders and FEeLS course pages.
 */

/**
 * Parses a date string following 'Due:' into formatted deadline and remaining time.
 * 
 * @param {string} dueDateText - Raw text following 'Due:'.
 * @returns {{formattedDeadline: string, remaining: string, parsedDate: Date | null}}
 */
export const parseDueDateString = (dueDateText) => {
  try {
    if (!dueDateText || typeof dueDateText !== 'string') {
      return { formattedDeadline: 'Unknown Date', remaining: 'Unknown', parsedDate: null };
    }

    const cleanText = dueDateText.replace(/<[^>]+>/g, '').trim();
    let parsedDate = null;

    // 1. Relative dates: "Today, 11:59 PM" or "Tomorrow, 8:00 AM"
    const relativeMatch = cleanText.match(/(Today|Tomorrow)[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (relativeMatch) {
      const isTomorrow = (relativeMatch[1] || '').toLowerCase() === 'tomorrow';
      let hours = parseInt(relativeMatch[2], 10);
      const minutes = parseInt(relativeMatch[3], 10);
      const meridian = relativeMatch[4] ? relativeMatch[4].toUpperCase() : null;

      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;

      const now = new Date();
      parsedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      if (isTomorrow) parsedDate.setDate(parsedDate.getDate() + 1);
    }

    // 2. Standard Moodle date format: "Friday, 25 September 2026, 11:59 PM" or "25 Sep 2026, 11:59 PM"
    if (!parsedDate) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      // Day Month Year Hour:Min (AM/PM)
      const dmyMatch = cleanText.match(/(\d{1,2})\s+([A-Za-z]{3,9})\w*(?:,?\s+(\d{4}))?[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      // Month Day Year Hour:Min (AM/PM)
      const mdyMatch = cleanText.match(/([A-Za-z]{3,9})\w*\s+(\d{1,2})(?:,?\s+(\d{4}))?[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

      const match = dmyMatch || mdyMatch;
      if (match) {
        let day, monthStr, yearStr, hourStr, minStr, ampm;
        if (dmyMatch) {
          day = parseInt(dmyMatch[1], 10);
          monthStr = (dmyMatch[2] || '').slice(0, 3).toLowerCase();
          yearStr = dmyMatch[3];
          hourStr = dmyMatch[4];
          minStr = dmyMatch[5];
          ampm = dmyMatch[6];
        } else {
          monthStr = (mdyMatch[1] || '').slice(0, 3).toLowerCase();
          day = parseInt(mdyMatch[2], 10);
          yearStr = mdyMatch[3];
          hourStr = mdyMatch[4];
          minStr = mdyMatch[5];
          ampm = mdyMatch[6];
        }

        const monthIndex = monthNames.indexOf(monthStr);
        if (monthIndex !== -1) {
          const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
          let hours = parseInt(hourStr, 10);
          const minutes = parseInt(minStr, 10);
          const meridian = ampm ? ampm.toUpperCase() : null;

          if (meridian === 'PM' && hours < 12) hours += 12;
          if (meridian === 'AM' && hours === 12) hours = 0;

          parsedDate = new Date(year, monthIndex, day, hours, minutes);
        }
      }
    }

    // 3. Fallback standard Date parsing
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      const hasDateIndicators = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})\b/i.test(cleanText);
      if (hasDateIndicators) {
        const fallback = new Date(cleanText);
        if (!isNaN(fallback.getTime()) && fallback.getFullYear() < 2100) {
          parsedDate = fallback;
        }
      }
    }

    let formattedDeadline = 'Unknown Date';
    let remaining = 'Unknown';

    if (parsedDate && !isNaN(parsedDate.getTime())) {
      const displayMinutes = parsedDate.getMinutes() < 10 ? '0' + parsedDate.getMinutes() : parsedDate.getMinutes();
      const ampm = parsedDate.getHours() >= 12 ? 'PM' : 'AM';
      let dispHours = parsedDate.getHours() % 12;
      dispHours = dispHours ? dispHours : 12;

      formattedDeadline = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()} ${dispHours}:${displayMinutes} ${ampm}`;

      const diffMs = parsedDate.getTime() - Date.now();
      if (diffMs < 0) {
        remaining = 'Overdue 🚨';
      } else {
        const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        remaining = `${daysLeft} days ${hoursLeft} hours`;
      }
    }

    return { formattedDeadline, remaining, parsedDate };
  } catch (err) {
    console.error('[FEeLS Parser] Error in parseDueDateString:', err);
    return { formattedDeadline: 'Unknown Date', remaining: 'Unknown', parsedDate: null };
  }
};

const cleanActivityTitle = (text) => {
  if (!text || typeof text !== 'string') return 'Untitled Activity';
  try {
    return text
      .replace(/<span[^>]*\bclass=["'][^"']*(?:accesshide|sr-only|hidden)[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '') // Remove accesshide text
      .replace(/<[^>]+>/g, ' ') // Replace tags with space
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled Activity';
  } catch (err) {
    return 'Untitled Activity';
  }
};

export const extractActivityName = (block) => {
  if (!block || typeof block !== 'string') return 'Untitled Activity';

  try {
    // 1. data-activityname attribute
    const dataMatch = block.match(/data-activityname=["']([^"']+)["']/i);
    if (dataMatch && dataMatch[1] && dataMatch[1].trim()) {
      return cleanActivityTitle(dataMatch[1]);
    }

    // 2. .instancename span
    const instanceMatch = block.match(/<span[^>]*\bclass=["'][^"']*\binstancename\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    if (instanceMatch && instanceMatch[1] && instanceMatch[1].trim()) {
      return cleanActivityTitle(instanceMatch[1]);
    }

    // 3. .activityname container
    const actNameMatch = block.match(/<[^>]*\bclass=["'][^"']*\bactivityname\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|h[1-6]|a)>/i);
    if (actNameMatch && actNameMatch[1] && actNameMatch[1].trim()) {
      return cleanActivityTitle(actNameMatch[1]);
    }

    // 4. .aalink anchor tag
    const aalinkMatch = block.match(/<a[^>]*\bclass=["'][^"']*\baalink\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (aalinkMatch && aalinkMatch[1] && aalinkMatch[1].trim()) {
      return cleanActivityTitle(aalinkMatch[1]);
    }

    // 5. Any mod link
    const modLinkMatch = block.match(/<a[^>]*href=["'][^"']*\/mod\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (modLinkMatch && modLinkMatch[1] && modLinkMatch[1].trim()) {
      return cleanActivityTitle(modLinkMatch[1]);
    }

    // 6. First heading in block
    const hMatch = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (hMatch && hMatch[1] && hMatch[1].trim()) {
      return cleanActivityTitle(hMatch[1]);
    }

    return 'Untitled Activity';
  } catch (err) {
    console.error('[FEeLS Parser] Error in extractActivityName:', err);
    return 'Untitled Activity';
  }
};

/**
 * Parses raw HTML of an individual course page to extract activities with due dates, lock status, and lock reason.
 * Targets elements with class .activity-item or .activity.
 * 
 * @param {string} rawHtml - Raw HTML content of the course page.
 * @param {string} [defaultSubject='General'] - Fallback subject code if not detected.
 * @returns {Array<{id: string, subject: string, description: string, deadline: string, remaining: string, isLocked: boolean, lockReason: string, source: string}>}
 */
export const parseCoursePageHtml = (rawHtml, defaultSubject = 'General') => {
  try {
    if (!rawHtml || typeof rawHtml !== 'string') return [];

    // Extract Subject code from HTML (e.g. CO544, EE380)
    const subjectMatch = rawHtml.match(/\b([A-Z]{2,4}\d{3})\b/i);
    const subject = subjectMatch ? subjectMatch[1].toUpperCase() : defaultSubject;

    const tasks = [];

    // Remove HTML comments
    const cleanHtml = rawHtml.replace(/<!--[\s\S]*?-->/g, '');

    // Match only elements with class exact tokens "activity" or "activity-item"
    const activityTagRegex = /<(?:li|div|section)[^>]*\bclass=["'][^"']*(?<=\s|["'])(?:activity-item|activity)(?=\s|["'])[^"']*["'][^>]*>/gi;
    const matches = [];
    let m;
    while ((m = activityTagRegex.exec(cleanHtml)) !== null) {
      matches.push({ index: m.index, tag: m[0] });
    }

    // Filter out nested matches
    const topLevelMatches = [];
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      if (topLevelMatches.length > 0) {
        const prev = topLevelMatches[topLevelMatches.length - 1];
        const sliceBetween = cleanHtml.slice(prev.index, current.index);
        if (prev.tag.startsWith('<li') && !sliceBetween.includes('</li>')) {
          continue; // Nested inside previous <li>
        }
        if (prev.tag.startsWith('<div') && !sliceBetween.includes('</div>')) {
          continue; // Nested inside previous <div>
        }
        if (prev.tag.startsWith('<section') && !sliceBetween.includes('</section>')) {
          continue; // Nested inside previous <section>
        }
      }
      topLevelMatches.push(current);
    }

    // Extract slices between top-level activity markers
    const activityBlocks = [];
    for (let i = 0; i < topLevelMatches.length; i++) {
      const startIndex = topLevelMatches[i].index;
      let endIndex;
      if (i + 1 < topLevelMatches.length) {
        endIndex = topLevelMatches[i + 1].index;
      } else {
        const nextUl = cleanHtml.indexOf('</ul>', startIndex);
        const nextBody = cleanHtml.indexOf('</body>', startIndex);
        const candidates = [nextUl, nextBody, cleanHtml.length].filter(idx => idx !== -1 && idx > startIndex);
        endIndex = Math.min(...candidates);
      }
      const block = cleanHtml.slice(startIndex, endIndex);
      activityBlocks.push(block);
    }

    for (const block of activityBlocks) {
      // Check if this activity has a 'Due:', 'Due date:', 'Closes:', or 'Available until:' string
      const dueMatch = block.match(/(?:<strong>)?\s*(?:Due(?:\s*date)?|Closes|Available\s+until)\s*:\s*(?:<\/strong>)?\s*([^<\n\r]+)/i);

      if (!dueMatch) {
        continue; // Skip activities without a due date
      }

      const rawDueText = dueMatch[1].replace(/<[^>]+>/g, '').trim();
      if (!rawDueText) {
        continue;
      }

      const { formattedDeadline, remaining } = parseDueDateString(rawDueText);

      // Extract Activity Name
      const activityName = extractActivityName(block);

      // Check Lock Status: "Not available unless:" or lock icon (fa-lock, lock SVG, icon-lock, etc.)
      const hasNotAvailableUnless = /not\s+available\s+unless\s*:/i.test(block);
      const hasLockIcon = /class=["'][^"']*(?:fa-lock|icon-lock|lock-icon|isrestricted)[^"']*["']|<(?:svg|i)[^>]*(?:lock|restricted)/i.test(block) || /title=["'][^"']*restricted[^"']*["']/i.test(block);

      const isLocked = hasNotAvailableUnless || hasLockIcon;
      let lockReason = '';

      if (hasNotAvailableUnless) {
        const reasonMatch = block.match(/not\s+available\s+unless\s*:\s*([\s\S]*?)(?:<\/(?:div|span|p|li)>|<div|<span class=["']badge|$)/i);
        if (reasonMatch) {
          lockReason = reasonMatch[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();
        }
      } else if (isLocked) {
        const generalReasonMatch = block.match(/class=["'][^"']*availabilityinfo[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p|li)>/i);
        if (generalReasonMatch) {
          lockReason = generalReasonMatch[1].replace(/<[^>]+>/g, '').trim();
        } else {
          lockReason = 'Prerequisites not met';
        }
      }

      const task = {
        id: `${subject}-${activityName}-${formattedDeadline}`.replace(/\s+/g, '-'),
        subject,
        description: activityName,
        deadline: formattedDeadline,
        remaining,
        isLocked,
        lockReason,
        source: 'feels'
      };

      tasks.push(task);
    }

    return tasks;
  } catch (error) {
    console.error('[FEeLS Parser] Error in parseCoursePageHtml:', error);
    return [];
  }
};

/**
 * Iterates through an array of course page objects, parses each course's HTML using parseCoursePageHtml,
 * and returns a single flattened array of all extracted tasks.
 * 
 * @param {Array<{id?: string, url?: string, html: string}>} coursePagesArray - Array of fetched course pages.
 * @returns {Array<{id: string, subject: string, description: string, deadline: string, remaining: string, isLocked: boolean, lockReason: string, source: string}>}
 */
export const parseAllCoursePages = (coursePagesArray) => {
  try {
    if (!Array.isArray(coursePagesArray) || coursePagesArray.length === 0) {
      return [];
    }

    const allTasks = [];
    for (const coursePage of coursePagesArray) {
      if (!coursePage) continue;
      const html = typeof coursePage === 'string' ? coursePage : coursePage.html;
      if (html && typeof html === 'string') {
        const tasks = parseCoursePageHtml(html);
        if (Array.isArray(tasks) && tasks.length > 0) {
          allTasks.push(...tasks);
        }
      }
    }

    return allTasks;
  } catch (error) {
    console.error('[FEeLS Parser] Error in parseAllCoursePages:', error);
    return [];
  }
};

/**
 * Legacy parser function for deadline strings (calendar events & manual entries).
 */
export const parseDeadlineString = (rawText) => {
  try {
    if (!rawText || typeof rawText !== 'string') {
      return {
        subject: 'General',
        description: 'Untitled Task',
        deadline: 'Unknown Date',
        remaining: 'Unknown'
      };
    }

    const subjectMatch = rawText.match(/\b([A-Z]{2,4}\d{3})\b/i);
    const subject = subjectMatch ? subjectMatch[1].toUpperCase() : "General";

    let formattedDeadline = "Unknown Date";
    let remaining = "Unknown";
    let parsedDate = null;
    let dateMatchText = "";

    const relativeMatch = rawText.match(/(Today|Tomorrow)[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const strictMatch = rawText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s*(\d{4}))?[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)/i);

    if (relativeMatch) {
      dateMatchText = relativeMatch[0];
      const isTomorrow = (relativeMatch[1] || '').toLowerCase() === 'tomorrow';
      let hours = parseInt(relativeMatch[2], 10);
      const minutes = parseInt(relativeMatch[3], 10);
      const meridian = relativeMatch[4] ? relativeMatch[4].toUpperCase() : 'AM';

      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;

      const now = new Date();
      parsedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      if (isTomorrow) parsedDate.setDate(parsedDate.getDate() + 1);

    } else if (strictMatch) {
      dateMatchText = strictMatch[0];
      const day = parseInt(strictMatch[1], 10);
      const monthStr = (strictMatch[2] || '').toLowerCase();
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIndex = months.indexOf(monthStr);
      const targetYear = strictMatch[3] ? parseInt(strictMatch[3], 10) : new Date().getFullYear();
      
      let hours = parseInt(strictMatch[4], 10);
      const minutes = parseInt(strictMatch[5], 10);
      const meridian = strictMatch[6] ? strictMatch[6].toUpperCase() : 'AM';

      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;

      parsedDate = new Date(targetYear, monthIndex, day, hours, minutes);
    }

    if (parsedDate && !isNaN(parsedDate)) {
      const displayMinutes = parsedDate.getMinutes() < 10 ? '0' + parsedDate.getMinutes() : parsedDate.getMinutes();
      const ampm = parsedDate.getHours() >= 12 ? 'PM' : 'AM';
      let dispHours = parsedDate.getHours() % 12;
      dispHours = dispHours ? dispHours : 12;

      formattedDeadline = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()} ${dispHours}:${displayMinutes} ${ampm}`;
      
      const diffMs = parsedDate - new Date();
      if (diffMs < 0) {
        remaining = "Overdue 🚨";
      } else {
        const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        remaining = `${daysLeft} days ${hoursLeft} hours`;
      }
    }

    let description = rawText.split(/Course event/i)[0] || '';
    if (dateMatchText) description = description.replace(dateMatchText, "");
    
    description = description
      .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow),?/ig, "")
      .replace(/is due/ig, "")
      .replace(/opens/ig, "- Opens")
      .replace(/closes/ig, "- Closes")
      .trim();

    return {
      subject,
      description: description || "Untitled Task",
      deadline: formattedDeadline,
      remaining
    };
  } catch (err) {
    console.error('[FEeLS Parser] Error in parseDeadlineString:', err);
    return {
      subject: 'General',
      description: 'Untitled Task',
      deadline: 'Unknown Date',
      remaining: 'Unknown'
    };
  }
};

/**
 * Backward-compatibility helper for HomeScreen.js
 */
export const extractDeadlines = (rawText) => {
  try {
    if (!rawText || typeof rawText !== 'string') return [];
    const lines = rawText.split('\n').filter(line => line.trim().length > 0);
    return lines.map(line => parseDeadlineString(line));
  } catch (err) {
    return [];
  }
};

export const formatForClipboard = (deadlines) => {
  try {
    if (!Array.isArray(deadlines) || deadlines.length === 0) return '';
    return deadlines
      .map(d => `*${d.subject}*: ${d.description}\nDue: ${d.deadline} (${d.remaining})`)
      .join('\n\n');
  } catch (err) {
    return '';
  }
};