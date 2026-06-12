import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabaseClient";

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    const sb = getSupabase();
    await sb.auth.signOut();
  }, []);

  return {
    session,
    loading,
    authError,
    signIn,
    signOut,
    isAuthenticated: Boolean(session),
  };
}
