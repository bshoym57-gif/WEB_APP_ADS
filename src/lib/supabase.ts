import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Make sure VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/facebook-boost`;

export interface Campaign {
  id: string;
  page_id: string;
  ad_account_id: string;
  post_id: string;
  link: string | null;
  budget: number;
  duration: number;
  currency: string;
  goal: string;
  countries: string;
  gender: number;
  age_min: number;
  age_max: number;
  boost_id: string | null;
  status: 'pending' | 'success' | 'error';
  response_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface ConnectionState {
  cookies: string;
  cookieHeader: string;
  fbDtsg: string;
  lsd: string;
  userId: string;
  connected: boolean;
}
