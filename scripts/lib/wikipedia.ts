/**
 * Wikipedia API helper for fetching women profile data
 */

export type WikipediaResult = {
  name: string;
  intro: string | null;
  accomplishments: string | null;
  imageUrl: string | null;
  categories: string[];
  birthYear: number | null;
};

/**
 * Extract birth year from Wikipedia intro text
 * Handles patterns like:
 * - "(January 15, 1867 – April 14, 1934)"
 * - "(born March 3, 1985)"
 * - "(b. 1990)"
 * - "born in 1950"
 */
export function extractBirthYear(text: string): number | null {
  if (!text) return null;

  // Pattern 1: (Month Day, YYYY - ...) or (Day Month YYYY - ...)
  const dateRangeMatch = text.match(/\((?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})\s*[–—-]/);
  if (dateRangeMatch) {
    const year = parseInt(dateRangeMatch[1]);
    if (year >= 1000 && year <= 2025) return year;
  }

  // Pattern 2: (born Month Day, YYYY) or (born YYYY)
  const bornMatch = text.match(/\(born\s+(?:[A-Z][a-z]+\s+\d{1,2},?\s+)?(\d{4})\)/i);
  if (bornMatch) {
    const year = parseInt(bornMatch[1]);
    if (year >= 1000 && year <= 2025) return year;
  }

  // Pattern 3: (b. YYYY)
  const bDotMatch = text.match(/\(b\.\s*(\d{4})\)/i);
  if (bDotMatch) {
    const year = parseInt(bDotMatch[1]);
    if (year >= 1000 && year <= 2025) return year;
  }

  // Pattern 4: born in YYYY or born YYYY
  const bornInMatch = text.match(/born\s+(?:in\s+)?(\d{4})/i);
  if (bornInMatch) {
    const year = parseInt(bornInMatch[1]);
    if (year >= 1000 && year <= 2025) return year;
  }

  // Pattern 5: (YYYY–YYYY) at start of text (common Wikipedia format)
  const yearRangeMatch = text.match(/\((\d{4})[–—-](?:\d{4}|present)?\)/);
  if (yearRangeMatch) {
    const year = parseInt(yearRangeMatch[1]);
    if (year >= 1000 && year <= 2025) return year;
  }

  // Pattern 6: Look for first 4-digit year in parentheses that looks like a birth year
  const anyYearMatch = text.match(/\(.*?(\d{4}).*?\)/);
  if (anyYearMatch) {
    const year = parseInt(anyYearMatch[1]);
    if (year >= 1800 && year <= 2010) return year;
  }

  return null;
}

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch Wikipedia data for a person
 */
