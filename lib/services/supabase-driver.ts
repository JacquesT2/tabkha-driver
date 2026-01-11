import { createClient } from '@supabase/supabase-js';

// Secondary Supabase client for Driver App specific data (Routes, Tracking)
const supabaseDriverUrl = process.env.NEXT_PUBLIC_SUPABASE_DRIVER_URL;
const supabaseDriverAnonKey = process.env.NEXT_PUBLIC_SUPABASE_DRIVER_ANON_KEY;

if (!supabaseDriverUrl || !supabaseDriverAnonKey) {
    // eslint-disable-next-line no-console
    console.warn('Missing NEXT_PUBLIC_SUPABASE_DRIVER_URL or NEXT_PUBLIC_SUPABASE_DRIVER_ANON_KEY environment variables');
}

export const supabaseDriver = createClient(
    supabaseDriverUrl || '',
    supabaseDriverAnonKey || ''
);
