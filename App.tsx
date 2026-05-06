import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import * as Keychain from 'react-native-keychain';
import BootSplash from 'react-native-bootsplash';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const App = () => {
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSplashHidden, setIsSplashHidden] = useState(false);

  useEffect(() => {
    const checkVault = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          setHasCredentials(true);
        }
      } catch (error) {
        console.log("Keychain couldn't be accessed!", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkVault();
  }, []);

  const onRootLayout = useCallback(async () => {
    if (isLoading || isSplashHidden) {
      return;
    }

    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    try {
      await BootSplash.hide({ fade: true });
      setIsSplashHidden(true);
    } catch (error) {
      console.log("BootSplash couldn't be hidden!", error);
    }
  }, [isLoading, isSplashHidden]);

  const clearVault = async () => {
    await Keychain.resetGenericPassword();
    setHasCredentials(false);
  };

  if (isLoading) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root} onLayout={onRootLayout}>
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
