#!/usr/bin/env npx tsx
/**
 * Quick script to add multiple women by name
 *
 * Usage:
 *   npx tsx scripts/add-women.ts "Taylor Swift" "Beyoncé" "Rihanna"
 *   npx tsx scripts/add-women.ts "Marie Curie:Marie_Curie" # Use custom wiki title after colon
 *   npx tsx scripts/add-women.ts --dry-run "Someone" # Preview without inserting
 */

import { fetchWikipediaData, extractNationality } from './lib/wikipedia.js';
import { processAndUploadImage, getSupabaseClient } from './lib/image-upload.js';

/**
 * Extract meaningful tags from Wikipedia intro and categories
 */
function extractTags(intro: string | null, categories: string[]): string[] {
  const tags = new Set<string>();

  // Common occupations/roles to look for in intro
  const occupationPatterns = [
    /\b(actress|actor)\b/i,
    /\b(singer|vocalist)\b/i,
    /\b(songwriter)\b/i,
    /\b(musician)\b/i,
    /\b(rapper)\b/i,
    /\b(producer)\b/i,
    /\b(director)\b/i,
    /\b(writer|author|novelist|poet)\b/i,
    /\b(journalist)\b/i,
    /\b(politician)\b/i,
    /\b(entrepreneur)\b/i,
    /\b(businesswoman|businessman)\b/i,
    /\b(ceo|founder)\b/i,
    /\b(scientist)\b/i,
    /\b(physicist)\b/i,
    /\b(chemist)\b/i,
    /\b(biologist)\b/i,
    /\b(mathematician)\b/i,
    /\b(engineer)\b/i,
    /\b(astronaut)\b/i,
    /\b(athlete)\b/i,
    /\b(olympian)\b/i,
    /\b(tennis player)\b/i,
    /\b(soccer player|footballer)\b/i,
    /\b(basketball player)\b/i,
    /\b(gymnast)\b/i,
    /\b(swimmer)\b/i,
    /\b(skier)\b/i,
    /\b(model)\b/i,
    /\b(comedian)\b/i,
    /\b(activist)\b/i,
    /\b(philanthropist)\b/i,
    /\b(designer)\b/i,
    /\b(artist)\b/i,
    /\b(painter)\b/i,
    /\b(photographer)\b/i,
    /\b(chef)\b/i,
    /\b(lawyer|attorney)\b/i,
    /\b(doctor|physician)\b/i,
    /\b(nurse)\b/i,
    /\b(professor)\b/i,
    /\b(educator)\b/i,
    /\b(influencer)\b/i,
    /\b(youtuber)\b/i,
    /\b(streamer)\b/i,
    /\b(billionaire)\b/i,
    /\b(investor)\b/i,
    /\b(queen|princess|empress)\b/i,
    /\b(first lady)\b/i,
    /\b(prime minister)\b/i,
    /\b(president)\b/i,
  ];

  // Extract from intro
  if (intro) {
    for (const pattern of occupationPatterns) {
      const match = intro.match(pattern);
      if (match) {
        tags.add(match[1].toLowerCase());
      }
    }

    // Extract nationality
    const nationality = extractNationality(intro);
    if (nationality) {
      tags.add(nationality);
    }
  }

  // Extract from Wikipedia categories
  const categoryKeywords = [
    'nobel', 'pulitzer', 'oscar', 'emmy', 'grammy', 'tony',
    'olympic', 'world champion', 'billionaire', 'activist',
    'feminist', 'lgbtq', 'entrepreneur', 'philanthropist'
  ];

  for (const cat of categories) {
    const lowerCat = cat.toLowerCase();
    for (const keyword of categoryKeywords) {
      if (lowerCat.includes(keyword)) {
        tags.add(keyword);
      }
    }
  }

  return Array.from(tags).slice(0, 8);
}

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
      const tags = extractTags(wikiData.intro, wikiData.categories || []);
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
