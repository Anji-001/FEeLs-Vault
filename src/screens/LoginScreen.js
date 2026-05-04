import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, Animated } from 'react-native';
import * as Keychain from 'react-native-keychain';

const LoginScreen = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // ✨ NEW: Toggle for viewing password ✨
  const [showPassword, setShowPassword] = useState(false);
  
  // ✨ NEW: Subtle animation state for button press ✨
  const scaleAnim = new Animated.Value(1);

  const handleLogin = async () => {
    if (!username || !password) {
      alert('Please enter both username and password.');
      return;
    }

    try {
      // Button press animation
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true })
      ]).start();

      await Keychain.setGenericPassword(username, password);
      onLoginSuccess();
    } catch (error) {
      console.log("Keychain couldn't be accessed!", error);
      alert('Failed to save credentials securely.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* KeyboardAvoidingView keeps the inputs from being hidden by the keyboard */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          
          {/* ✨ HERO SECTION ✨ */}
          <View style={styles.heroContainer}>
            <View style={styles.iconCircle}>
              <Text style={styles.heroIcon}>🔐</Text>
            </View>
            <Text style={styles.title}>FEeLS Vault</Text>
            <Text style={styles.subtitle}>Link your university account to extract deadlines automatically.</Text>
          </View>

          {/* ✨ FORM SECTION ✨ */}
          <View style={styles.formContainer}>
            
            {/* Username Input */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.input}
                placeholder="E-Number (e.g., e21xxx)"
                placeholderTextColor="#9ca3af"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="FEeLS Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              
              {/* Show/Hide Toggle */}
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ✨ ACTION SECTION ✨ */}
          <View style={styles.actionContainer}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
                <Text style={styles.loginBtnText}>Secure & Connect</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Security Badge */}
            <View style={styles.securityBadge}>
              <Text style={styles.securityIcon}>🛡️</Text>
              <Text style={styles.securityText}>Credentials are encrypted and never leave your device.</Text>
            </View>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8f9fa' },
  container: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 30, alignItems: 'center', width: '100%', maxWidth: 500, alignSelf: 'center' },
  
  // Hero
  heroContainer: { alignItems: 'center', marginBottom: 40 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  heroIcon: { fontSize: 40 },
  title: { fontSize: 32, fontWeight: '900', color: '#111827', marginBottom: 10, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },

  // Form
  formContainer: { width: '100%', marginBottom: 30 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, marginBottom: 15, paddingHorizontal: 15, height: 60, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  inputIcon: { fontSize: 20, marginRight: 10, color: '#9ca3af' },
  input: { flex: 1, fontSize: 16, color: '#111827', height: '100%' },
  eyeBtn: { padding: 10 },
  eyeIcon: { fontSize: 18, color: '#6b7280' },

  // Action
  actionContainer: { width: '100%', alignItems: 'center' },
  loginBtn: { backgroundColor: '#111827', width: 250, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  loginBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  
  // Security Badge
  securityBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 25, backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12 },
  securityIcon: { fontSize: 16, marginRight: 8 },
  securityText: { fontSize: 12, color: '#6b7280', flexShrink: 1, fontWeight: '500' }
});

export default LoginScreen;