// A sheet that comes out from an edge of the main screen and follows the finger (ADR-0010).
// From the bottom come the menu (RF-32) and the options of a habit (RF-34); from the top, the
// calendar (RF-31).
//
// `useSheet` holds its state; `Sheet` draws it over the screen; and `useOpenSheetGesture`
// gives the drag that pulls it out from another view, such as the strip of the menu. It closes
// when dragged back or when the backdrop is touched.

import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "expo-symbols";
import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  GestureDetector,
  usePanGesture,
  type PanGesture,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import {
  ACTIVATION_DISTANCE,
  BACKDROP_OPACITY,
  HORIZONTAL_FAIL_DISTANCE,
  SPRING,
  settlesOpen,
  visibleHeight,
} from "./sheet-motion";
import { fontSize, radius, spacing, topGap, useColors } from "./theme";

/** The edge of the screen a sheet comes out from. */
export type SheetEdge = "top" | "bottom";

export interface SheetState {
  readonly edge: SheetEdge;
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  /** How many points of the sheet are visible: 0 when closed, its height when open. */
  readonly visible: SharedValue<number>;
  /** The height of the sheet, once it has been laid out. */
  readonly height: SharedValue<number>;
  /** Animates the sheet open or closed from a gesture, carrying its speed. */
  readonly settle: (open: boolean, velocity: number) => void;
}

export function useSheet(edge: SheetEdge = "bottom"): SheetState {
  const visible = useSharedValue(0);
  const height = useSharedValue(0);
  const [isOpen, setOpen] = useState(false);

  const settle = useCallback(
    (open: boolean, velocity: number) => {
      "worklet";
      visible.set(withSpring(open ? height.get() : 0, { ...SPRING, velocity }));
      scheduleOnRN(setOpen, open);
    },
    [visible, height],
  );

  const open = useCallback(() => {
    setOpen(true);
    visible.set(withSpring(height.get(), SPRING));
  }, [visible, height]);

  const close = useCallback(() => {
    setOpen(false);
    visible.set(withSpring(0, SPRING));
  }, [visible]);

  return { edge, isOpen, open, close, visible, height, settle };
}

// The drag that moves the sheet: it follows the finger from where the sheet was and, when let
// go, settles open or closed (sheet-motion.ts).
function useSheetDrag(
  sheet: SheetState,
  config: {
    testID: string;
    wasOpen: boolean;
    activeOffsetY: number | [number, number];
    /** If given, the drag only moves the sheet when it is true as the drag starts. */
    onlyIf?: SharedValue<boolean>;
  },
): PanGesture {
  const { edge, visible, height, settle } = sheet;
  const { wasOpen, onlyIf } = config;
  // A sheet at the bottom opens upwards, which is a negative translation.
  const towardsOpen = edge === "bottom" ? -1 : 1;
  const start = useSharedValue(0);
  const moving = useSharedValue(false);
  return usePanGesture({
    testID: config.testID,
    activeOffsetY: config.activeOffsetY,
    failOffsetX: [-HORIZONTAL_FAIL_DISTANCE, HORIZONTAL_FAIL_DISTANCE],
    onActivate: () => {
      "worklet";
      moving.set(onlyIf === undefined || onlyIf.get());
      start.set(visible.get());
    },
    onUpdate: (event) => {
      "worklet";
      if (!moving.get()) return;
      visible.set(
        visibleHeight(
          start.get() + towardsOpen * event.translationY,
          height.get(),
        ),
      );
    },
    onDeactivate: (event) => {
      "worklet";
      if (!moving.get()) return;
      const velocity = towardsOpen * event.velocityY;
      const open =
        !event.canceled &&
        settlesOpen(
          wasOpen,
          towardsOpen * event.translationY,
          velocity,
          height.get(),
        );
      settle(open, velocity);
    },
  });
}

/**
 * The drag that opens `sheet` from the view it is attached to: up for a sheet at the bottom,
 * down for one at the top. With `onlyIf`, the drag is ignored unless it is true when it
 * starts: a list only pulls the calendar down when it is scrolled to the top (RF-31).
 */
export function useOpenSheetGesture(
  sheet: SheetState,
  testID: string,
  onlyIf?: SharedValue<boolean>,
): PanGesture {
  return useSheetDrag(sheet, {
    testID,
    wasOpen: false,
    activeOffsetY:
      sheet.edge === "bottom" ? -ACTIVATION_DISTANCE : ACTIVATION_DISTANCE,
    onlyIf,
  });
}

