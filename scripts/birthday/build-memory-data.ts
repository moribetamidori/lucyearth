import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type DiscoveredTweet = {
  id: string;
  author: string;
  text: string;
  sourceUrl: string;
  publishedAt?: string;
  media: Array<{ type: 'image'; src: string; alt: string }>;
  clusterId?: string;
};

type ClusterSeed = {
  id: string;
  text: string;
};

const EXPECTED_AUTHOR = 'jmilldotdev';

const CLUSTER_SEEDS: ClusterSeed[] = [
  {
    id: 'autonomous-signals',
    text: 'AI agents autonomous media machine intelligence bots future models research experiments',
  },
  {
    id: 'temporary-worlds',
    text: 'Mars College temporary village community desert gathering future technology self preservation',
  },
  {
    id: 'deliciously-broken-code',
    text: 'software code programming bugs spaghetti humor internet developer tools weird websites',
  },
  {
    id: 'tools-for-thought',
    text: 'Obsidian notes knowledge memory prompting context library thinking writing information',
  },
  {
    id: 'desert-internet',
    text: 'Bombay Beach art objects memes ritual physical internet culture psychedelia desert',
  },
  {
    id: 'coordination-machines',
    text: 'protocol payments crypto coordination commitments goals markets networks incentives money',
  },
];

// Visual-only posts and editorial project connections need a human nudge; new
// posts still fall through to the local embedding model below.
const CLUSTER_OVERRIDES: Record<string, string> = {
  '1600624362394091523': 'autonomous-signals',
  '2080667229251592249': 'autonomous-signals',
  '2089047403005370595': 'temporary-worlds',
  '2090423273943138502': 'desert-internet',
  '2090425796351447255': 'coordination-machines',
  '2090468626583138468': 'tools-for-thought',
  '2090494513324195991': 'deliciously-broken-code',
};

export const DEFAULT_SOURCE_URLS = [
  'https://x.com/jmilldotdev',
  'https://x.com/jmilldotdev/status/1600624362394091523',
  'https://x.com/jmilldotdev/status/2080667229251592249',
];

function cleanUrl(value: string | undefined): string {
  return (value ?? '').replaceAll('&amp;', '&');
}

function cleanText(value: string | undefined): string {
  return (value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function idFromUrl(value: string): string | null {
  return value.match(/\/status\/(\d+)/)?.[1] ?? null;
}

export function parsePublicXHtml(html: string): DiscoveredTweet[] {
  const $ = load(html);
  const results: DiscoveredTweet[] = [];

  $('article[data-tweet-id][itemprop="hasPart"]').each((_, article) => {
    const node = $(article);
    const id = node.attr('data-tweet-id');
    const sourceUrl = cleanUrl(node.find('meta[itemprop="url"]').first().attr('content'));
    const author = node.find('meta[itemprop="alternateName"]').first().attr('content') ?? '';

    if (!id || author.toLowerCase() !== EXPECTED_AUTHOR || idFromUrl(sourceUrl) !== id) {
      return;
    }

    const media = node
      .find('img[src*="pbs.twimg.com/media"]')
      .filter((__, image) => $(image).closest('article[data-tweet-id]')[0] === article)
      .map((__, image) => ({
        type: 'image' as const,
        src: cleanUrl($(image).attr('src')),
        alt: cleanText($(image).attr('alt')) || 'Image attached to the post',
      }))
      .get();

    results.push({
      id,
      author,
      text: cleanText(node.find('meta[itemprop="text"]').first().attr('content')),
      sourceUrl,
      publishedAt: node.find('meta[itemprop="datePublished"]').first().attr('content'),
      media,
    });
  });

  const canonicalUrl = cleanUrl($('meta[property="og:url"]').attr('content'));
  const canonicalId = idFromUrl(canonicalUrl);
  const canonicalAuthor = $('meta[name="twitter:creator"]')
    .attr('content')
    ?.replace(/^@/, '')
    .toLowerCase();

  if (canonicalId && canonicalAuthor === EXPECTED_AUTHOR) {
    const image = cleanUrl($('meta[property="og:image"]').attr('content'));
    results.push({
      id: canonicalId,
      author: EXPECTED_AUTHOR,
      text: cleanText($('meta[property="og:description"]').attr('content')),
      sourceUrl: canonicalUrl,
      publishedAt: $('meta[property="article:published_time"]').attr('content'),
      media: image
        ? [{ type: 'image', src: image, alt: 'Image attached to the post' }]
        : [],
    });
  }

  return dedupeTweets(results);
}

export function dedupeTweets(tweets: DiscoveredTweet[]): DiscoveredTweet[] {
  const unique = new Map<string, DiscoveredTweet>();

  for (const tweet of tweets) {
    if (tweet.author.toLowerCase() !== EXPECTED_AUTHOR) continue;
    const previous = unique.get(tweet.id);
    if (!previous) {
      unique.set(tweet.id, tweet);
      continue;
    }

    const richer = tweet.text.length > previous.text.length ? tweet : previous;
    const media = new Map(
      [...previous.media, ...tweet.media].map((item) => [item.src, item])
    );
    unique.set(tweet.id, {
      ...richer,
      publishedAt: richer.publishedAt ?? previous.publishedAt ?? tweet.publishedAt,
      media: [...media.values()],
    });
  }

  return [...unique.values()].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude) || 1);
}

export async function assignClustersLocally(
  tweets: DiscoveredTweet[]
): Promise<DiscoveredTweet[]> {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = (await pipeline(
    'feature-extraction',
    'onnx-community/all-MiniLM-L6-v2-ONNX',
    { dtype: 'q4' }
  )) as unknown as {
    (input: string[], options: { pooling: 'mean'; normalize: true }): Promise<{
      tolist(): number[][];
    }>;
    dispose?: () => Promise<void>;
  };

  const texts = [...CLUSTER_SEEDS.map((seed) => seed.text), ...tweets.map((tweet) => tweet.text)];
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  const vectors = output.tolist();
  const seedVectors = vectors.slice(0, CLUSTER_SEEDS.length);
  const tweetVectors = vectors.slice(CLUSTER_SEEDS.length);

  const clustered = tweets.map((tweet, tweetIndex) => {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    seedVectors.forEach((seedVector, seedIndex) => {
      const score = cosineSimilarity(tweetVectors[tweetIndex], seedVector);
      if (score > bestScore) {
        bestIndex = seedIndex;
        bestScore = score;
      }
    });

    return {
      ...tweet,
      clusterId: CLUSTER_OVERRIDES[tweet.id] ?? CLUSTER_SEEDS[bestIndex].id,
    };
  });

  await extractor.dispose?.();
  return clustered;
}

type CliOptions = {
  sources: string[];
  output: string;
  embed: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const sources: string[] = [];
  let output = 'data/bd/2026/discovered-tweets.json';
  let embed = false;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source' && argv[index + 1]) {
      sources.push(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--output' && argv[index + 1]) {
      output = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--embed') {
      embed = true;
    }
  }

  return {
    sources: sources.length > 0 ? sources : DEFAULT_SOURCE_URLS,
    output,
    embed,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const collected: DiscoveredTweet[] = [];

  for (const source of options.sources) {
    const response = await fetch(source, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BirthdayMemoryPalace/1.0)' },
    });
    if (!response.ok) {
      throw new Error(`Could not fetch ${source}: ${response.status}`);
    }
    collected.push(...parsePublicXHtml(await response.text()));
  }

  const tweets = dedupeTweets(collected);
  const output = options.embed ? await assignClustersLocally(tweets) : tweets;
  const destination = path.resolve(options.output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Saved ${output.length} verified posts to ${destination}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
