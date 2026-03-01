import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, useColorScheme, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDark } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Accelerometer } from 'expo-sensors';

import Constants from 'expo-constants';
import { preventScreenCaptureAsync } from 'expo-screen-capture';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initDatabase, updateStreak } from './src/storage/database';

// Only initialise notifications in real builds — Expo Go removed Android push support in SDK 53
const isExpoGo = Constants.appOwnership === 'expo';
let Notifications = null;
if (!isExpoGo) {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}



import PinScreen from './src/screens/PinScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddEditNoteScreen from './src/screens/AddEditNoteScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TrashScreen from './src/screens/TrashScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ route }) {
  const isFakeMode = route.params?.isFakeMode || false;
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route: tabRoute }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = { HomeTab: 'file-text', TrashTab: 'trash-2', SettingsTab: 'settings' };
          const iconName = icons[tabRoute.name] || 'circle';
          if (focused) {
            return (
              <View style={[styles.activeTab, { backgroundColor: theme.primaryLight }]}>
                <Feather name={iconName} size={22} color={color} />
              </View>
            );
          }
          return <Feather name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          elevation: 0,
          shadowOpacity: 0,
          height: 100,
          paddingBottom: Platform.OS === 'ios' ? 36 : 34,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 3,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 0,
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        initialParams={{ isFakeMode }}
        options={{ title: 'Notes' }}
      />
      <Tab.Screen
        name="TrashTab"
        component={TrashScreen}
        options={{ title: 'Trash' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { theme, isDark, autoLockSeconds, shakeToLock } = useTheme();
  const navRef = useRef(null);
  const bgTimestamp = useRef(null);

  // Auto-lock on return from background
  useEffect(() => {
    if (!autoLockSeconds) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        bgTimestamp.current = Date.now();
      } else if (state === 'active' && bgTimestamp.current) {
        const elapsed = (Date.now() - bgTimestamp.current) / 1000;
        if (elapsed >= autoLockSeconds && navRef.current) {
          navRef.current.reset({ index: 0, routes: [{ name: 'Pin' }] });
        }
        bgTimestamp.current = null;
      }
    });
    return () => sub.remove();
  }, [autoLockSeconds]);

  // Shake to lock
  useEffect(() => {
    if (!shakeToLock) return;
    let lastShake = 0;
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (magnitude > 2.5 && now - lastShake > 2000) {
        lastShake = now;
        if (navRef.current) {
          navRef.current.reset({ index: 0, routes: [{ name: 'Pin' }] });
        }
      }
    });
    Accelerometer.setUpdateInterval(300);
    return () => sub.remove();
  }, [shakeToLock]);

  const navTheme = {
    ...(isDark ? NavDark : DefaultTheme),
    colors: {
      ...(isDark ? NavDark : DefaultTheme).colors,
      background: theme.background,
      card: theme.surface,
      text: theme.textPrimary,
      border: theme.border,
      primary: theme.primary,
    },
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.background} />
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <NavigationContainer theme={navTheme} ref={navRef}>
          <Stack.Navigator
            initialRouteName="Pin"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
              animation: 'fade',
              animationDuration: 150,
            }}
          >
            <Stack.Screen name="Pin" component={PinScreen} options={{ animation: 'none' }} />
            <Stack.Screen name="Home" component={MainTabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="AddEditNote" component={AddEditNoteScreen} options={{ gestureEnabled: true, animation: 'slide_from_right', animationDuration: 250 }} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await updateStreak(); // track daily usage streak
        if (Notifications) await Notifications.requestPermissionsAsync();
        await preventScreenCaptureAsync();
      } catch (e) {
        console.error('App init error:', e);
      }
      setIsReady(true);
    })();
  }, []);

  // Use system color scheme for the initial loading screen to avoid white flash
  const systemScheme = useColorScheme();
  const loadingBg = systemScheme === 'dark' ? '#0F172A' : '#F1F5F9';
  const loadingAccent = systemScheme === 'dark' ? '#818CF8' : '#4F46E5';

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: loadingBg }}>
        <ActivityIndicator size="large" color={loadingAccent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: loadingBg }}>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  activeTab: {
    width: 40,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
