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
type ReaderMode = 'pages' | 'feed';

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
  const [readerMode, setReaderMode] = useState<ReaderMode>('pages');
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

  const nextPage = async () => {
    const session = sessionRef.current;

    if (!session || !beginMutation()) {
      return;
    }

    try {
      const result = await session.nextPage();
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
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

  const renderChoices = () => {
    if (!snapshot || snapshot.choices.length === 0) {
      return null;
    }

    return (
      <View accessibilityLabel={UI_STRINGS.choicesLabel} style={styles.choicesZone}>
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
            <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
              {choice.text}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <AdsBanner isDarkMode={isDarkMode} />

        {screen === 'start' ? (
          <View style={[styles.screen, styles.startContent]}>
            <Text style={[styles.title, isDarkMode && styles.textDark]}>
              {DEFAULT_STORY.title}
            </Text>
            <Text style={[styles.status, isDarkMode && styles.textMutedDark]}>
              {UI_STRINGS.prototypeStatus} · v{APP_CONFIG.versionName}
            </Text>
            <Text style={[styles.description, isDarkMode && styles.textMutedDark]}>
              {DEFAULT_STORY.description}
            </Text>

            <View style={styles.modeBlock}>
              <Text style={[styles.sectionLabel, isDarkMode && styles.textMutedDark]}>
                {UI_STRINGS.readerModeLabel}
              </Text>
              <View style={styles.modeSelector}>
                {(['pages', 'feed'] as const).map(mode => {
                  const selected = readerMode === mode;
                  const label =
                    mode === 'pages'
                      ? UI_STRINGS.readerModePages
                      : UI_STRINGS.readerModeFeed;

                  return (
                    <Pressable
                      accessibilityLabel={label}
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      disabled={isBusy}
                      key={mode}
                      onPress={() => setReaderMode(mode)}
                      style={({pressed}) => [
                        styles.modeButton,
                        isDarkMode && styles.modeButtonDark,
                        selected && styles.modeButtonSelected,
                        isDarkMode && selected && styles.modeButtonSelectedDark,
                        pressed && styles.buttonPressed,
                        isBusy && styles.disabled,
                      ]}>
                      <Text
                        style={[
                          styles.modeButtonText,
                          isDarkMode && styles.textDark,
                          selected && styles.modeButtonTextSelected,
                        ]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.modeHint, isDarkMode && styles.textMutedDark]}>
                {readerMode === 'pages'
                  ? UI_STRINGS.readerModePagesHint
                  : UI_STRINGS.readerModeFeedHint}
              </Text>
            </View>

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
          </View>
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
                {readerMode === 'pages'
                  ? UI_STRINGS.readerModePages
                  : UI_STRINGS.readerModeFeed}
              </Text>
            </View>

            {notice ? (
              <Text style={[styles.readerNotice, isDarkMode && styles.noticeDark]}>
                {notice}
              </Text>
            ) : null}

            {readerMode === 'pages' ? (
              <View style={styles.pageReaderContent}>
                <View
                  accessibilityLabel="Текст текущей страницы"
                  style={[
                    styles.storySurface,
                    styles.pageStorySurface,
                    isDarkMode && styles.storySurfaceDark,
                  ]}>
                  <Text style={[styles.storyPassage, isDarkMode && styles.textDark]}>
                    {snapshot.pageText}
                  </Text>
                </View>

                <Text style={[styles.pageCounter, isDarkMode && styles.textMutedDark]}>
                  {UI_STRINGS.pageLabel} {snapshot.pageIndex + 1}/{snapshot.pageCount}
                </Text>

                {snapshot.hasNextPage ? (
                  <Pressable
                    accessibilityLabel={UI_STRINGS.nextPage}
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() => {
                      void nextPage();
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
                      {UI_STRINGS.nextPage}
                    </Text>
                  </Pressable>
                ) : (
                  renderChoices()
                )}

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
              </View>
            ) : (
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

                {renderChoices()}

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
            )}
          </View>
        ) : null}

        {screen === 'ending' && snapshot ? (
          <View style={[styles.screen, styles.endingContent]}>
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
          </View>
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
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: '#111111',
  },
  status: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666666',
  },
  description: {
    fontSize: 16,
    lineHeight: 23,
    color: '#555555',
  },
  modeBlock: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#666666',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  modeButtonDark: {
    borderColor: '#555555',
  },
  modeButtonSelected: {
    borderWidth: 2,
    borderColor: '#111111',
  },
  modeButtonSelectedDark: {
    borderColor: '#ffffff',
  },
  modeButtonText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#222222',
  },
  modeButtonTextSelected: {
    fontWeight: '700',
  },
  modeHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666666',
  },
  notice: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f4f4f4',
    color: '#333333',
    fontSize: 14,
    lineHeight: 20,
  },
  noticeDark: {
    backgroundColor: '#252525',
    color: '#eeeeee',
  },
  loading: {
    fontSize: 15,
    color: '#222222',
  },
  startActions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: '#111111',
  },
  primaryButtonDark: {
    backgroundColor: '#f0f0f0',
  },
  primaryButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  primaryButtonTextDark: {
    color: '#111111',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 18,
  },
  secondaryButtonDark: {
    borderColor: '#555555',
  },
  secondaryButtonText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#222222',
  },
  buttonPressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.45,
  },
  readerHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e4',
  },
  headerDark: {
    borderBottomColor: '#333333',
  },
  headerAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  headerActionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#222222',
  },
  readerTitle: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#222222',
    textAlign: 'right',
  },
  readerNotice: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    padding: 9,
    backgroundColor: '#f4f4f4',
    color: '#333333',
    fontSize: 13,
    lineHeight: 18,
  },
  pageReaderContent: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 28,
  },
  storySurface: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#fafafa',
  },
  storySurfaceDark: {
    borderColor: '#333333',
    backgroundColor: '#1b1b1b',
  },
  pageStorySurface: {
    flex: 1,
    justifyContent: 'center',
  },
  storyPassage: {
    fontSize: 18,
    lineHeight: 28,
    color: '#171717',
  },
  storyPassageSpacing: {
    marginTop: 18,
  },
  pageCounter: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666666',
    textAlign: 'center',
  },
  choicesZone: {
    gap: 8,
  },
  choice: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cfcfcf',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  choiceDark: {
    borderColor: '#444444',
    backgroundColor: '#1a1a1a',
  },
  choiceText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#222222',
  },
  readerRestart: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  readerRestartText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666666',
  },
  endingContent: {
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  endingEyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#666666',
  },
  endingId: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: '#111111',
  },
  finalTextLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666666',
  },
  endingActions: {
    gap: 10,
  },
  textDark: {
    color: '#f3f3f3',
  },
  textMutedDark: {
    color: '#b8b8b8',
  },
});
