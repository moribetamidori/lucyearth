import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

type Plant = {
  id: string;
  title: string;
  image_url: string | null;
  ai_generated: boolean;
};

type Craft = {
  notes: string | null;
  plant: Plant | null;
  result_plant: Plant | null;
};

type WikimediaImage = {
  imageUrl: string;
  sourceUrl: string;
  attribution: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SOURCE_TAXA: Record<string, string> = {
  Clover: 'Trifolium repens',
  Daisy: 'Bellis perennis',
  Duckweed: 'Lemna minor',
  Wildflowers: 'Wildflower',
  'White Mushroom': 'Agaricus bisporus',
  'Elephant Ear': 'Alocasia macrorrhizos',
};

function scientificName(notes: string | null) {
  return notes?.match(/^Real-world taxon:\s*(.+?)\.$/)?.[1] || null;
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson(url: URL, label: string, attempt = 1): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'LucyEarthPlantbook/1.0 (botanical image enrichment; lucyearth.app)' },
  });
  if (response.status === 429 && attempt < 4) {
    const retrySeconds = Number(response.headers.get('retry-after')) || attempt * 10;
    await new Promise((resolve) => setTimeout(resolve, Math.min(retrySeconds, 30) * 1000));
    return fetchJson(url, label, attempt + 1);
  }
  if (!response.ok) throw new Error(`${label} failed (${response.status}).`);
  return response.json();
}

async function wikipediaImages(queries: string[]) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', prop: 'pageimages|info', inprop: 'url', piprop: 'thumbnail|name',
    pithumbsize: '1000', redirects: '1', titles: queries.join('|'), format: 'json',
    origin: '*', maxlag: '5',
  }).toString();
  const payload = await fetchJson(url, 'Wikipedia image request') as {
    query?: {
      normalized?: Array<{ from: string; to: string }>;
      redirects?: Array<{ from: string; to: string }>;
      pages?: Record<string, { title: string; missing?: string; thumbnail?: { source?: string }; pageimage?: string; fullurl?: string }>;
    };
  };
  const aliases = new Map<string, string>();
  payload.query?.normalized?.forEach(({ from, to }) => aliases.set(from, to));
  payload.query?.redirects?.forEach(({ from, to }) => aliases.set(from, to));
  const finalTitle = (title: string) => {
    const seen = new Set<string>();
    while (aliases.has(title) && !seen.has(title)) { seen.add(title); title = aliases.get(title) as string; }
    return title;
  };
  const pages = new Map(Object.values(payload.query?.pages || {}).map((page) => [page.title.toLocaleLowerCase(), page]));
  return new Map(queries.map((query) => [query, pages.get(finalTitle(query).toLocaleLowerCase())]));
}

async function commonsCredits(filenames: string[]) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|descriptionurl',
    titles: filenames.map((filename) => `File:${filename}`).join('|'), format: 'json',
    origin: '*', maxlag: '5',
  }).toString();
  const payload = await fetchJson(url, 'Commons metadata request') as {
    query?: { pages?: Record<string, { title: string; imageinfo?: Array<{ descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }> };
  };
  const credits = new Map<string, { sourceUrl: string; attribution: string }>();
  Object.values(payload.query?.pages || {}).forEach((page) => {
    const filename = page.title.replace(/^File:/, '');
    const info = page.imageinfo?.[0];
    const artist = cleanText(info?.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor';
    const license = cleanText(info?.extmetadata?.LicenseShortName?.value) || 'See source for license';
    credits.set(filename.replace(/_/g, ' ').toLocaleLowerCase(), {
      sourceUrl: info?.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
      attribution: `${artist} · ${license}`,
    });
  });
  return credits;
}

async function resolveImageBatch(queries: string[]) {
  const pages = await wikipediaImages(queries);
  const filenames = [...new Set([...pages.values()].flatMap((page) => page?.pageimage ? [page.pageimage] : []))];
  const credits = await commonsCredits(filenames);
  const images = new Map<string, WikimediaImage>();
  queries.forEach((query) => {
    const page = pages.get(query);
    if (!page || page.missing !== undefined || !page.thumbnail?.source || !page.pageimage) return;
    const credit = credits.get(page.pageimage.replace(/_/g, ' ').toLocaleLowerCase());
    if (!credit) return;
    images.set(query, { imageUrl: page.thumbnail.source, ...credit });
  });
  return images;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const { data, error } = await supabase
    .from('plantbook2_crafts')
    .select('notes, plant:plantbook2_plants!plant_id(id,title,image_url,ai_generated), result_plant:plantbook2_plants!result_plant_id(id,title,image_url,ai_generated)')
    .eq('ai_generated', true);
  if (error) throw error;

  const crafts = (data || []) as unknown as Craft[];
  const targets = new Map<string, { plant: Plant; taxon: string }>();
  for (const craft of crafts) {
    const taxon = scientificName(craft.notes);
    if (craft.result_plant && taxon) targets.set(craft.result_plant.id, { plant: craft.result_plant, taxon });
    if (craft.plant && !craft.plant.ai_generated && SOURCE_TAXA[craft.plant.title]) {
      targets.set(craft.plant.id, { plant: craft.plant, taxon: SOURCE_TAXA[craft.plant.title] });
    }
  }

  const imageByTaxon = new Map<string, WikimediaImage>();
  const failures: string[] = [];
  const taxa = [...new Set([...targets.values()].map(({ taxon }) => taxon))];
  for (let index = 0; index < taxa.length; index += 40) {
    const batch = taxa.slice(index, index + 40);
    try {
      const images = await resolveImageBatch(batch);
      images.forEach((image, taxon) => imageByTaxon.set(taxon, image));
      batch.filter((taxon) => !images.has(taxon)).forEach((taxon) => failures.push(`${taxon}: No species-page image found.`));
      console.log(`Resolved ${imageByTaxon.size}/${taxa.length} canonical images.`);
    } catch (error) {
      batch.forEach((taxon) => failures.push(`${taxon}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  if (dryRun) {
    console.log(`Dry run resolved ${imageByTaxon.size}/${taxa.length} canonical images.`);
    if (failures.length > 0) console.error(`Missing ${failures.length} images:\n${failures.join('\n')}`);
    process.exitCode = failures.length > 0 ? 1 : 0;
    return;
  }

  let updated = 0;
  for (const { plant, taxon } of targets.values()) {
    try {
      const image = imageByTaxon.get(taxon);
      if (!image) throw new Error(`No resolved image for ${taxon}.`);
      const { error: updateError } = await supabase.from('plantbook2_plants').update({
        image_url: image.imageUrl,
        image_path: null,
        image_source_url: image.sourceUrl,
        image_attribution: image.attribution,
      }).eq('id', plant.id);
      if (updateError) throw updateError;
      updated += 1;
      console.log(`${updated}/${targets.size} ${plant.title} <- ${taxon}`);
    } catch (error) {
      failures.push(`${plant.title} (${taxon}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Updated ${updated} canonical plant images (${imageByTaxon.size} unique taxa).`);
  if (failures.length > 0) {
    console.error(`Missing or failed ${failures.length} images:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}

void run();
