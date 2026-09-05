import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { required } from '../config';

export function tradeDb() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export function dbError(error: { code?: string } | null) {
  if (error) throw new Error(`Trading database operation failed (${error.code ?? 'unknown'}). Check the trade migration and server configuration.`);
}
