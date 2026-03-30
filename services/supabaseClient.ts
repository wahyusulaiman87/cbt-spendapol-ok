import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hynbsniiuzdgnmoqzezc.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5bmJzbmlpdXpkZ25tb3F6ZXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MTU4OTEsImV4cCI6MjA4NDE5MTg5MX0.Ln9_TNnHs9XGz8DFs8ETdMZUD2O7mt3luAZst1OBVro';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Using default Supabase credentials. For production, please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);