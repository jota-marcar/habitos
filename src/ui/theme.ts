// Style tokens: every color, spacing and font size of the interface comes from here (ADR-0010).
// Colors have a light and a dark set, chosen from the system appearance.

import { useColorScheme } from "react-native";

export interface Colors {
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly danger: string;
}

const LIGHT: Colors = {
  background: "#F2F2F7",
  surface: "#FFFFFF",
  text: "#000000",
  textSecondary: "#6C6C70",
  border: "#D1D1D6",
  primary: "#208AEF",
  onPrimary: "#FFFFFF",
  danger: "#D70015",
};

const DARK: Colors = {
  background: "#000000",
  surface: "#1C1C1E",
  text: "#FFFFFF",
  textSecondary: "#AEAEB2",
  border: "#38383A",
  primary: "#4BA3F5",
  onPrimary: "#FFFFFF",
  danger: "#FF6961",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fontSize = {
  caption: 13,
  body: 17,
  title: 22,
  large: 28,
} as const;

export const radius = { sm: 8, md: 12, round: 999 } as const;

/** The colors for the current system appearance. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}
