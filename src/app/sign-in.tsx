// The only screen without a session (RF-01): signing in with Apple or Google. Once Supabase
// has the session, the navigation leaves this screen by itself (see AppStack).

import { GoogleSigninButton } from "@react-native-google-signin/google-signin";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  signInWithApple,
  signInWithGoogle,
  type SignInOutcome,
} from "@/auth/sign-in";
import { SIGN_IN_FAILED_MESSAGE } from "@/ui/messages";
import { fontSize, radius, spacing, useColors } from "@/ui/theme";

// The size Google recommends for its wide button; Apple's takes the same, so they line up.
const BUTTON_WIDTH = 312;
const BUTTON_HEIGHT = 48;

export default function SignIn() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = async (provider: () => Promise<SignInOutcome>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const outcome = await provider();
    // A cancellation is the user's choice: it does not deserve a message.
    setFailed(outcome === "failed");
    setBusy(false);
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.welcome}>
        <Text style={[styles.title, { color: colors.text }]}>Hábitos</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Inicia sesión para guardar tus hábitos en tu cuenta.
        </Text>
      </View>

      <View style={styles.actions}>
        {failed ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.danger }]}
          >
            {SIGN_IN_FAILED_MESSAGE}
          </Text>
        ) : null}
        {busy ? (
          <ActivityIndicator
            testID="signing-in"
            color={colors.primary}
            style={styles.button}
          />
        ) : null}
        <View
          style={[styles.buttons, busy && styles.hidden]}
          pointerEvents={busy ? "none" : "auto"}
        >
          <AppleAuthenticationButton
            testID="sign-in-apple"
            buttonType={AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.sm}
            style={styles.button}
            onPress={() => void signIn(signInWithApple)}
          />
          <GoogleSigninButton
            testID="sign-in-google"
            size={GoogleSigninButton.Size.Wide}
            color={GoogleSigninButton.Color.Light}
            style={styles.button}
            onPress={() => void signIn(signInWithGoogle)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  welcome: { flex: 1, justifyContent: "center", gap: spacing.sm },
  title: { fontSize: fontSize.large, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: fontSize.body, textAlign: "center" },
  actions: { alignItems: "center", gap: spacing.md },
  buttons: { alignItems: "center", gap: spacing.md },
  hidden: { opacity: 0.4 },
  button: { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
  error: { fontSize: fontSize.caption, textAlign: "center" },
});
