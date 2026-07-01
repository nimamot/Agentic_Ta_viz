import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isLocalMode } from "../lib/dataSource";
import { getSupabase } from "../lib/supabaseClient";

export function useSupabaseAuth() {
  const localMode = isLocalMode();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!localMode);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (localMode) {
      setSession(null);
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [localMode]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (localMode) return false;
    setAuthError(null);
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, [localMode]);

  const signOut = useCallback(async () => {
    if (localMode) return;
    setAuthError(null);
    const sb = getSupabase();
    await sb.auth.signOut();
  }, [localMode]);

  return {
    session,
    loading,
    authError,
    signIn,
    signOut,
    isAuthenticated: Boolean(session),
  };
}
