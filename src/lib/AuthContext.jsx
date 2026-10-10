import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('id, email, role').eq('id', userId).maybeSingle();
  if (error) {
    console.error('Failed to load profile:', error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    const apply = async (nextSession) => {
      const nextProfile = nextSession ? await loadProfile(nextSession.user.id) : null;
      if (!active) return;
      setSession(nextSession);
      setProfile(nextProfile);
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => apply(nextSession), 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin',
    isLoading,
    isPasswordRecovery,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
