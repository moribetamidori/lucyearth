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

export type ChildCalendarEntry = {
  id: string;
  date: string;
  status: 'none' | 'yes' | 'maybe' | 'no';
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
  thumbnail_url?: string;
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
  thumbnail_url?: string;
};

export type Redaction = {
  start: number;
  end: number;
};

export type JournalEntry = {
  id: string;
  anon_id: string;
  entry_text: string;
  created_at: string;
  updated_at: string;
  upvote_count?: number;
  redactions?: Redaction[];
};

export type JournalEntryVote = {
  id: string;
  entry_id: string;
  anon_id: string;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  anon_id: string;
  action: string;
  details: string | null;
  created_at: string;
};

export type DoubanRating = {
  id: string;
  anon_id: string | null;
  title: string;
  category: 'movie' | 'tv' | 'book' | 'music' | 'game';
  rating: number; // 1-5
  comment: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SubstackArticle = {
  id: number;
  title: string;
  link: string;
  created_at: string;
  updated_at: string;
};

export type GardenSpecies = {
  id: string;
  common_name: string;
  scientific_name: string | null;
  image_url: string;
  sunlight: string | null;
  watering_schedule: string | null;
  soil_type: string | null;
  bloom_season: string | null;
  planted_on: string | null;
  last_pruned_on: string | null;
  status: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type GardenPlacement = {
  id: string;
  species_id: string;
  cells: number[];
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type BookshelfBook = {
  id: string;
  title: string;
  author: string | null;
  spine_color: string;
  height: number;
  width: number;
  length: number;
  cover_url: string | null;
  spine_texture: string | null;
  order_index: number;
  spine_font_color: string;
  spine_font_size: number;
  created_at: string;
  updated_at: string;
};

export type WomenProfile = {
  id: string;
  name: string;
  image_url: string | null;
  intro: string | null;
  accomplishments: string | null;
  tags: string[];
  birth_year: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type TimelineEntry = {
  id: string;
  title: string;
  details: string | null;
  event_time: string;
  image_url: string | null;
  image_filename: string | null;
  image_urls?: string[] | null;
  image_filenames?: (string | null)[] | null;
  created_at: string;
  updated_at: string;
};

export type SlotMachineSpin = {
  id: string;
  anon_id: string | null;
  reel_one: string;
  reel_two: string;
  reel_three: string;
  fortune_text: string;
  fortune_model?: string | null;
  created_at: string;
};

export type WishlistItem = {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
  is_purchased: boolean;
  order_index: number;
  anon_id: string | null;
  created_at: string;
  updated_at: string;
};
