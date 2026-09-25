import {
  parseCoursePageHtml,
  parseDueDateString,
  parseAllCoursePages,
  extractPerusallLtiUrl,
  extractCourseMetadata,
  parseCoursePageWithMetadata,
} from '../src/utils/parser';

describe('parser utilities', () => {
  describe('parseDueDateString', () => {
    test('parses relative dates like "Tomorrow, 11:59 PM"', () => {
      const { formattedDeadline, remaining, parsedDate } = parseDueDateString('Tomorrow, 11:59 PM');
      expect(formattedDeadline).not.toBe('Unknown Date');
      expect(remaining).not.toBe('Unknown');
      expect(parsedDate).toBeInstanceOf(Date);
    });

    test('parses standard Moodle format "Friday, 25 September 2026, 11:59 PM"', () => {
      const { formattedDeadline, parsedDate } = parseDueDateString('Friday, 25 September 2026, 11:59 PM');
      expect(formattedDeadline).toContain('9/25/2026');
      expect(formattedDeadline).toContain('11:59 PM');
      expect(parsedDate).toBeInstanceOf(Date);
    });

    test('handles completely invalid or garbage date strings gracefully', () => {
      const { formattedDeadline, remaining, parsedDate } = parseDueDateString('Not a real date 9999');
      expect(formattedDeadline).toBe('Unknown Date');
      expect(remaining).toBe('Unknown');
      expect(parsedDate).toBeNull();
    });
  });

  describe('parseCoursePageHtml', () => {
    const mockCourseHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>CO544 - Machine Learning</title></head>
        <body>
          <h1 class="page-header-headings">CO544: Machine Learning</h1>
          <ul class="section img-text">
            <!-- Activity 1: Normal Assignment with Due date -->
            <li class="activity assign modtype_assign" id="module-101">
              <div class="activity-item" data-activityname="Lab 1: Supervised Learning Report">
                <div class="activityname">
                  <a class="aalink" href="https://feels.pdn.ac.lk/mod/assign/view.php?id=101">
                    <span class="instancename">Lab 1: Supervised Learning Report<span class="accesshide"> Assignment</span></span>
                  </a>
                </div>
                <div class="activity-dates">
                  <strong>Due:</strong> Friday, 25 September 2026, 11:59 PM
                </div>
              </div>
            </li>

            <!-- Activity 2: Locked Assignment with "Not available unless:" -->
            <li class="activity assign modtype_assign" id="module-102">
              <div class="activity-item">
                <div class="activityname">
                  <a class="aalink" href="https://feels.pdn.ac.lk/mod/assign/view.php?id=102">
                    <span class="instancename">Assignment 2: Neural Networks</span>
                  </a>
                </div>
                <div class="activity-dates">
                  Due: Sunday, 27 September 2026, 8:00 PM
                </div>
                <div class="availabilityinfo isrestricted">
                  <span class="badge badge-info"><i class="fa fa-lock"></i> Restricted</span>
                  Not available unless: The activity <strong>Lab 1 Pre-Quiz</strong> is marked complete
                </div>
              </div>
            </li>

            <!-- Activity 3: Locked with Lock Icon only -->
            <div class="activity-item" id="module-103">
              <div class="activityname">
                <span class="instancename">Quiz 1: Classification</span>
              </div>
              <div class="activity-dates">
                Due: Monday, 28 September 2026, 10:00 AM
              </div>
              <div class="availabilityinfo">
                <i class="icon fa fa-lock" title="Restricted"></i>
                Score 80% or higher in Practice Quiz
              </div>
            </div>

            <!-- Activity 4: Resource without due date (should be ignored) -->
            <li class="activity resource modtype_resource" id="module-104">
              <div class="activity-item">
                <div class="activityname">
                  <span class="instancename">Lecture 1 Slides</span>
                </div>
              </div>
            </li>
          </ul>
        </body>
      </html>
    `;

    test('extracts activities with due dates, lock status, and lock reason into standard task JSON format', () => {
      const tasks = parseCoursePageHtml(mockCourseHtml);

      expect(tasks).toHaveLength(3);

      // Task 1: Unlocked activity
      expect(tasks[0]).toMatchObject({
        subject: 'CO544',
        description: 'Lab 1: Supervised Learning Report',
        isLocked: false,
        lockReason: '',
        source: 'feels',
      });
      expect(tasks[0].deadline).toContain('9/25/2026 11:59 PM');

      // Task 2: Locked activity with "Not available unless:"
      expect(tasks[1]).toMatchObject({
        subject: 'CO544',
        description: 'Assignment 2: Neural Networks',
        isLocked: true,
        source: 'feels',
      });
      expect(tasks[1].lockReason).toContain('The activity Lab 1 Pre-Quiz is marked complete');
      expect(tasks[1].deadline).toContain('9/27/2026 8:00 PM');

      // Task 3: Locked with lock icon
      expect(tasks[2]).toMatchObject({
        subject: 'CO544',
        description: 'Quiz 1: Classification',
        isLocked: true,
        source: 'feels',
      });
      expect(tasks[2].lockReason).toContain('Score 80% or higher in Practice Quiz');
      expect(tasks[2].deadline).toContain('9/28/2026 10:00 AM');
    });

    test('captures deadlines using "Closes:", "Due date:", and "Available until:" keywords', () => {
      const variedKeywordsHtml = `
        <html>
          <body>
            <h1>CO322: Data Structures</h1>
            <div class="activity-item">
              <span class="instancename">Quiz 2: Trees</span>
              <div class="activity-dates">
                <strong>Closes:</strong> Monday, 28 September 2026, 11:00 PM
              </div>
            </div>
            <div class="activity-item">
              <span class="instancename">Project Proposal</span>
              <div class="activity-dates">
                Due date: Tuesday, 29 September 2026, 5:00 PM
              </div>
            </div>
            <div class="activity-item">
              <span class="instancename">Bonus Quiz</span>
              <div class="activity-dates">
                Available until: Wednesday, 30 September 2026, 8:00 PM
              </div>
            </div>
          </body>
        </html>
      `;

      const tasks = parseCoursePageHtml(variedKeywordsHtml);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].description).toBe('Quiz 2: Trees');
      expect(tasks[0].deadline).toContain('9/28/2026 11:00 PM');
      expect(tasks[1].description).toBe('Project Proposal');
      expect(tasks[1].deadline).toContain('9/29/2026 5:00 PM');
      expect(tasks[2].description).toBe('Bonus Quiz');
      expect(tasks[2].deadline).toContain('9/30/2026 8:00 PM');
    });

    test('falls back to default subject if no course code is found in HTML', () => {
      const noSubjectHtml = `
        <html><body>
          <h1>Just a Random Course Name</h1>
          <div class="activity-item">
            <span class="instancename">Mystery Assignment</span>
            <div class="activity-dates">Due: Friday, 25 September 2026, 11:59 PM</div>
          </div>
        </body></html>
      `;
      const tasks = parseCoursePageHtml(noSubjectHtml, 'General');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].subject).toBe('General'); // Should use the fallback
    });
  });

  describe('parseAllCoursePages', () => {
    const course1Html = `
      <html>
        <body>
          <h1>CO544: Machine Learning</h1>
          <div class="activity-item">
            <span class="instancename">Assignment 1: Regression</span>
            <div class="activity-dates">Due: Friday, 25 September 2026, 11:59 PM</div>
          </div>
        </body>
      </html>
    `;

    const course2Html = `
      <html>
        <body>
          <h1>EE380: Control Systems</h1>
          <div class="activity-item">
            <span class="instancename">Lab 2: Root Locus</span>
            <div class="activity-dates">Due: Saturday, 26 September 2026, 5:00 PM</div>
            <div class="availabilityinfo isrestricted">
              Not available unless: Lab 1 submitted
            </div>
          </div>
        </body>
      </html>
    `;

    test('iterates through course pages array and returns flattened task list', () => {
      const coursePages = [
        { id: '701', url: 'https://feels.pdn.ac.lk/course/view.php?id=701', html: course1Html },
        { id: '702', url: 'https://feels.pdn.ac.lk/course/view.php?id=702', html: course2Html },
      ];

      const tasks = parseAllCoursePages(coursePages);

      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toMatchObject({
        subject: 'CO544',
        description: 'Assignment 1: Regression',
        isLocked: false,
        source: 'feels',
      });
      expect(tasks[1]).toMatchObject({
        subject: 'EE380',
        description: 'Lab 2: Root Locus',
        isLocked: true,
        lockReason: 'Lab 1 submitted',
        source: 'feels',
      });
    });

    test('handles empty or invalid inputs gracefully', () => {
      expect(parseAllCoursePages([])).toEqual([]);
      expect(parseAllCoursePages(null)).toEqual([]);
      expect(parseAllCoursePages(undefined)).toEqual([]);
      expect(parseAllCoursePages([{ html: '' }])).toEqual([]);
    });

    test('ignores failed network fetches with empty HTML', () => {
      const mixedCoursePages = [
        { id: '701', url: 'https://feels.pdn.ac.lk...', html: '<html><body><div class="activity-item"><span class="instancename">Valid Task</span><div class="activity-dates">Due: Today 5:00 PM</div></div></body></html>' },
        { id: '702', url: 'https://feels.pdn.ac.lk...', html: '', success: false, error: 'Timeout' }, // Failed fetch
        { id: '703', url: 'https://feels.pdn.ac.lk...', html: null } // Malformed payload
      ];

      const tasks = parseAllCoursePages(mixedCoursePages);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe('Valid Task');
    });
  });

  describe('Perusall LTI activity link and course metadata detection', () => {
    const courseWithPerusallHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1 class="page-header-headings">CO544 Machine Learning</h1>
          <ul class="section">
            <li class="activity lti modtype_lti" id="module-555">
              <div class="activity-item">
                <div class="activityname">
                  <a class="aalink" href="https://feels.pdn.ac.lk/mod/lti/view.php?id=555">
                    <span class="instancename">Perusall Course Readings E-Book</span>
                  </a>
                </div>
              </div>
            </li>
            <li class="activity assign modtype_assign" id="module-101">
              <div class="activity-item">
                <span class="instancename">Assignment 1</span>
                <div class="activity-dates">Due: Today 11:59 PM</div>
              </div>
            </li>
          </ul>
        </body>
      </html>
    `;

    const courseWithRelativeLtiHtml = `
      <div>
        <h1>EE380 Control Systems</h1>
        <div class="activity-item">
          <a href="/mod/lti/view.php?id=888">Reading Assignment Chapter 4 (Perusall)</a>
        </div>
      </div>
    `;

    const courseWithoutPerusallHtml = `
      <div>
        <h1>CO322 Data Structures</h1>
        <div class="activity-item">
          <a href="/mod/lti/view.php?id=999">MATLAB Grader Online Tool</a>
        </div>
      </div>
    `;

    test('extractPerusallLtiUrl extracts full URL from Perusall LTI activities', () => {
      const url1 = extractPerusallLtiUrl(courseWithPerusallHtml);
      expect(url1).toBe('https://feels.pdn.ac.lk/mod/lti/view.php?id=555');

      const url2 = extractPerusallLtiUrl(courseWithRelativeLtiHtml);
      expect(url2).toBe('https://feels.pdn.ac.lk/mod/lti/view.php?id=888');
    });

    test('extractPerusallLtiUrl returns null if LTI activity is unrelated to Perusall or Reading', () => {
      const url = extractPerusallLtiUrl(courseWithoutPerusallHtml);
      expect(url).toBeNull();
    });

    test('extractCourseMetadata appends perusallLtiUrl property to course metadata', () => {
      const metadata = extractCourseMetadata(courseWithPerusallHtml);
      expect(metadata).toEqual({
        subject: 'CO544',
        title: 'CO544 Machine Learning',
        perusallLtiUrl: 'https://feels.pdn.ac.lk/mod/lti/view.php?id=555',
      });
    });

    test('parseCoursePageWithMetadata returns metadata with perusallLtiUrl and parsed tasks', () => {
      const result = parseCoursePageWithMetadata(courseWithPerusallHtml);
      expect(result.metadata.perusallLtiUrl).toBe('https://feels.pdn.ac.lk/mod/lti/view.php?id=555');
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].description).toBe('Assignment 1');
    });
  });
});

