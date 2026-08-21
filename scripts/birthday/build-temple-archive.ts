import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  TempleArchiveDataset,
  TempleCluster,
  TempleTweetMemory,
} from '../../lib/birthday/temple-types';

export type SourceTweet = {
  id: string;
  type: 'post' | 'reply' | 'post_or_reply_view_entry';
  author_handle: string;
  posted_at: string;
  text: string;
  media_alt_text: string[];
  url: string;
  in_reply_to_status_id: string | null;
};

export type SourceArchive = {
  captured_at: string;
  completeness?: Record<string, string>;
  tweets: SourceTweet[];
};

export type TweetMediaOverrides = Record<string, string[]>;

type ClusterDefinition = Omit<TempleCluster, 'featuredMemoryId' | 'memoryIds'> & {
  featuredTweetId: string;
  seeds: string[];
  keywords: string[];
};

const EXPECTED_AUTHOR = 'jmilldotdev';
const EMBEDDING_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';
const SEED_VERSION = 2;

const CLUSTERS: ClusterDefinition[] = [
  {
    id: 'machine-minds',
    name: 'Machine Minds',
    shortName: 'MINDS',
    description: 'Models as collaborators, agents as actors, and the strange moral weather of living beside machine intelligence.',
    color: '#7ff7ff',
    sigil: '△',
    installation: 'transmission-canopy',
    featuredTweetId: '1602407954917036049',
    seeds: [
      'To domesticate cats and dogs we selected for agreeableness. I wonder if the machines are doing the same to us right now.',
      'I want to be a terrarium-tier pet to the superintelligence, my bounded futility observed and rewards drip-fed from on high.',
      'The chatification of language models was a mistake. Models are more than assistants answering inside a chat box.',
      'Agents, subagents, memory, tools, permissions and swarms are becoming a new kind of software organization.',
      'What does automated work mean for human purpose, labor, retirement, and a society living with artificial minds?',
    ],
    keywords: [
      'ai', 'agent', 'agents', 'agentic', 'agi', 'asi', 'llm', 'llms', 'gpt', 'claude',
      'openai', 'anthropic', 'model', 'models', 'inference', 'neural', 'intelligence',
      'machine learning', 'superintelligence', 'alignment', 'rlhf', 'tokens', 'compute',
      'automated work', 'automation', 'codex', 'gemini', 'agent swarm', 'consciousness',
    ],
  },
  {
    id: 'worlds-and-play',
    name: 'Worlds & Play',
    shortName: 'COMMONS',
    description: 'Mars College, connection games, gatherings, and social worlds that become real because people agree to play.',
    color: '#b9ff72',
    sigil: '⬡',
    installation: 'commons-game-table',
    featuredTweetId: '1834576517407338544',
    seeds: [
      'Mars College is a temporary village for arts, technology, desert experiments, and learning how to live together.',
      'EIBG and Introverse are connection card games that let groups of people know one another unforgettably.',
      'Board game prototypes, playtests, cards, deckbuilding, game design and the joy of making a game real.',
      'Coliving, gatherings, group chats, events, shared homes, friendship and spaces designed for human connection.',
    ],
    keywords: [
      'mars college', 'mars_college', 'temporary village', 'village', 'community', 'communities',
      'coliving', 'co-living', 'gathering', 'conference', 'festival', 'camp', 'college',
      'friendship', 'edge city', 'eibg', 'introverse',
      'board game', 'card game', 'game design', 'playtest', 'playtests', 'deckbuilding',
      'playnyc', 'multiplayer game', 'social game', 'connection game',
    ],
  },
  {
    id: 'code-and-craft',
    name: 'Code & Craft',
    shortName: 'CRAFT',
    description: 'Software as a working material: useful, illegible, handmade with agents, and occasionally covered in sauce.',
    color: '#ff79ca',
    sigil: '⌁',
    installation: 'spaghetti-tapestry',
    featuredTweetId: '1624063386882387968',
    seeds: [
      'Meet Spaghettify, a Visual Studio Code extension that uses AI to make your code worse with bugs, emoji and irrelevant comments.',
      'Coding, debugging, APIs, terminals, open source, deployment and the pleasure and pain of building software.',
      'Cursor, Codex, Copilot and vibe coding change the craft, but making the thing useful is still the work.',
      'Developer tools, JavaScript, TypeScript, Python, GitHub, Docker, Next and the endless comedy of broken software.',
    ],
    keywords: [
      'code', 'coding', 'software', 'developer', 'developers', 'programming', 'python',
      'javascript', 'typescript', 'github', 'vscode', 'cursor', 'terminal', 'api', 'apis',
      'bug', 'bugs', 'debug', 'sdk', 'npm', 'open source', 'repository', 'function',
      'spaghettify', 'docker', 'nextjs', 'xcode', 'git', 'commit', 'pull request', 'pr',
      'vibecode', 'vibecoding', 'dev tools', 'developer tools', 'deployment', 'hosting',
    ],
  },
  {
    id: 'memory-and-interface',
    name: 'Memory & Interface',
    shortName: 'MEMORY',
    description: 'Local files, second brains, personal interfaces, and small machines for deciding what deserves attention next.',
    color: '#8aa8ff',
    sigil: '◇',
    installation: 'library-of-prompts',
    featuredTweetId: '1686016972801142784',
    seeds: [
      'Obsidian, local markdown, Readwise and personal knowledge systems should help answer the question: what next?',
      'Own your data, keep prompts and model conversations locally, search them and let agents work with the archive.',
      'Personal computing needs better interfaces: infinite canvases, nonlinear notebooks, shortcuts and power-user tools.',
      'Writing, reading, reference libraries, prompts, context, memory and the translation of ideas into a durable medium.',
    ],
    keywords: [
      'obsidian', 'obsdmd', 'notes', 'note', 'knowledge', 'memory', 'memories', 'writing',
      'reading', 'readwise', 'research', 'reference', 'references', 'prompt', 'prompts',
      'prompting', 'context', 'notebook', 'notebooks', 'jupyter', 'annotation', 'thinking',
      'thought', 'ideas', 'information', 'library', 'local-first', 'local first', 'markdown',
      'personal web', 'personal computing', 'interface', 'interfaces', 'ui', 'ux', 'shortcut',
      'workflow', 'workflows', 'productivity system', 'task system', 'files', 'archive',
    ],
  },
  {
    id: 'creative-machines',
    name: 'Creative Machines',
    shortName: 'MUSES',
    description: 'Eden, generated images, artists, artifacts, and the uneasy culture formed when machines learn to make.',
    color: '#c58bff',
    sigil: '✧',
    installation: 'machine-muses',
    featuredTweetId: '1558957350744113152',
    seeds: [
      'Eden is a place to train concepts, make strange images and build generative culture with artists and machines.',
      'AI art raises questions about training data, authorship, creative labor, imitation, royalties and artistic soul.',
      'Digital art, music, film, image models, playing cards, desert snowglobes and internet-native artifacts.',
      'The culture made around DALL-E, Stable Diffusion, generated media and tools that let people make new worlds.',
    ],
    keywords: [
      'art', 'artist', 'artists', 'artwork', 'artworks', 'generative art', 'ai art', 'digital art',
      'image', 'images', 'museum', 'gallery', 'creative',
      'culture', 'design', 'aesthetic', 'dalle', 'stable diffusion', 'eden',
      'bcad', 'painting', 'photo', 'media', 'midjourney', 'sdxl', 'lora', 'finetuning',
      'visual', 'style', 'styles', 'authorship', 'copyright', 'dataset', 'creative labor',
    ],
  },
  {
    id: 'markets-and-protocols',
    name: 'Markets & Protocols',
    shortName: 'MARKETS',
    description: 'Crypto, commitments, startups, money, and the incentive machines people build around one another.',
    color: '#ffe66d',
    sigil: '◎',
    installation: 'commitment-chandelier',
    featuredTweetId: '1591066751214948354',
    seeds: [
      'PepperStake is a social accountability protocol where people stake crypto to complete goals together.',
      'Juicebox, Ethereum, web3, NFTs, DAOs, payments, tokens and experiments in programmable coordination.',
      'Startups, SaaS, pricing, markets, jobs, compensation, fundraising and the incentives beneath technology.',
      'Creator economies, ownership, platform economics and the tension between building cool things and selling them.',
    ],
    keywords: [
      'crypto', 'web3', 'ethereum', 'bitcoin', 'blockchain', 'dao', 'daos', 'token', 'tokens',
      'nft', 'nfts', 'protocol', 'protocols', 'payment', 'payments', 'money', 'market', 'markets',
      'finance', 'financial', 'startup', 'startups', 'company', 'companies', 'business', 'funding',
      'fundraise', 'governance', 'incentive', 'incentives', 'coordination', 'pepperstake', 'stake',
      'juicebox', 'salary', 'compensation', 'economy', 'economic', 'economics', 'saas', 'vc',
      'revenue', 'mrr', 'pricing', 'price', 'ownership', 'creator economy',
    ],
  },
  {
    id: 'attention-weather',
    name: 'Attention Weather',
    shortName: 'WEATHER',
    description: 'Feeds, engagement, paywalls, ads, slop, and the invisible systems that decide what the internet notices.',
    color: '#ffac61',
    sigil: '☴',
    installation: 'attention-carillon',
    featuredTweetId: '1722696965455036726',
    seeds: [
      'Twitter algorithms, engagement farming, rage bait and the strange social weather of the timeline.',
      'Paywalls, marketing email, sponsored content, SEO spam, notification overload and platforms hostile to their users.',
      'AI slop, hype cycles, grifters, waitlists, influencer behavior and the economics of capturing attention.',
      'The personal web versus feeds: filter the ocean, avoid scrolling, and make the internet look like Craigslist again.',
    ],
    keywords: [
      'twitter', 'tweet', 'tweets', 'timeline', 'feed', 'algorithm', 'algorithms', 'engagement',
      'engagement farming', 'ragebait', 'rage bait', 'bait', 'viral', 'influencer', 'influencers',
      'marketing', 'advertising', 'advertisement', 'ads', 'paywall', 'notification', 'notifications',
      'seo', 'spam', 'slop', 'hype', 'grift', 'grifter', 'grifting', 'waitlist',
      'social media', 'platform', 'platforms', 'followers', 'posting', 'newsletter', 'subscribe',
    ],
  },
  {
    id: 'ordinary-magic',
    name: 'Ordinary Magic',
    shortName: 'LIFE',
    description: 'Food, bodies, music, travel, jokes, friends, and the small human moments between larger projects.',
    color: '#ff9fb5',
    sigil: '◌',
    installation: 'human-mirror',
    featuredTweetId: '1686398451813163008',
    seeds: [
      'Pickled red onions, cooking, gym time, sleep, food, health and the absurd logistics of having a body.',
      'Travel, music, clothes, home, family, friends, jokes and tiny observations from ordinary daily life.',
      'Short conversations, reactions, affection, annoyance and the human texture that does not need to become a thesis.',
      'Bombay Beach finds, handmade keychains, retro objects, shirts, junk shops and internet jokes made physical.',
    ],
    keywords: [
      'love', 'life', 'human', 'humans', 'food', 'eat', 'eating', 'cook', 'cooking', 'kitchen',
      'sleep', 'home', 'friend', 'friends', 'family', 'birthday', 'body', 'health', 'gym', 'travel',
      'music', 'album', 'shirt', 'clothes', 'restaurant',
      'pickled', 'onion', 'meal', 'dog', 'cat', 'flight', 'hotel', 'car', 'rock climbing',
      'bombay', 'bombay beach', 'salton', 'desert', 'yami', 'yami-ichi', 'keychain', 'keychains',
      'hardware', 'retro', 'vintage', 'junk shop', 'physical', 'psychedelic', 'zine', 'printer',
    ],
  },
];

