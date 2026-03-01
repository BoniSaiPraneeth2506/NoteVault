import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../theme/ThemeContext';
import { getAppPin, setAppPin, getFakePin, addSecurityLog } from '../storage/database';

export default function PinScreen({ route, navigation }) {
  const [ready, setReady] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef(null);
  const { theme, loaded, biometricEnabled } = useTheme();
  const t = theme;
  const [camPermission, requestCamPermission] = useCameraPermissions();

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      const existingPin = await getAppPin();
      setIsSetup(!existingPin);
      // Request camera permission for intruder detection
      requestCamPermission();
      // Check biometric availability
      if (existingPin && biometricEnabled) {
        try {
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          setBiometricAvailable(compatible && enrolled);
        } catch (_) {}
      }
      // Branding visible before showing keypad
      setTimeout(() => {
        setReady(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }, 2500);
    })();
  }, [loaded, biometricEnabled]);

  const handleBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock NoteVault',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (result.success) {
        await addSecurityLog('biometric_unlock', 'Biometric authentication successful');
        navigation.replace('Home');
      }
    } catch (err) {
      console.error('Biometric error:', err);
    }
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleKeyPress = async (num) => {
    if (pin.length >= 4) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = pin + num;
    setPin(newPin);
    if (newPin.length === 4) {
      if (isSetup) {
        await setAppPin(newPin);
        navigation.replace('Home');
      } else {
        const realPin = await getAppPin();
        const fakePin = await getFakePin();
        if (newPin === realPin) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await addSecurityLog('pin_unlock', 'Successful PIN unlock');
          navigation.replace('Home');
        } else if (fakePin && newPin === fakePin) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await addSecurityLog('fake_pin_unlock', 'Fake PIN used');
          navigation.replace('Home', { isFakeMode: true });
        } else {
          setFailCount(f => f + 1);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          await addSecurityLog('failed_attempt', `Failed PIN attempt #${failCount + 1}`);
          setErrorMsg(failCount >= 2 ? 'Too many failed attempts' : 'Incorrect PIN, try again');
          triggerShake();
          setPin('');
          setTimeout(() => setErrorMsg(''), 2000);
          // Silently capture intruder selfie
          try {
            if (cameraRef.current) {
              const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, skipProcessing: true });
              const dir = FileSystem.documentDirectory + 'intruder/';
              const dirInfo = await FileSystem.getInfoAsync(dir);
              if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
              const destUri = dir + `intruder_${Date.now()}.jpg`;
              await FileSystem.copyAsync({ from: photo.uri, to: destUri });
              await addSecurityLog('intruder_selfie', destUri);
            }
          } catch (_) {}
        }
      }
    }
  };

  const handleDelete = () => { Haptics.selectionAsync(); setPin(pin.slice(0, -1)); };

  // ── Loading / branding screen ──
  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor: t.background }]}>
        <View style={[styles.splashIconWrap, { backgroundColor: t.primaryLight }]}>
          <Feather name="shield" size={38} color={t.primary} />
        </View>
        <Text style={[styles.splashTitle, { color: t.primary }]}>NoteVault</Text>
        <Text style={[styles.splashSubtitle, { color: t.textMuted }]}>Private · Secure · Offline</Text>
      </View>
    );
  }

  // ── PIN entry screen ──
  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      {/* Hidden front camera for intruder selfie */}
      <CameraView
        ref={cameraRef}
        facing="front"
        style={{ width: 1, height: 1, position: 'absolute', top: 0, left: 0, opacity: 0 }}
      />
      <Animated.View style={[styles.pinContent, { opacity: fadeAnim }]}>
        <View style={[styles.iconWrap, { backgroundColor: t.primaryLight }]}>
          <Feather name="shield" size={30} color={t.primary} />
        </View>
        <Text style={[styles.title, { color: t.textPrimary }]}>
          {isSetup ? 'Create a PIN' : 'Welcome Back'}
        </Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          {isSetup ? 'Choose a 4-digit PIN to secure your vault' : 'Enter your PIN to unlock'}
        </Text>

        {/* Dots */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: pin.length > i ? (errorMsg ? t.danger : t.primary) : t.border },
                pin.length > i && { transform: [{ scale: 1.1 }] },
              ]}
            />
          ))}
        </Animated.View>

        {/* Error message */}
        {errorMsg ? (
          <Text style={[styles.errorText, { color: t.danger }]}>{errorMsg}</Text>
        ) : (
          <View style={styles.errorPlaceholder} />
        )}

        {/* Keypad */}
        <View style={styles.keypad}>
          {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, ri) => (
            <View key={`row-${ri}`} style={styles.keyRow}>
              {row.map((key, ki) => {
                const uniqueKey = `${ri}-${ki}`;
                if (key === '') {
                  if (biometricAvailable && !isSetup) {
                    return (
                      <TouchableOpacity key={uniqueKey} style={styles.key} onPress={handleBiometric} activeOpacity={0.6}>
                        <Feather name="smartphone" size={22} color={t.primary} />
                      </TouchableOpacity>
                    );
                  }
                  return <View key={uniqueKey} style={styles.key} />;
                }
                if (key === 'del') {
                  return (
                    <TouchableOpacity key={uniqueKey} style={styles.key} onPress={handleDelete} activeOpacity={0.6}>
                      <Feather name="delete" size={22} color={t.textSecondary} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={uniqueKey}
                    style={[styles.key, { backgroundColor: t.background }]}
                    onPress={() => handleKeyPress(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.keyText, { color: t.textPrimary }]}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {biometricAvailable && !isSetup && (
          <Text style={[styles.biometricHint, { color: t.textMuted }]}>Tap fingerprint icon to use biometrics</Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Splash / branding styles
  splashIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  splashTitle: { fontSize: 32, fontWeight: '800', letterSpacing: 1 },
  splashSubtitle: { fontSize: 14, marginTop: 8 },
  // PIN entry styles
  pinContent: { alignItems: 'center', width: '100%' },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 36, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', marginBottom: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 10 },
  errorText: { fontSize: 13, fontWeight: '600', marginBottom: 28, textAlign: 'center' },
  errorPlaceholder: { height: 19, marginBottom: 28 },
  keypad: { width: '100%', maxWidth: 280 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  key: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 26, fontWeight: '600' },
  biometricHint: { fontSize: 12, marginTop: 8 },
});
