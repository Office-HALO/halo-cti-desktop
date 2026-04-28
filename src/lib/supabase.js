import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

// Reservation sub-windows share localStorage with the main window (same origin).
// If we let them auto-refresh tokens or persist session changes, closing the
// sub-window can fire onAuthStateChange(null) in the main window → blank screen.
// Fix: read-only auth storage that never writes back to localStorage.
const isRsvWindow = new URLSearchParams(window.location.search).has('rsvKey');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, isRsvWindow ? {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    // Read-only storage: loads the existing session written by the main window
    // but never writes back, so closing this window can't pollute the main window's
    // auth state and trigger a blank screen.
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: () => {},
      removeItem: () => {},
    },
  },
} : {});
