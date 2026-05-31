/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Access environment variables using Vite's import.meta.env for client-side
// Note: In AI Studio, sensitive keys should be accessed server-side using process.env
// For this hybrid approach, we define the types but instantiate appropriately
// depending on where this is imported (client vs server).

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// We export a function to create a client so it can be instantiated safely
export const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.');
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};
