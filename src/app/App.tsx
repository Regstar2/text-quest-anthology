import React from 'react';
import {StatusBar, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {APP_CONFIG} from '../config/appConfig';
import {UI_STRINGS} from '../config/uiStrings';

export function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <View style={styles.content}>
          <Text style={[styles.title, isDarkMode && styles.textDark]}>
            {UI_STRINGS.bootstrapTitle}
          </Text>
          <Text style={[styles.status, isDarkMode && styles.textMutedDark]}>
            {UI_STRINGS.bootstrapStatus}
          </Text>
          <Text style={[styles.version, isDarkMode && styles.textMutedDark]}>
            v{APP_CONFIG.versionName}
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeAreaDark: {
    backgroundColor: '#111111',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#111111',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  status: {
    color: '#4b5563',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  version: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
  },
  textDark: {
    color: '#f9fafb',
  },
  textMutedDark: {
    color: '#d1d5db',
  },
});
