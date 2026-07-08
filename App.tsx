import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as Keychain from 'react-native-keychain';
import BootSplash from 'react-native-bootsplash';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ToDoScreen from './src/screens/ToDoScreen';

const Stack = createNativeStackNavigator();

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

  if (!hasCredentials) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root} onLayout={onRootLayout}>
          <LoginScreen onLoginSuccess={() => setHasCredentials(true)} />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root} onLayout={onRootLayout}>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Dashboard">
              {(props) => (
                <DashboardScreen {...props} onLogout={clearVault} />
              )}
            </Stack.Screen>
            <Stack.Screen name="ToDo" component={ToDoScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
