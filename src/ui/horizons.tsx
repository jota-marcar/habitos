// The carousel of the main screen, with a page per horizon (RF-33, ADR-0021). Only the box
// slides: the title stays in its place, fading into the title of the next page along the way.

import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { fontSize, radius, spacing, useColors } from "./theme";

/** The pages of the main screen, in the order they are swiped through. */
export const HORIZONS = ["habits", "weekly"] as const;
export type Horizon = (typeof HORIZONS)[number];

const LAST_PAGE = HORIZONS.length - 1;

export interface HorizonsState {
  /** The page that takes up most of the screen. */
  readonly horizon: Horizon;
  /** Where the carousel is, in pages: 0.5 is halfway between the first and the second. */
  readonly position: SharedValue<number>;
  /** Follows the scroll of the carousel, whose pages are `width` wide. */
  readonly onOffset: (offset: number, width: number) => void;
}

export function useHorizons(): HorizonsState {
  const position = useSharedValue(0);
  const [page, setPage] = useState(0);

  const onOffset = useCallback(
    (offset: number, width: number) => {
      // The bounce at the ends goes past the first and the last page.
      const exact = Math.max(0, Math.min(LAST_PAGE, offset / width));
      position.set(exact);
      setPage(Math.round(exact));
    },
    [position],
  );

  return { horizon: HORIZONS[page], position, onOffset };
}

export interface HorizonTitle {
  readonly title: string;
  /** Next to the title, in a smaller size. */
  readonly detail?: string;
  /** What touching the title goes back to (RF-21, RF-41), if it goes back to anything. */
  readonly returnHint?: string;
  readonly onReturn: () => void;
}

function FadingTitle({
  index,
  position,
  active,
  title,
  detail,
  returnHint,
  onReturn,
}: HorizonTitle & {
  index: number;
  position: SharedValue<number>;
  active: boolean;
}) {
  const colors = useColors();
  // The old title is gone by the middle of the way, where the new one starts to appear.
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - 2 * Math.abs(position.get() - index)),
  }));
  const canReturn = returnHint !== undefined;

  return (
    <Animated.View
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      // All the titles are in the same place: the first one gives the height of the area.
      style={[styles.fadingTitle, index > 0 && styles.overlaidTitle, fadeStyle]}
    >
      <Pressable
        accessibilityRole={canReturn ? "button" : "text"}
        accessibilityHint={returnHint}
        disabled={!canReturn}
        hitSlop={spacing.sm}
        onPress={onReturn}
        style={styles.titleRow}
      >
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {detail === undefined ? null : (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>
            {detail}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function HorizonTitles({
  horizons,
  titles,
}: {
  horizons: HorizonsState;
  titles: Readonly<Record<Horizon, HorizonTitle>>;
}) {
  return (
    <View style={styles.titles}>
      {HORIZONS.map((horizon, index) => (
        <FadingTitle
          key={horizon}
          index={index}
          position={horizons.position}
          active={horizon === horizons.horizon}
          {...titles[horizon]}
        />
      ))}
    </View>
  );
}

export function HorizonPager({
  horizons,
  pages,
}: {
  horizons: HorizonsState;
  pages: Readonly<Record<Horizon, ReactNode>>;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    horizons.onOffset(event.nativeEvent.contentOffset.x, width);

  return (
    <ScrollView
      testID="horizon-pager"
      horizontal
      pagingEnabled
      // A drag goes either sideways or along the list of the page, never both at once.
      directionalLockEnabled
      alwaysBounceVertical={false}
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {HORIZONS.map((horizon) => {
        const active = horizon === horizons.horizon;
        return (
          <View
            key={horizon}
            testID={`horizon-${horizon}`}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? "auto" : "no-hide-descendants"}
            style={{ width }}
          >
            <View style={[styles.box, { backgroundColor: colors.surface }]}>
              {pages[horizon]}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The area is as wide as the screen, so that a long title fits over a short one, and each
  // title only as wide as its text, which is what can be touched.
  titles: { alignSelf: "stretch" },
  fadingTitle: { alignSelf: "flex-start" },
  overlaidTitle: { left: 0, position: "absolute", top: 0 },
  titleRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
  title: { fontSize: fontSize.heading, fontWeight: "600" },
  detail: { fontSize: fontSize.caption },
  box: {
    borderRadius: radius.md,
    flex: 1,
    marginHorizontal: spacing.md,
    overflow: "hidden",
  },
});
