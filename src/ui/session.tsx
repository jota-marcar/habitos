// Gives the screens the session of the account (RF-01, RF-02). Nothing is rendered until the
// session kept in the keychain has been read, so the sign-in screen never flashes on opening
// the app with a session open.

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/shared/supabase";

/** The session, or null without one. Tests provide it without Supabase. */
export const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // It is called at once with the session in the keychain (INITIAL_SESSION), and then on
    // every change: signing in, renewing the token, signing out.
    const { data } = supabase().auth.onAuthStateChange((_event, current) => {
      setSession(current);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session | null {
  return useContext(SessionContext);
}
