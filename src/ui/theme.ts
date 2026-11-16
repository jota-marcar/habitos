// Style tokens: every color, spacing and font size of the interface comes from here (ADR-0010).
// The app is dark only, with a single violet accent (ADR-0013); app.json declares the dark
// appearance so native pieces (alerts, pickers, keyboard) match.

export interface Colors {
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly danger: string;
  /** Dims the screen behind a sheet. */
  readonly backdrop: string;
}

const COLORS: Colors = {
  background: "#0F0F11",
  surface: "#18181B",
  text: "#EDEDEF",
  textSecondary: "#8A8A93",
  border: "#27272A",
  primary: "#8B7CF6",
  onPrimary: "#0F0F11",
  danger: "#F2555A",
  backdrop: "#000000",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fontSize = {
  caption: 13,
  body: 17,
  /** The date at the top of the day view: a touch larger than the body text. */
  heading: 19,
  title: 22,
  large: 28,
} as const;

/**
 * Space between the top safe area and the first line of the screen. The calendar, which comes
 * down from the top, uses it too, so that its month lines up with the date it covers.
 */
export const topGap = spacing.lg;

export const radius = { sm: 8, md: 12, round: 999 } as const;

/** The colors of the interface. A hook so that screens keep working if a light set returns. */
export function useColors(): Colors {
  return COLORS;
}
