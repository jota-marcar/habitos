// The settings, with the options of the account (RF-32): signing out (RF-03) and deleting the
// account (RF-04).

import type { User } from "@supabase/supabase-js";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  deleteAccount,
  usesApple,
  type DeleteAccountOutcome,
} from "@/auth/delete-account";
import { signOut } from "@/auth/sign-out";
import { hasPendingChanges } from "@/data/account-data";
import { syncNow } from "@/sync/app-sync";
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

const DELETE_ACCOUNT_WARNING =
  "Se borrarán para siempre todos tus hábitos y su historial, en tu cuenta y en este iPhone. No se puede deshacer.";
const DELETE_ACCOUNT_APPLE_STEP = "Para terminar, confírmalo con Apple.";
const DELETE_ACCOUNT_ERROR =
  "No se ha podido eliminar la cuenta. Comprueba la conexión e inténtalo de nuevo.";
const DELETE_ACCOUNT_APPLE_MISMATCH =
  "Lo has confirmado con un Apple ID distinto del de tu cuenta. Inténtalo de nuevo con el mismo.";

// How long signing out waits for the last changes to be uploaded before warning about them.
const SYNC_BEFORE_SIGN_OUT_MS = 5_000;

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
    setBusy(true);
    let pending: boolean;
    try {
      await uploadLastChanges();
      pending = await hasPendingChanges(db);
    } finally {
      setBusy(false);
    }
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

  // The changes not uploaded yet are tried first, for a while: they would be lost.
  const uploadLastChanges = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      syncNow(db),
      new Promise((resolve) => {
        timer = setTimeout(resolve, SYNC_BEFORE_SIGN_OUT_MS);
      }),
    ]);
    clearTimeout(timer);
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

  const confirmDeleteAccount = () => {
    if (busy || session === null) return;
    const user = session.user;
    Alert.alert(
      "Eliminar cuenta",
      usesApple(user)
        ? `${DELETE_ACCOUNT_WARNING} ${DELETE_ACCOUNT_APPLE_STEP}`
        : DELETE_ACCOUNT_WARNING,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar cuenta",
          style: "destructive",
          onPress: () => void runDeleteAccount(user),
        },
      ],
    );
  };

  // Once the account is deleted, the session is closed and the navigation goes to the sign-in
  // screen by itself.
  const runDeleteAccount = async (user: User) => {
    setBusy(true);
    let outcome: DeleteAccountOutcome;
    try {
      outcome = await deleteAccount(db, user);
    } catch {
      outcome = "failed";
    }
    if (outcome === "deleted") return;
    setBusy(false);
    if (outcome === "cancelled") return;
    Alert.alert(
      "Eliminar cuenta",
      outcome === "apple_mismatch"
        ? DELETE_ACCOUNT_APPLE_MISMATCH
        : DELETE_ACCOUNT_ERROR,
    );
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
        <SheetOption
          icon="trash"
          fallbackIcon="×"
          label="Eliminar cuenta"
          destructive
          onPress={confirmDeleteAccount}
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
