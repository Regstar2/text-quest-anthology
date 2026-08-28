import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  useColorScheme,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {adsProvider} from '../ads';
import {APP_CONFIG} from '../config/appConfig';
import {UI_STRINGS} from '../config/uiStrings';
import {
  StorySession,
  type StoryReaderSnapshot,
  type StorySessionRecovery,
} from '../narrative/StorySession';
import {storyLoader} from '../narrative/StoryLoader';
import {storySaveRepository} from '../persistence/NativeStorySaveStorage';

const DEFAULT_STORY = storyLoader.listMetadata()[0];
const AdsBanner = adsProvider.Banner;

type AppScreen = 'start' | 'reader' | 'ending';

if (!DEFAULT_STORY) {
  throw new Error('STORY_NOT_FOUND: Generated story manifest is empty.');
}

const DEFAULT_STORY_PACKAGE = storyLoader.load(DEFAULT_STORY.id);

export function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const sessionRef = useRef<StorySession | null>(null);
  const mutationLockRef = useRef(false);
  const hasStartedSessionRef = useRef(false);
  const [screen, setScreen] = useState<AppScreen>('start');
  const [snapshot, setSnapshot] = useState<StoryReaderSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [hasStartedSession, setHasStartedSession] = useState(false);

  const beginMutation = (): boolean => {
    if (mutationLockRef.current) {
      return false;
    }

    mutationLockRef.current = true;
    setIsMutating(true);
    return true;
  };

  const endMutation = (): void => {
    mutationLockRef.current = false;
    setIsMutating(false);
  };

  const exitStory = useCallback(() => {
    if (mutationLockRef.current) {
      return;
    }

    setScreen('start');

    const session = sessionRef.current;
    if (!session || !hasStartedSessionRef.current) {
      return;
    }

    void session.flush().then(persisted => {
      if (!persisted) {
        setNotice(UI_STRINGS.saveFailed);
      }
    });
  }, []);

  useEffect(() => {
    void adsProvider.initialize();
  }, []);

  useEffect(() => {
    let active = true;

    void StorySession.open(DEFAULT_STORY_PACKAGE, storySaveRepository)
      .then(result => {
        if (!active) {
          return;
        }

        sessionRef.current = result.session;
        hasStartedSessionRef.current = result.resumed;
        setSnapshot(result.snapshot);
        setHasStartedSession(result.resumed);
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
      if (nextState === 'active') {
        void adsProvider.preloadInterstitial();
        return;
      }

      if (nextState !== 'inactive' && nextState !== 'background') {
        return;
      }

      const session = sessionRef.current;

      if (!session || !hasStartedSessionRef.current) {
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen === 'start') {
          return false;
        }

        if (mutationLockRef.current) {
          return true;
        }

        exitStory();
        return true;
      },
    );

    return () => subscription.remove();
  }, [exitStory, screen]);

  const enterStory = async () => {
    const session = sessionRef.current;

    if (!session || !snapshot || isLoading || !beginMutation()) {
      return;
    }

    try {
      if (!hasStartedSessionRef.current) {
        const persisted = await session.flush();
        hasStartedSessionRef.current = true;
        setHasStartedSession(true);
        setNotice(persisted ? null : UI_STRINGS.saveFailed);
      }

      setScreen(snapshot.isEnded ? 'ending' : 'reader');
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const choose = async (choiceIndex: number) => {
    const session = sessionRef.current;

    if (!session || !beginMutation()) {
      return;
    }

    try {
      const result = await session.choose(choiceIndex);
      hasStartedSessionRef.current = true;
      setHasStartedSession(true);
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
      setScreen(result.snapshot.isEnded ? 'ending' : 'reader');
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const restart = async (showEndingAd: boolean) => {
    const session = sessionRef.current;

    if (!session || !beginMutation()) {
      return;
    }

    try {
      if (showEndingAd) {
        try {
          await adsProvider.showInterstitial('story-ending-restart');
        } catch {
          // Advertising is optional and must never block the narrative reset.
        }
      }

      const result = await session.restart();
      hasStartedSessionRef.current = true;
      setHasStartedSession(true);
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
      setScreen('reader');
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const requestRestart = () => {
    if (mutationLockRef.current) {
      return;
    }

    const showEndingAd = screen === 'ending' && snapshot?.isEnded === true;

    Alert.alert(UI_STRINGS.restart, UI_STRINGS.restartConfirmation, [
      {text: UI_STRINGS.cancel, style: 'cancel'},
      {
        text: UI_STRINGS.restart,
        style: 'destructive',
        onPress: () => {
          void restart(showEndingAd);
        },
      },
    ]);
  };

  const isBusy = isLoading || isMutating;
  let startActionLabel: string = UI_STRINGS.startStory;

  if (hasStartedSession) {
    startActionLabel = UI_STRINGS.continueStory;
  }

  if (snapshot?.isEnded) {
    startActionLabel = UI_STRINGS.viewEnding;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <AdsBanner isDarkMode={isDarkMode} />

        {screen === 'start' ? (
          <ScrollView
            contentContainerStyle={styles.startContent}
            style={styles.screen}>
            <Text style={[styles.title, isDarkMode && styles.textDark]}>
              {DEFAULT_STORY.title}
            </Text>
            <Text style={[styles.status, isDarkMode && styles.textMutedDark]}>
              {UI_STRINGS.prototypeStatus} · v{APP_CONFIG.versionName}
            </Text>
            <Text style={[styles.description, isDarkMode && styles.textMutedDark]}>
              {DEFAULT_STORY.description}
            </Text>

            {notice ? (
              <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>
                {notice}
              </Text>
            ) : null}

            {isLoading ? (
              <Text style={[styles.loading, isDarkMode && styles.textDark]}>
                {UI_STRINGS.loadingStory}
              </Text>
            ) : null}

            {snapshot ? (
              <View style={styles.startActions}>
                <Pressable
                  accessibilityLabel={startActionLabel}
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => {
                    void enterStory();
                  }}
                  style={({pressed}) => [
                    styles.primaryButton,
                    isDarkMode && styles.primaryButtonDark,
                    pressed && styles.buttonPressed,
                    isBusy && styles.disabled,
                  ]}>
                  <Text
                    style={[
                      styles.primaryButtonText,
                      isDarkMode && styles.primaryButtonTextDark,
                    ]}>
                    {startActionLabel}
                  </Text>
                </Pressable>

                {hasStartedSession ? (
                  <Pressable
                    accessibilityLabel={UI_STRINGS.restart}
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={requestRestart}
                    style={({pressed}) => [
                      styles.secondaryButton,
                      isDarkMode && styles.secondaryButtonDark,
                      pressed && styles.buttonPressed,
                      isBusy && styles.disabled,
                    ]}>
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        isDarkMode && styles.textDark,
                      ]}>
                      {UI_STRINGS.restart}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {screen === 'reader' && snapshot ? (
          <View style={styles.screen}>
            <View style={[styles.readerHeader, isDarkMode && styles.headerDark]}>
              <Pressable
                accessibilityLabel={UI_STRINGS.returnToStart}
                accessibilityRole="button"
                disabled={isBusy}
                hitSlop={8}
                onPress={exitStory}
                style={({pressed}) => [
                  styles.headerAction,
                  pressed && styles.buttonPressed,
                  isBusy && styles.disabled,
                ]}>
                <Text style={[styles.headerActionText, isDarkMode && styles.textDark]}>
                  ← {UI_STRINGS.returnToStart}
                </Text>
              </Pressable>
              <Text style={[styles.readerTitle, isDarkMode && styles.textDark]}>
                {DEFAULT_STORY.title}
              </Text>
            </View>

            {notice ? (
              <Text
                style={[
                  styles.readerNotice,
                  isDarkMode && styles.noticeDark,
                ]}>
                {notice}
              </Text>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.readerContent}
              style={styles.readerScroll}>
              <View
                accessibilityLabel="Текст истории"
                style={[styles.storySurface, isDarkMode && styles.storySurfaceDark]}>
                {snapshot.passages.map((passage, index) => (
                  <Text
                    key={`${index}-${passage.slice(0, 24)}`}
                    style={[
                      styles.storyPassage,
                      index > 0 && styles.storyPassageSpacing,
                      isDarkMode && styles.textDark,
                    ]}>
                    {passage}
                  </Text>
                ))}
              </View>

              {snapshot.choices.length > 0 ? (
                <View
                  accessibilityLabel={UI_STRINGS.choicesLabel}
                  style={styles.choicesZone}>
                  <Text
                    style={[
                      styles.sectionLabel,
                      isDarkMode && styles.textMutedDark,
                    ]}>
                    {UI_STRINGS.choicesLabel}
                  </Text>
                  {snapshot.choices.map(choice => (
                    <Pressable
                      accessibilityLabel={choice.text}
                      accessibilityRole="button"
                      disabled={isBusy}
                      key={choice.index}
                      onPress={() => {
                        void choose(choice.index);
                      }}
                      style={({pressed}) => [
                        styles.choice,
                        isDarkMode && styles.choiceDark,
                        pressed && styles.buttonPressed,
                        isBusy && styles.disabled,
                      ]}>
                      <Text
                        style={[styles.choiceText, isDarkMode && styles.textDark]}>
                        {choice.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable
                accessibilityLabel={UI_STRINGS.restart}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={requestRestart}
                style={({pressed}) => [
                  styles.readerRestart,
                  pressed && styles.buttonPressed,
                  isBusy && styles.disabled,
                ]}>
                <Text
                  style={[
                    styles.readerRestartText,
                    isDarkMode && styles.textMutedDark,
                  ]}>
                  {UI_STRINGS.restart}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}

        {screen === 'ending' && snapshot ? (
          <ScrollView
            contentContainerStyle={styles.endingContent}
            style={styles.screen}>
            <Text style={[styles.endingEyebrow, isDarkMode && styles.textMutedDark]}>
              {UI_STRINGS.endingLabel}
            </Text>
            <Text style={[styles.endingId, isDarkMode && styles.textDark]}>
              {snapshot.endingId ?? 'unknown'}
            </Text>
            <Text style={[styles.finalTextLabel, isDarkMode && styles.textMutedDark]}>
              {UI_STRINGS.finalTextLabel}
            </Text>
            <View style={[styles.storySurface, isDarkMode && styles.storySurfaceDark]}>
              <Text style={[styles.storyPassage, isDarkMode && styles.textDark]}>
                {snapshot.text}
              </Text>
            </View>

            {notice ? (
              <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>
                {notice}
              </Text>
            ) : null}

            <View style={styles.endingActions}>
              <Pressable
                accessibilityLabel={UI_STRINGS.restart}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={requestRestart}
                style={({pressed}) => [
                  styles.primaryButton,
                  isDarkMode && styles.primaryButtonDark,
                  pressed && styles.buttonPressed,
                  isBusy && styles.disabled,
                ]}>
                <Text
                  style={[
                    styles.primaryButtonText,
                    isDarkMode && styles.primaryButtonTextDark,
                  ]}>
                  {UI_STRINGS.restart}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={UI_STRINGS.exitStory}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={exitStory}
                style={({pressed}) => [
                  styles.secondaryButton,
                  isDarkMode && styles.secondaryButtonDark,
                  pressed && styles.buttonPressed,
                  isBusy && styles.disabled,
                ]}>
                <Text
                  style={[
                    styles.secondaryButtonText,
                    isDarkMode && styles.textDark,
                  ]}>
                  {UI_STRINGS.exitStory}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
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
  screen: {
    flex: 1,
  },
  startContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  title: {
    color: '#111111',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  status: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  description: {
    color: '#4b5563',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 24,
    textAlign: 'center',
  },
  loading: {
    color: '#111111',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  notice: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
    textAlign: 'center',
  },
  noticeDark: {
    color: '#fcd34d',
  },
  startActions: {
    gap: 12,
    marginTop: 28,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonDark: {
    backgroundColor: '#f9fafb',
  },
  primaryButtonText: {
    color: '#ffffff',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    textAlign: 'center',
  },
  primaryButtonTextDark: {
    color: '#111111',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#9ca3af',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonDark: {
    borderColor: '#6b7280',
  },
  secondaryButtonText: {
    color: '#111111',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  readerHeader: {
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerDark: {
    borderBottomColor: '#374151',
  },
  headerAction: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  headerActionText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '600',
  },
  readerTitle: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    marginTop: 4,
  },
  readerNotice: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    textAlign: 'center',
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    paddingBottom: 32,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  storySurface: {
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  storySurfaceDark: {
    backgroundColor: '#1f2937',
  },
  storyPassage: {
    color: '#111111',
    fontSize: 18,
    lineHeight: 28,
  },
  storyPassageSpacing: {
    marginTop: 18,
  },
  choicesZone: {
    marginTop: 22,
  },
  sectionLabel: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  choice: {
    borderColor: '#9ca3af',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  choiceDark: {
    borderColor: '#6b7280',
  },
  choiceText: {
    color: '#111111',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    textAlign: 'left',
  },
  readerRestart: {
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  readerRestartText: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  endingContent: {
    flexGrow: 1,
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  endingEyebrow: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  endingId: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    marginTop: 8,
    textAlign: 'center',
  },
  finalTextLabel: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 26,
  },
  endingActions: {
    gap: 12,
    marginTop: 28,
  },
  buttonPressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.5,
  },
  textDark: {
    color: '#f9fafb',
  },
  textMutedDark: {
    color: '#d1d5db',
  },
});
