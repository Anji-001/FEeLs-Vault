import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Button } from 'react-native';
import WebView from 'react-native-webview';
import * as Keychain from 'react-native-keychain';
import Clipboard from '@react-native-clipboard/clipboard';

const DashboardScreen = ({ onLogout }) => {
  const webviewRef = useRef(null);
  const [credentials, setCredentials] = useState(null);
  const [status, setStatus] = useState('Unlocking vault...');
  const [deadlines, setDeadlines] = useState([]);

  // 1. Grab the credentials from the hardware vault on load
  useEffect(() => {
    const loadVault = async () => {
      const creds = await Keychain.getGenericPassword();
      if (creds) {
        setCredentials(creds);
        setStatus('Connecting to FEeLS...');
      } else {
        onLogout(); // Failsafe: if no creds, send back to login
      }
    };
    loadVault();
  }, []);

  // 2. A much smarter login script that hunts for different types of inputs
  const getAutoLoginScript = () => `
    setTimeout(function() {
      // Look for standard IDs, but fallback to general input names if IDs fail
      var userField = document.getElementById('username') || document.querySelector('input[name="username"]');
      var passField = document.getElementById('password') || document.querySelector('input[name="password"]');
      var loginBtn = document.getElementById('loginbtn') || document.querySelector('button[type="submit"]') || document.querySelector('[type="submit"]');
      
      if (userField && passField && loginBtn) {
        userField.value = '${credentials.username}';
        passField.value = '${credentials.password}';
        loginBtn.click();
      } else {
        // If it still can't find them, tell our React Native app so it doesn't hang!
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'HTML elements not found on login page.' }));
      }
    }, 1000); // Increased delay slightly to let the university network load
    true;
  `;

  // 3. The script that scrapes the calendar page
  const scrapeCalendarScript = `
    setTimeout(function() {
      try {
        // Moodle usually wraps events in elements with 'event' or 'calendar_event' classes
        var events = document.querySelectorAll('.event, .calendar_event_course'); 
        var results = [];
        
        events.forEach(function(evt) {
          results.push(evt.innerText.replace(/\\n/g, ' ').trim());
        });

        // Send the array back to React Native
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPED_DATA', data: results }));
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    }, 1500); // Give the calendar time to load
    true;
  `;

  // 4. Act as the Traffic Controller
  // 4. Act as the Traffic Controller
  const handleNavigation = (navState) => {
    const url = navState.url;
    console.log("Ghost Browser is currently at:", url); // Prints to your Metro terminal!

    // Wait for the page to finish loading before injecting the script
    if (navState.loading) {
      return; 
    }

    if (url.includes('login/index.php')) {
      setStatus('Logging in automatically...');
      webviewRef.current.injectJavaScript(getAutoLoginScript());
    } 
    // This is the updated condition! 
    // It catches the exact URL you saw, plus a few other common homepage variations.
    else if (
        url.includes('my/') || 
        url.includes('dashboard') || 
        url === 'https://feels.pdn.ac.lk/' || 
        url === 'https://feels.pdn.ac.lk/?' || 
        url.includes('?redirect=')
    ) {
      setStatus('Success! Routing to calendar...');
      webviewRef.current.injectJavaScript(`window.location.href = 'https://feels.pdn.ac.lk/calendar/view.php?view=upcoming';`);
    }
    else if (url.includes('calendar/view.php')) {
      setStatus('Scanning for deadlines...');
      webviewRef.current.injectJavaScript(scrapeCalendarScript);
    }
  };

  // 5. Receive the data from the hidden website
  const handleMessage = (event) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      
      if (parsed.type === 'SCRAPED_DATA') {
        const data = parsed.data;
        if (data.length > 0) {
          setDeadlines(data);
          setStatus('✅ Deadlines Extracted!');
          
          // Format and copy to clipboard automatically
          const clipboardText = "🚨 Upcoming FEeLS Deadlines:\\n\\n" + data.map(d => "📌 " + d).join('\\n\\n');
          Clipboard.setString(clipboardText);
          Alert.alert("Success", "Deadlines copied to your clipboard!");
        } else {
          setStatus('No upcoming deadlines found.');
        }
      }
    } catch (e) {
      console.log("Error parsing message from webview", e);
    }
  };

  if (!credentials) return <ActivityIndicator style={{ flex: 1 }} size="large" />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FEeLS Dashboard</Text>
      
      {/* Status Bar */}
      <View style={styles.statusBox}>
        {status.includes('✅') || status.includes('No upcoming') ? null : <ActivityIndicator color="#0066cc" />}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      {/* Results Display */}
      <View style={styles.resultsBox}>
        {deadlines.length > 0 ? (
          deadlines.map((item, index) => (
            <Text key={index} style={styles.deadlineItem}>📌 {item}</Text>
          ))
        ) : (
          <Text style={styles.placeholderText}>Waiting for data...</Text>
        )}
      </View>

      <Button title="Logout & Clear Vault" onPress={onLogout} color="#ff3b30" />

      {/* THE GHOST BROWSER - Still visible for one last test! */}
      <View style={{ flex: 1, borderColor: 'red', borderWidth: 2, marginTop: 10 }}>
        <WebView
          ref={webviewRef}
          // MAGIC FIX 1: Start directly at the target URL!
          source={{ uri: 'https://feels.pdn.ac.lk/calendar/view.php?view=upcoming' }}
          onNavigationStateChange={handleNavigation}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          // MAGIC FIX 2: Force Android and iOS to share and save cookies better
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  statusBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f2ff', padding: 15, borderRadius: 8, marginBottom: 20 },
  statusText: { marginLeft: 10, fontSize: 16, color: '#004080', fontWeight: '600' },
  resultsBox: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#ddd' },
  deadlineItem: { fontSize: 15, marginBottom: 15, lineHeight: 22, color: '#444' },
  placeholderText: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }
});

export default DashboardScreen;