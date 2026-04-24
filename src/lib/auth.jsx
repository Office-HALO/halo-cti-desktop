import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { useAppStore } from '../store/state.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const setCurrentStaff = useAppStore((s) => s.setCurrentStaff);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      if (!sess) {
        setStaff(null);
        setCurrentStaff(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [setCurrentStaff]);

  useEffect(() => {
    if (!session?.user?.email) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('email', session.user.email)
        .eq('is_active', true)
        .single();
      if (cancelled) return;
      if (error || !data) {
        await supabase.auth.signOut();
        setStaff(null);
        setCurrentStaff(null);
      } else {
        setStaff(data);
        setCurrentStaff(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, setCurrentStaff]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ session, staff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
