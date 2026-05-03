// src/screens/HomeScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { extractDeadlines, formatForClipboard } from '../utils/parser';

const HomeScreen = () => {
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('');

  const handleProcessDeadlines = () => {
    if (!inputText) {
      Alert.alert("Hold up", "Please paste some calendar text first!");
      return;
    }

    // 1. Extract the raw text into an array
    const parsedData = extractDeadlines(inputText);
    
    // 2. Format it into our nice message
    const finalMessage = formatForClipboard(parsedData);

    // 3. Copy to device clipboard
    Clipboard.setString(finalMessage);
    
    setStatus('✅ Deadlines copied to clipboard!');
    
    // Clear the status message after 3 seconds
    setTimeout(() => setStatus(''), 3000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FEeLS Deadline Importer</Text>
      
      <TextInput
        style={styles.input}
        multiline
        placeholder="Paste your calendar text here..."
        value={inputText}
        onChangeText={setInputText}
      />

      <Button title="Extract & Copy" onPress={handleProcessDeadlines} color="#0066cc" />
      
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    height: 200,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    backgroundColor: '#fff',
    textAlignVertical: 'top', 
  },
  status: {
    marginTop: 20,
    textAlign: 'center',
    color: 'green',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

export default HomeScreen;