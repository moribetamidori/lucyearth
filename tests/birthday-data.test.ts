import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeTweets,
  parsePublicXHtml,
  type DiscoveredTweet,
} from '../scripts/birthday/build-memory-data';

test('parses only verified authored posts from a public profile snapshot', () => {
  const html = `
    <article data-tweet-id="111" itemprop="hasPart">
      <meta itemprop="url" content="https://x.com/jmilldotdev/status/111" />
      <meta itemprop="alternateName" content="jmilldotdev" />
      <meta itemprop="text" content="hello &amp;amp; goodbye" />
      <meta itemprop="datePublished" content="2026-08-20T10:00:00.000Z" />
      <img src="https://pbs.twimg.com/media/test?format=webp&amp;name=medium" alt="" />
      <article data-tweet-id="222" itemprop="hasPart">
        <meta itemprop="url" content="https://x.com/someone/status/222" />
        <meta itemprop="alternateName" content="someone" />
        <meta itemprop="text" content="quoted text" />
        <img src="https://pbs.twimg.com/media/quoted?format=webp" alt="quoted media" />
      </article>
    </article>
  `;

  const result = parsePublicXHtml(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '111');
  assert.equal(result[0].text, 'hello & goodbye');
  assert.equal(result[0].media.length, 1);
  assert.equal(result[0].media[0].src, 'https://pbs.twimg.com/media/test?format=webp&name=medium');
});

test('parses a canonical public status page from Open Graph metadata', () => {
  const html = `
    <meta property="og:url" content="https://x.com/jmilldotdev/status/333" />
    <meta name="twitter:creator" content="@jmilldotdev" />
    <meta property="og:description" content="a small signal" />
    <meta property="article:published_time" content="2022-12-07T22:52:40.000Z" />
    <meta property="og:image" content="https://pbs.twimg.com/media/signal.jpg" />
  `;

  const result = parsePublicXHtml(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'a small signal');
  assert.equal(result[0].publishedAt, '2022-12-07T22:52:40.000Z');
});

test('deduplicates by tweet id and keeps the richer record', () => {
  const base: DiscoveredTweet = {
    id: '444',
    author: 'jmilldotdev',
    text: '',
    sourceUrl: 'https://x.com/jmilldotdev/status/444',
    media: [],
  };

  const result = dedupeTweets([
    { ...base, media: [{ type: 'image', src: 'https://example.com/image.jpg', alt: 'image' }] },
    { ...base, text: 'the richer record' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'the richer record');
  assert.equal(result[0].media.length, 1);
});