export function Sheet({
  sheet,
  closeLabel,
  testID,
  children,
}: {
  sheet: SheetState;
  /** What the backdrop says to screen readers: it closes the sheet. */
  closeLabel: string;
  testID: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { edge, isOpen, close, visible, height } = sheet;
  const atBottom = edge === "bottom";

  const closeGesture = useSheetDrag(sheet, {
    testID: `${testID}-drag`,
    wasOpen: true,
    activeOffsetY: [-ACTIVATION_DISTANCE, ACTIVATION_DISTANCE],
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    height.set(measured);
    // The content of an open sheet can change, as the options of each habit do.
    if (isOpen) visible.set(withSpring(measured, SPRING));
  };

  const backdropStyle = useAnimatedStyle(() => {
    const h = height.get();
    const progress = h > 0 ? Math.min(visible.get() / h, 1) : 0;
    return { opacity: BACKDROP_OPACITY * progress };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const h = height.get();
    // Until it is measured, a closed sheet stays out of sight beyond its edge.
    const hidden = (h > 0 ? h : 10_000) - visible.get();
    return { transform: [{ translateY: atBottom ? hidden : -hidden }] };
  });

  const grabber = (
    <View
      style={[
        styles.grabber,
        atBottom ? styles.grabberAbove : styles.grabberBelow,
        { backgroundColor: colors.border },
      ]}
    />
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={isOpen ? "auto" : "box-none"}
      accessibilityElementsHidden={!isOpen}
      importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
    >
      <Animated.View
        pointerEvents={isOpen ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backdrop },
          backdropStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
      </Animated.View>
      <GestureDetector gesture={closeGesture}>
        <Animated.View
          testID={testID}
          onLayout={onLayout}
          pointerEvents={isOpen ? "auto" : "none"}
          style={[
            styles.container,
            atBottom
              ? { bottom: 0, paddingBottom: insets.bottom + spacing.sm }
              : // The first line of a top sheet sits where the date of the screen is.
                { top: 0, paddingTop: insets.top + topGap - spacing.sm },
            sheetStyle,
          ]}
        >
          {/* The grabber is on the side the sheet is dragged from. */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {atBottom ? grabber : null}
            {children}
            {atBottom ? null : grabber}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** What a sheet is about, above its options: a title and, optionally, a detail next to it. */
export function SheetTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string | null;
}) {
  const colors = useColors();
  return (
    <View style={styles.title}>
      <Text
        style={[styles.titleText, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {detail ? (
        <Text style={[styles.titleDetail, { color: colors.textSecondary }]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** An option of a sheet: an SF Symbol and a label (ADR-0011). */
export function SheetOption({
  icon,
  fallbackIcon,
  label,
  destructive = false,
  onPress,
}: {
  icon: SFSymbol;
  /** What is shown where SF Symbols are not available. */
  fallbackIcon: string;
  label: string;
  /** An option that loses data, shown in the color of danger. */
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tint = destructive ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <SymbolView
        name={icon}
        size={ICON_SIZE}
        tintColor={tint}
        weight="medium"
        fallback={
          <Text style={[styles.fallbackIcon, { color: tint }]}>
            {fallbackIcon}
          </Text>
        }
      />
      <Text
        style={[
          styles.optionLabel,
          { color: destructive ? colors.danger : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const ICON_SIZE = 22;

const styles = StyleSheet.create({
  container: {
    left: 0,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    right: 0,
  },
  card: {
    borderRadius: radius.md * 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    borderRadius: radius.round,
    height: 5,
    width: 36,
  },
  grabberAbove: { marginBottom: spacing.sm },
  grabberBelow: { marginTop: spacing.sm },
  title: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  titleText: { flexShrink: 1, fontSize: fontSize.caption, fontWeight: "600" },
  titleDetail: { fontSize: fontSize.caption, fontVariant: ["tabular-nums"] },
  option: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - spacing.xs,
  },
  pressed: { opacity: 0.6 },
  optionLabel: { fontSize: fontSize.body },
  fallbackIcon: {
    fontSize: ICON_SIZE,
    lineHeight: ICON_SIZE,
    textAlign: "center",
    width: ICON_SIZE,
  },
});
