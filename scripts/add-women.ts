#!/usr/bin/env npx tsx
/**
 * Quick script to add multiple women by name
 *
 * Usage:
 *   npx tsx scripts/add-women.ts "Taylor Swift" "Beyoncé" "Rihanna"
 *   npx tsx scripts/add-women.ts "Marie Curie:Marie_Curie" # Use custom wiki title after colon
 *   npx tsx scripts/add-women.ts --dry-run "Someone" # Preview without inserting
 */

import { fetchWikipediaData, generateTags } from './lib/wikipedia.js';
import { processAndUploadImage, getSupabaseClient } from './lib/image-upload.js';

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const names = args.filter((a) => !a.startsWith('--'));

if (names.length === 0) {
  console.log(`
Usage: npx tsx scripts/add-women.ts "Name 1" "Name 2" "Name 3"

Options:
  --dry-run    Preview without inserting into database

Examples:
  npx tsx scripts/add-women.ts "Taylor Swift" "Beyoncé"
  npx tsx scripts/add-women.ts "Ada Lovelace:Ada_Lovelace"  # Custom wiki title
  npx tsx scripts/add-women.ts --dry-run "Someone New"
`);
  process.exit(0);
}

async function main() {
  console.log(`\n🌟 Adding ${names.length} women to the Galaxy\n`);

  if (DRY_RUN) {
    console.log('(Dry run - no data will be inserted)\n');
  }

  const supabase = getSupabaseClient();
  const results: { name: string; status: 'success' | 'failed'; error?: string }[] = [];

  for (const entry of names) {
    // Parse name and optional wiki title (format: "Name:Wiki_Title")
    const [name, wikiTitle] = entry.split(':');

    console.log(`📍 Processing: ${name}`);

    try {
      // Fetch Wikipedia data
      const wikiData = await fetchWikipediaData(name, wikiTitle);

      if (!wikiData) {
        console.log(`   ⚠️  No Wikipedia page found for "${name}"`);
        console.log(`   💡 Try: "${name}:Exact_Wikipedia_Title"\n`);
        results.push({ name, status: 'failed', error: 'No Wikipedia page found' });
        continue;
      }

      console.log(`   ✓ Found: ${wikiData.intro?.slice(0, 60)}...`);

      // Upload image
      let imageUrl: string | null = null;
      if (wikiData.imageUrl && !DRY_RUN) {
        process.stdout.write('   ↳ Uploading image... ');
        imageUrl = await processAndUploadImage(wikiData.imageUrl, name);
        console.log(imageUrl ? '✓' : '✗');
      }

      // Generate tags
      const tags = generateTags('', [], wikiData.intro, wikiData.categories || []);
      console.log(`   ↳ Tags: ${tags.join(', ')}`);
      console.log(`   ↳ Born: ${wikiData.birthYear || 'unknown'}`);

      if (DRY_RUN) {
        console.log(`   ✅ Would insert "${name}"\n`);
        results.push({ name, status: 'success' });
        continue;
      }

      // Insert into database
      const { error } = await supabase.from('women_profiles').insert({
        name,
        intro: wikiData.intro,
        accomplishments: wikiData.accomplishments,
        image_url: imageUrl,
        tags,
        birth_year: wikiData.birthYear,
        created_by: 'manual-import',
      });

      if (error) {
        if (error.code === '23505') {
          console.log(`   ⚠️  "${name}" already exists in database\n`);
          results.push({ name, status: 'failed', error: 'Already exists' });
        } else {
          throw error;
        }
      } else {
        console.log(`   ✅ Added "${name}" to the Galaxy!\n`);
        results.push({ name, status: 'success' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Error: ${errorMsg}\n`);
      results.push({ name, status: 'failed', error: errorMsg });
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 200));
  }

  // Summary
  console.log('─'.repeat(40));
  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`\n✨ Done! ${succeeded} added, ${failed} failed\n`);
}

main().catch(console.error);
