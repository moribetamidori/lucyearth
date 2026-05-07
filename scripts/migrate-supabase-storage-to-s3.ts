#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getPublicUrlForPath, uploadBufferToS3 } from '../lib/server/s3Storage';

config({ path: resolve(process.cwd(), '.env.local') });

type SupabaseFile = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type UrlColumnConfig = {
  table: string;
  columns: string[];
  arrayColumns?: string[];
};

type UrlRow = {
  id: string | number;
  [column: string]: string | string[] | number | null;
};

const URL_COLUMNS: UrlColumnConfig[] = [
  { table: 'poop_images', columns: ['image_url'] },
  { table: 'cat_pictures', columns: ['image_url', 'thumbnail_url'] },
  { table: 'arena_blocks', columns: ['image_url', 'thumbnail_url'] },
  { table: 'douban_ratings', columns: ['image_url'] },
  { table: 'garden_species', columns: ['image_url'] },
  { table: 'songs', columns: ['file_url', 'cover_url'] },
  { table: 'location_pin_images', columns: ['image_url'] },
  { table: 'bookshelf_books', columns: ['cover_url'] },
  { table: 'women_profiles', columns: ['image_url'] },
  {
    table: 'timeline_entries',
    columns: ['image_url'],
    arrayColumns: ['image_urls'],
  },
  { table: 'wishlist_items', columns: ['image_url'] },
];

const CONTENT_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
  png: 'image/png',
  webp: 'image/webp',
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipCopy = args.has('--skip-copy');
const skipDbUpdate = args.has('--skip-db-update');
const deleteSourceAfterCopy = args.has('--delete-source-after-copy');

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function inferContentType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPES[extension] || 'application/octet-stream';
}

function convertSupabaseUrl(url: string | null): string | null {
  if (!url) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const markers = ['storage/v1/object/public/', 'storage/v1/object/sign/', 'storage/v1/object/'];
  const marker = markers.find((candidate) => pathname.includes(candidate));
  if (!marker) return url;

  const objectPath = pathname.slice(pathname.indexOf(marker) + marker.length);
  const [bucket, ...pathParts] = objectPath.split('/');
  const path = pathParts.join('/');

  if (!bucket || !path) return url;
  return getPublicUrlForPath(bucket, path);
}

async function listFiles(
  supabase: ReturnType<typeof getSupabaseClient>,
  bucket: string,
  prefix = ''
): Promise<string[]> {
  const files: string[] = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;
    const entries = (data || []) as SupabaseFile[];

    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...(await listFiles(supabase, bucket, fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return files;
}

async function copyStorageObjects(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  let copied = 0;
  let deleted = 0;

  for (const bucket of buckets || []) {
    const bucketName = bucket.name;
    const files = await listFiles(supabase, bucketName);
    console.log(`${bucketName}: ${files.length} object(s)`);

    for (const [fileIndex, path] of files.entries()) {
      const label = `${bucketName}/${path}`;

      if (dryRun) {
        console.log(`[dry-run] copy ${label}`);
        continue;
      }

      console.log(`Copying ${label} (${fileIndex + 1}/${files.length})`);
      const { data, error: downloadError } = await supabase.storage.from(bucketName).download(path);
      if (downloadError) throw downloadError;
      if (!data) throw new Error(`Failed to download ${label}`);

      const buffer = Buffer.from(await data.arrayBuffer());
      const contentType = data.type || inferContentType(path);
      await uploadBufferToS3(bucketName, path, buffer, contentType, '3600', true);
      copied += 1;
    }

    if (!dryRun && deleteSourceAfterCopy && files.length > 0) {
      for (let index = 0; index < files.length; index += 100) {
        const chunk = files.slice(index, index + 100);
        const { error: removeError } = await supabase.storage.from(bucketName).remove(chunk);
        if (removeError) throw removeError;
        deleted += chunk.length;
      }
    }
  }

  return { copied, deleted };
}

async function updateDatabaseUrls(supabase: ReturnType<typeof getSupabaseClient>) {
  let updatedRows = 0;

  for (const config of URL_COLUMNS) {
    const selectedColumns = ['id', ...config.columns, ...(config.arrayColumns || [])].join(',');
    const { data, error } = await supabase.from(config.table).select(selectedColumns);

    if (error) {
      console.warn(`Skipping ${config.table}: ${error.message}`);
      continue;
    }

    for (const row of ((data || []) as unknown as UrlRow[])) {
      const updates: Record<string, string | string[] | null> = {};

      for (const column of config.columns) {
        const original = row[column] as string | null;
        const converted = convertSupabaseUrl(original);
        if (converted !== original) updates[column] = converted;
      }

      for (const column of config.arrayColumns || []) {
        const original = row[column] as string[] | null;
        if (!Array.isArray(original)) continue;

        const converted = original.map((url) => convertSupabaseUrl(url) || url);
        if (converted.some((url, index) => url !== original[index])) {
          updates[column] = converted;
        }
      }

      if (Object.keys(updates).length === 0) continue;

      if (dryRun) {
        console.log(`[dry-run] update ${config.table}/${row.id}`, updates);
      } else {
        const { error: updateError } = await supabase
          .from(config.table)
          .update(updates)
          .eq('id', row.id);
        if (updateError) throw updateError;
      }

      updatedRows += 1;
    }
  }

  return updatedRows;
}

async function main() {
  const supabase = getSupabaseClient();

  if (!skipCopy) {
    const result = await copyStorageObjects(supabase);
    console.log(`Copied ${result.copied} object(s) to S3.`);
    if (deleteSourceAfterCopy) {
      console.log(`Deleted ${result.deleted} source Supabase object(s).`);
    }
  }

  if (!skipDbUpdate) {
    const updatedRows = await updateDatabaseUrls(supabase);
    console.log(`${dryRun ? 'Would update' : 'Updated'} ${updatedRows} database row(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
