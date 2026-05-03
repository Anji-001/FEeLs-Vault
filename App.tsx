import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, ActivityIndicator } from 'react-native';
import * as Keychain from 'react-native-keychain';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const App = () => {
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkVault = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          setHasCredentials(true);
        }
      } catch (error) {
        console.log("Keychain couldn't be accessed!", error);
      }
      setIsLoading(false);
    };
    checkVault();
  }, []);

  const clearVault = async () => {
    await Keychain.resetGenericPassword();
    setHasCredentials(false);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 10 }}>Checking secure vault...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {!hasCredentials ? (
        <LoginScreen onLoginSuccess={() => setHasCredentials(true)} />
      ) : (
        <DashboardScreen onLogout={clearVault} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;