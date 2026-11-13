// A sheet that comes up from the bottom of the main screen and follows the finger (ADR-0010).
// The menu uses it (RF-32), and so will the options of a habit (RF-34).
//
// `useBottomSheet` holds its state; `BottomSheet` draws it over the screen; and
// `useOpenSheetGesture` gives the drag that pulls it up from another view, such as the strip
// of the menu. It closes when dragged down or when the backdrop is touched.

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
import { fontSize, radius, spacing, useColors } from "./theme";

export interface BottomSheetState {
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

export function useBottomSheet(): BottomSheetState {
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

  return { isOpen, open, close, visible, height, settle };
}

// The drag that moves the sheet: it follows the finger from where the sheet was and, when let
// go, settles open or closed (sheet-motion.ts).
function useSheetDrag(
  sheet: BottomSheetState,
  config: {
    testID: string;
    wasOpen: boolean;
    activeOffsetY: number | [number, number];
  },
): PanGesture {
  const { visible, height, settle } = sheet;
  const { wasOpen } = config;
  const start = useSharedValue(0);
  return usePanGesture({
    testID: config.testID,
    activeOffsetY: config.activeOffsetY,
    failOffsetX: [-HORIZONTAL_FAIL_DISTANCE, HORIZONTAL_FAIL_DISTANCE],
    onActivate: () => {
      "worklet";
      start.set(visible.get());
    },
    onUpdate: (event) => {
      "worklet";
      visible.set(
        visibleHeight(start.get() - event.translationY, height.get()),
      );
    },
    onDeactivate: (event) => {
      "worklet";
      const open =
        !event.canceled &&
        settlesOpen(
          wasOpen,
          -event.translationY,
          -event.velocityY,
          height.get(),
        );
      settle(open, -event.velocityY);
    },
  });
}

/** The drag up that opens `sheet` from the view it is attached to. */
export function useOpenSheetGesture(
  sheet: BottomSheetState,
  testID: string,
): PanGesture {
  return useSheetDrag(sheet, {
    testID,
    wasOpen: false,
    activeOffsetY: -ACTIVATION_DISTANCE,
  });
}

export function BottomSheet({
  sheet,
  closeLabel,
  testID,
  children,
}: {
  sheet: BottomSheetState;
  /** What the backdrop says to screen readers: it closes the sheet. */
  closeLabel: string;
  testID: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isOpen, close, visible, height } = sheet;

  const closeGesture = useSheetDrag(sheet, {
    testID: `${testID}-drag`,
    wasOpen: true,
    activeOffsetY: [-ACTIVATION_DISTANCE, ACTIVATION_DISTANCE],
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    height.set(measured);
    // The content of an open sheet can change, as the options of each habit will.
    if (isOpen) visible.set(withSpring(measured, SPRING));
  };

  const backdropStyle = useAnimatedStyle(() => {
    const h = height.get();
    const progress = h > 0 ? Math.min(visible.get() / h, 1) : 0;
    return { opacity: BACKDROP_OPACITY * progress };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const h = height.get();
    // Until it is measured, a closed sheet stays out of sight below the screen.
    const hidden = h > 0 ? h : 10_000;
    return { transform: [{ translateY: hidden - visible.get() }] };
  });

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
            { paddingBottom: insets.bottom + spacing.sm },
            sheetStyle,
          ]}
        >
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View
              style={[styles.grabber, { backgroundColor: colors.border }]}
            />
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** An option of a sheet: an SF Symbol and a label (ADR-0011). */
export function SheetOption({
  icon,
  fallbackIcon,
  label,
  onPress,
}: {
  icon: SFSymbol;
  /** What is shown where SF Symbols are not available. */
  fallbackIcon: string;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
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
        tintColor={colors.primary}
        weight="medium"
        fallback={
          <Text style={[styles.fallbackIcon, { color: colors.primary }]}>
            {fallbackIcon}
          </Text>
        }
      />
      <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const ICON_SIZE = 22;

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    right: 0,
  },
  card: {
    borderRadius: radius.md * 2,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    borderRadius: radius.round,
    height: 5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    width: 36,
  },
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
