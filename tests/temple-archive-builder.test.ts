import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTempleArchive,
  type SourceArchive,
  type SourceTweet,
} from '../scripts/birthday/build-temple-archive';

function tweet(overrides: Partial<SourceTweet> & Pick<SourceTweet, 'id' | 'text'>): SourceTweet {
  return {
    type: 'post',
    author_handle: 'jmilldotdev',
    posted_at: '2026-08-20T10:00:00.000Z',
    media_alt_text: [],
    url: `https://x.com/i/status/${overrides.id}`,
    in_reply_to_status_id: null,
    ...overrides,
  };
}

function source(tweets: SourceTweet[]): SourceArchive {
  return {
    captured_at: '2026-08-21T12:19:22.696Z',
    tweets,
  };
}

test('the archive builder normalizes reply-like entries and preserves attachment context', async () => {
  const archive = await buildTempleArchive(source([
    tweet({
      id: '100',
      text: '@friend this &gt; that',
      type: 'post_or_reply_view_entry',
      media_alt_text: ['A strange terminal'],
    }),
  ]), 'keywords');

  assert.equal(archive.memories.length, 1);
  assert.equal(archive.memories[0].tweetType, 'reply');
  assert.equal(archive.memories[0].text, '@friend this > that');
  assert.deepEqual(archive.memories[0].attachmentAltText, ['A strange terminal']);
  assert.deepEqual(archive.memories[0].attachmentUrls, []);
  assert.equal(archive.memories[0].sourceUrl, 'https://x.com/jmilldotdev/status/100');
});

test('media overrides turn lost image markers into renderable attachment URLs', async () => {
  const archive = await buildTempleArchive(source([
    tweet({
      id: '300',
      text: 'A visual post',
      media_alt_text: ['Image'],
    }),
  ]), 'keywords', {
    '300': ['https://pbs.twimg.com/media/example.jpg?name=large'],
  });

  assert.deepEqual(archive.memories[0].attachmentUrls, [
    'https://pbs.twimg.com/media/example.jpg?name=large',
  ]);
  assert.deepEqual(archive.memories[0].attachmentAltText, []);
});

test('keyword archive generation is deterministic and keeps related reply chains together', async () => {
  const input = source([
    tweet({ id: '200', text: 'Python developer tools and broken code' }),
    tweet({
      id: '201',
      text: '@friend exactly',
      type: 'reply',
      in_reply_to_status_id: '200',
    }),
  ]);
  const first = await buildTempleArchive(input, 'keywords');
  const second = await buildTempleArchive(input, 'keywords');

  assert.deepEqual(first, second);
  assert.equal(first.memories[0].clusterId, 'code-and-craft');
  assert.equal(first.memories[1].clusterId, first.memories[0].clusterId);
  assert.notEqual(first.memories[0].visualSeed, first.memories[1].visualSeed);
});
