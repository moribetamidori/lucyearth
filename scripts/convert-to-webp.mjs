#!/usr/bin/env node

import sharp from 'sharp';

const SUPABASE_URL = "https://bvmasuebhpznnxvdxglz.supabase.co";
const SUPABASE_KEY = "sb_secret_p3JkiRTggjsc5OydUWwPdA_VuWAChYs";

const BUCKETS_TO_CONVERT = [
  { name: 'cat-pictures', prefix: '' },
  { name: 'arena-blocks', prefix: '' },
  { name: 'douban-images', prefix: '' },
  { name: 'women-profiles', prefix: 'women/' },
  { name: 'location-images', prefix: 'anon_1761054815980_mdquqfd/' },
];

async function listBucketFiles(bucket, prefix = '') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({ prefix, limit: 1000 })
  });
  if (!res.ok) return [];
  return await res.json();
}

async function downloadFile(bucket, path) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY
    }
  });
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadFile(bucket, path, buffer, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': contentType,
      'apikey': SUPABASE_KEY,
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload: ${res.status} - ${text}`);
  }
  return res.json();
}

async function convertToWebP(buffer) {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

async function main() {
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    beforeSize: 0,
    afterSize: 0,
    byBucket: {}
  };

  for (const { name: bucket, prefix } of BUCKETS_TO_CONVERT) {
    console.log(`\n=== Processing ${bucket}/${prefix} ===`);

    const files = await listBucketFiles(bucket, prefix);
    const pngFiles = files.filter(f => {
      const mime = f.metadata?.mimetype || '';
      return mime === 'image/png' && f.name?.endsWith('.webp');
    });

    console.log(`Found ${pngFiles.length} PNG files with .webp extension`);

    results.byBucket[bucket] = {
      before: 0,
      after: 0,
      count: 0
    };

    for (const file of pngFiles) {
      const filePath = prefix + file.name;
      const originalSize = file.metadata?.size || 0;
      results.beforeSize += originalSize;
      results.byBucket[bucket].before += originalSize;

      try {
        process.stdout.write(`  Converting ${file.name} (${(originalSize / 1024).toFixed(0)} KB)...`);

        // Download the file
        const buffer = await downloadFile(bucket, filePath);

        // Convert to WebP
        const webpBuffer = await convertToWebP(buffer);
        const newSize = webpBuffer.length;

        // Upload back
        await uploadFile(bucket, filePath, webpBuffer, 'image/webp');

        results.afterSize += newSize;
        results.byBucket[bucket].after += newSize;
        results.byBucket[bucket].count++;
        results.processed++;

        const savings = ((1 - newSize / originalSize) * 100).toFixed(1);
        console.log(` → ${(newSize / 1024).toFixed(0)} KB (-${savings}%)`);

      } catch (error) {
        console.log(` ERROR: ${error.message}`);
        results.errors++;
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('CONVERSION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nFiles processed: ${results.processed}`);
  console.log(`Files skipped: ${results.skipped}`);
  console.log(`Errors: ${results.errors}`);

  console.log('\n--- Size Reduction by Bucket ---');
  console.log('| Bucket | Before | After | Saved | % Reduction |');
  console.log('|--------|--------|-------|-------|-------------|');

  for (const [bucket, data] of Object.entries(results.byBucket)) {
    if (data.count > 0) {
      const beforeMB = (data.before / 1024 / 1024).toFixed(2);
      const afterMB = (data.after / 1024 / 1024).toFixed(2);
      const savedMB = ((data.before - data.after) / 1024 / 1024).toFixed(2);
      const pct = ((1 - data.after / data.before) * 100).toFixed(1);
      console.log(`| ${bucket.padEnd(14)} | ${beforeMB.padStart(6)} MB | ${afterMB.padStart(5)} MB | ${savedMB.padStart(5)} MB | ${pct.padStart(10)}% |`);
    }
  }

  console.log('\n--- Total ---');
  const totalBeforeMB = (results.beforeSize / 1024 / 1024).toFixed(2);
  const totalAfterMB = (results.afterSize / 1024 / 1024).toFixed(2);
  const totalSavedMB = ((results.beforeSize - results.afterSize) / 1024 / 1024).toFixed(2);
  const totalPct = ((1 - results.afterSize / results.beforeSize) * 100).toFixed(1);

  console.log(`Before: ${totalBeforeMB} MB`);
  console.log(`After:  ${totalAfterMB} MB`);
  console.log(`Saved:  ${totalSavedMB} MB (${totalPct}% reduction)`);
}

main().catch(console.error);
