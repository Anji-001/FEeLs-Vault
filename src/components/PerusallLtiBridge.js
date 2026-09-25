import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';
import { formatCookieHeader } from '../utils/perusallFetcher';
import { DESKTOP_UA } from '../constants/perusallConstants';

/**
 * Strategy:
 *
 * Moodle's mod/lti/view.php does NOT show a standalone launch form when the user is
 * already authenticated. Instead it embeds the Perusall tool inside an <iframe>.
 * Because onNavigationStateChange only fires for the MAIN frame, that iframe
 * navigation is invisible to us by default.
 *
 * Fix:
 *  1. After the Moodle page loads, inject JS that searches for:
 *       a) A Perusall <iframe> — extract its src and navigate the main frame there.
 *       b) A traditional LTI <form> — strip its target and submit it (fallback for
 *          Moodle installs that still show the "Continue to external tool" screen).
 *  2. Once the main frame lands on app.perusall.com, wait SETTLE_DELAY_MS for the
 *     SPA session to stabilise, then capture cookies via CookieManager.
 *
 * All WebView-side messages are relayed via postMessage so they appear in RN logs
 * under the "[PerusallLtiBridge WebView]" tag.
 */

// ─── Injected script — comprehensive LTI interception ────────────────────────
//
// Moodle loads the LTI iframe DYNAMICALLY via AMD/RequireJS JavaScript AFTER the
// page renders, so polling the DOM at load time always finds 0 iframes.
// This script uses three complementary strategies:
//
//   1. window.open() intercept  — Moodle may call window.open() to launch the
//      tool in a new tab; the Android WebView silently drops that call. We redirect
//      it to the main frame instead.
//
//   2. HTMLFormElement.prototype.submit intercept — If Moodle auto-submits an LTI
//      form with target="_blank" or target="perusall_window", we strip the target
//      attribute first so the POST stays inside this WebView.
//
//   3. MutationObserver — watches the live DOM for any iframe injected after load.
//      Falls back to a 2-second poll for safety.
//
const INJECTED_LTI_SCRIPT = `
  (function() {
    function rlog(msg) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LTI_LOG', msg: msg })); } catch(_) {}
    }

    rlog('LTI bridge v4 | host: ' + location.host + ' | title: ' + document.title);

    // Guard: only run the LTI interception logic on relevant domains.
    // Perusall can redirect to support.perusall.com if it rejects the browser;
    // without this guard the script would try to navigate to HubSpot embeds etc.
    var isFeels = location.hostname.indexOf('feels.pdn.ac.lk') !== -1;
    var isAppPerusall = location.hostname === 'app.perusall.com';
    var isMoodleLaunch = location.pathname.indexOf('/mod/lti/') !== -1;
    if (!isFeels && !isAppPerusall && !isMoodleLaunch) {
      rlog('Wrong domain (' + location.hostname + ') — installing window.open intercept only, skipping DOM scan.');
      // Still intercept window.open in case this page redirects to Perusall
      var origOpenGuard = window.open;
      window.open = function(url, t, f) {
        rlog('window.open on ' + location.hostname + ': ' + url);
        return origOpenGuard ? origOpenGuard.call(window, url, t, f) : null;
      };
      return true; // exit the IIFE early
    }

    var done = false;
    function navigateTo(url) {
      if (done) return;
      done = true;
      rlog('Navigating main frame to: ' + url);
      observer.disconnect();
      clearInterval(pollInterval);
      window.location.href = url;
    }

    // An iframe src is LTI-related only if the hostname is app.perusall.com,
    // OR it is Moodle's own LTI launch/service path.
    // Do NOT match subdomains like perusall-9386255.hs-sites.com (HubSpot widgets).
    function isLtiSrc(src) {
      if (!src) return false;
      try {
        var u = new URL(src);
        return u.hostname === 'app.perusall.com' ||
               /\/mod\/lti\/(launch|service)/i.test(u.pathname);
      } catch(e) { return false; }
    }

    function checkIframes() {
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var src = iframes[i].src || iframes[i].getAttribute('src') || '';
        if (src) rlog('iframe[' + i + '] src: ' + src);
        if (isLtiSrc(src)) { navigateTo(src); return true; }
      }
      return false;
    }

    // ── 1. Intercept window.open ──────────────────────────────────────────────
    var origOpen = window.open;
    window.open = function(url, target, features) {
      rlog('window.open intercepted: ' + url);
      try {
        var wu = new URL(url);
        if (wu.hostname === 'app.perusall.com' || /\/mod\/lti\//i.test(wu.pathname)) {
          navigateTo(url);
          return null;
        }
      } catch(e) {}
      return origOpen ? origOpen.call(window, url, target, features) : null;
    };

    // ── 2. Intercept HTMLFormElement.prototype.submit ─────────────────────────
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
      rlog('form.submit intercepted | action: ' + this.action + ' | target: ' + (this.target || 'none'));
      // Strip any target that would open outside this WebView
      if (this.target && this.target !== '_self') {
        rlog('Stripping target: ' + this.target);
        this.removeAttribute('target');
      }
      origSubmit.call(this);
    };

    // ── 3. Check existing DOM ─────────────────────────────────────────────────
    if (checkIframes()) return;

    // Also check for traditional LTI forms already in the DOM
    var selectors = ['form[action*="perusall"]', '#ltiLaunchForm', 'form[id*="lti"]', 'form[name*="lti"]', 'form[action*="lti"]'];
    for (var s = 0; s < selectors.length; s++) {
      var form = document.querySelector(selectors[s]);
      if (form) {
        rlog('Existing LTI form | selector: ' + selectors[s] + ' | action: ' + form.action);
        form.removeAttribute('target');
        form.submit();
        return;
      }
    }

    // ── 4. MutationObserver — watch for dynamically injected iframes ──────────
    var observer = new MutationObserver(function(mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var nodes = mutations[m].addedNodes;
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (!node || node.nodeType !== 1) continue;
          var candidates = node.tagName === 'IFRAME' ? [node] : (node.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll('iframe')) : []);
          for (var ci = 0; ci < candidates.length; ci++) {
            var src = candidates[ci].src || candidates[ci].getAttribute('src') || '';
            if (src) rlog('Observer: iframe src = ' + src);
            if (isLtiSrc(src)) { navigateTo(src); return; }
          }
          // Also catch dynamically created forms
          var forms = node.tagName === 'FORM' ? [node] : (node.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll('form[action*="lti"], form[action*="perusall"]')) : []);
          for (var fi = 0; fi < forms.length; fi++) {
            rlog('Observer: LTI form action = ' + forms[fi].action);
            forms[fi].removeAttribute('target');
            forms[fi].submit();
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // ── 5. Periodic poll as safety net ───────────────────────────────────────
    var pollCount = 0;
    var pollInterval = setInterval(function() {
      pollCount++;
      var iframeCount = document.querySelectorAll('iframe').length;
      rlog('Poll ' + pollCount + ' | iframes: ' + iframeCount + ' | forms: ' + document.querySelectorAll('form').length);
      if (checkIframes()) {
        clearInterval(pollInterval);
        observer.disconnect();
      } else if (pollCount >= 8) {
        clearInterval(pollInterval);
        observer.disconnect();

        // ── Last resort: extract Moodle sesskey → navigate to launch.php ─────
        // mod/lti/launch.php outputs a raw standalone LTI form with no AMD/YUI
        // dependencies, so it reliably works in any headless WebView.
        var sesskey = null;
        try { sesskey = window.M && window.M.cfg && window.M.cfg.sesskey; } catch(e) {}
        if (!sesskey) {
          var mSk = document.querySelector('meta[name="sesskey"]');
          if (mSk) sesskey = mSk.getAttribute('content');
        }
        if (!sesskey) {
          var fSk = document.querySelector('input[name="sesskey"]');
          if (fSk) sesskey = fSk.value;
        }
        var idMatch = location.search.match(/[?&]id=(\\d+)/);
        var activityId = idMatch ? idMatch[1] : null;
        rlog('TIMEOUT | sesskey: ' + (sesskey ? '✓ found' : 'NOT FOUND') + ' | activityId: ' + activityId);

        if (sesskey && activityId) {
          var launchUrl = location.origin + '/mod/lti/launch.php?id=' + activityId + '&sesskey=' + sesskey;
          rlog('Navigating to launch.php directly: ' + launchUrl);
          navigateTo(launchUrl);
        } else {
          rlog('Cannot use launch.php fallback | body snippet: ' + document.body.innerHTML.substring(0, 800));
        }
      }
    }, 2000);

    rlog('MutationObserver + poll active. Waiting for Moodle AMD module to inject LTI content...');
  })();
  true;
`;

