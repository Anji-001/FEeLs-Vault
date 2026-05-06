import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Keychain from 'react-native-keychain';
import BootSplash from 'react-native-bootsplash';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const Stack = createStackNavigator();

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isNavReady, setIsNavReady] = useState(false);
  const [isSplashHidden, setIsSplashHidden] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.log("Keychain couldn't be accessed!", error);
      } finally {
        setIsAppReady(true);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAppReady || !isNavReady || isSplashHidden) {
      return;
    }

    const hideSplash = async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      try {
        await BootSplash.hide({ fade: true });
      } catch (error) {
        console.log("BootSplash couldn't be hidden!", error);
      } finally {
        setIsSplashHidden(true);
      }
    };

    hideSplash();
  }, [isAppReady, isNavReady, isSplashHidden]);

  const handleLoginSuccess = () => setIsAuthenticated(true);
  
  const handleLogout = async () => {
    await Keychain.resetGenericPassword();
    setIsAuthenticated(false);
  };

  if (!isAppReady) return null;

  return (
    <NavigationContainer onReady={() => setIsNavReady(true)}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Dashboard">
            {(props) => <DashboardScreen {...props} onLogout={handleLogout} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;