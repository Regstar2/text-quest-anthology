import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  Modal,
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
const PAGE_GAP = 12;
const PAGE_VERTICAL_PADDING = 12;
const PAGINATION_SAFETY_LINES = 3;
const MIN_CHOICE_PAGE_LINES = 3;
const CHOICE_ROW_RESERVE = 72;
const CHOICE_GAP = 8;
const PARAGRAPH_INDENT = '\u2003\u2003';
const ZERO_WIDTH_SPACE = '\u200B';
const EMPTY_LINES: readonly string[] = [];

type AppScreen = 'start' | 'reader' | 'ending';
type ReaderMode = 'pages' | 'feed';
type MenuView = 'menu' | 'restart' | null;

type ReaderMeasurement = Readonly<{
  key: string;
  lines: readonly string[];
}>;

if (!DEFAULT_STORY) {
  throw new Error('STORY_NOT_FOUND: Generated story manifest is empty.');
}

const DEFAULT_STORY_PACKAGE = storyLoader.load(DEFAULT_STORY.id);
const EMPTY_MEASUREMENT: ReaderMeasurement = {key: '', lines: EMPTY_LINES};

export function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const sessionRef = useRef<StorySession | null>(null);
  const mutationLockRef = useRef(false);
  const hasStartedSessionRef = useRef(false);
  const measurementKeyRef = useRef('');

  const [screen, setScreen] = useState<AppScreen>('start');
  const [readerMode, setReaderMode] = useState<ReaderMode>('pages');
  const [menuView, setMenuView] = useState<MenuView>(null);
  const [snapshot, setSnapshot] = useState<StoryReaderSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const [pageHeight, setPageHeight] = useState(0);
  const [readerRevision, setReaderRevision] = useState(0);
  const [measurement, setMeasurement] =
    useState<ReaderMeasurement>(EMPTY_MEASUREMENT);

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

    setMenuView(null);
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
        if (menuView !== null) {
          setMenuView(null);
          return true;
        }
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
  }, [exitStory, menuView, screen]);

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
      setReaderRevision(previous => previous + 1);
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
      setReaderRevision(previous => previous + 1);
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
      setReaderRevision(previous => previous + 1);
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
      setScreen('reader');
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const canRestart =
    hasStartedSession || screen === 'ending' || snapshot?.isEnded === true;

  const requestRestart = () => {
    if (!canRestart || mutationLockRef.current) {
      return;
    }
    setMenuView('restart');
  };

  const confirmRestart = () => {
    const showEndingAd = screen === 'ending' && snapshot?.isEnded === true;
    setMenuView(null);
    restart(showEndingAd);
  };

  const changeReaderMode = (mode: ReaderMode) => {
    if (mode === 'pages' && readerMode !== 'pages') {
      setReaderRevision(previous => previous + 1);
    }
    setReaderMode(mode);
    setMenuView(null);
  };

  const isBusy = isLoading || isMutating;
  let startActionLabel: string = UI_STRINGS.startStory;

  if (hasStartedSession) {
    startActionLabel = UI_STRINGS.continueStory;
  }
  if (snapshot?.isEnded) {
    startActionLabel = UI_STRINGS.viewEnding;
  }

  const currentParagraphs = useMemo(
    () => splitParagraphs(snapshot?.text ?? ''),
    [snapshot?.text],
  );
  const readerText = useMemo(
    () => currentParagraphs.map(indentParagraph).join('\n'),
    [currentParagraphs],
  );
  const measurementKey = `${readerRevision}\u0000${readerText}`;
  const measurementText =
    readerRevision % 2 === 0 ? readerText : `${readerText}${ZERO_WIDTH_SPACE}`;

  measurementKeyRef.current = measurementKey;

  const activeLines =
    measurement.key === measurementKey ? measurement.lines : EMPTY_LINES;
  const measurementReady = pageHeight > 0 && activeLines.length > 0;
  const choiceReserve = getChoiceReserve(snapshot?.choices.length ?? 0);

  const pages = useMemo(
    () =>
      measurementReady
        ? paginateLines(activeLines, pageHeight, choiceReserve)
        : [],
    [activeLines, choiceReserve, measurementReady, pageHeight],
  );

  const effectivePageIndex =
    snapshot && pages.length > 0
      ? Math.min(snapshot.pageIndex, pages.length - 1)
      : 0;
  const isChoicePage =
    measurementReady &&
    Boolean(snapshot?.choices.length) &&
    effectivePageIndex === pages.length - 1;
  const visiblePageText = measurementReady
    ? pages[effectivePageIndex]?.join('\n') ?? readerText
    : readerText;

  const recordMeasuredLines = (
    callbackKey: string,
    lines: readonly string[],
  ) => {
    if (measurementKeyRef.current !== callbackKey || lines.length === 0) {
      return;
    }

    const normalizedLines = lines.map(normalizeMeasuredLine);

    setMeasurement(previous => {
      if (
        previous.key === callbackKey &&
        sameLines(previous.lines, normalizedLines)
      ) {
        return previous;
      }
      return {key: callbackKey, lines: normalizedLines};
    });
  };

  const renderChoices = (enabled: boolean) => {
    if (!snapshot || snapshot.choices.length === 0) {
      return null;
    }

    return (
      <View accessibilityLabel={UI_STRINGS.choicesLabel} style={styles.choicesZone}>
        {snapshot.choices.map(choice => (
          <Pressable
            accessibilityLabel={choice.text}
            accessibilityRole="button"
            disabled={isBusy || !enabled}
            key={choice.index}
            onPress={() => {
              choose(choice.index);
            }}
            style={({pressed}) => [
              styles.choice,
              isDarkMode && styles.choiceDark,
              pressed && styles.buttonPressed,
              (isBusy || !enabled) && styles.disabled,
            ]}>
            <Text style={[styles.choiceText, isDarkMode && styles.textDark]}>
              {choice.text}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };

  const renderMenuButton = () => (
    <Pressable
      accessibilityLabel={UI_STRINGS.menu}
      accessibilityRole="button"
      disabled={isBusy}
      hitSlop={8}
      onPress={() => setMenuView('menu')}
      style={({pressed}) => [
        styles.menuButton,
        pressed && styles.buttonPressed,
        isBusy && styles.disabled,
      ]}>
      <Text style={[styles.menuButtonText, isDarkMode && styles.textDark]}>⋮</Text>
    </Pressable>
  );

  const renderHeader = () => (
    <View style={[styles.readerHeader, isDarkMode && styles.headerDark]}>
      <Text style={[styles.readerTitle, isDarkMode && styles.textDark]}>
        {DEFAULT_STORY.title}
      </Text>
      {renderMenuButton()}
    </View>
  );

  const renderMenu = () => (
    <Modal
      animationType="fade"
      onRequestClose={() => setMenuView(null)}
      transparent
      visible={menuView !== null}>
      <Pressable style={styles.menuBackdrop} onPress={() => setMenuView(null)}>
        <Pressable
          onPress={event => event.stopPropagation()}
          style={[styles.menuSheet, isDarkMode && styles.menuSheetDark]}>
          {menuView === 'restart' ? (
            <>
              <View style={styles.menuHeadingBlock}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>
                  {UI_STRINGS.restart}?
                </Text>
                <Text
                  style={[
                    styles.menuDescription,
                    isDarkMode && styles.textMutedDark,
                  ]}>
                  {UI_STRINGS.restartConfirmation}
                </Text>
              </View>

              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMenuView('menu')}
                  style={({pressed}) => [
                    styles.menuSecondaryAction,
                    isDarkMode && styles.menuSecondaryActionDark,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={[styles.menuActionText, isDarkMode && styles.textDark]}>
                    {UI_STRINGS.cancel}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={confirmRestart}
                  style={({pressed}) => [
                    styles.menuDangerAction,
                    pressed && styles.buttonPressed,
                    isBusy && styles.disabled,
                  ]}>
                  <Text style={styles.menuDangerActionText}>{UI_STRINGS.restart}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.menuGrabber} />
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>
                {UI_STRINGS.menu}
              </Text>

              <View style={styles.menuSection}>
                <Text
                  style={[
                    styles.menuSectionLabel,
                    isDarkMode && styles.textMutedDark,
                  ]}>
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
                        key={mode}
                        onPress={() => changeReaderMode(mode)}
                        style={({pressed}) => [
                          styles.modeButton,
                          isDarkMode && styles.modeButtonDark,
                          selected && styles.modeButtonSelected,
                          isDarkMode && selected && styles.modeButtonSelectedDark,
                          pressed && styles.buttonPressed,
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
              </View>

              {screen !== 'start' ? (
                <>
                  <View style={styles.menuDivider} />
                  <Pressable
                    accessibilityRole="button"
                    onPress={exitStory}
                    style={({pressed}) => [
                      styles.menuRow,
                      pressed && styles.menuRowPressed,
                    ]}>
                    <Text style={[styles.menuRowIcon, isDarkMode && styles.textDark]}>⌂</Text>
                    <Text style={[styles.menuRowText, isDarkMode && styles.textDark]}>
                      {UI_STRINGS.returnToStart}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {canRestart ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={requestRestart}
                  style={({pressed}) => [
                    styles.menuRow,
                    pressed && styles.menuRowPressed,
                  ]}>
                  <Text style={styles.menuDangerIcon}>↻</Text>
                  <Text style={styles.menuDangerText}>{UI_STRINGS.restart}</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setMenuView(null)}
                style={({pressed}) => [
                  styles.menuCloseButton,
                  isDarkMode && styles.menuSecondaryActionDark,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={[styles.menuActionText, isDarkMode && styles.textDark]}>
                  {UI_STRINGS.cancel}
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
        <AdsBanner isDarkMode={isDarkMode} />

        {screen === 'start' ? (
          <View style={styles.screen}>
            <View style={styles.startHeader}>{renderMenuButton()}</View>
            <View style={styles.startContent}>
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
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {screen === 'reader' && snapshot ? (
          <View style={styles.screen}>
            {renderHeader()}
            {notice ? (
              <Text style={[styles.readerNotice, isDarkMode && styles.noticeDark]}>{notice}</Text>
            ) : null}

            {readerMode === 'pages' ? (
              <View style={styles.pageReaderContent}>
                <View
                  onLayout={(event: LayoutChangeEvent) => {
                    setPageHeight(event.nativeEvent.layout.height);
                  }}
                  style={styles.pageBody}>
                  <Text
                    onTextLayout={(event: TextLayoutEvent) => {
                      recordMeasuredLines(
                        measurementKey,
                        event.nativeEvent.lines.map(line => line.text),
                      );
                    }}
                    pointerEvents="none"
                    style={styles.measureText}>
                    {measurementText}
                  </Text>

                  <View
                    style={[
                      styles.pageTextArea,
                      isChoicePage && {paddingBottom: choiceReserve + PAGE_GAP},
                    ]}>
                    <Text style={[styles.storyParagraph, isDarkMode && styles.textDark]}>
                      {visiblePageText}
                    </Text>
                  </View>

                  <View
                    pointerEvents={isChoicePage ? 'auto' : 'none'}
                    style={[
                      styles.choiceDock,
                      {height: choiceReserve},
                      !isChoicePage && styles.choiceDockHidden,
                    ]}>
                    {renderChoices(isChoicePage && measurementReady)}
                  </View>
                </View>

                <View style={styles.pageFooter}>
                  <Pressable
                    accessibilityLabel={UI_STRINGS.previousPage}
                    accessibilityRole="button"
                    disabled={isBusy || !measurementReady || effectivePageIndex === 0}
                    onPress={() => {
                      moveToPage(effectivePageIndex - 1);
                    }}
                    style={({pressed}) => [
                      styles.pageNavButton,
                      isDarkMode && styles.pageNavButtonDark,
                      pressed && styles.buttonPressed,
                      (isBusy || !measurementReady || effectivePageIndex === 0) &&
                        styles.disabled,
                    ]}>
                    <Text style={[styles.pageNavText, isDarkMode && styles.textDark]}>
                      ← {UI_STRINGS.previousPage}
                    </Text>
                  </Pressable>

                  <Text style={[styles.pageCounter, isDarkMode && styles.textMutedDark]}>
                    {measurementReady ? `${effectivePageIndex + 1}/${pages.length}` : '1/…'}
                  </Text>

                  <Pressable
                    accessibilityLabel={UI_STRINGS.nextPage}
                    accessibilityRole="button"
                    disabled={
                      isBusy ||
                      !measurementReady ||
                      effectivePageIndex >= pages.length - 1
                    }
                    onPress={() => {
                      moveToPage(effectivePageIndex + 1);
                    }}
                    style={({pressed}) => [
                      styles.pageNavButton,
                      isDarkMode && styles.pageNavButtonDark,
                      pressed && styles.buttonPressed,
                      (isBusy ||
                        !measurementReady ||
                        effectivePageIndex >= pages.length - 1) &&
                        styles.disabled,
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
                <View style={styles.feedText}>
                  {snapshot.passages.map((passage, index) => (
                    <Text
                      key={`${index}-${passage.slice(0, 24)}`}
                      style={[styles.storyParagraph, isDarkMode && styles.textDark]}>
                      {indentParagraph(passage)}
                    </Text>
                  ))}
                </View>
                {renderChoices(true)}
              </ScrollView>
            )}
          </View>
        ) : null}

        {screen === 'ending' && snapshot ? (
          <View style={styles.screen}>
            {renderHeader()}
            <View style={styles.endingContent}>
              <Text style={[styles.endingId, isDarkMode && styles.textDark]}>
                {snapshot.endingId ?? 'unknown'}
              </Text>
              <Text style={[styles.finalTextLabel, isDarkMode && styles.textMutedDark]}>
                {UI_STRINGS.finalTextLabel}
              </Text>
              {splitParagraphs(snapshot.text).map((paragraph, index) => (
                <Text
                  key={`ending-${index}`}
                  style={[styles.storyParagraph, isDarkMode && styles.textDark]}>
                  {indentParagraph(paragraph)}
                </Text>
              ))}
              {notice ? (
                <Text style={[styles.notice, isDarkMode && styles.noticeDark]}>{notice}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {renderMenu()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(paragraph => paragraph.length > 0);
}

function indentParagraph(paragraph: string): string {
  return `${PARAGRAPH_INDENT}${paragraph.trim()}`;
}

function normalizeMeasuredLine(line: string): string {
  return line.replace(/[\r\n]/g, '').split(ZERO_WIDTH_SPACE).join('');
}

function getChoiceReserve(choiceCount: number): number {
  if (choiceCount <= 0) {
    return 0;
  }
  return choiceCount * CHOICE_ROW_RESERVE + Math.max(0, choiceCount - 1) * CHOICE_GAP;
}

function paginateLines(
  measuredLines: readonly string[],
  pageHeight: number,
  choiceReserve: number,
): string[][] {
  if (measuredLines.length === 0) {
    return [];
  }

  const contentHeight = Math.max(
    STORY_LINE_HEIGHT,
    pageHeight - PAGE_VERTICAL_PADDING,
  );
  const measuredNormalCapacity = Math.max(
    1,
    Math.floor(contentHeight / STORY_LINE_HEIGHT),
  );
  const normalCapacity = Math.max(
    1,
    measuredNormalCapacity - PAGINATION_SAFETY_LINES,
  );

  if (choiceReserve <= 0) {
    return chunkLines(measuredLines, normalCapacity);
  }

  const measuredChoiceCapacity = Math.max(
    1,
    Math.floor(
      (contentHeight - choiceReserve - PAGE_GAP) / STORY_LINE_HEIGHT,
    ),
  );
  const choiceCapacity = Math.max(
    1,
    measuredChoiceCapacity - PAGINATION_SAFETY_LINES,
  );
  const minimumChoiceLines = Math.min(
    measuredLines.length,
    choiceCapacity,
    MIN_CHOICE_PAGE_LINES,
  );

  const pages: string[][] = [];
  let cursor = 0;

  while (measuredLines.length - cursor > choiceCapacity) {
    const remaining = measuredLines.length - cursor;
    const maximumTake = Math.max(1, remaining - minimumChoiceLines);
    const take = Math.min(normalCapacity, maximumTake);
    pages.push(measuredLines.slice(cursor, cursor + take));
    cursor += take;
  }

  pages.push(measuredLines.slice(cursor));
  return pages;
}

function chunkLines(lines: readonly string[], capacity: number): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += capacity) {
    pages.push(lines.slice(index, index + capacity));
  }

  return pages.length > 0 ? pages : [[]];
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
  startHeader: {
    minHeight: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
  startContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 14,
  },
  title: {fontSize: 30, lineHeight: 36, fontWeight: '700', color: '#111111'},
  status: {fontSize: 13, lineHeight: 18, color: '#666666'},
  description: {fontSize: 16, lineHeight: 23, color: '#555555'},
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
  buttonPressed: {opacity: 0.65},
  disabled: {opacity: 0.38},
  readerHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dddddd',
  },
  headerDark: {borderBottomColor: '#2f2f2f'},
  readerTitle: {fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#222222'},
  menuButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {fontSize: 28, lineHeight: 30, color: '#222222'},
  readerNotice: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 8,
    padding: 9,
    backgroundColor: '#f4f4f4',
    color: '#333333',
    fontSize: 13,
    lineHeight: 18,
  },
  pageReaderContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageBody: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    paddingVertical: PAGE_VERTICAL_PADDING / 2,
  },
  measureText: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAGE_VERTICAL_PADDING / 2,
    opacity: 0,
    fontSize: 18,
    lineHeight: STORY_LINE_HEIGHT,
    color: '#171717',
    textAlign: 'justify',
    includeFontPadding: false,
  },
  pageTextArea: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  choiceDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: PAGE_VERTICAL_PADDING / 2,
    justifyContent: 'flex-end',
  },
  choiceDockHidden: {opacity: 0},
  pageFooter: {
    flexShrink: 0,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageNavButton: {
    minHeight: 44,
    minWidth: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    paddingHorizontal: 12,
  },
  pageNavButtonDark: {borderColor: '#444444'},
  pageNavText: {fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#222222'},
  pageCounter: {fontSize: 13, lineHeight: 18, color: '#666666', textAlign: 'center'},
  readerScroll: {flex: 1},
  readerContent: {paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, gap: 18},
  feedText: {gap: 0},
  storyParagraph: {
    fontSize: 18,
    lineHeight: STORY_LINE_HEIGHT,
    color: '#171717',
    textAlign: 'justify',
    includeFontPadding: false,
  },
  choicesZone: {flexShrink: 0, gap: CHOICE_GAP},
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  choiceDark: {borderColor: '#444444', backgroundColor: '#171717'},
  choiceText: {fontSize: 16, lineHeight: 22, color: '#222222'},
  endingContent: {flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 8},
  endingId: {fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#111111'},
  finalTextLabel: {fontSize: 13, lineHeight: 18, color: '#666666', marginBottom: 6},
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  menuSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: '#ffffff',
    gap: 14,
  },
  menuSheetDark: {backgroundColor: '#1a1a1a'},
  menuGrabber: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#b8b8b8',
  },
  menuHeadingBlock: {gap: 8, paddingTop: 8},
  menuTitle: {fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#171717'},
  menuDescription: {fontSize: 15, lineHeight: 21, color: '#666666'},
  menuSection: {gap: 8},
  menuSectionLabel: {fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#666666'},
  modeSelector: {flexDirection: 'row', gap: 8},
  modeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d0',
  },
  modeButtonDark: {borderColor: '#444444'},
  modeButtonSelected: {borderColor: '#111111', backgroundColor: '#f1f1f1'},
  modeButtonSelectedDark: {borderColor: '#eeeeee', backgroundColor: '#2b2b2b'},
  modeButtonText: {fontSize: 15, lineHeight: 20, color: '#222222'},
  modeButtonTextSelected: {fontWeight: '700'},
  menuDivider: {height: StyleSheet.hairlineWidth, backgroundColor: '#d8d8d8'},
  menuRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  menuRowPressed: {backgroundColor: 'rgba(127, 127, 127, 0.12)'},
  menuRowIcon: {width: 24, fontSize: 21, color: '#222222', textAlign: 'center'},
  menuRowText: {fontSize: 16, lineHeight: 22, color: '#222222'},
  menuDangerIcon: {width: 24, fontSize: 22, color: '#c62828', textAlign: 'center'},
  menuDangerText: {fontSize: 16, lineHeight: 22, color: '#c62828'},
  menuCloseButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  menuSecondaryAction: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  menuSecondaryActionDark: {backgroundColor: '#2c2c2c'},
  menuDangerAction: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#c62828',
  },
  menuActionText: {fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#222222'},
  menuDangerActionText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  confirmActions: {flexDirection: 'row', gap: 10, marginTop: 4},
  textDark: {color: '#f3f3f3'},
  textMutedDark: {color: '#b8b8b8'},
});