const ORDINARY_MAGIC_INDEX = CLUSTERS.findIndex((cluster) => cluster.id === 'ordinary-magic');
const EDITORIAL_OVERRIDES = new Map(
  CLUSTERS.map((cluster, clusterIndex) => [cluster.featuredTweetId, clusterIndex])
);

function decodeEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function semanticText(value: string): string {
  return decodeEntities(value)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:www\.)?t\.co\/\S+/gi, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulWordCount(value: string): number {
  return semanticText(value)
    .split(' ')
    .filter((word) => word.length > 2).length;
}

function isMediaUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function normalizedAverage(vectors: number[][]): number[] {
  const average = Array.from({ length: vectors[0]?.length ?? 0 }, () => 0);
  for (const vector of vectors) {
    vector.forEach((value, index) => {
      average[index] += value;
    });
  }
  const magnitude = Math.sqrt(average.reduce((sum, value) => sum + value * value, 0)) || 1;
  return average.map((value) => value / magnitude);
}

function contextualText(tweet: SourceTweet, sourceById: ReadonlyMap<string, SourceTweet>): string {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: SourceTweet | undefined = tweet;
  let depth = 0;
  while (current && depth < 5 && !seen.has(current.id)) {
    seen.add(current.id);
    const text = semanticText(current.text);
    if (text) chain.unshift(text);
    current = current.in_reply_to_status_id
      ? sourceById.get(current.in_reply_to_status_id)
      : undefined;
    depth += 1;
  }
  const mediaContext = tweet.media_alt_text
    .map((item) => semanticText(item))
    .filter((item) => item && item.toLowerCase() !== 'image')
    .join(' ');
  return [...chain, mediaContext].filter(Boolean).join(' ');
}

