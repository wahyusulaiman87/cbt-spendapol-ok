import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hynbsniiuzdgnmoqzezc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5bmJzbmlpdXpkZ25tb3F6ZXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MTU4OTEsImV4cCI6MjA4NDE5MTg5MX0.Ln9_TNnHs9XGz8DFs8ETdMZUD2O7mt3luAZst1OBVro';

export const supabase = createClient(supabaseUrl, supabaseKey);