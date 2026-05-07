/**
 * Image download and upload helper for S3 storage
 */

import sharp from 'sharp';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { uploadBufferToS3 } from '../../lib/server/s3Storage';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Lazy-initialized Supabase client
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabase) return supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    );
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey);
  return supabase;
}

/**
 * Download an image from a URL
 */
export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; WomenGalaxyBot/1.0; +https://lucyearth.com)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status} ${url}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Convert image buffer to WebP format
 */
export async function convertToWebP(
  imageBuffer: Buffer,
  quality = 82
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(500, 500, {
      fit: 'cover',
      position: 'top', // Focus on face area
    })
    .webp({ quality })
    .toBuffer();
}

/**
 * Upload image to S3 storage and return public URL
 */
export async function uploadToS3(
  imageBuffer: Buffer,
  name: string
): Promise<string | null> {
  try {
    // Generate unique filename
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 30);
    const fileName = `women/${Date.now()}_${safeName}.webp`;

    return uploadBufferToS3('women-profiles', fileName, imageBuffer, 'image/webp', '3600');
  } catch (error) {
    console.error(`Error uploading image for ${name}:`, error);
    return null;
  }
}

/**
 * Download, convert, and upload an image in one go
 */
export async function processAndUploadImage(
  imageUrl: string,
  name: string
): Promise<string | null> {
  // Download
  const rawBuffer = await downloadImage(imageUrl);
  if (!rawBuffer) {
    return null;
  }

  // Convert to WebP
  let webpBuffer: Buffer;
  try {
    webpBuffer = await convertToWebP(rawBuffer);
  } catch (error) {
    console.error(`Error converting image for ${name}:`, error);
    return null;
  }

  // Upload to S3
  return uploadToS3(webpBuffer, name);
}

/**
 * Get the Supabase client for database operations
 */
export function getSupabaseClient() {
  return getSupabase();
}