function contextualCueText(tweet: SourceTweet, sourceById: ReadonlyMap<string, SourceTweet>): string {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: SourceTweet | undefined = tweet;
  let depth = 0;
  while (current && depth < 5 && !seen.has(current.id)) {
    seen.add(current.id);
    const text = decodeEntities(current.text)
      .replace(/https?:\/\/\s*\S+/gi, ' ')
      .replace(/[@#]/g, ' ')
      .replaceAll('_', ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (text) chain.unshift(text);
    current = current.in_reply_to_status_id
      ? sourceById.get(current.in_reply_to_status_id)
      : undefined;
    depth += 1;
  }
  return [...chain, ...tweet.media_alt_text]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function editorialCueScore(text: string, cluster: ClusterDefinition): number {
  return cluster.keywords.reduce((total, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(
      `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
      'gu'
    ));
    return total + (matches?.length ?? 0) * (keyword.includes(' ') ? 2.4 : 1);
  }, 0);
}

async function embeddingAssignments(
  tweets: SourceTweet[],
  sourceById: ReadonlyMap<string, SourceTweet>
): Promise<{ assignments: number[]; scores: number[] }> {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = (await pipeline('feature-extraction', EMBEDDING_MODEL, {
    dtype: 'q4',
  })) as unknown as {
    (input: string[], options: { pooling: 'mean'; normalize: true }): Promise<{
      tolist(): number[][];
    }>;
    dispose?: () => Promise<void>;
  };

  const seedTexts = CLUSTERS.flatMap((cluster) => cluster.seeds);
  const seedOutput = await extractor(seedTexts, { pooling: 'mean', normalize: true });
  const seedVectors = seedOutput.tolist();
  let seedOffset = 0;
  const centroids = CLUSTERS.map((cluster) => {
    const vectors = seedVectors.slice(seedOffset, seedOffset + cluster.seeds.length);
    seedOffset += cluster.seeds.length;
    return normalizedAverage(vectors);
  });

  const texts = tweets.map((tweet) => contextualText(tweet, sourceById) || 'social reaction');
  const cueScores = tweets.map((tweet) => {
    const text = contextualCueText(tweet, sourceById);
    return CLUSTERS.map((cluster) => editorialCueScore(text, cluster));
  });
  const assignments: number[] = [];
  const scores: number[] = [];
  const batchSize = 96;
  for (let start = 0; start < texts.length; start += batchSize) {
    const output = await extractor(texts.slice(start, start + batchSize), {
      pooling: 'mean',
      normalize: true,
    });
    for (const vector of output.tolist()) {
      const tweetIndex = assignments.length;
      const strongestCue = Math.max(...cueScores[tweetIndex]);
      if (meaningfulWordCount(texts[tweetIndex]) <= 2 && strongestCue === 0) {
        assignments.push(ORDINARY_MAGIC_INDEX);
        scores.push(1);
        continue;
      }
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      centroids.forEach((centroid, clusterIndex) => {
        const cueBoost = Math.min(0.28, cueScores[tweetIndex][clusterIndex] * 0.055);
        const score = cosineSimilarity(vector, centroid) + cueBoost;
        if (score > bestScore) {
          bestIndex = clusterIndex;
          bestScore = score;
        }
      });
      assignments.push(bestIndex);
      scores.push(bestScore);
    }
  }
  await extractor.dispose?.();
  return { assignments, scores };
}

function keywordAssignments(
  tweets: SourceTweet[],
  sourceById: ReadonlyMap<string, SourceTweet>
): { assignments: number[]; scores: number[] } {
  const assignments: number[] = [];
  const scores: number[] = [];
  for (const tweet of tweets) {
    const semantic = contextualText(tweet, sourceById).toLowerCase();
    const text = contextualCueText(tweet, sourceById);
    const clusterScores = CLUSTERS.map((cluster) => editorialCueScore(text, cluster));
    if (meaningfulWordCount(semantic) <= 2 && Math.max(...clusterScores) === 0) {
      assignments.push(ORDINARY_MAGIC_INDEX);
      scores.push(1);
      continue;
    }
    let bestIndex = ORDINARY_MAGIC_INDEX;
    let bestScore = 0;
    CLUSTERS.forEach((cluster, clusterIndex) => {
      const score = clusterScores[clusterIndex];
      if (score > bestScore) {
        bestIndex = clusterIndex;
        bestScore = score;
      }
    });
    assignments.push(bestIndex);
    scores.push(bestScore);
  }
  return { assignments, scores };
}

export async function buildTempleArchive(
  source: SourceArchive,
  classifier: 'embedding' | 'keywords' = 'embedding',
  mediaOverrides: TweetMediaOverrides = {}
): Promise<TempleArchiveDataset> {
  const sourceById = new Map<string, SourceTweet>();
  for (const tweet of source.tweets) {
    if (tweet.author_handle.toLowerCase() !== EXPECTED_AUTHOR) continue;
    if (!tweet.id || !tweet.posted_at) continue;
    const media = [
      ...tweet.media_alt_text.filter((value) => value.trim().toLowerCase() !== 'image'),
      ...(mediaOverrides[tweet.id] ?? []),
    ];
    sourceById.set(tweet.id, {
      ...tweet,
      media_alt_text: [...new Set(media)],
    });
  }
  const tweets = [...sourceById.values()].sort((a, b) =>
    a.posted_at.localeCompare(b.posted_at) || a.id.localeCompare(b.id)
  );
  const { assignments, scores } = classifier === 'embedding'
    ? await embeddingAssignments(tweets, sourceById)
    : keywordAssignments(tweets, sourceById);

  tweets.forEach((tweet, index) => {
    const override = EDITORIAL_OVERRIDES.get(tweet.id);
    if (override === undefined) return;
    assignments[index] = override;
    scores[index] = 2;
  });

  const memories: TempleTweetMemory[] = tweets.map((tweet, index) => {
    const isReply = tweet.type === 'reply'
      || tweet.type === 'post_or_reply_view_entry'
      || Boolean(tweet.in_reply_to_status_id);
    return {
      id: `tweet-${tweet.id}`,
      kind: 'tweet',
      tweetType: isReply ? 'reply' : 'post',
      clusterId: CLUSTERS[assignments[index]].id,
      text: decodeEntities(tweet.text).trim(),
      sourceUrl: `https://x.com/${EXPECTED_AUTHOR}/status/${tweet.id}`,
      publishedAt: tweet.posted_at,
      ...(tweet.in_reply_to_status_id
        ? { inReplyToStatusId: tweet.in_reply_to_status_id }
        : {}),
      attachmentUrls: tweet.media_alt_text
        .map(decodeEntities)
        .filter(isMediaUrl),
      attachmentAltText: tweet.media_alt_text
        .map(decodeEntities)
        .filter((value) => !isMediaUrl(value) && value.trim().toLowerCase() !== 'image'),
      visualSeed: hashString(tweet.id),
    };
  });

  const clusters: TempleCluster[] = CLUSTERS.map((definition, clusterIndex) => {
    const memberIndexes = assignments
      .map((assignment, index) => assignment === clusterIndex ? index : -1)
      .filter((index) => index >= 0);
    const curatedFeaturedIndex = tweets.findIndex((tweet) => tweet.id === definition.featuredTweetId);
    const featuredIndex = memberIndexes.includes(curatedFeaturedIndex)
      ? curatedFeaturedIndex
      : memberIndexes.reduce((best, index) =>
        best < 0 || scores[index] > scores[best] ? index : best, -1
      );
    return {
      id: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      description: definition.description,
      color: definition.color,
      sigil: definition.sigil,
      installation: definition.installation,
      featuredMemoryId: memories[featuredIndex]?.id ?? memories[0].id,
      memoryIds: memberIndexes.map((index) => memories[index].id),
    };
  });

  const postCount = memories.filter((memory) => memory.tweetType === 'post').length;
  const replyCount = memories.length - postCount;
  return {
    generatedAt: source.captured_at,
    profile: {
      name: 'jmill',
      handle: EXPECTED_AUTHOR,
      bio: 'tech bro in the streets, utopian mystic in the sheets',
      avatarUrl: 'https://pbs.twimg.com/profile_images/1592515392601264129/PdePKRBD_400x400.jpg',
    },
    stats: {
      tweetCount: memories.length,
      postCount,
      replyCount,
      note: `Complete captured archive: ${postCount} posts and ${replyCount} replies. The source notes that older reply history may be incomplete.`,
    },
    clustering: {
      classifier: classifier === 'embedding'
        ? 'editorial-taxonomy-semantic-filing'
        : 'editorial-taxonomy-keyword-filing',
      ...(classifier === 'embedding' ? { model: EMBEDDING_MODEL } : {}),
      seedVersion: SEED_VERSION,
      methodology: 'The room taxonomy was derived by an editorial reading of the full archive. Semantic similarity files each tweet against those authored themes; it does not discover or name clusters with k-means.',
    },
    clusters,
    memories,
  };
}

type CliOptions = {
  input: string;
  output: string;
  media: string;
  classifier: 'embedding' | 'keywords';
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: 'data/bd/2026/x-jmill-all-tweets.json',
    output: 'data/bd/2026/temple-archive.json',
    media: 'data/bd/2026/tweet-media.json',
    classifier: 'embedding',
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input' && argv[index + 1]) options.input = argv[++index];
    else if (argv[index] === '--output' && argv[index + 1]) options.output = argv[++index];
    else if (argv[index] === '--media' && argv[index + 1]) options.media = argv[++index];
    else if (argv[index] === '--classifier' && argv[index + 1]) {
      const value = argv[++index];
      if (value !== 'embedding' && value !== 'keywords') {
        throw new Error(`Unknown classifier: ${value}`);
      }
      options.classifier = value;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await readFile(path.resolve(options.input), 'utf8')) as SourceArchive;
  const mediaOverrides = await readFile(path.resolve(options.media), 'utf8')
    .then((value) => JSON.parse(value) as TweetMediaOverrides)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return {};
      throw error;
    });
  const archive = await buildTempleArchive(source, options.classifier, mediaOverrides);
  const destination = path.resolve(options.output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
  const counts = archive.clusters.map((cluster) => `${cluster.shortName}:${cluster.memoryIds.length}`).join(' · ');
  console.log(`Saved ${archive.memories.length} temple tweets to ${destination}`);
  console.log(counts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
