import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  useColorScheme,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {APP_CONFIG} from '../config/appConfig';
import {UI_STRINGS} from '../config/uiStrings';
import type {InkRuntimeSnapshot} from '../narrative/InkStoryRuntime';
import {
  StorySession,
  type StorySessionRecovery,
} from '../narrative/StorySession';
import {storyLoader} from '../narrative/StoryLoader';
import {storySaveRepository} from '../persistence/NativeStorySaveStorage';

const DEFAULT_STORY = storyLoader.listMetadata()[0];

if (!DEFAULT_STORY) {
  throw new Error('STORY_NOT_FOUND: Generated story manifest is empty.');
}

const DEFAULT_STORY_PACKAGE = storyLoader.load(DEFAULT_STORY.id);

export function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const sessionRef = useRef<StorySession | null>(null);
  const [snapshot, setSnapshot] = useState<InkRuntimeSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    let active = true;

    void StorySession.open(DEFAULT_STORY_PACKAGE, storySaveRepository)
      .then(result => {
        if (!active) {
          return;
        }

        sessionRef.current = result.session;
        setSnapshot(result.snapshot);
        setNotice(recoveryMessage(result.recovery));
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setNotice(UI_STRINGS.startupFailed);
        setIsLoading(false);
      });

    return () => {
      active = false;
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'inactive' && nextState !== 'background') {
        return;
      }

      const session = sessionRef.current;

      if (!session) {
        return;
      }

      void session.flush().then(persisted => {
        if (!persisted) {
          setNotice(UI_STRINGS.saveFailed);
        }
      });
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  const choose = async (choiceIndex: number) => {
    const session = sessionRef.current;

    if (!session || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      const result = await session.choose(choiceIndex);
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      setIsMutating(false);
    }
  };

  const restart = async () => {
    const session = sessionRef.current;

    if (!session || isMutating) {
      return;
    }

    setIsMutating(true);

    try {
      const result = await session.restart();
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      setIsMutating(false);
    }
  };

  const requestRestart = () => {
    Alert.alert(UI_STRINGS.restart, UI_STRINGS.restartConfirmation, [
      {text: UI_STRINGS.cancel, style: 'cancel'},
      {
        text: UI_STRINGS.restart,
        style: 'destructive',
        onPress: () => {
          void restart();
        },
      },
    ]);
  };

  const isBusy = isLoading || isMutating;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <View style={styles.content}>
          <Text style={[styles.title, isDarkMode && styles.textDark]}>
            {DEFAULT_STORY.title}
          </Text>
          <Text style={[styles.status, isDarkMode && styles.textMutedDark]}>
            {UI_STRINGS.prototypeStatus} · v{APP_CONFIG.versionName}
          </Text>

          {notice ? (
            <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>
              {notice}
            </Text>
          ) : null}

          <View style={[styles.storyCard, isDarkMode && styles.storyCardDark]}>
            <Text style={[styles.storyText, isDarkMode && styles.textDark]}>
              {snapshot?.text ??
                (isLoading ? UI_STRINGS.loadingStory : UI_STRINGS.startupFailed)}
            </Text>
          </View>

          {snapshot?.choices.map(choice => (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              key={choice.index}
              onPress={() => {
                void choose(choice.index);
              }}
              style={({pressed}) => [
                styles.choice,
                isDarkMode && styles.choiceDark,
                pressed && styles.choicePressed,
                isBusy && styles.disabled,
              ]}>
              <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
                {choice.text}
              </Text>
            </Pressable>
          ))}

          {snapshot?.isEnded ? (
            <View style={styles.endingBlock}>
              <Text style={[styles.ending, isDarkMode && styles.textDark]}>
                {UI_STRINGS.endingLabel}: {snapshot.endingId ?? 'unknown'}
              </Text>
            </View>
          ) : null}

          {snapshot ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={requestRestart}
              style={({pressed}) => [
                styles.restart,
                isDarkMode && styles.choiceDark,
                pressed && styles.choicePressed,
                isBusy && styles.disabled,
              ]}>
              <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
                {UI_STRINGS.restart}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function recoveryMessage(recovery: StorySessionRecovery | null): string | null {
  switch (recovery) {
    case 'corrupted-save-reset':
      return UI_STRINGS.corruptedSaveReset;
    case 'incompatible-save-reset':
      return UI_STRINGS.incompatibleSaveReset;
    case 'storage-unavailable':
      return UI_STRINGS.storageUnavailable;
    case null:
      return null;
  }
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
  notice: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
  },
  noticeDark: {
    color: '#fcd34d',
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
  disabled: {
    opacity: 0.5,
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