export async function fetchWikipediaData(
  name: string,
  wikiTitle?: string
): Promise<WikipediaResult | null> {
  const title = wikiTitle || name.replace(/ /g, '_');

  try {
    // Fetch extract and image
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|pageimages|categories',
      exintro: 'true',
      explaintext: 'true',
      pithumbsize: '500',
      cllimit: '20',
      format: 'json',
      origin: '*',
    });

    const response = await fetch(`${WIKIPEDIA_API}?${params}`);
    if (!response.ok) {
      console.error(`Wikipedia API error for ${name}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') {
      // Page not found
      return null;
    }

    const page = pages[pageId];
    const extract = page.extract || '';
    const imageUrl = page.thumbnail?.source || null;
    const categories =
      page.categories?.map((c: { title: string }) =>
        c.title.replace('Category:', '').toLowerCase()
      ) || [];

    // Split extract into intro (first 2 sentences) and accomplishments (rest)
    const sentences = extract.split(/(?<=[.!?])\s+/);
    const intro = sentences.slice(0, 2).join(' ').trim() || null;
    const accomplishments =
      sentences.length > 2 ? sentences.slice(2, 5).join(' ').trim() : null;

    // Extract birth year from the full extract (more likely to contain date info)
    const birthYear = extractBirthYear(extract);

    return {
      name,
      intro,
      accomplishments,
      imageUrl,
      categories,
      birthYear,
    };
  } catch (error) {
    console.error(`Error fetching Wikipedia data for ${name}:`, error);
    return null;
  }
}

/**
 * Extract nationality from intro text
 */
export function extractNationality(intro: string): string | null {
  const nationalities = [
    'american',
    'british',
    'canadian',
    'australian',
    'french',
    'german',
    'italian',
    'spanish',
    'mexican',
    'brazilian',
    'chinese',
    'japanese',
    'korean',
    'indian',
    'russian',
    'polish',
    'irish',
    'scottish',
    'dutch',
    'swedish',
    'norwegian',
    'danish',
    'finnish',
    'swiss',
    'austrian',
    'belgian',
    'portuguese',
    'greek',
    'turkish',
    'israeli',
    'egyptian',
    'south african',
    'nigerian',
    'kenyan',
    'ethiopian',
    'moroccan',
    'chilean',
    'argentinian',
    'colombian',
    'peruvian',
    'venezuelan',
    'cuban',
    'puerto rican',
    'dominican',
    'jamaican',
    'haitian',
    'filipino',
    'vietnamese',
    'thai',
    'indonesian',
    'malaysian',
    'singaporean',
    'taiwanese',
    'hong kong',
    'pakistani',
    'bangladeshi',
    'sri lankan',
    'iranian',
    'iraqi',
    'lebanese',
    'syrian',
    'jordanian',
    'saudi',
    'emirati',
    'qatari',
    'kuwaiti',
    'yemeni',
    'ukrainian',
    'czech',
    'hungarian',
    'romanian',
    'bulgarian',
    'serbian',
    'croatian',
    'slovenian',
    'slovakian',
    'belarusian',
    'latvian',
    'lithuanian',
    'estonian',
    'icelandic',
    'new zealand',
  ];

  const lowerIntro = intro.toLowerCase();
  for (const nat of nationalities) {
    if (lowerIntro.includes(nat)) {
      return nat;
    }
  }
  return null;
}

/**
 * Generate auto-tags from category and Wikipedia data
 */
export function generateTags(
  category: string,
  baseTags: string[],
  intro: string | null,
  wikiCategories: string[]
): string[] {
  const tags = new Set<string>();

  // Add base tags from the curated list
  baseTags.forEach((tag) => tags.add(tag.toLowerCase()));

  // Add category as a tag
  tags.add(category.toLowerCase());

  // Extract nationality from intro
  if (intro) {
    const nationality = extractNationality(intro);
    if (nationality) {
      tags.add(nationality);
    }
  }

  // Extract useful tags from Wikipedia categories
  const keywordPatterns = [
    /nobel laureate/i,
    /pulitzer prize/i,
    /oscar winner/i,
    /emmy winner/i,
    /grammy winner/i,
    /olympic gold/i,
    /world champion/i,
    /billionaire/i,
    /philanthropist/i,
    /activist/i,
    /feminist/i,
    /lgbtq/i,
  ];

  for (const cat of wikiCategories) {
    for (const pattern of keywordPatterns) {
      if (pattern.test(cat)) {
        const match = cat.match(pattern);
        if (match) {
          tags.add(match[0].toLowerCase());
        }
      }
    }
  }

  return Array.from(tags).slice(0, 8); // Limit to 8 tags
}

/**
 * Batch fetch with rate limiting
 */
export async function batchFetchWikipedia(
  names: Array<{ name: string; wiki?: string }>,
  onProgress?: (current: number, total: number, name: string) => void,
  delayMs = 100
): Promise<Map<string, WikipediaResult>> {
  const results = new Map<string, WikipediaResult>();

  for (let i = 0; i < names.length; i++) {
    const { name, wiki } = names[i];
    onProgress?.(i + 1, names.length, name);

    const result = await fetchWikipediaData(name, wiki);
    if (result) {
      results.set(name, result);
    }

    // Rate limiting
    if (i < names.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}
