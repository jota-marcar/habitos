// Keeps a form with changes from closing by accident (RF-52): the Cancel button and the gesture
// that dismisses the modal both ask first.

import { usePreventRemove, useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

/** Whether what the form holds differs from what it started with. */
export function hasFormChanges<Values>(values: Values, initial: Values) {
  return JSON.stringify(values) !== JSON.stringify(initial);
}

/**
 * Asks before leaving while `hasChanges`. Returns how to close the form once it has been saved,
 * when there is nothing left to lose.
 */
export function useDiscardGuard(hasChanges: boolean): () => void {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const stopGuarding = usePreventRemove(
    hasChanges && !leaving,
    ({ repeat }) => {
      Alert.alert(
        "¿Descartar los cambios?",
        "Lo que has cambiado se perderá.",
        [
          { text: "Seguir editando", style: "cancel" },
          {
            text: "Descartar",
            style: "destructive",
            onPress: () => {
              setLeaving(true);
              repeat();
            },
          },
        ],
      );
    },
  );

  return () => {
    setLeaving(true);
    stopGuarding();
    router.back();
  };
}
