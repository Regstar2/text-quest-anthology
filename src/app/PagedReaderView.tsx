import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextLayoutEvent,
} from 'react-native';
import {UI_STRINGS} from '../config/uiStrings';
import {
  PAGE_VERTICAL_PADDING,
  READER_MAX_FONT_SIZE_MULTIPLIER,
  STORY_LINE_HEIGHT,
  type PaginationMeasurementRequest,
} from './PagedReaderPagination';
import type {PagedReaderBehavior} from './PagedReaderBehavior';
import type {ReaderPalette} from './ReaderTheme';

export type PagedReaderViewProps = Readonly<{
  behavior: PagedReaderBehavior;
  paginationRequest: PaginationMeasurementRequest | null;
  palette: ReaderPalette;
  busy: boolean;
  pagePanHandlers?: React.ComponentProps<typeof View>;
  interactionContent: React.ReactNode;
  onMeasurement(
    request: PaginationMeasurementRequest,
    lines: readonly string[],
    measuredLineHeight?: number,
  ): void;
  onPageLayout(width: number, height: number): void;
  onPrevious(): void;
  onNext(): void;
  onCloseInteraction(): void;
}>;

export function PagedReaderView({
  behavior,
  paginationRequest,
  palette,
  busy,
  pagePanHandlers,
  interactionContent,
  onMeasurement,
  onPageLayout,
  onPrevious,
  onNext,
  onCloseInteraction,
}: PagedReaderViewProps): React.JSX.Element {
  const previousDisabled = busy || !behavior.canGoPrevious;
  const nextDisabled = busy || !behavior.canGoNext;

  return (
    <View style={styles.pageReaderContent}>
      {paginationRequest ? (
        <Text
          key={`measurement-${paginationRequest.key}`}
          maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
          onTextLayout={(event: TextLayoutEvent) => {
            const measuredLines = event.nativeEvent.lines;
            onMeasurement(
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

      {behavior.interactionVisible ? (
        <>
          <ScrollView
            contentContainerStyle={styles.pagedInteractionContent}
            style={styles.pagedInteractionScroll}>
            {interactionContent}
          </ScrollView>

          <View style={styles.pageFooter}>
            <Pressable
              accessibilityLabel={UI_STRINGS.previousPage}
              accessibilityRole="button"
              disabled={busy || behavior.interactionTransitionPending}
              onPress={onCloseInteraction}
              style={({pressed}) => [
                styles.pageNavButton,
                {borderColor: palette.border},
                pressed && styles.buttonPressed,
                (busy || behavior.interactionTransitionPending) &&
                  styles.disabled,
              ]}>
              <Text style={[styles.pageNavText, {color: palette.text}]}>←</Text>
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
              onPageLayout(width, height);
            }}
            style={styles.pageBody}>
            <View
              {...pagePanHandlers}
              collapsable={false}
              style={styles.pageTextArea}>
              {behavior.pageTransitionReady && behavior.currentPage ? (
                <Text
                  key={`page-${behavior.currentPage.key}`}
                  maxFontSizeMultiplier={READER_MAX_FONT_SIZE_MULTIPLIER}
                  style={[styles.storyParagraph, {color: palette.text}]}>
                  {behavior.currentPage.paragraphs.join('\n')}
                </Text>
              ) : null}

              <View pointerEvents="box-none" style={styles.tapZones}>
                <Pressable
                  accessibilityLabel={UI_STRINGS.previousPage}
                  disabled={previousDisabled}
                  onPress={onPrevious}
                  style={styles.tapZone}
                />
                <Pressable
                  accessibilityLabel={UI_STRINGS.nextPage}
                  disabled={nextDisabled}
                  onPress={onNext}
                  style={styles.tapZone}
                />
              </View>
            </View>
          </View>

          <View style={styles.pageFooter}>
            <Pressable
              accessibilityLabel={UI_STRINGS.previousPage}
              accessibilityRole="button"
              disabled={previousDisabled}
              onPress={onPrevious}
              style={({pressed}) => [
                styles.pageNavButton,
                {borderColor: palette.border},
                pressed && styles.buttonPressed,
                previousDisabled && styles.disabled,
              ]}>
              <Text style={[styles.pageNavText, {color: palette.text}]}>←</Text>
            </Pressable>

            <Text
              key={`page-counter-${behavior.displayedPageNumber ?? 'pending'}`}
              style={[styles.pageCounter, {color: palette.muted}]}>
              {behavior.displayedPageNumber ?? ''}
            </Text>

            <Pressable
              accessibilityLabel={UI_STRINGS.nextPage}
              accessibilityRole="button"
              disabled={nextDisabled}
              onPress={onNext}
              style={({pressed}) => [
                styles.pageNavButton,
                {borderColor: palette.border},
                pressed && styles.buttonPressed,
                nextDisabled && styles.disabled,
              ]}>
              <Text style={[styles.pageNavText, {color: palette.text}]}>→</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  storyParagraph: {
    fontSize: 18,
    lineHeight: STORY_LINE_HEIGHT,
    textAlign: 'justify',
    includeFontPadding: false,
  },
  buttonPressed: {opacity: 0.68},
  disabled: {opacity: 0.38},
});
