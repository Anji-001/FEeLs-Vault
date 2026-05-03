import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Button, Modal, TextInput, TouchableOpacity } from 'react-native';
import WebView from 'react-native-webview';
import * as Keychain from 'react-native-keychain';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseDeadlineString } from '../utils/parser';

// The default templates
const DEFAULT_HEADER = "*🚨 UPCOMING DEADLINES:*";
const DEFAULT_ITEM = "*[{subject}]* _{desc}_\n⏳ *Due:* {date}\n⏱️ *Left:* {left}";

const DashboardScreen = ({ onLogout }) => {
  const webviewRef = useRef(null);
  const [credentials, setCredentials] = useState(null);
  const [status, setStatus] = useState('Unlocking vault...');
  const [deadlines, setDeadlines] = useState([]);

  // Template State
  const [showSettings, setShowSettings] = useState(false);
  const [headerTemplate, setHeaderTemplate] = useState(DEFAULT_HEADER);
  const [itemTemplate, setItemTemplate] = useState(DEFAULT_ITEM);

  useEffect(() => {
    const loadData = async () => {
      const creds = await Keychain.getGenericPassword();
      if (creds) {
        setCredentials(creds);
        setStatus('Connecting to FEeLS...');
      } else {
        onLogout();
      }

      const savedHeader = await AsyncStorage.getItem('@header_template');
      const savedItem = await AsyncStorage.getItem('@item_template');
      if (savedHeader) setHeaderTemplate(savedHeader);
      if (savedItem) setItemTemplate(savedItem);
    };
    loadData();
  }, []);

  const saveTemplates = async () => {
    await AsyncStorage.setItem('@header_template', headerTemplate);
    await AsyncStorage.setItem('@item_template', itemTemplate);
    setShowSettings(false);
    Alert.alert("Saved!", "Your custom format has been saved.");
  };

  // ✨ THE NEW MANUAL COPY FUNCTION ✨
  const handleManualCopy = () => {
    if (deadlines.length === 0) {
      Alert.alert("Nothing to copy", "Wait for the deadlines to load first!");
      return;
    }

    const formattedItems = deadlines.map(d => {
      return itemTemplate
        .replace(/{subject}/g, d.subject)
        .replace(/{desc}/g, d.description)
        .replace(/{date}/g, d.deadline)
        .replace(/{left}/g, d.remaining);
    });

    const clipboardText = `${headerTemplate}\n\n${formattedItems.join('\n\n〰️〰️〰️〰️〰️〰️〰️〰️〰️\n\n')}`;
      
    Clipboard.setString(clipboardText);
    Alert.alert("Copied!", "Your deadlines are ready to paste.");
  };

  const getAutoLoginScript = () => `
    setTimeout(function() {
      var userField = document.getElementById('username') || document.querySelector('input[name="username"]');
      var passField = document.getElementById('password') || document.querySelector('input[name="password"]');
      var loginBtn = document.getElementById('loginbtn') || document.querySelector('button[type="submit"]') || document.querySelector('[type="submit"]');
      
      if (userField && passField && loginBtn) {
        userField.value = '${credentials.username}';
        passField.value = '${credentials.password}';
        loginBtn.click();
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: 'HTML elements not found.' }));
      }
    }, 1000);
    true;
  `;

  const scrapeCalendarScript = `
    setTimeout(function() {
      try {
        var events = document.querySelectorAll('.event, .calendar_event_course'); 
        var results = [];
        
        events.forEach(function(evt) {
          if (evt.parentElement && evt.parentElement.closest('.event, .calendar_event_course')) return;
          var rawText = evt.innerText.replace(/\\n/g, ' ').trim();
          if (rawText && !results.includes(rawText)) results.push(rawText);
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPED_DATA', data: results }));
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    }, 1500); 
    true;
  `;

  const handleNavigation = (navState) => {
    const url = navState.url;
    if (navState.loading) return; 

    if (url.includes('login/index.php')) {
      setStatus('Logging in automatically...');
      webviewRef.current.injectJavaScript(getAutoLoginScript());
    } 
    else if (url.includes('my/') || url.includes('dashboard') || url === 'https://feels.pdn.ac.lk/' || url === 'https://feels.pdn.ac.lk/?' || url.includes('?redirect=')) {
      setStatus('Success! Routing to calendar...');
      webviewRef.current.injectJavaScript(`window.location.href = 'https://feels.pdn.ac.lk/calendar/view.php?view=upcoming';`);
    }
    else if (url.includes('calendar/view.php')) {
      setStatus('Scanning for deadlines...');
      webviewRef.current.injectJavaScript(scrapeCalendarScript);
    }
  };

  const handleMessage = (event) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      
      if (parsed.type === 'SCRAPED_DATA') {
        const rawArray = parsed.data;
        if (rawArray.length > 0) {
          
          const structuredData = rawArray
            .map(item => parseDeadlineString(item))
            .filter(item => !item.description.toLowerCase().includes('quiz'));
          
          if (structuredData.length > 0) {
            setDeadlines(structuredData);
            setStatus('✅ Deadlines Extracted!');
            
            // We still auto-copy on the first successful load!
            const formattedItems = structuredData.map(d => {
              return itemTemplate
                .replace(/{subject}/g, d.subject)
                .replace(/{desc}/g, d.description)
                .replace(/{date}/g, d.deadline)
                .replace(/{left}/g, d.remaining);
            });

            const clipboardText = `${headerTemplate}\n\n${formattedItems.join('\n\n〰️〰️〰️〰️〰️〰️〰️〰️〰️\n\n')}`;
            Clipboard.setString(clipboardText);
            
          } else {
            setDeadlines([]);
            setStatus('No actionable deadlines found.');
          }
        } else {
          setStatus('No upcoming deadlines found.');
        }
      }
    } catch (e) {
      console.log("Error parsing message", e);
    }
  };

  if (!credentials) return <ActivityIndicator style={{ flex: 1 }} size="large" />;

  return (
    <View style={styles.container}>
      {/* ✨ UPDATED HEADER ROW ✨ */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>FEeLS</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={handleManualCopy} style={[styles.settingsBtn, styles.copyBtn]}>
            <Text style={[styles.settingsBtnText, styles.copyBtnText]}>📋 Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙️ Format</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.statusBox}>
        {status.includes('✅') || status.includes('No actionable') || status.includes('No upcoming') ? null : <ActivityIndicator color="#0066cc" />}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.resultsBox}>
        {deadlines.length > 0 ? (
          deadlines.map((item, index) => (
            <View key={index} style={styles.card}>
              <Text style={styles.cardSubject}>{item.subject}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.cardTime}>Due: {item.deadline}</Text>
              <Text style={styles.cardLeft}>Left: {item.remaining}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.placeholderText}>Waiting for data...</Text>
        )}
      </View>

      <Button title="Logout & Clear Vault" onPress={onLogout} color="#ff3b30" />

      {/* THE FORMATTING MODAL */}
      <Modal visible={showSettings} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Customize Output</Text>
            <Text style={styles.modalSubtitle}>Use tags: {"{subject}, {desc}, {date}, {left}"}</Text>
            
            <Text style={styles.inputLabel}>Header Text:</Text>
            <TextInput 
              style={styles.input} 
              value={headerTemplate} 
              onChangeText={setHeaderTemplate} 
            />

            <Text style={styles.inputLabel}>Item Format:</Text>
            <TextInput 
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
              multiline={true}
              value={itemTemplate} 
              onChangeText={setItemTemplate} 
            />

            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setShowSettings(false)} color="#999" />
              <Button title="Save Format" onPress={saveTemplates} color="#0066cc" />
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ width: 0, height: 0, opacity: 0 }}>
        <WebView
          ref={webviewRef}
          source={{ uri: 'https://feels.pdn.ac.lk/calendar/view.php?view=upcoming' }}
          onNavigationStateChange={handleNavigation}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333' },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  settingsBtn: { backgroundColor: '#ddd', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 },
  settingsBtnText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  copyBtn: { backgroundColor: '#cce5ff' }, // Light blue to make the copy button pop
  copyBtnText: { color: '#004080' },
  statusBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f2ff', padding: 15, borderRadius: 8, marginBottom: 20 },
  statusText: { marginLeft: 10, fontSize: 16, color: '#004080', fontWeight: '600' },
  resultsBox: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#ddd' },
  placeholderText: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  card: { marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10 },
  cardSubject: { fontSize: 16, fontWeight: 'bold', color: '#004080' },
  cardDesc: { fontSize: 15, color: '#333', marginTop: 2 },
  cardTime: { fontSize: 14, color: '#d9534f', marginTop: 2 },
  cardLeft: { fontSize: 14, color: '#5cb85c', marginTop: 2, fontWeight: '600' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 10, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  modalSubtitle: { fontSize: 12, color: '#666', marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 15, fontSize: 14, color: '#333' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }
});

export default DashboardScreen;