// The settings, with the options of the account (RF-32): for now, signing out (RF-03).

import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { signOut } from "@/auth/sign-out";
import { hasPendingChanges } from "@/data/account-data";
import { Section } from "@/ui/components";
import { useDatabase } from "@/ui/database";
import { useSession } from "@/ui/session";
import { SheetOption } from "@/ui/sheet";
import { fontSize, spacing, useColors } from "@/ui/theme";

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  apple: "Apple",
  google: "Google",
};

const SIGN_OUT_ERROR = "No se ha podido cerrar la sesión. Inténtalo de nuevo.";

export default function Settings() {
  const colors = useColors();
  const db = useDatabase();
  const session = useSession();
  const [busy, setBusy] = useState(false);

  const provider = session?.user.app_metadata.provider;
  const providerName =
    typeof provider === "string" ? (PROVIDER_NAMES[provider] ?? null) : null;
  const email = session?.user.email ?? null;

  const confirmSignOut = async () => {
    if (busy) return;
    const pending = await hasPendingChanges(db);
    Alert.alert(
      "Cerrar sesión",
      pending
        ? "Hay cambios que aún no se han copiado en tu cuenta. Si cierras la sesión ahora, se perderán."
        : "Tus datos se borrarán de este iPhone, pero seguirán en tu cuenta.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: () => void runSignOut(),
        },
      ],
    );
  };

  // Once the session is closed, the navigation goes to the sign-in screen by itself.
  const runSignOut = async () => {
    setBusy(true);
    try {
      await signOut(db);
    } catch {
      setBusy(false);
      Alert.alert("Cerrar sesión", SIGN_OUT_ERROR);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Section title="Cuenta">
        <View style={styles.account}>
          <Text style={[styles.accountText, { color: colors.text }]}>
            {providerName === null
              ? "Sesión iniciada"
              : `Sesión iniciada con ${providerName}`}
          </Text>
          {email === null ? null : (
            <Text
              style={[styles.accountDetail, { color: colors.textSecondary }]}
            >
              {email}
            </Text>
          )}
        </View>
        <SheetOption
          icon="rectangle.portrait.and.arrow.right"
          fallbackIcon="⎋"
          label="Cerrar sesión"
          destructive
          onPress={() => void confirmSignOut()}
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  account: { gap: spacing.xs, padding: spacing.md },
  accountText: { fontSize: fontSize.body },
  accountDetail: { fontSize: fontSize.caption },
});
