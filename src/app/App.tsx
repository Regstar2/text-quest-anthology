import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  type LayoutChangeEvent,
  type TextLayoutEvent,
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
const STORY_LINE_HEIGHT = 28;
const PAGE_GAP = 14;
const PAGE_VERTICAL_PADDING = 36;

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
  const [pageHeight, setPageHeight] = useState(0);
  const [choiceHeight, setChoiceHeight] = useState(0);
  const [measuredLines, setMeasuredLines] = useState<readonly string[]>([]);

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

    session.flush().then(persisted => {
      if (!persisted) {
        setNotice(UI_STRINGS.saveFailed);
      }
    });
  }, []);

  useEffect(() => {
    adsProvider.initialize();
  }, []);

  useEffect(() => {
    let active = true;

    StorySession.open(DEFAULT_STORY_PACKAGE, storySaveRepository)
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
    setMeasuredLines([]);
    setChoiceHeight(0);
  }, [snapshot?.text]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        adsProvider.preloadInterstitial();
        return;
      }
      if (nextState !== 'inactive' && nextState !== 'background') {
        return;
      }
      const session = sessionRef.current;
      if (!session || !hasStartedSessionRef.current) {
        return;
      }
      session.flush().then(persisted => {
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

  const moveToPage = async (pageIndex: number) => {
    const session = sessionRef.current;
    if (!session || !beginMutation()) {
      return;
    }

    try {
      const result = await session.setPage(pageIndex);
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
          // Advertising is optional and must never block narrative reset.
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
          restart(showEndingAd);
        },
      },
    ]);
  };

  const openStoryMenu = () => {
    Alert.alert(UI_STRINGS.menu, undefined, [
      {text: UI_STRINGS.returnToStart, onPress: exitStory},
      {text: UI_STRINGS.restart, style: 'destructive', onPress: requestRestart},
      {text: UI_STRINGS.cancel, style: 'cancel'},
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

  const pageTexts = useMemo(
    () =>
      paginateMeasuredLines(
        measuredLines,
        snapshot?.text ?? '',
        pageHeight,
        snapshot?.choices.length ? choiceHeight : 0,
      ),
    [choiceHeight, measuredLines, pageHeight, snapshot?.choices.length, snapshot?.text],
  );
  const effectivePageIndex = snapshot
    ? Math.min(snapshot.pageIndex, Math.max(pageTexts.length - 1, 0))
    : 0;
  const isChoicePage =
    Boolean(snapshot?.choices.length) && effectivePageIndex === pageTexts.length - 1;

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
              choose(choice.index);
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

  const renderHeader = (label: string) => (
    <View style={[styles.readerHeader, isDarkMode && styles.headerDark]}>
      <Text style={[styles.readerTitle, isDarkMode && styles.textDark]}>{label}</Text>
      <Pressable
        accessibilityLabel={UI_STRINGS.menu}
        accessibilityRole="button"
        disabled={isBusy}
        hitSlop={8}
        onPress={openStoryMenu}
        style={({pressed}) => [
          styles.menuButton,
          pressed && styles.buttonPressed,
          isBusy && styles.disabled,
        ]}>
        <Text style={[styles.menuButtonText, isDarkMode && styles.textDark]}>⋮</Text>
      </Pressable>
    </View>
  );

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
              <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>{notice}</Text>
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
                  onPress={enterStory}
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
                    <Text style={[styles.secondaryButtonText, isDarkMode && styles.textDark]}>
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
            {renderHeader(
              readerMode === 'pages' ? UI_STRINGS.readerModePages : UI_STRINGS.readerModeFeed,
            )}
            {notice ? (
              <Text style={[styles.readerNotice, isDarkMode && styles.noticeDark]}>{notice}</Text>
            ) : null}

            {readerMode === 'pages' ? (
              <View style={styles.pageReaderContent}>
                <View
                  onLayout={(event: LayoutChangeEvent) => {
                    setPageHeight(event.nativeEvent.layout.height);
                  }}
                  style={[
                    styles.pageBody,
                    isDarkMode && styles.storySurfaceDark,
                  ]}>
                  <Text
                    onTextLayout={(event: TextLayoutEvent) => {
                      const lines = event.nativeEvent.lines.map(line => line.text);
                      setMeasuredLines(previous =>
                        sameLines(previous, lines) ? previous : lines,
                      );
                    }}
                    style={[styles.measureText, styles.storyPassage]}>
                    {snapshot.text}
                  </Text>

                  {snapshot.choices.length > 0 ? (
                    <View
                      onLayout={(event: LayoutChangeEvent) => {
                        setChoiceHeight(event.nativeEvent.layout.height);
                      }}
                      pointerEvents="none"
                      style={styles.measureChoices}>
                      {snapshot.choices.map(choice => (
                        <View key={choice.index} style={styles.choice}>
                          <Text style={styles.choiceText}>{choice.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Text style={[styles.storyPassage, isDarkMode && styles.textDark]}>
                    {pageTexts[effectivePageIndex] ?? snapshot.text}
                  </Text>
                  {isChoicePage ? renderChoices() : null}
                </View>

                <View style={styles.pageFooter}>
                  <Pressable
                    accessibilityLabel={UI_STRINGS.previousPage}
                    accessibilityRole="button"
                    disabled={isBusy || effectivePageIndex === 0}
                    onPress={() => {
                      moveToPage(effectivePageIndex - 1);
                    }}
                    style={({pressed}) => [
                      styles.pageNavButton,
                      isDarkMode && styles.secondaryButtonDark,
                      pressed && styles.buttonPressed,
                      (isBusy || effectivePageIndex === 0) && styles.disabled,
                    ]}>
                    <Text style={[styles.pageNavText, isDarkMode && styles.textDark]}>
                      ← {UI_STRINGS.previousPage}
                    </Text>
                  </Pressable>

                  <Text style={[styles.pageCounter, isDarkMode && styles.textMutedDark]}>
                    {effectivePageIndex + 1}/{pageTexts.length}
                  </Text>

                  <Pressable
                    accessibilityLabel={UI_STRINGS.nextPage}
                    accessibilityRole="button"
                    disabled={isBusy || effectivePageIndex >= pageTexts.length - 1}
                    onPress={() => {
                      moveToPage(effectivePageIndex + 1);
                    }}
                    style={({pressed}) => [
                      styles.pageNavButton,
                      isDarkMode && styles.secondaryButtonDark,
                      pressed && styles.buttonPressed,
                      (isBusy || effectivePageIndex >= pageTexts.length - 1) && styles.disabled,
                    ]}>
                    <Text style={[styles.pageNavText, isDarkMode && styles.textDark]}>
                      {UI_STRINGS.nextPage} →
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.readerContent}
                style={styles.readerScroll}>
                <View style={[styles.storySurface, isDarkMode && styles.storySurfaceDark]}>
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
              </ScrollView>
            )}
          </View>
        ) : null}

        {screen === 'ending' && snapshot ? (
          <View style={styles.screen}>
            {renderHeader(UI_STRINGS.endingLabel)}
            <View style={styles.endingContent}>
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
                <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>{notice}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function paginateMeasuredLines(
  measuredLines: readonly string[],
  fallbackText: string,
  pageHeight: number,
  choiceHeight: number,
): string[] {
  if (measuredLines.length === 0 || pageHeight <= 0) {
    return [fallbackText];
  }

  const contentHeight = Math.max(STORY_LINE_HEIGHT, pageHeight - PAGE_VERTICAL_PADDING);
  const normalCapacity = Math.max(1, Math.floor(contentHeight / STORY_LINE_HEIGHT));
  const choiceCapacity =
    choiceHeight > 0
      ? Math.max(
          1,
          Math.floor((contentHeight - choiceHeight - PAGE_GAP) / STORY_LINE_HEIGHT),
        )
      : normalCapacity;

  if (measuredLines.length <= choiceCapacity) {
    return [measuredLines.join('\n')];
  }

  const pages: string[] = [];
  const finalStart = Math.max(0, measuredLines.length - choiceCapacity);
  const prefix = measuredLines.slice(0, finalStart);

  for (let index = 0; index < prefix.length; index += normalCapacity) {
    pages.push(prefix.slice(index, index + normalCapacity).join('\n'));
  }

  pages.push(measuredLines.slice(finalStart).join('\n'));
  return pages;
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
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
  safeArea: {flex: 1, backgroundColor: '#ffffff'},
  safeAreaDark: {backgroundColor: '#111111'},
  screen: {flex: 1},
  startContent: {justifyContent: 'center', padding: 24, gap: 14},
  title: {fontSize: 30, lineHeight: 36, fontWeight: '700', color: '#111111'},
  status: {fontSize: 13, lineHeight: 18, color: '#666666'},
  description: {fontSize: 16, lineHeight: 23, color: '#555555'},
  modeBlock: {gap: 8},
  sectionLabel: {fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#666666'},
  modeSelector: {flexDirection: 'row', gap: 8},
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
  modeButtonDark: {borderColor: '#555555'},
  modeButtonSelected: {borderWidth: 2, borderColor: '#111111'},
  modeButtonSelectedDark: {borderColor: '#ffffff'},
  modeButtonText: {fontSize: 15, lineHeight: 20, color: '#222222'},
  modeButtonTextSelected: {fontWeight: '700'},
  modeHint: {fontSize: 13, lineHeight: 18, color: '#666666'},
  notice: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f4f4f4',
    color: '#333333',
    fontSize: 14,
    lineHeight: 20,
  },
  noticeDark: {backgroundColor: '#252525', color: '#eeeeee'},
  loading: {fontSize: 15, color: '#222222'},
  startActions: {gap: 10},
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: '#111111',
  },
  primaryButtonDark: {backgroundColor: '#f0f0f0'},
  primaryButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  primaryButtonTextDark: {color: '#111111'},
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 18,
  },
  secondaryButtonDark: {borderColor: '#555555'},
  secondaryButtonText: {fontSize: 15, lineHeight: 21, color: '#222222'},
  buttonPressed: {opacity: 0.65},
  disabled: {opacity: 0.4},
  readerHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e4',
  },
  headerDark: {borderBottomColor: '#333333'},
  readerTitle: {fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#222222'},
  menuButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {fontSize: 28, lineHeight: 30, color: '#222222'},
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
  pageReaderContent: {flex: 1, padding: 16, gap: 10},
  pageBody: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#fafafa',
    gap: PAGE_GAP,
  },
  measureText: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    opacity: 0,
  },
  measureChoices: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    opacity: 0,
    gap: 8,
  },
  pageFooter: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageNavButton: {
    minHeight: 44,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 12,
  },
  pageNavText: {fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#222222'},
  pageCounter: {fontSize: 13, lineHeight: 18, color: '#666666', textAlign: 'center'},
  readerScroll: {flex: 1},
  readerContent: {padding: 16, gap: 16, paddingBottom: 28},
  storySurface: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#fafafa',
  },
  storySurfaceDark: {borderColor: '#333333', backgroundColor: '#1b1b1b'},
  storyPassage: {fontSize: 18, lineHeight: STORY_LINE_HEIGHT, color: '#171717'},
  storyPassageSpacing: {marginTop: 18},
  choicesZone: {gap: 8},
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
  choiceDark: {borderColor: '#444444', backgroundColor: '#1a1a1a'},
  choiceText: {fontSize: 16, lineHeight: 22, color: '#222222'},
  endingContent: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
  endingId: {fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#111111'},
  finalTextLabel: {fontSize: 13, lineHeight: 18, color: '#666666'},
  textDark: {color: '#f3f3f3'},
  textMutedDark: {color: '#b8b8b8'},
});
