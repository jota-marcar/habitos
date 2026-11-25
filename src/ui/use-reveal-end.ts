// Scrolls a form just enough to show a native picker that opens at its end, below the screen:
// the reminder picker of a habit (RF-22) and the calendar of the deadline of a goal (RF-55).

import { useRef } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";

export function useRevealEnd() {
  const scroll = useRef<ScrollViewInstance>(null);
  // Set when the picker opens, until it has its real height.
  const pending = useRef(false);
  // The size and position of the form, to scroll it just enough to show the picker.
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const scrollY = useRef(0);

  /** What the ScrollView of the form needs. */
  const scrollProps = {
    ref: scroll,
    onLayout: (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
    },
    onContentSizeChange: (_width: number, height: number) => {
      contentHeight.current = height;
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
    },
    scrollEventThrottle: 16,
  };

  /** Asks to show the end of the form once the picker that is opening has its size. */
  const revealEnd = () => {
    pending.current = true;
  };

  // The native picker first lays out with no height and measures itself in a later pass, so the
  // form waits for that height. It waits one more frame for the new size of the form to arrive
  // and reach the native view, which limits the scroll to the size it knows. The target leaves
  // the keyboard out, as it is closing. The picker ends the form, so its end is what has to be
  // shown.
  /** Goes on the `onLayout` of the picker. */
  const onPickerLayout = (event: LayoutChangeEvent) => {
    if (!pending.current || event.nativeEvent.layout.height === 0) return;
    pending.current = false;
    requestAnimationFrame(() => {
      const end = contentHeight.current - viewportHeight.current;
      if (end > scrollY.current) {
        scroll.current?.scrollTo({ y: end, animated: true });
      }
    });
  };

  return { scrollProps, revealEnd, onPickerLayout };
}
