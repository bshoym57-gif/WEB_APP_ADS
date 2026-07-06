import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

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
