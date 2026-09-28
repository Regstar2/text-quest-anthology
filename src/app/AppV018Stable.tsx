import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  BackHandler,
  Modal,
  PanResponder,
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
  useWindowDimensions,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {adsProvider} from '../ads';
import {ADS_CONFIG} from '../config/adsConfig';
import {APP_CONFIG} from '../config/appConfig';
import {UI_STRINGS} from '../config/uiStrings';
import {
  StorySession,
  type StoryReaderSnapshot,
  type StorySessionRecovery,
} from '../narrative/StorySession';
import {storyLoader} from '../narrative/StoryLoader';
import type {StoryMetadata} from '../narrative/StoryMetadata';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderMode,
  type ReaderPreferences,
  type ReaderTheme,
} from '../persistence/ReaderPreferencesRepository';
import {
  readerPreferencesRepository,
  storySaveRepository,
  unlockedEndingsRepository,
} from '../persistence/NativeStorySaveStorage';
import type {UnlockedEnding} from '../persistence/UnlockedEndingsRepository';
import {
  loadStoryCatalog,
  type StoryCatalogItem,
} from './StoryCatalog';
import {
  clampPageIndex,
  pageAfterHorizontalSwipe,
  shouldHandleHorizontalPageSwipe,
} from './ReaderNavigation';
import {
  CHOICE_GAP,
  FORCED_PAGE_BREAK_MARKER,
  PAGE_VERTICAL_PADDING,
  READER_MAX_FONT_SIZE_MULTIPLIER,
  STORY_LINE_HEIGHT,
  commitPaginationMeasurement,
  createPagedReaderState,
  indentReaderParagraph,
  movePagedReaderToPage,
  planPaginationMeasurement,
  resetPagedReaderState,
  updatePagedReaderGeometry,
  type PaginationMeasurementRequest,
} from './PagedReaderPagination';
import {
  READER_THEME_LABELS,
  resolveReaderPalette,
  type ReaderPalette,
} from './ReaderTheme';

const AdsBanner = adsProvider.Banner;
const READER_THEMES: readonly ReaderTheme[] = [
  'auto',
  'light',
  'sepia',
  'dark',
  'oled',
];

type AppScreen = 'main' | 'catalog' | 'settings' | 'endings' | 'reader';
type MenuView = 'menu' | 'restart' | null;

type AppColors = Readonly<{
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
}>;

