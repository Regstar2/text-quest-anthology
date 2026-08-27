import React, {useRef, useState} from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {APP_CONFIG} from '../config/appConfig';
import {UI_STRINGS} from '../config/uiStrings';
import {
  InkStoryRuntime,
  type InkRuntimeSnapshot,
  type InkStoryContent,
} from '../narrative/InkStoryRuntime';
import syntheticStory from '../stories/generated/synthetic.json';

const COMPILED_STORY = syntheticStory as InkStoryContent;

export function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const runtimeRef = useRef<InkStoryRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<InkRuntimeSnapshot>(() =>
    createSession(runtimeRef),
  );

  const choose = (choiceIndex: number) => {
    const runtime = runtimeRef.current;

    if (!runtime) {
      return;
    }

    setSnapshot(runtime.choose(choiceIndex));
  };

  const restart = () => {
    setSnapshot(createSession(runtimeRef));
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <View style={styles.content}>
          <Text style={[styles.title, isDarkMode && styles.textDark]}>
            {UI_STRINGS.prototypeTitle}
          </Text>
          <Text style={[styles.status, isDarkMode && styles.textMutedDark]}>
            {UI_STRINGS.prototypeStatus} · v{APP_CONFIG.versionName}
          </Text>

          <View style={[styles.storyCard, isDarkMode && styles.storyCardDark]}>
            <Text style={[styles.storyText, isDarkMode && styles.textDark]}>
              {snapshot.text}
            </Text>
          </View>

          {snapshot.choices.map(choice => (
            <Pressable
              accessibilityRole="button"
              key={choice.index}
              onPress={() => choose(choice.index)}
              style={({pressed}) => [
                styles.choice,
                isDarkMode && styles.choiceDark,
                pressed && styles.choicePressed,
              ]}>
              <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
                {choice.text}
              </Text>
            </Pressable>
          ))}

          {snapshot.isEnded ? (
            <View style={styles.endingBlock}>
              <Text style={[styles.ending, isDarkMode && styles.textDark]}>
                {UI_STRINGS.endingLabel}: {snapshot.endingId ?? 'unknown'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={restart}
                style={({pressed}) => [
                  styles.restart,
                  isDarkMode && styles.choiceDark,
                  pressed && styles.choicePressed,
                ]}>
                <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
                  {UI_STRINGS.restart}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function createSession(
  runtimeRef: React.MutableRefObject<InkStoryRuntime | null>,
): InkRuntimeSnapshot {
  const runtime = new InkStoryRuntime(COMPILED_STORY);
  runtimeRef.current = runtime;
  return runtime.continueToChoiceOrEnd();
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
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  storyCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    marginTop: 28,
    padding: 18,
  },
  storyCardDark: {
    backgroundColor: '#1f2937',
  },
  storyText: {
    color: '#111111',
    fontSize: 18,
    lineHeight: 26,
  },
  choice: {
    borderColor: '#9ca3af',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  choiceDark: {
    borderColor: '#6b7280',
  },
  choicePressed: {
    opacity: 0.65,
  },
  choiceText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  endingBlock: {
    marginTop: 22,
  },
  ending: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  restart: {
    borderColor: '#9ca3af',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textDark: {
    color: '#f9fafb',
  },
  textMutedDark: {
    color: '#d1d5db',
  },
});
