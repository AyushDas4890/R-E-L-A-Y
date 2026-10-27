import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when auth is not configured (local dev); the app then runs in no-auth mode.
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;

export const authEnabled = !!supabase;
