import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type PoopImage = {
  id: string;
  image_url: string;
  label: string;
  is_emoji: boolean;
  created_at: string;
};

export type CalendarEntry = {
  id: string;
  date: string;
  poop_image_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AnonUser = {
  id: string;
  anon_id: string;
  cat_clicks: number;
  created_at: string;
  updated_at: string;
};

export type CatPicture = {
  id: string;
  image_url: string;
  anon_id: string | null;
  created_at: string;
  media_type?: 'image' | 'video';
};

export type ArenaCollection = {
  id: string;
  title: string;
  anon_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ArenaBlock = {
  id: string;
  collection_id: string;
  image_url: string;
  anon_id: string | null;
  created_at: string;
  media_type?: 'image' | 'video';
};