export function App(): React.JSX.Element {
  const systemDark = useColorScheme() === 'dark';
  const {fontScale} = useWindowDimensions();
  const sessionRef = useRef<StorySession | null>(null);
  const mutationLockRef = useRef(false);
  const pagedReaderIndexRef = useRef(0);
  const hasStartedSessionRef = useRef(false);
  const feedChoiceCountRef = useRef(0);

  const storyMetadata = useMemo(() => storyLoader.listMetadata(), []);

  const [screen, setScreen] = useState<AppScreen>('main');
  const [activeStory, setActiveStory] = useState<StoryMetadata | null>(null);
  const [catalogItems, setCatalogItems] = useState<readonly StoryCatalogItem[]>([]);
  const [unlockedEndings, setUnlockedEndings] =
    useState<readonly UnlockedEnding[]>([]);
  const [readerPreferences, setReaderPreferences] =
    useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [menuView, setMenuView] = useState<MenuView>(null);
  const [catalogRestartTarget, setCatalogRestartTarget] = useState<string | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<StoryReaderSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const [pagedReader, setPagedReader] = useState(createPagedReaderState);
  const [paginationRequest, setPaginationRequest] =
    useState<PaginationMeasurementRequest | null>(null);
  const [pagedInteractionVisible, setPagedInteractionVisible] = useState(false);
  const [pagedInteractionSnapshot, setPagedInteractionSnapshot] =
    useState<StoryReaderSnapshot | null>(null);
  const [
    pagedInteractionTargetPassageCount,
    setPagedInteractionTargetPassageCount,
  ] = useState<number | null>(null);
  const [feedBannerVisible, setFeedBannerVisible] = useState(false);
  const [bannerReadyHeight, setBannerReadyHeight] = useState(0);

  const readerPalette = resolveReaderPalette(readerPreferences.theme, systemDark);
  const appColors: AppColors = readerPalette;
  const readerMode = readerPreferences.mode;

  const resetPagedReader = useCallback(
    (
      pageAnchor: StoryReaderSnapshot['pageAnchor'],
      fallbackPageIndex: number,
    ): void => {
      pagedReaderIndexRef.current = 0;
      setPagedReader(current =>
        resetPagedReaderState(current, pageAnchor, fallbackPageIndex),
      );
      setPaginationRequest(null);
      setPagedInteractionVisible(false);
      setPagedInteractionSnapshot(null);
      setPagedInteractionTargetPassageCount(null);
    },
    [],
  );

  const resetReaderAdCadence = useCallback((): void => {
    feedChoiceCountRef.current = 0;
    setFeedBannerVisible(false);
  }, []);

  const beginMutation = useCallback((): boolean => {
    if (mutationLockRef.current) {
      return false;
    }

    mutationLockRef.current = true;
    setIsMutating(true);
    return true;
  }, []);

  const endMutation = useCallback((): void => {
    mutationLockRef.current = false;
    setIsMutating(false);
  }, []);

  const refreshCatalog = useCallback(async (): Promise<void> => {
    const catalog = await loadStoryCatalog(
      storyLoader,
      storySaveRepository,
      unlockedEndingsRepository,
    );
    setCatalogItems(catalog.items);

    if (catalog.storageUnavailable) {
      setNotice(UI_STRINGS.storageUnavailable);
    }
  }, []);

  const persistReaderPreferences = useCallback(
    (next: ReaderPreferences): void => {
      setReaderPreferences(next);
      readerPreferencesRepository.save(next).catch(() => {
        setNotice(UI_STRINGS.preferenceSaveFailed);
      });
    },
    [],
  );

  const changeReaderMode = useCallback(
    (mode: ReaderMode): void => {
      if (mode === readerPreferences.mode) {
        return;
      }

      if (mode === 'pages') {
        setFeedBannerVisible(false);
        resetPagedReader(null, Number.MAX_SAFE_INTEGER);
      } else {
        feedChoiceCountRef.current = 0;
        setFeedBannerVisible(false);
      }

      persistReaderPreferences({...readerPreferences, mode});
    },
    [persistReaderPreferences, readerPreferences, resetPagedReader],
  );

  const changeReaderTheme = useCallback(
    (theme: ReaderTheme): void => {
      if (theme === readerPreferences.theme) {
        return;
      }

      persistReaderPreferences({...readerPreferences, theme});
    },
    [persistReaderPreferences, readerPreferences],
  );

  const recordEnding = useCallback(
    async (storyId: string, endingSnapshot: StoryReaderSnapshot): Promise<void> => {
      if (!endingSnapshot.isEnded || !endingSnapshot.endingId) {
        return;
      }

      try {
        await unlockedEndingsRepository.unlock(storyId, {
          id: endingSnapshot.endingId,
          text: endingSnapshot.text,
        });
      } catch {
        setNotice(UI_STRINGS.endingSaveFailed);
      }
    },
    [],
  );

  const showMain = useCallback(() => {
    if (mutationLockRef.current) {
      return;
    }

    setMenuView(null);
    setCatalogRestartTarget(null);
    setActiveStory(null);
    setUnlockedEndings([]);
    setNotice(null);
    setScreen('main');
  }, []);

  const showSettings = useCallback(() => {
    if (mutationLockRef.current) {
      return;
    }

    setNotice(null);
    setScreen('settings');
  }, []);

  const showCatalog = useCallback(() => {
    if (mutationLockRef.current) {
      return;
    }

    setMenuView(null);
    setCatalogRestartTarget(null);
    setActiveStory(null);
    setUnlockedEndings([]);
    setNotice(null);
    setScreen('catalog');
    setIsLoading(true);

    refreshCatalog()
      .catch(() => {
        setNotice(UI_STRINGS.storageUnavailable);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [refreshCatalog]);

  const showEndings = useCallback(async (story: StoryMetadata) => {
    if (mutationLockRef.current) {
      return;
    }

    setActiveStory(story);
    setUnlockedEndings([]);
    setNotice(null);
    setScreen('endings');
    setIsLoading(true);

    try {
      setUnlockedEndings(await unlockedEndingsRepository.list(story.id));
    } catch {
      setNotice(UI_STRINGS.storageUnavailable);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exitStory = useCallback(() => {
    if (mutationLockRef.current) {
      return;
    }

    const session = sessionRef.current;
    const shouldFlush = hasStartedSessionRef.current;

    sessionRef.current = null;
    hasStartedSessionRef.current = false;
    resetReaderAdCadence();
    resetPagedReader(null, 0);
    setHasStartedSession(false);
    setActiveStory(null);
    setSnapshot(null);
    setMenuView(null);
    setScreen('catalog');

    const finishExit = async () => {
      if (session && shouldFlush) {
        const persisted = await session.flush();
        if (!persisted) {
          setNotice(UI_STRINGS.saveFailed);
        }
      }

      try {
        await refreshCatalog();
      } catch {
        setNotice(UI_STRINGS.storageUnavailable);
      }
    };

    void finishExit();
  }, [refreshCatalog, resetPagedReader, resetReaderAdCadence]);

  useEffect(() => {
    let cancelled = false;

    readerPreferencesRepository
      .load()
      .then(preferences => {
        if (!cancelled) {
          setReaderPreferences(preferences);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotice(UI_STRINGS.storageUnavailable);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    adsProvider.initialize();
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

  const openStory = async (storyId: string) => {
    if (isLoading || !beginMutation()) {
      return;
    }

    setIsLoading(true);

    try {
      const storyPackage = storyLoader.load(storyId);
      const opened = await StorySession.open(storyPackage, storySaveRepository);
      const initialPageIndex = opened.snapshot.isEnded
        ? Number.MAX_SAFE_INTEGER
        : opened.snapshot.pageIndex;

      sessionRef.current = opened.session;
      hasStartedSessionRef.current = opened.resumed;
      resetReaderAdCadence();
      resetPagedReader(opened.snapshot.pageAnchor, initialPageIndex);
      setHasStartedSession(opened.resumed);
      setActiveStory(storyPackage.metadata);
      setSnapshot(opened.snapshot);
      setNotice(recoveryMessage(opened.recovery));

      if (!opened.resumed) {
        const persisted = await opened.session.flush();
        hasStartedSessionRef.current = true;
        setHasStartedSession(true);
        if (!persisted) {
          setNotice(UI_STRINGS.saveFailed);
        }
      }

      if (opened.snapshot.isEnded) {
        await recordEnding(storyId, opened.snapshot);
      }

      setScreen('reader');
    } catch {
      sessionRef.current = null;
      hasStartedSessionRef.current = false;
      resetReaderAdCadence();
      resetPagedReader(null, 0);
      setHasStartedSession(false);
      setActiveStory(null);
      setSnapshot(null);
      setNotice(UI_STRINGS.startupFailed);
      setScreen('catalog');
    } finally {
      setIsLoading(false);
      endMutation();
    }
  };

  const startFreshStory = async (storyId: string, countAsRestart: boolean) => {
    if (isLoading || !beginMutation()) {
      return;
    }

    setIsLoading(true);

    try {
      const storyPackage = storyLoader.load(storyId);
      const opened = await StorySession.open(storyPackage, storySaveRepository);
      const fresh = await opened.session.restart();

      sessionRef.current = opened.session;
      hasStartedSessionRef.current = true;
      resetReaderAdCadence();
      resetPagedReader(fresh.snapshot.pageAnchor, 0);
      setHasStartedSession(true);
      setActiveStory(storyPackage.metadata);
      setSnapshot(fresh.snapshot);
      setNotice(fresh.persisted ? null : UI_STRINGS.saveFailed);
      setScreen('reader');

      if (countAsRestart) {
        try {
          await adsProvider.showInterstitial('story-restart');
        } catch {
          // Ads remain fail-open and never block a fresh playthrough.
        }
      }
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      setIsLoading(false);
      endMutation();
    }
  };

  const choose = async (choiceIndex: number) => {
    const session = sessionRef.current;
    if (!session || !activeStory || !beginMutation()) {
      return;
    }

    const nextReaderPageIndex =
      readerMode === 'pages' ? pagedReader.currentPageIndex + 1 : undefined;

    try {
      const result = session.choose(choiceIndex, nextReaderPageIndex);

      hasStartedSessionRef.current = true;
      setHasStartedSession(true);
      if (readerMode === 'pages' && pagedInteractionVisible) {
        setPagedInteractionTargetPassageCount(result.snapshot.passages.length);
      }
      setSnapshot(result.snapshot);

      if (readerMode === 'feed') {
        const nextChoiceCount = feedChoiceCountRef.current + 1;
        feedChoiceCountRef.current = nextChoiceCount;
        setFeedBannerVisible(
          nextChoiceCount % ADS_CONFIG.bannerFrequency.feedChoicesPerBanner === 0,
        );
      }

      if (result.snapshot.isEnded) {
        void recordEnding(activeStory.id, result.snapshot);
      }

      setScreen('reader');

      const persisted = await result.persistence;
      setNotice(persisted ? null : UI_STRINGS.saveFailed);
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const restartActiveStory = async () => {
    setMenuView(null);
    const session = sessionRef.current;
    if (!session || !beginMutation()) {
      return;
    }

    try {
      const result = await session.restart();
      hasStartedSessionRef.current = true;
      resetReaderAdCadence();
      resetPagedReader(result.snapshot.pageAnchor, 0);
      setHasStartedSession(true);
      setSnapshot(result.snapshot);
      setNotice(result.persisted ? null : UI_STRINGS.saveFailed);
      setScreen('reader');

      try {
        await adsProvider.showInterstitial('story-restart');
      } catch {
        // Advertising is optional and must never block narrative reset.
      }
    } catch {
      setNotice(UI_STRINGS.storyActionFailed);
    } finally {
      endMutation();
    }
  };

  const canRestart = activeStory !== null &&
    (hasStartedSession || snapshot?.isEnded === true);

  const readerParagraphs = useMemo(
    () => buildReaderParagraphs(snapshot),
    [snapshot],
  );
  useEffect(() => {
    pagedReaderIndexRef.current = pagedReader.currentPageIndex;
  }, [pagedReader.currentPageIndex]);

  useEffect(() => {
    if (readerMode !== 'pages') {
      return;
    }

    setPagedReader(current => {
      if (!current.geometry) {
        return current;
      }

      return updatePagedReaderGeometry(current, {
        width: current.geometry.width,
        height: current.geometry.height,
        fontScale,
      });
    });
  }, [fontScale, readerMode]);

  useEffect(() => {
    if (readerMode !== 'pages' || !snapshot) {
      setPaginationRequest(null);
      return;
    }

    const nextRequest = planPaginationMeasurement(
      pagedReader,
      readerParagraphs,
      bannerReadyHeight,
      ADS_CONFIG.bannerFrequency.pagesPerBanner,
    );
    setPaginationRequest(current =>
      current?.key === nextRequest?.key ? current : nextRequest,
    );
  }, [
    bannerReadyHeight,
    pagedReader,
    readerMode,
    readerParagraphs,
    snapshot,
  ]);

  const currentPage = pagedReader.pages[pagedReader.currentPageIndex] ?? null;
  const readerContentCommitted =
    pagedReader.processedPassageCount === readerParagraphs.length;
  const pageTransitionReady =
    currentPage !== null &&
    currentPage.geometryRevision === pagedReader.geometryRevision &&
    paginationRequest === null &&
    readerContentCommitted;
  const canOpenPagedInteraction =
    pageTransitionReady &&
    pagedReader.currentPageIndex === pagedReader.pages.length - 1 &&
    (snapshot?.isEnded === true || Boolean(snapshot?.choices.length));
  const pagedInteractionTransitionPending =
    pagedInteractionTargetPassageCount !== null;
  const isPagedInteractionVisible =
    readerMode === 'pages' &&
    pagedInteractionVisible &&
    (pagedInteractionTransitionPending || canOpenPagedInteraction);
  const displayedPageNumber =
    !isPagedInteractionVisible && pageTransitionReady
      ? pagedReader.currentPageIndex + 1
      : null;
  const pageBannerActive =
    screen === 'reader' &&
    snapshot?.isEnded !== true &&
    readerMode === 'pages' &&
    !isPagedInteractionVisible &&
    currentPage !== null &&
    currentPage.bannerReserve > 0 &&
    currentPage.bannerReserve === bannerReadyHeight;
  const showReaderBanner =
    snapshot?.isEnded !== true &&
    (readerMode === 'pages'
      ? pageBannerActive
      : screen === 'reader' && feedBannerVisible);
  const isBusy = isLoading || isMutating;

  useEffect(() => {
    if (
      readerMode !== 'pages' ||
      pagedInteractionTargetPassageCount === null ||
      paginationRequest !== null ||
      pagedReader.processedPassageCount < pagedInteractionTargetPassageCount
    ) {
      return;
    }

    setPagedInteractionVisible(false);
    setPagedInteractionSnapshot(null);
    setPagedInteractionTargetPassageCount(null);
  }, [
    pagedInteractionTargetPassageCount,
    pagedReader.processedPassageCount,
    paginationRequest,
    readerMode,
  ]);

  const moveToPage = useCallback(
    (requestedPageIndex: number) => {
      const session = sessionRef.current;
      if (
        !session ||
        mutationLockRef.current ||
        pagedReader.pages.length === 0
      ) {
        return;
      }

      const nextPageIndex = clampPageIndex(
        requestedPageIndex,
        pagedReader.pages.length,
      );
      const previousPageIndex = pagedReaderIndexRef.current;
      if (nextPageIndex === previousPageIndex) {
        return;
      }

      const nextPage = pagedReader.pages[nextPageIndex];

      try {
        const pageUpdate = session.setPage(nextPageIndex, nextPage.anchor);
        pagedReaderIndexRef.current = nextPageIndex;
        setPagedInteractionVisible(false);
        setPagedInteractionSnapshot(null);
        setPagedInteractionTargetPassageCount(null);
        setPagedReader(current =>
          movePagedReaderToPage(current, nextPageIndex),
        );

        void pageUpdate.persistence.then(persisted => {
          if (!persisted && sessionRef.current === session) {
            setNotice(UI_STRINGS.saveFailed);
          }
        });
      } catch {
        pagedReaderIndexRef.current = previousPageIndex;
        setNotice(UI_STRINGS.storyActionFailed);
      }
    },
    [pagedReader.pages],
  );

  const openPagedInteraction = useCallback((): void => {
    if (!isBusy && canOpenPagedInteraction && snapshot) {
      setPagedInteractionSnapshot(snapshot);
      setPagedInteractionTargetPassageCount(null);
      setPagedInteractionVisible(true);
    }
  }, [canOpenPagedInteraction, isBusy, snapshot]);

  const closePagedInteraction = useCallback((): void => {
    if (pagedInteractionTransitionPending) {
      return;
    }

    setPagedInteractionVisible(false);
    setPagedInteractionSnapshot(null);
    setPagedInteractionTargetPassageCount(null);
  }, [pagedInteractionTransitionPending]);

  const advancePagedReader = useCallback((): void => {
    if (!pageTransitionReady || isBusy) {
      return;
    }

    const currentPageIndex = pagedReaderIndexRef.current;
    if (currentPageIndex < pagedReader.pages.length - 1) {
      void moveToPage(currentPageIndex + 1);
      return;
    }

    openPagedInteraction();
  }, [
    isBusy,
    moveToPage,
    openPagedInteraction,
    pageTransitionReady,
    pagedReader.pages.length,
  ]);

  const pagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          readerMode === 'pages' &&
          pageTransitionReady &&
          !isBusy &&
          shouldHandleHorizontalPageSwipe(gestureState.dx, gestureState.dy),
        onPanResponderRelease: (_event, gestureState) => {
          if (
            readerMode !== 'pages' ||
            !pageTransitionReady ||
            !shouldHandleHorizontalPageSwipe(gestureState.dx, gestureState.dy)
          ) {
            return;
          }

          if (gestureState.dx < 0) {
            advancePagedReader();
            return;
          }

          void moveToPage(
            pageAfterHorizontalSwipe(
              pagedReaderIndexRef.current,
              pagedReader.pages.length,
              gestureState.dx,
            ),
          );
        },
      }),
    [
      advancePagedReader,
      isBusy,
      moveToPage,
      pageTransitionReady,
      pagedReader.pages.length,
      readerMode,
    ],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (menuView !== null) {
          setMenuView(null);
          return true;
        }
        if (catalogRestartTarget !== null) {
          setCatalogRestartTarget(null);
          return true;
        }
        if (mutationLockRef.current) {
          return true;
        }
        if (screen === 'main') {
          return false;
        }
        if (screen === 'catalog' || screen === 'settings') {
          showMain();
          return true;
        }
        if (screen === 'endings') {
          setActiveStory(null);
          setUnlockedEndings([]);
          setScreen('catalog');
          return true;
        }
        if (
          screen === 'reader' &&
          readerMode === 'pages' &&
          isPagedInteractionVisible
        ) {
          closePagedInteraction();
          return true;
        }
        if (
          screen === 'reader' &&
          snapshot?.isEnded === true &&
          readerMode === 'pages' &&
          pageTransitionReady &&
          pagedReader.currentPageIndex > 0
        ) {
          void moveToPage(pagedReaderIndexRef.current - 1);
          return true;
        }

        exitStory();
        return true;
      },
    );

    return () => subscription.remove();
  }, [
    catalogRestartTarget,
    closePagedInteraction,
    exitStory,
    menuView,
    moveToPage,
    pageTransitionReady,
    isPagedInteractionVisible,
    pagedReader.currentPageIndex,
    readerMode,
    screen,
    showMain,
    snapshot?.isEnded,
  ]);

  const commitMeasuredLines = (
    request: PaginationMeasurementRequest,
    lines: readonly string[],
    measuredLineHeight?: number,
  ) => {
    if (lines.length === 0) {
      return;
    }

    setPagedReader(current =>
      commitPaginationMeasurement(
        current,
        request,
        lines,
        measuredLineHeight,
      ),
    );
    setPaginationRequest(current =>
      current?.key === request.key ? null : current,
    );
  };

  const renderChoices = (
    enabled: boolean,
    sourceSnapshot: StoryReaderSnapshot | null = snapshot,
  ) => {
    if (
      !sourceSnapshot ||
      sourceSnapshot.choices.length === 0 ||
      sourceSnapshot.isEnded
    ) {
      return null;
    }

    return (
      <View accessibilityLabel={UI_STRINGS.choicesLabel} style={styles.choicesZone}>
        {sourceSnapshot.choices.map((choice, ordinal) => {
          const choiceEnabled = enabled && choice.enabled;
          const label = choice.enabled ? choice.text : `🔒  ${choice.text}`;

          return (
            <Pressable
              accessibilityLabel={
                choice.enabled
                  ? choice.text
                  : `${UI_STRINGS.choiceLocked}: ${choice.text}`
              }
              accessibilityRole="button"
              accessibilityState={{disabled: isBusy || !choiceEnabled}}
              disabled={isBusy || !choiceEnabled}
              key={`${choice.index}:${ordinal}:${choice.text}`}
              onPress={() => {
                if (choice.enabled) {
                  void choose(choice.index);
                }
              }}
              style={({pressed}) => [
                styles.choice,
                {
                  backgroundColor: choice.enabled
                    ? readerPalette.surface
                    : readerPalette.surfaceMuted,
                  borderColor: readerPalette.border,
                },
                !choice.enabled && styles.choiceUnavailable,
                pressed && choiceEnabled && styles.buttonPressed,
                (isBusy || !enabled) && styles.disabled,
              ]}>
              <Text
                maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                style={[
                  styles.choiceText,
                  {color: choice.enabled ? readerPalette.text : readerPalette.muted},
                  !choice.enabled && styles.choiceTextUnavailable,
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderEndingActions = () => {
    if (!snapshot?.isEnded) {
      return null;
    }

    return (
      <View style={styles.endingDockContent}>
        <Text style={[styles.endingLabel, {color: readerPalette.muted}]}>
          {formatEndingDisplay(snapshot.endingId)}
        </Text>
        <View style={styles.endingActions}>
          <Pressable
            accessibilityLabel={UI_STRINGS.restart}
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => {
              void restartActiveStory();
            }}
            style={({pressed}) => [
              styles.endingPrimaryAction,
              {backgroundColor: readerPalette.primary},
              pressed && styles.buttonPressed,
              isBusy && styles.disabled,
            ]}>
            <Text
              style={[
                styles.catalogPrimaryActionText,
                {color: readerPalette.primaryText},
              ]}>
              {UI_STRINGS.restart}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel={UI_STRINGS.endingMenu}
            accessibilityRole="button"
            disabled={isBusy}
            onPress={exitStory}
            style={({pressed}) => [
              styles.endingSecondaryAction,
              {
                borderColor: readerPalette.border,
                backgroundColor: readerPalette.surface,
              },
              pressed && styles.buttonPressed,
              isBusy && styles.disabled,
            ]}>
            <Text style={[styles.menuActionText, {color: readerPalette.text}]}>
              {UI_STRINGS.endingMenu}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderReaderHeader = () => (
    <View
      style={[
        styles.readerHeader,
        {
          backgroundColor: readerPalette.background,
          borderBottomColor: readerPalette.border,
        },
      ]}>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={[styles.readerTitle, {color: readerPalette.text}]}>
        {activeStory?.title ?? UI_STRINGS.appTitle}
      </Text>
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
        <Text style={[styles.menuButtonText, {color: readerPalette.text}]}>⋮</Text>
      </Pressable>
    </View>
  );

  const renderReaderModeSelector = (palette: ReaderPalette) => (
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
              {
                borderColor: selected ? palette.text : palette.border,
                backgroundColor: selected ? palette.primary : palette.surface,
              },
              pressed && styles.buttonPressed,
            ]}>
            <Text
              maxFontSizeMultiplier={1.3}
              style={[
                styles.modeButtonText,
                {
                  color: selected ? palette.primaryText : palette.text,
                  fontWeight: selected ? '700' : '400',
                },
              ]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderReaderThemeSelector = (palette: ReaderPalette) => (
    <View style={styles.themeSelector}>
      {READER_THEMES.map(theme => {
        const selected = readerPreferences.theme === theme;
        return (
          <Pressable
            accessibilityLabel={READER_THEME_LABELS[theme]}
            accessibilityRole="button"
            accessibilityState={{selected}}
            key={theme}
            onPress={() => changeReaderTheme(theme)}
            style={({pressed}) => [
              styles.themeChip,
              {
                borderColor: selected ? palette.text : palette.border,
                backgroundColor: selected ? palette.primary : palette.surface,
              },
              pressed && styles.buttonPressed,
            ]}>
            <Text
              maxFontSizeMultiplier={1.25}
              style={[
                styles.themeChipText,
                {
                  color: selected ? palette.primaryText : palette.text,
                  fontWeight: selected ? '700' : '400',
                },
              ]}>
              {READER_THEME_LABELS[theme]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderReaderMenu = () => (
    <Modal
      animationType="fade"
      onRequestClose={() => setMenuView(null)}
      transparent
      visible={menuView !== null}>
      <Pressable style={styles.menuBackdrop} onPress={() => setMenuView(null)}>
        <Pressable
          onPress={event => event.stopPropagation()}
          style={[
            styles.menuSheet,
            {backgroundColor: readerPalette.surface},
          ]}>
          {menuView === 'restart' ? (
            <>
              <View style={styles.menuHeadingBlock}>
                <Text style={[styles.menuTitle, {color: readerPalette.text}]}>
                  {UI_STRINGS.restart}?
                </Text>
                <Text
                  style={[
                    styles.menuDescription,
                    {color: readerPalette.muted},
                  ]}>
                  {UI_STRINGS.restartConfirmation}
                </Text>
              </View>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMenuView('menu')}
                  style={({pressed}) => [
                    styles.confirmButton,
                    {backgroundColor: readerPalette.surfaceMuted},
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={[styles.menuActionText, {color: readerPalette.text}]}>
                    {UI_STRINGS.cancel}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => {
                    void restartActiveStory();
                  }}
                  style={({pressed}) => [
                    styles.confirmButton,
                    {backgroundColor: readerPalette.danger},
                    pressed && styles.buttonPressed,
                    isBusy && styles.disabled,
                  ]}>
                  <Text style={[styles.menuActionText, styles.whiteText]}>
                    {UI_STRINGS.restart}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.menuGrabber,
                  {backgroundColor: readerPalette.muted},
                ]}
              />
              <View style={styles.menuTitleRow}>
                <Text style={[styles.menuTitle, {color: readerPalette.text}]}>
                  {UI_STRINGS.menu}
                </Text>
                <Pressable
                  accessibilityLabel={UI_STRINGS.close}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setMenuView(null)}
                  style={styles.menuCloseIcon}>
                  <Text style={[styles.menuCloseIconText, {color: readerPalette.text}]}>
                    ×
                  </Text>
                </Pressable>
              </View>

              <View style={styles.menuSection}>
                <Text style={[styles.menuSectionLabel, {color: readerPalette.muted}]}>
                  {UI_STRINGS.readerModeLabel}
                </Text>
                {renderReaderModeSelector(readerPalette)}
              </View>

              <View style={styles.menuSection}>
                <Text style={[styles.menuSectionLabel, {color: readerPalette.muted}]}>
                  {UI_STRINGS.readerThemeLabel}
                </Text>
                {renderReaderThemeSelector(readerPalette)}
              </View>

              <View
                style={[styles.menuDivider, {backgroundColor: readerPalette.border}]}
              />
              <Pressable
                accessibilityRole="button"
                onPress={exitStory}
                style={({pressed}) => [
                  styles.menuRow,
                  pressed && {backgroundColor: readerPalette.surfaceMuted},
                ]}>
                <Text style={[styles.menuRowIcon, {color: readerPalette.text}]}>←</Text>
                <Text style={[styles.menuRowText, {color: readerPalette.text}]}>
                  {UI_STRINGS.returnToCatalog}
                </Text>
              </Pressable>

              {canRestart ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMenuView('restart')}
                  style={({pressed}) => [
                    styles.menuRow,
                    pressed && {backgroundColor: readerPalette.surfaceMuted},
                  ]}>
                  <Text style={[styles.menuRowIcon, {color: readerPalette.danger}]}>↻</Text>
                  <Text style={[styles.menuRowText, {color: readerPalette.danger}]}>
                    {UI_STRINGS.restart}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderCatalogRestartConfirmation = () => (
    <Modal
      animationType="fade"
      onRequestClose={() => setCatalogRestartTarget(null)}
      transparent
      visible={catalogRestartTarget !== null}>
      <Pressable
        style={styles.centerModalBackdrop}
        onPress={() => setCatalogRestartTarget(null)}>
        <Pressable
          onPress={event => event.stopPropagation()}
          style={[
            styles.dialog,
            {backgroundColor: appColors.surface, borderColor: appColors.border},
          ]}>
          <Text style={[styles.dialogTitle, {color: appColors.text}]}>
            {UI_STRINGS.restart}?
          </Text>
          <Text style={[styles.dialogText, {color: appColors.muted}]}>
            {UI_STRINGS.restartConfirmation}
          </Text>
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCatalogRestartTarget(null)}
              style={({pressed}) => [
                styles.confirmButton,
                {backgroundColor: appColors.surfaceMuted},
                pressed && styles.buttonPressed,
              ]}>
              <Text style={[styles.menuActionText, {color: appColors.text}]}>
                {UI_STRINGS.cancel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const storyId = catalogRestartTarget;
                setCatalogRestartTarget(null);
                if (storyId) {
                  void startFreshStory(storyId, true);
                }
              }}
              style={({pressed}) => [
                styles.confirmButton,
                {backgroundColor: appColors.danger},
                pressed && styles.buttonPressed,
              ]}>
              <Text style={[styles.menuActionText, styles.whiteText]}>
                {UI_STRINGS.restart}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const activeEndingTotal = activeStory
    ? catalogItems.find(item => item.metadata.id === activeStory.id)
        ?.totalEndingCount ?? null
    : null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={readerPalette.statusBar} />
      <SafeAreaView
        style={[styles.safeArea, {backgroundColor: appColors.background}]}>
        <AdsBanner
          isDarkMode={readerPalette.statusBar === 'light-content'}
          onReadyHeightChange={setBannerReadyHeight}
          reserveSpace={false}
          visible={showReaderBanner}
        />

        {screen === 'main' ? (
          <View style={styles.screen}>
            <View style={styles.mainContent}>
              <View style={styles.mainCopy}>
                <Text
                  maxFontSizeMultiplier={1.25}
                  style={[styles.mainTitle, {color: appColors.text}]}>
                  {UI_STRINGS.appTitle}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.mainDescription, {color: appColors.muted}]}>
                  {UI_STRINGS.anthologyDescription}
                </Text>
              </View>

              <View style={styles.mainActions}>
                <Pressable
                  accessibilityLabel={UI_STRINGS.stories}
                  accessibilityRole="button"
                  onPress={showCatalog}
                  style={({pressed}) => [
                    styles.mainPrimaryAction,
                    {backgroundColor: appColors.primary},
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text
                    maxFontSizeMultiplier={1.25}
                    style={[
                      styles.mainPrimaryActionText,
                      {color: appColors.primaryText},
                    ]}>
                    {UI_STRINGS.stories}
                  </Text>
                  <Text style={[styles.actionArrow, {color: appColors.primaryText}]}>
                    →
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityLabel={UI_STRINGS.settings}
                  accessibilityRole="button"
                  onPress={showSettings}
                  style={({pressed}) => [
                    styles.mainSecondaryAction,
                    {
                      backgroundColor: appColors.surface,
                      borderColor: appColors.border,
                    },
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text
                    maxFontSizeMultiplier={1.25}
                    style={[styles.mainSecondaryActionText, {color: appColors.text}]}>
                    {UI_STRINGS.settings}
                  </Text>
                  <Text style={[styles.settingsGlyph, {color: appColors.muted}]}>⚙</Text>
                </Pressable>
              </View>
            </View>
            <Text style={[styles.versionLabel, {color: appColors.muted}]}>
              v{APP_CONFIG.versionName}
            </Text>
          </View>
        ) : null}

        {screen === 'catalog' ? (
          <View style={styles.screen}>
            <AppHeader
              title={UI_STRINGS.stories}
              onBack={showMain}
              colors={appColors}
              disabled={isBusy}
            />
            <ScrollView
              contentContainerStyle={styles.catalogList}
              style={styles.readerScroll}>
              {notice ? <Notice text={notice} colors={appColors} /> : null}
              {isLoading ? (
                <Text style={[styles.loading, {color: appColors.muted}]}>
                  {UI_STRINGS.loadingCatalog}
                </Text>
              ) : null}
              {!isLoading && storyMetadata.length === 0 ? (
                <Text style={[styles.emptyText, {color: appColors.muted}]}>
                  {UI_STRINGS.catalogEmpty}
                </Text>
              ) : null}

              {catalogItems.map(item => (
                <View
                  key={item.metadata.id}
                  style={[
                    styles.catalogCard,
                    {
                      backgroundColor: appColors.surface,
                      borderColor: appColors.border,
                    },
                  ]}>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.catalogCardTitle, {color: appColors.text}]}>
                    {item.metadata.title}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                    style={[
                      styles.catalogCardDescription,
                      {color: appColors.muted},
                    ]}>
                    {item.metadata.description}
                  </Text>

                  {item.progress !== 'not-started' ? (
                    <Text style={[styles.progressText, {color: appColors.muted}]}>
                      {item.progress === 'completed'
                        ? UI_STRINGS.progressCompleted
                        : UI_STRINGS.progressStarted}
                    </Text>
                  ) : null}

                  <Pressable
                    accessibilityLabel={catalogPrimaryLabel(item)}
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() => {
                      if (item.action === 'restart') {
                        void startFreshStory(item.metadata.id, true);
                      } else {
                        void openStory(item.metadata.id);
                      }
                    }}
                    style={({pressed}) => [
                      styles.catalogPrimaryAction,
                      {backgroundColor: appColors.primary},
                      pressed && styles.buttonPressed,
                      isBusy && styles.disabled,
                    ]}>
                    <Text
                      maxFontSizeMultiplier={1.25}
                      style={[
                        styles.catalogPrimaryActionText,
                        {color: appColors.primaryText},
                      ]}>
                      {catalogPrimaryLabel(item)}
                    </Text>
                  </Pressable>

                  <View style={styles.catalogSecondaryRow}>
                    {item.progress === 'in-progress' ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy}
                        onPress={() => setCatalogRestartTarget(item.metadata.id)}
                        style={({pressed}) => [
                          styles.textAction,
                          pressed && styles.buttonPressed,
                        ]}>
                        <Text style={[styles.textActionLabel, {color: appColors.muted}]}>
                          {UI_STRINGS.restart}
                        </Text>
                      </Pressable>
                    ) : (
                      <View />
                    )}

                    <Pressable
                      accessibilityRole="button"
                      disabled={isBusy}
                      onPress={() => {
                        void showEndings(item.metadata);
                      }}
                      style={({pressed}) => [
                        styles.textAction,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={[styles.textActionLabel, {color: appColors.text}]}>
                        {UI_STRINGS.endings} · {formatEndingProgress(item)} →
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {screen === 'settings' ? (
          <View style={styles.screen}>
            <AppHeader
              title={UI_STRINGS.settings}
              onBack={showMain}
              colors={appColors}
              disabled={isBusy}
            />
            <ScrollView contentContainerStyle={styles.settingsContent}>
              {notice ? <Notice text={notice} colors={appColors} /> : null}
              <Text style={[styles.settingsSectionTitle, {color: appColors.muted}]}>
                {UI_STRINGS.reading}
              </Text>

              <View style={styles.settingsGroup}>
                <Text style={[styles.settingsLabel, {color: appColors.text}]}>
                  {UI_STRINGS.readerModeLabel}
                </Text>
                {renderReaderModeSelector(readerPalette)}
              </View>

              <View style={styles.settingsGroup}>
                <Text style={[styles.settingsLabel, {color: appColors.text}]}>
                  {UI_STRINGS.readerThemeLabel}
                </Text>
                {renderReaderThemeSelector(readerPalette)}
                <Text style={[styles.settingsHint, {color: appColors.muted}]}>
                  {UI_STRINGS.readerThemeHint}
                </Text>
              </View>
            </ScrollView>
          </View>
        ) : null}

        {screen === 'endings' && activeStory ? (
          <View style={styles.screen}>
            <AppHeader
              title={UI_STRINGS.endings}
              subtitle={activeStory.title}
              onBack={() => {
                setActiveStory(null);
                setUnlockedEndings([]);
                setScreen('catalog');
              }}
              colors={appColors}
              disabled={isBusy}
            />
            <ScrollView contentContainerStyle={styles.endingsList}>
              {notice ? <Notice text={notice} colors={appColors} /> : null}
              <Text style={[styles.endingsCount, {color: appColors.muted}]}>
                {UI_STRINGS.endingsOpened}: {unlockedEndings.length}
                {activeEndingTotal === null ? '' : ` / ${activeEndingTotal}`}
              </Text>
              {isLoading ? (
                <Text style={[styles.loading, {color: appColors.muted}]}>
                  {UI_STRINGS.loadingEndings}
                </Text>
              ) : null}
              {!isLoading && unlockedEndings.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    {
                      backgroundColor: appColors.surface,
                      borderColor: appColors.border,
                    },
                  ]}>
                  <Text style={[styles.emptyCardTitle, {color: appColors.text}]}>
                    {UI_STRINGS.endingsEmptyTitle}
                  </Text>
                  <Text style={[styles.emptyText, {color: appColors.muted}]}>
                    {UI_STRINGS.endingsEmptyDescription}
                  </Text>
                </View>
              ) : null}
              {unlockedEndings.map(ending => (
                <View
                  key={ending.id}
                  style={[
                    styles.endingCard,
                    {
                      backgroundColor: appColors.surface,
                      borderColor: appColors.border,
                    },
                  ]}>
                  <Text style={[styles.endingCardTitle, {color: appColors.text}]}>
                    {formatEndingDisplay(ending.id)}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                    style={[styles.endingCardText, {color: appColors.muted}]}>
                    {ending.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {screen === 'reader' && snapshot && activeStory ? (
          <View style={[styles.screen, {backgroundColor: readerPalette.background}]}>
            {renderReaderHeader()}
            {notice ? <ReaderNotice text={notice} palette={readerPalette} /> : null}

            {readerMode === 'pages' ? (
              <View style={styles.pageReaderContent}>
                {paginationRequest ? (
                  <Text
                    key={`measurement-${paginationRequest.key}`}
                    maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                    onTextLayout={(event: TextLayoutEvent) => {
                      const measuredLines = event.nativeEvent.lines;
                      commitMeasuredLines(
                        paginationRequest,
                        measuredLines.map(line => line.text),
                        measuredLines.length > 0
                          ? Math.max(...measuredLines.map(line => line.height))
                          : undefined,
                      );
                    }}
                    pointerEvents="none"
                    style={[
                      styles.measureText,
                      {width: paginationRequest.geometry.width},
                    ]}>
                    {paginationRequest.text}
                  </Text>
                ) : null}

                {isPagedInteractionVisible ? (
                  <>
                    <ScrollView
                      contentContainerStyle={styles.pagedInteractionContent}
                      style={styles.pagedInteractionScroll}>
                      {(pagedInteractionSnapshot ?? snapshot).isEnded
                        ? renderEndingActions()
                        : renderChoices(
                            !pagedInteractionTransitionPending,
                            pagedInteractionSnapshot ?? snapshot,
                          )}
                    </ScrollView>

                    <View style={styles.pageFooter}>
                      <Pressable
                        accessibilityLabel={UI_STRINGS.previousPage}
                        accessibilityRole="button"
                        disabled={isBusy || pagedInteractionTransitionPending}
                        onPress={closePagedInteraction}
                        style={({pressed}) => [
                          styles.pageNavButton,
                          {borderColor: readerPalette.border},
                          pressed && styles.buttonPressed,
                          (isBusy || pagedInteractionTransitionPending) &&
                            styles.disabled,
                        ]}>
                        <Text
                          style={[
                            styles.pageNavText,
                            {color: readerPalette.text},
                          ]}>
                          ←
                        </Text>
                      </Pressable>

                      <View style={styles.pageFooterCenterSpacer} />
                      <View style={styles.pageFooterButtonSpacer} />
                    </View>
                  </>
                ) : (
                  <>
                    <View
                      collapsable={false}
                      onLayout={(event: LayoutChangeEvent) => {
                        const {width, height} = event.nativeEvent.layout;
                        setPagedReader(current =>
                          updatePagedReaderGeometry(current, {
                            width,
                            height:
                              height +
                              (pageBannerActive ? currentPage.bannerReserve : 0),
                            fontScale,
                          }),
                        );
                      }}
                      style={styles.pageBody}>
                      <View
                        {...pagePanResponder.panHandlers}
                        collapsable={false}
                        style={styles.pageTextArea}>
                        {pageTransitionReady && currentPage ? (
                          <Text
                            key={`page-${currentPage.key}`}
                            maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                            style={[
                              styles.storyParagraph,
                              {color: readerPalette.text},
                            ]}>
                            {currentPage.paragraphs.join('\n')}
                          </Text>
                        ) : null}

                        <View pointerEvents="box-none" style={styles.tapZones}>
                          <Pressable
                            accessibilityLabel={UI_STRINGS.previousPage}
                            disabled={
                              isBusy ||
                              !pageTransitionReady ||
                              pagedReader.currentPageIndex === 0
                            }
                            onPress={() => {
                              void moveToPage(pagedReaderIndexRef.current - 1);
                            }}
                            style={styles.tapZone}
                          />
                          <Pressable
                            accessibilityLabel={UI_STRINGS.nextPage}
                            disabled={
                              isBusy ||
                              !pageTransitionReady ||
                              (pagedReader.currentPageIndex >=
                                pagedReader.pages.length - 1 &&
                                !canOpenPagedInteraction)
                            }
                            onPress={advancePagedReader}
                            style={styles.tapZone}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.pageFooter}>
                      <Pressable
                        accessibilityLabel={UI_STRINGS.previousPage}
                        accessibilityRole="button"
                        disabled={
                          isBusy ||
                          !pageTransitionReady ||
                          pagedReader.currentPageIndex === 0
                        }
                        onPress={() => {
                          void moveToPage(pagedReaderIndexRef.current - 1);
                        }}
                        style={({pressed}) => [
                          styles.pageNavButton,
                          {borderColor: readerPalette.border},
                          pressed && styles.buttonPressed,
                          (isBusy ||
                            !pageTransitionReady ||
                            pagedReader.currentPageIndex === 0) &&
                            styles.disabled,
                        ]}>
                        <Text
                          style={[
                            styles.pageNavText,
                            {color: readerPalette.text},
                          ]}>
                          ←
                        </Text>
                      </Pressable>

                      <Text
                        key={`page-counter-${displayedPageNumber ?? 'pending'}`}
                        style={[
                          styles.pageCounter,
                          {color: readerPalette.muted},
                        ]}>
                        {displayedPageNumber ?? ''}
                      </Text>

                      <Pressable
                        accessibilityLabel={UI_STRINGS.nextPage}
                        accessibilityRole="button"
                        disabled={
                          isBusy ||
                          !pageTransitionReady ||
                          (pagedReader.currentPageIndex >=
                            pagedReader.pages.length - 1 &&
                            !canOpenPagedInteraction)
                        }
                        onPress={advancePagedReader}
                        style={({pressed}) => [
                          styles.pageNavButton,
                          {borderColor: readerPalette.border},
                          pressed && styles.buttonPressed,
                          (isBusy ||
                            !pageTransitionReady ||
                            (pagedReader.currentPageIndex >=
                              pagedReader.pages.length - 1 &&
                              !canOpenPagedInteraction)) &&
                            styles.disabled,
                        ]}>
                        <Text
                          style={[
                            styles.pageNavText,
                            {color: readerPalette.text},
                          ]}>
                          →
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.readerContent}
                style={styles.readerScroll}>
                <View style={styles.feedText}>
                  {snapshot.passages
                    .filter(
                      passage =>
                        !passage.startsWith(FORCED_PAGE_BREAK_MARKER),
                    )
                    .map((passage, index) => (
                      <Text
                        key={`${index}-${passage.slice(0, 24)}`}
                        maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                        style={[styles.storyParagraph, {color: readerPalette.text}]}>
                        {indentReaderParagraph(passage)}
                      </Text>
                    ))}
                </View>
                {snapshot.isEnded ? renderEndingActions() : renderChoices(true)}
              </ScrollView>
            )}
          </View>
        ) : null}

        {renderReaderMenu()}
        {renderCatalogRestartConfirmation()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppHeader({
  title,
  subtitle,
  onBack,
  colors,
  disabled,
}: Readonly<{
  title: string;
  subtitle?: string;
  onBack(): void;
  colors: AppColors;
  disabled: boolean;
}>): React.JSX.Element {
  return (
    <View style={[styles.appHeader, {borderBottomColor: colors.border}]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={onBack}
        style={({pressed}) => [
          styles.appHeaderBack,
          pressed && styles.buttonPressed,
          disabled && styles.disabled,
        ]}>
        <Text style={[styles.appHeaderBackText, {color: colors.text}]}>←</Text>
      </Pressable>
      <View style={styles.appHeaderTitleBlock}>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={[styles.appHeaderTitle, {color: colors.text}]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={[styles.appHeaderSubtitle, {color: colors.muted}]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.appHeaderSpacer} />
    </View>
  );
}

function Notice({
  text,
  colors,
}: Readonly<{text: string; colors: AppColors}>): React.JSX.Element {
  return (
    <Text
      style={[
        styles.notice,
        {backgroundColor: colors.surfaceMuted, color: colors.text},
      ]}>
      {text}
    </Text>
  );
}

function ReaderNotice({
  text,
  palette,
}: Readonly<{text: string; palette: ReaderPalette}>): React.JSX.Element {
  return (
    <Text
      style={[
        styles.readerNotice,
        {backgroundColor: palette.surfaceMuted, color: palette.text},
      ]}>
      {text}
    </Text>
  );
}

function catalogPrimaryLabel(item: StoryCatalogItem): string {
  switch (item.action) {
    case 'start':
      return UI_STRINGS.catalogStart;
    case 'continue':
      return UI_STRINGS.continueStory;
    case 'restart':
      return UI_STRINGS.restart;
  }
}

function formatEndingProgress(item: StoryCatalogItem): string {
  return item.totalEndingCount === null
    ? String(item.unlockedEndingCount)
    : `${item.unlockedEndingCount}/${item.totalEndingCount}`;
}

function formatEndingDisplay(endingId: string | null): string {
  if (!endingId) {
    return UI_STRINGS.endingLabel;
  }

  const match = /^e(\d+)(?:[_-](.+))?$/i.exec(endingId.trim());
  if (!match) {
    return `${UI_STRINGS.endingLabel} · ${endingId}`;
  }

  const number = match[1];
  const rawName = match[2] ?? '';
  const words = rawName
    .split(/[_-]+/g)
    .map(word => word.trim())
    .filter(Boolean);
  const joinedName = words.join(' ');
  const name = joinedName
    ? `${joinedName.charAt(0).toUpperCase()}${joinedName.slice(1)}`
    : '';

  return `${UI_STRINGS.endingLabel} №${number}${name ? ` · ${name}` : ''}`;
}

function buildReaderParagraphs(
  snapshot: StoryReaderSnapshot | null,
): string[] {
  if (!snapshot) {
    return [];
  }

  const passages = snapshot.passages
    .map(passage => passage.trim())
    .filter(passage => passage.length > 0);

  if (passages.length === 0) {
    return splitParagraphs(snapshot.text);
  }

  if (
    !snapshot.isEnded ||
    passages.some(passage => passage.startsWith(FORCED_PAGE_BREAK_MARKER))
  ) {
    return passages;
  }

  const current = splitParagraphs(snapshot.text);
  const historyLength = Math.max(0, passages.length - current.length);
  const history = passages.slice(0, historyLength);

  if (history.length === 0) {
    return current;
  }

  return [...history, FORCED_PAGE_BREAK_MARKER, ...current];
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(paragraph => paragraph.length > 0);
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
  safeArea: {flex: 1},
  screen: {flex: 1},
  buttonPressed: {opacity: 0.68},
  disabled: {opacity: 0.38},
  whiteText: {color: '#ffffff'},
  pagedBannerSlot: {flexShrink: 0, overflow: 'hidden'},
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 34,
  },
  mainCopy: {gap: 20},
  mainTitle: {
    maxWidth: 640,
    fontSize: 38,
    lineHeight: 45,
    fontWeight: '800',
  },
  mainDescription: {maxWidth: 620, fontSize: 18, lineHeight: 27},
  mainActions: {gap: 12},
  mainPrimaryAction: {
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainPrimaryActionText: {fontSize: 18, lineHeight: 24, fontWeight: '800'},
  actionArrow: {fontSize: 25, lineHeight: 28},
  mainSecondaryAction: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainSecondaryActionText: {fontSize: 17, lineHeight: 23, fontWeight: '700'},
  settingsGlyph: {fontSize: 20},
  versionLabel: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    fontSize: 12,
    lineHeight: 16,
  },
  appHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  appHeaderBack: {
    width: 52,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appHeaderBackText: {fontSize: 27, lineHeight: 30},
  appHeaderTitleBlock: {flex: 1, alignItems: 'center', gap: 1},
  appHeaderTitle: {fontSize: 20, lineHeight: 26, fontWeight: '800'},
  appHeaderSubtitle: {fontSize: 12, lineHeight: 16},
  appHeaderSpacer: {width: 52},
  catalogList: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 14,
  },
  catalogCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  catalogCardTitle: {fontSize: 22, lineHeight: 29, fontWeight: '800'},
  catalogCardDescription: {fontSize: 16, lineHeight: 24},
  progressText: {fontSize: 13, lineHeight: 18},
  catalogPrimaryAction: {
    minHeight: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  catalogPrimaryActionText: {fontSize: 16, lineHeight: 22, fontWeight: '800'},
  catalogSecondaryRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textAction: {minHeight: 34, justifyContent: 'center', paddingHorizontal: 2},
  textActionLabel: {fontSize: 14, lineHeight: 20, fontWeight: '600'},
  loading: {fontSize: 15, lineHeight: 21},
  emptyText: {fontSize: 15, lineHeight: 22},
  notice: {borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20},
  settingsContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 28,
  },
  settingsSectionTitle: {fontSize: 14, lineHeight: 20, fontWeight: '800'},
  settingsGroup: {gap: 12},
  settingsLabel: {fontSize: 17, lineHeight: 23, fontWeight: '700'},
  settingsHint: {fontSize: 13, lineHeight: 19},
  endingsList: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 14,
  },
  endingsCount: {fontSize: 14, lineHeight: 20},
  emptyCard: {borderRadius: 18, borderWidth: 1, padding: 18, gap: 8},
  emptyCardTitle: {fontSize: 18, lineHeight: 24, fontWeight: '800'},
  endingCard: {borderRadius: 18, borderWidth: 1, padding: 18, gap: 10},
  endingCardTitle: {fontSize: 18, lineHeight: 24, fontWeight: '800'},
  endingCardText: {fontSize: 15, lineHeight: 23},
  readerHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readerTitle: {flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700'},
  menuButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {fontSize: 30, lineHeight: 32},
  readerNotice: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 60,
    zIndex: 20,
    borderRadius: 10,
    padding: 9,
    fontSize: 13,
    lineHeight: 18,
  },
  pageReaderContent: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
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
    top: -10000,
    opacity: 0,
    color: 'transparent',
    fontSize: 18,
    lineHeight: STORY_LINE_HEIGHT,
    textAlign: 'justify',
    includeFontPadding: false,
  },
  pageTextArea: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  tapZones: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    flexDirection: 'row',
  },
  tapZone: {flex: 1},
  pageFooter: {
    flexShrink: 0,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageNavButton: {
    width: 56,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
  },
  pageNavText: {fontSize: 20, lineHeight: 22, fontWeight: '700'},
  pageCounter: {fontSize: 13, lineHeight: 18, textAlign: 'center'},
  pageFooterCenterSpacer: {flex: 1},
  pageFooterButtonSpacer: {width: 56, minHeight: 42},
  pagedInteractionScroll: {flex: 1},
  pagedInteractionContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  readerScroll: {flex: 1},
  readerContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    gap: 20,
  },
  feedText: {gap: 0},
  storyParagraph: {
    fontSize: 18,
    lineHeight: STORY_LINE_HEIGHT,
    textAlign: 'justify',
    includeFontPadding: false,
  },
  choicesZone: {flexShrink: 0, gap: CHOICE_GAP},
  choice: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceUnavailable: {borderStyle: 'dashed'},
  choiceText: {fontSize: 16, lineHeight: 22},
  choiceTextUnavailable: {fontStyle: 'italic'},
  endingDockContent: {gap: 8},
  endingLabel: {fontSize: 13, lineHeight: 18, fontWeight: '700'},
  endingActions: {flexDirection: 'row', gap: 10},
  endingPrimaryAction: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  endingSecondaryAction: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 16,
  },
  menuGrabber: {
    width: 44,
    height: 4,
    alignSelf: 'center',
    borderRadius: 999,
    opacity: 0.8,
  },
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuTitle: {fontSize: 24, lineHeight: 30, fontWeight: '800'},
  menuCloseIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCloseIconText: {fontSize: 30, lineHeight: 32},
  menuHeadingBlock: {gap: 8, paddingTop: 8},
  menuDescription: {fontSize: 15, lineHeight: 22},
  menuSection: {gap: 10},
  menuSectionLabel: {fontSize: 13, lineHeight: 18, fontWeight: '700'},
  modeSelector: {flexDirection: 'row', gap: 8},
  modeButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  modeButtonText: {fontSize: 15, lineHeight: 20},
  themeSelector: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  themeChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  themeChipText: {fontSize: 14, lineHeight: 19},
  menuDivider: {height: StyleSheet.hairlineWidth},
  menuRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  menuRowIcon: {width: 26, fontSize: 22, textAlign: 'center'},
  menuRowText: {fontSize: 16, lineHeight: 22, fontWeight: '600'},
  confirmActions: {flexDirection: 'row', gap: 10, marginTop: 4},
  confirmButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    paddingHorizontal: 10,
  },
  menuActionText: {fontSize: 15, lineHeight: 20, fontWeight: '700'},
  centerModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  dialog: {borderWidth: 1, borderRadius: 22, padding: 20, gap: 12},
  dialogTitle: {fontSize: 21, lineHeight: 27, fontWeight: '800'},
  dialogText: {fontSize: 15, lineHeight: 22},
});