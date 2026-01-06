import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

// Lazy initialize Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchBirthYearFromWikidata(wikidataId: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: wikidataId,
      props: 'claims',
      format: 'json',
      origin: '*',
    });

    const response = await fetch(`${WIKIDATA_API}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const entity = data.entities?.[wikidataId];
    if (!entity) return null;

    const birthClaim = entity.claims?.P569?.[0];
    if (!birthClaim) return null;

    const timeValue = birthClaim.mainsnak?.datavalue?.value?.time;
    if (!timeValue) return null;

    const yearMatch = timeValue.match(/^[+-](\d+)-/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year >= 1 && year <= 2025) return year;
    }
    return null;
  } catch {
    return null;
  }
}

function extractBirthYear(text: string): number | null {
  if (!text) return null;

  const patterns = [
    /\((?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})\s*[–—-]/,
    /\(born\s+(?:[A-Z][a-z]+\s+\d{1,2},?\s+)?(\d{4})\)/i,
    /\(b\.\s*(\d{4})\)/i,
    /born\s+(?:in\s+)?(\d{4})/i,
    /\((\d{4})[–—-](?:\d{4}|present)?\)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 1000 && year <= 2025) return year;
    }
  }
  return null;
}

function extractNationality(intro: string): string | null {
  const nationalities = [
    'american', 'british', 'canadian', 'australian', 'french', 'german',
    'italian', 'spanish', 'mexican', 'brazilian', 'chinese', 'japanese',
    'korean', 'indian', 'russian', 'polish', 'irish', 'scottish', 'dutch',
    'swedish', 'norwegian', 'danish', 'finnish', 'swiss', 'austrian',
    'belgian', 'portuguese', 'greek', 'turkish', 'israeli', 'egyptian',
    'south african', 'nigerian', 'kenyan', 'filipino', 'vietnamese',
    'thai', 'indonesian', 'taiwanese', 'pakistani', 'iranian', 'lebanese',
    'ukrainian', 'czech', 'hungarian', 'romanian', 'serbian', 'croatian',
    'new zealand', 'singaporean', 'malaysian', 'hong kong',
  ];

  const lowerIntro = intro.toLowerCase();
  for (const nat of nationalities) {
    if (lowerIntro.includes(nat)) return nat;
  }
  return null;
}

function extractTags(intro: string | null, categories: string[]): string[] {
  const tags = new Set<string>();

  const occupationPatterns = [
    /\b(actress|actor)\b/i, /\b(singer|vocalist)\b/i, /\b(songwriter)\b/i,
    /\b(musician)\b/i, /\b(rapper)\b/i, /\b(producer)\b/i, /\b(director)\b/i,
    /\b(writer|author|novelist|poet)\b/i, /\b(journalist)\b/i,
    /\b(politician)\b/i, /\b(entrepreneur)\b/i, /\b(businesswoman)\b/i,
    /\b(ceo|founder)\b/i, /\b(scientist)\b/i, /\b(physicist)\b/i,
    /\b(chemist)\b/i, /\b(biologist)\b/i, /\b(mathematician)\b/i,
    /\b(engineer)\b/i, /\b(astronaut)\b/i, /\b(athlete)\b/i,
    /\b(olympian)\b/i, /\b(tennis player)\b/i, /\b(gymnast)\b/i,
    /\b(model)\b/i, /\b(comedian)\b/i, /\b(activist)\b/i,
    /\b(philanthropist)\b/i, /\b(designer)\b/i, /\b(artist)\b/i,
    /\b(painter)\b/i, /\b(photographer)\b/i, /\b(chef)\b/i,
    /\b(lawyer|attorney)\b/i, /\b(doctor|physician)\b/i,
    /\b(professor)\b/i, /\b(influencer)\b/i, /\b(billionaire)\b/i,
    /\b(investor)\b/i, /\b(queen|princess|empress)\b/i,
  ];

  if (intro) {
    for (const pattern of occupationPatterns) {
      const match = intro.match(pattern);
      if (match) tags.add(match[1].toLowerCase());
    }
    const nationality = extractNationality(intro);
    if (nationality) tags.add(nationality);
  }

  const categoryKeywords = [
    'nobel', 'pulitzer', 'oscar', 'emmy', 'grammy', 'tony',
    'olympic', 'billionaire', 'activist', 'feminist', 'entrepreneur',
  ];

  for (const cat of categories) {
    const lowerCat = cat.toLowerCase();
    for (const keyword of categoryKeywords) {
      if (lowerCat.includes(keyword)) tags.add(keyword);
    }
  }

  return Array.from(tags).slice(0, 8);
}

async function uploadImage(imageUrl: string, name: string, supabase: ReturnType<typeof getSupabaseClient>): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const fileName = `women/${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;

    const { error } = await supabase.storage
      .from('women-profiles')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });

    if (error) return null;

    const { data } = supabase.storage.from('women-profiles').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
      return NextResponse.json({ error: 'Server configuration error: missing Supabase URL' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ error: 'Server configuration error: missing service key' }, { status: 500 });
    }

    const supabase = getSupabaseClient();

    const { name, wikiTitle } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const title = wikiTitle || name.replace(/ /g, '_');

    // Fetch Wikipedia data
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|pageimages|categories|pageprops',
      exintro: 'true',
      explaintext: 'true',
      pithumbsize: '500',
      cllimit: '20',
      format: 'json',
      origin: '*',
    });

    const wikiResponse = await fetch(`${WIKIPEDIA_API}?${params}`);
    if (!wikiResponse.ok) {
      return NextResponse.json({ error: 'Wikipedia API error' }, { status: 500 });
    }

    const wikiData = await wikiResponse.json();
    const pages = wikiData.query?.pages;
    if (!pages) {
      return NextResponse.json({ error: 'No Wikipedia data found' }, { status: 404 });
    }

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') {
      return NextResponse.json(
        { error: `No Wikipedia page found for "${name}". Try adding the exact Wikipedia title after a colon, e.g., "Name:Wikipedia_Title"` },
        { status: 404 }
      );
    }

    const page = pages[pageId];
    const extract = page.extract || '';
    const wikiImageUrl = page.thumbnail?.source || null;
    const categories = page.categories?.map((c: { title: string }) =>
      c.title.replace('Category:', '').toLowerCase()
    ) || [];

    // Parse intro and accomplishments
    const sentences = extract.split(/(?<=[.!?])\s+/);
    const intro = sentences.slice(0, 2).join(' ').trim() || null;
    const accomplishments = sentences.length > 2 ? sentences.slice(2, 5).join(' ').trim() : null;

    // Get birth year from Wikidata first, fallback to text
    let birthYear: number | null = null;
    const wikidataId = page.pageprops?.wikibase_item;
    if (wikidataId) {
      birthYear = await fetchBirthYearFromWikidata(wikidataId);
    }
    if (!birthYear) {
      birthYear = extractBirthYear(extract);
    }

    // Upload image
    let imageUrl: string | null = null;
    if (wikiImageUrl) {
      imageUrl = await uploadImage(wikiImageUrl, name, supabase);
    }

    // Generate tags
    const tags = extractTags(intro, categories);

    // Insert into database
    const { data, error } = await supabase
      .from('women_profiles')
      .insert({
        name,
        intro,
        accomplishments,
        image_url: imageUrl,
        tags,
        birth_year: birthYear,
        created_by: 'web-import',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `"${name}" already exists in the database` }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
}
