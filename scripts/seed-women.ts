#!/usr/bin/env npx tsx
/**
 * Seed script for populating Women Galaxy with ~1000 accomplished women
 *
 * Usage:
 *   npx tsx scripts/seed-women.ts                    # Run full import
 *   npx tsx scripts/seed-women.ts --dry-run          # Preview without inserting
 *   npx tsx scripts/seed-women.ts --limit=50         # Test with smaller batch
 *   npx tsx scripts/seed-women.ts --skip-images      # Skip image uploads (faster)
 *   npx tsx scripts/seed-women.ts --start=100        # Start from index 100 (resume)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWikipediaData, generateTags } from './lib/wikipedia.js';
import { processAndUploadImage, getSupabaseClient } from './lib/image-upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_IMAGES = args.includes('--skip-images');
const LIMIT = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0') || Infinity;
const START = parseInt(args.find((a) => a.startsWith('--start='))?.split('=')[1] || '0') || 0;

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 150; // ms between Wikipedia API calls
const BATCH_SIZE = 20; // Insert in batches
const DELAY_BETWEEN_BATCHES = 2000; // ms between batch inserts

type WomanEntry = {
  name: string;
  category: string;
  tags: string[];
  wiki?: string;
};

type ProcessedWoman = {
  name: string;
  intro: string | null;
  accomplishments: string | null;
  image_url: string | null;
  tags: string[];
  birth_year: number | null;
  created_by: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatProgress(current: number, total: number): string {
  const percent = ((current / total) * 100).toFixed(1);
  const bar = '='.repeat(Math.floor((current / total) * 30)).padEnd(30, ' ');
  return `[${bar}] ${percent}% (${current}/${total})`;
}

async function main() {
  console.log('\n🌟 Women Galaxy Seed Script\n');
  console.log('Options:');
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Skip images: ${SKIP_IMAGES}`);
  console.log(`  Limit: ${LIMIT === Infinity ? 'none' : LIMIT}`);
  console.log(`  Start index: ${START}`);
  console.log('');

  // Load the curated list
  const listPath = path.join(__dirname, 'data', 'women-list.json');
  const rawData = fs.readFileSync(listPath, 'utf-8');
  const allWomen: WomanEntry[] = JSON.parse(rawData);

  console.log(`📋 Loaded ${allWomen.length} women from curated list\n`);

  // Apply start and limit
  const women = allWomen.slice(START, START + LIMIT);
  console.log(`📍 Processing ${women.length} women (starting at index ${START})\n`);

  const processed: ProcessedWoman[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  // Process each woman
  for (let i = 0; i < women.length; i++) {
    const woman = women[i];
    const globalIndex = START + i;

    console.log(`${formatProgress(i + 1, women.length)} ${woman.name}`);

    try {
      // Fetch Wikipedia data
      const wikiData = await fetchWikipediaData(woman.name, woman.wiki);

      let imageUrl: string | null = null;

      if (wikiData?.imageUrl && !SKIP_IMAGES && !DRY_RUN) {
        // Download and upload image
        process.stdout.write('  ↳ Uploading image... ');
        imageUrl = await processAndUploadImage(wikiData.imageUrl, woman.name);
        console.log(imageUrl ? '✓' : '✗ (using fallback)');
      } else if (wikiData?.imageUrl && SKIP_IMAGES) {
        // Use Wikipedia URL directly
        imageUrl = wikiData.imageUrl;
      }

      // Generate tags
      const tags = generateTags(
        woman.category,
        woman.tags,
        wikiData?.intro || null,
        wikiData?.categories || []
      );

      const profile: ProcessedWoman = {
        name: woman.name,
        intro: wikiData?.intro || `${woman.category} - ${woman.tags.join(', ')}`,
        accomplishments: wikiData?.accomplishments || null,
        image_url: imageUrl,
        tags,
        birth_year: wikiData?.birthYear || null,
        created_by: 'wikipedia-import',
      };

      processed.push(profile);

      if (DRY_RUN) {
        console.log(`  ↳ Born: ${profile.birth_year || 'unknown'}`);
        console.log(`  ↳ Tags: ${tags.join(', ')}`);
        console.log(`  ↳ Intro: ${(profile.intro || '').slice(0, 80)}...`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ↳ ❌ Error: ${errorMsg}`);
      failed.push({ name: woman.name, error: errorMsg });
    }

    // Rate limiting
    await sleep(DELAY_BETWEEN_REQUESTS);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN COMPLETE\n');
    console.log(`  ✅ Would insert: ${processed.length} profiles`);
    console.log(`  ❌ Failed: ${failed.length} profiles`);
    console.log('\nRun without --dry-run to actually insert data.');
    return;
  }

  // Insert into database in batches
  console.log(`💾 Inserting ${processed.length} profiles into database...\n`);

  const supabase = getSupabaseClient();
  let inserted = 0;
  for (let i = 0; i < processed.length; i += BATCH_SIZE) {
    const batch = processed.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('women_profiles')
      .insert(batch)
      .select('id, name');

    if (error) {
      console.error(`❌ Batch insert error:`, error);
      // Try individual inserts for this batch
      for (const profile of batch) {
        const { error: singleError } = await supabase
          .from('women_profiles')
          .insert(profile);

        if (singleError) {
          console.error(`  ❌ Failed to insert ${profile.name}:`, singleError.message);
          failed.push({ name: profile.name, error: singleError.message });
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data?.length || 0;
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${data?.length || 0} profiles`);
    }

    if (i + BATCH_SIZE < processed.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('🎉 IMPORT COMPLETE\n');
  console.log(`  ✅ Inserted: ${inserted} profiles`);
  console.log(`  ❌ Failed: ${failed.length} profiles`);

  // Save failed imports to log file
  if (failed.length > 0) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logPath = path.join(logsDir, `failed-imports-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(failed, null, 2));
    console.log(`\n  📝 Failed imports logged to: ${logPath}`);
  }

  // Save checkpoint for resume
  const checkpointPath = path.join(__dirname, 'logs', 'last-checkpoint.json');
  fs.writeFileSync(
    checkpointPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      lastIndex: START + women.length,
      inserted,
      failed: failed.length,
    }, null, 2)
  );
  console.log(`  📍 Checkpoint saved to: ${checkpointPath}`);

  console.log('\n✨ Open your Women Galaxy modal to see the results!\n');
}

main().catch(console.error);
