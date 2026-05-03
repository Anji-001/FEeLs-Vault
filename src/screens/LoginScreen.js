import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as Keychain from 'react-native-keychain';

const LoginScreen = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveCredentials = async () => {
    if (!username || !password) {
      Alert.alert('Hold up', 'Please enter both your FEeLS username and password.');
      return;
    }

    setIsSaving(true);

    try {
      // This encrypts and locks your password in the Android Keystore
      await Keychain.setGenericPassword(username, password);
      
      // Tell the main app that we are good to go!
      onLoginSuccess();
    } catch (error) {
      Alert.alert('Error', 'Could not secure your credentials. Try again.');
      console.error("Keychain error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link Your FEeLS Account</Text>
      <Text style={styles.subtitle}>
        Your credentials are encrypted and stored securely on your device.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="FEeLS Username (e.g., e21xxx)"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry // Hides the password dots
      />

      {isSaving ? (
        <ActivityIndicator size="large" color="#0066cc" />
      ) : (
        <Button title="Securely Save & Connect" onPress={handleSaveCredentials} color="#0066cc" />
      )}
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
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
});

export default LoginScreen;