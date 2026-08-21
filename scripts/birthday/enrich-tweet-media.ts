import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SourceArchive, SourceTweet, TweetMediaOverrides } from './build-temple-archive';

const DEFAULT_INPUT = 'data/bd/2026/x-jmill-all-tweets.json';
const DEFAULT_OUTPUT = 'data/bd/2026/tweet-media.json';

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'");
}

export function extractTweetImage(html: string): string | null {
  const candidates = [
    ...html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/gi),
    ...html.matchAll(/<meta\s+content="([^"]+)"\s+property="og:image"/gi),
  ];
  for (const match of candidates) {
    const source = decodeHtml(match[1]);
    if (!/^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb)\//i.test(source)) continue;
    return source.replace(/:(?:small|medium|large|orig)$/i, '?name=large');
  }
  return null;
}

function hasLostImage(tweet: SourceTweet): boolean {
  return tweet.media_alt_text.some((value) => value.trim().toLowerCase() === 'image');
}

async function recoverTweetImage(tweet: SourceTweet): Promise<string | null> {
  const response = await fetch(`https://x.com/jmilldotdev/status/${tweet.id}`, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; LucyEarthBirthdayArchive/1.0)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return extractTweetImage(await response.text());
}

type CliOptions = {
  input: string;
  output: string;
  concurrency: number;
  id?: string;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    concurrency: 6,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input' && argv[index + 1]) options.input = argv[++index];
    else if (argv[index] === '--output' && argv[index + 1]) options.output = argv[++index];
    else if (argv[index] === '--concurrency' && argv[index + 1]) {
      options.concurrency = Math.max(1, Number(argv[++index]) || 1);
    } else if (argv[index] === '--id' && argv[index + 1]) options.id = argv[++index];
    else if (argv[index] === '--limit' && argv[index + 1]) {
      options.limit = Math.max(1, Number(argv[++index]) || 1);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await readFile(path.resolve(options.input), 'utf8')) as SourceArchive;
  const destination = path.resolve(options.output);
  const existing: TweetMediaOverrides = await readFile(destination, 'utf8')
    .then((value) => JSON.parse(value) as TweetMediaOverrides)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return {} as TweetMediaOverrides;
      throw error;
    });
  const candidates = source.tweets
    .filter((tweet) => hasLostImage(tweet) && !existing[tweet.id]?.length)
    .filter((tweet) => !options.id || tweet.id === options.id)
    .slice(0, options.limit);

  let cursor = 0;
  let recovered = 0;
  let unavailable = 0;
  let failed = 0;
  const workers = Array.from(
    { length: Math.min(options.concurrency, Math.max(1, candidates.length)) },
    async () => {
      while (cursor < candidates.length) {
        const index = cursor++;
        const tweet = candidates[index];
        try {
          const image = await recoverTweetImage(tweet);
          if (image) {
            existing[tweet.id] = [image];
            recovered += 1;
          } else {
            unavailable += 1;
          }
        } catch (error) {
          failed += 1;
          console.warn(`Could not enrich ${tweet.id}: ${error instanceof Error ? error.message : error}`);
        }
        const complete = recovered + unavailable + failed;
        if (complete % 25 === 0 || complete === candidates.length) {
          console.log(`${complete}/${candidates.length} checked · ${recovered} recovered · ${unavailable} unavailable · ${failed} failed`);
        }
      }
    }
  );
  await Promise.all(workers);
  const sorted = Object.fromEntries(Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  console.log(`Saved ${Object.keys(sorted).length} recovered media records to ${destination}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
