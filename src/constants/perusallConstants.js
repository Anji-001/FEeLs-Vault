// Shared constants so the WebView's spoofed User-Agent and the fetch() calls
// in perusallFetcher.js can never drift apart. Import DESKTOP_UA in both files.

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
