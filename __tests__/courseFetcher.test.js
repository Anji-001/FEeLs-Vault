import {
  extractAvailableSemestersFromHtml,
  extractCourseUrlsFromHtml,
  fetchCoursePages,
  getCourseScraperScript,
} from '../src/utils/courseFetcher';

describe('courseFetcher', () => {
  const mockDashboardHtml = `
    <div>
      <div class="block">
        <h3>Courses by Semester</h3>
        <div class="accordion">
          <div class="card">
            <div class="card-header">
              <a data-toggle="collapse" href="#collapse-sem-sep-2026">
                Semesters commenced in September 2026
              </a>
            </div>
            <div id="collapse-sem-sep-2026" class="collapse show">
              <a href="https://feels.pdn.ac.lk/course/view.php?id=701">CO544 Machine Learning</a>
              <a href="https://feels.pdn.ac.lk/course/view.php?id=702">CO543 Image Processing</a>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <a data-toggle="collapse" href="#collapse-sem-mar-2026">
                Semesters commenced in March 2026
              </a>
            </div>
            <div id="collapse-sem-mar-2026" class="collapse">
              <a href="https://feels.pdn.ac.lk/course/view.php?id=601">CO321 Embedded Systems</a>
              <a href="https://feels.pdn.ac.lk/course/view.php?id=602">CO322 Data Structures</a>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <a data-toggle="collapse" href="#collapse-sem-sep-2025">
                Semesters commenced in September 2025
              </a>
            </div>
            <div id="collapse-sem-sep-2025" class="collapse">
              <a href="https://feels.pdn.ac.lk/course/view.php?id=501">CO221 Logic Design</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  test('extractAvailableSemestersFromHtml extracts array of available semester block titles and container selectors/IDs', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const semesters = extractAvailableSemestersFromHtml(mockDashboardHtml);

    expect(semesters).toHaveLength(3);
    expect(semesters[0]).toEqual({
      id: 'collapse-sem-sep-2026',
      title: 'Semesters commenced in September 2026',
      selector: '#collapse-sem-sep-2026',
    });
    expect(semesters[1]).toEqual({
      id: 'collapse-sem-mar-2026',
      title: 'Semesters commenced in March 2026',
      selector: '#collapse-sem-mar-2026',
    });
    expect(semesters[2]).toEqual({
      id: 'collapse-sem-sep-2025',
      title: 'Semesters commenced in September 2025',
      selector: '#collapse-sem-sep-2025',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('EXTRACTED AVAILABLE SEMESTER LIST')
    );

    consoleLogSpy.mockRestore();
  });

  test('extractCourseUrlsFromHtml extracts courses strictly from the selected semester container', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // 1. Select September 2026
    const sepCourses = extractCourseUrlsFromHtml(mockDashboardHtml, 'collapse-sem-sep-2026');
    expect(sepCourses).toEqual([
      { id: '701', url: 'https://feels.pdn.ac.lk/course/view.php?id=701' },
      { id: '702', url: 'https://feels.pdn.ac.lk/course/view.php?id=702' },
    ]);

    // 2. Select March 2026
    const marCourses = extractCourseUrlsFromHtml(mockDashboardHtml, 'Semesters commenced in March 2026');
    expect(marCourses).toEqual([
      { id: '601', url: 'https://feels.pdn.ac.lk/course/view.php?id=601' },
      { id: '602', url: 'https://feels.pdn.ac.lk/course/view.php?id=602' },
    ]);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Final filtered course count')
    );

    consoleLogSpy.mockRestore();
  });

  test('fetchCoursePages iterates asynchronously through courses', async () => {
    const mockCourses = [
      { id: '101', url: 'https://feels.pdn.ac.lk/course/view.php?id=101' },
      { id: '102', url: 'https://feels.pdn.ac.lk/course/view.php?id=102' },
    ];

    const mockHtmlResponses = {
      'https://feels.pdn.ac.lk/course/view.php?id=101': '<html><body><h1>CO544 Course Page</h1></body></html>',
      'https://feels.pdn.ac.lk/course/view.php?id=102': '<html><body><h1>CO322 Course Page</h1></body></html>',
    };

    global.fetch = jest.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtmlResponses[url] || ''),
      })
    );

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const results = await fetchCoursePages(mockCourses);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);

    consoleLogSpy.mockRestore();
  });

  test('getCourseScraperScript embeds selected semester and extracts semester list', () => {
    const scriptWithParam = getCourseScraperScript('collapse-sem-sep-2026');
    expect(typeof scriptWithParam).toBe('string');
    expect(scriptWithParam).toContain('collapse-sem-sep-2026');
    expect(scriptWithParam).toContain('extractAvailableSemestersFromDOM');
    expect(scriptWithParam).toContain('FINAL FILTERED COURSE COUNT');
    expect(scriptWithParam).toContain('block-fcl__rubric');
    expect(scriptWithParam).toContain('aria-controls');
    expect(scriptWithParam).toContain('nextElementSibling');
    expect(scriptWithParam).toContain('fetchHTMLViaIframe');

    const scriptNoParam = getCourseScraperScript();
    expect(scriptNoParam).toContain('SEMESTERS_DISCOVERED');
  });

  test('fetchCoursePages handles network errors and timeouts gracefully', async () => {
    const mockCourses = [
      { id: '101', url: 'https://feels.pdn.ac.lk/course/view.php?id=101' },
      { id: '102', url: 'https://feels.pdn.ac.lk/course/view.php?id=102' },
    ];

    global.fetch = jest.fn((url) => {
      if (url.includes('101')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });
      }
      return Promise.reject(new Error('Network connection failed'));
    });

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const results = await fetchCoursePages(mockCourses, 500);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('HTTP 500');
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('Network connection failed');

    consoleLogSpy.mockRestore();
  });
});