const SETTLE_DELAY_MS = 2500;

/**
 * Headless WebView component for transparent Moodle-to-Perusall LTI authentication.
 *
 * @param {Object} props
 * @param {string} props.url - Moodle LTI URL (e.g. https://feels.pdn.ac.lk/mod/lti/view.php?id=...)
 * @param {Function} props.onAuthSuccess - Callback triggered after cookie extraction
 * @param {Function} [props.onError] - Optional callback triggered on WebView error
 */
const PerusallLtiBridge = ({ url, onAuthSuccess, onError }) => {
  const isAuthenticatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const webviewRef = useRef(null);

  // Track mount state to prevent async callbacks from firing after unmount (crash guard)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Relay WebView-side postMessage logs into RN logs
  const handleMessage = useCallback((event) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type === 'LTI_LOG') {
        console.log('[PerusallLtiBridge WebView]', payload.msg);
      }
    } catch (_) {
      // Ignore non-LTI messages from the Perusall SPA itself
    }
  }, []);

  const handleNavigationStateChange = useCallback(async (navState) => {
    if (!navState || !navState.url) return;

    console.log(`[PerusallLtiBridge Trace] Navigating to: ${navState.url}`);

    // Detect when Perusall's browser-check rejected our UA and redirected to the
    // support site. Surface this as an error so it can be diagnosed.
    if (navState.url.includes('support.perusall.com')) {
      console.warn('[PerusallLtiBridge] Perusall rejected the browser UA and redirected to support site. Check DESKTOP_UA version.');
      if (typeof onError === 'function') {
        onError({ description: 'Perusall browser check failed — redirected to support.perusall.com. UA may be outdated.' });
      }
      return;
    }

    const isPerusallLanded =
      navState.url.includes('app.perusall.com') &&
      !navState.url.includes('lti/launch') &&
      // Only filter the user-facing login page, NOT the LTI handshake endpoint.
      // lti-1.1/sign-in is Perusall's OAuth handshake — after completing it,
      // Perusall sets fresh session cookies and redirects to the course.
      // If we filter it out AND Perusall serves the course from that same URL,
      // cookies would never be captured.
      !navState.url.match(/app\.perusall\.com\/(login|sign-in)($|[?#])/);


    if (!isPerusallLanded) return;
    if (navState.loading) return;
    if (isAuthenticatingRef.current) return;

    isAuthenticatingRef.current = true;

    const parsedUrl = new URL(navState.url);
    const dynamicBaseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    console.log(
      `[PerusallLtiBridge] Landed on Perusall: ${dynamicBaseUrl}. ` +
      `Waiting ${SETTLE_DELAY_MS}ms for SPA session bootstrap before reading cookies...`
    );

    setTimeout(async () => {
      // Guard: component may have unmounted during the delay
      if (!isMountedRef.current) {
        console.log('[PerusallLtiBridge] Component unmounted before cookie capture — aborting.');
        return;
      }

      try {
        const cookies = await CookieManager.get(dynamicBaseUrl);
        console.log('[PerusallLtiBridge] Extracted Cookie Keys:', Object.keys(cookies || {}));

        await AsyncStorage.setItem('@perusall_base_url', dynamicBaseUrl);
        const cookieHeader = formatCookieHeader(cookies);

        if (cookieHeader) {
          await AsyncStorage.setItem('@perusall_cookies', cookieHeader);
          await AsyncStorage.removeItem('@perusall_auth_expired');
          console.log('[PerusallLtiBridge] Persisted fresh cookies to AsyncStorage.');
        } else {
          console.warn('[PerusallLtiBridge] CookieManager returned empty cookies for', dynamicBaseUrl);
          await AsyncStorage.setItem(
            '@perusall_cookies',
            typeof cookies === 'string' ? cookies : JSON.stringify(cookies || {})
          );
        }

        if (isMountedRef.current && typeof onAuthSuccess === 'function') {
          onAuthSuccess(cookies, navState);
        }
      } catch (err) {
        console.warn('[PerusallLtiBridge] Error extracting/persisting cookies:', err?.message || err);
        // Reset guard so the bridge can retry on a subsequent Perusall navigation
        isAuthenticatingRef.current = false;
        if (isMountedRef.current && typeof onAuthSuccess === 'function') {
          onAuthSuccess(null, navState);
        }
      }
    }, SETTLE_DELAY_MS);
  }, [onAuthSuccess]);

  const handleError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('[PerusallLtiBridge] WebView error during LTI launch:', nativeEvent);
    if (typeof onError === 'function') {
      onError(nativeEvent);
    }
  }, [onError]);

  if (!url) return null;

  return (
    <View style={styles.hiddenContainer} pointerEvents="none" testID="perusall-lti-bridge-container">
      <WebView
        ref={webviewRef}
        testID="perusall-lti-webview"
        source={{ uri: url }}
        style={styles.hiddenContainer}
        userAgent={DESKTOP_UA}
        injectedJavaScript={INJECTED_LTI_SCRIPT}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        onError={handleError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    // Use real dimensions so Moodle's AMD JavaScript can query clientWidth/clientHeight.
    // A 0×0 WebView causes layout-dependent JS (like Moodle's mod_lti/tool_launch AMD
    // module) to silently abort before injecting any LTI iframe or form.
    // opacity:0 + left:-9999 keeps it completely invisible to the user.
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 375,
    height: 600,
    opacity: 0,
  },
});

export default PerusallLtiBridge;
