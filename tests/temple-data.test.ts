import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import archive from '../data/bd/2026/temple-archive.json';
import temple from '../data/bd/2026/temple-layout.json';

test('temple layout has nine distinct, navigable landmarks', () => {
  assert.equal(temple.zones.length, 9);
  assert.equal(new Set(temple.zones.map((zone) => zone.id)).size, 9);

  for (const zone of temple.zones) {
    assert.equal(zone.position.length, 3);
    assert.equal(zone.spawn.length, 3);
    assert.ok(zone.radius > 0);
    assert.ok(zone.revealPhase >= 0 && zone.revealPhase < 1);
  }
});

test('each populated temple room maps to a valid memory cluster', () => {
  const clusterIds = new Set(archive.clusters.map((cluster) => cluster.id));
  const populated = temple.zones.filter((zone) => zone.clusterId !== null);
  const dormant = temple.zones.filter((zone) => zone.clusterId === null);

  assert.equal(populated.length, 8);
  assert.equal(dormant.length, 1);
  assert.equal(dormant[0].id, 'central-ubosot');
  for (const zone of populated) assert.ok(clusterIds.has(zone.clusterId as string));
  assert.equal(new Set(populated.map((zone) => zone.clusterId)).size, 8);
});

test('the sanctum word assigns one letter to every landmark', () => {
  assert.equal(temple.sanctumWord, 'MISCHIEFS');
  assert.equal(temple.sanctumWord.length, temple.zones.length);
  assert.ok(temple.zones.some((zone) => zone.id === 'central-ubosot'));
});

test('the temple archive preserves every captured tweet exactly once', () => {
  const source = JSON.parse(
    readFileSync(new URL('../data/bd/2026/x-jmill-all-tweets.json', import.meta.url), 'utf8')
  ) as { tweets: Array<{ id: string }> };
  const sourceIds = new Set(source.tweets.map((tweet) => `tweet-${tweet.id}`));
  const archiveIds = new Set(archive.memories.map((memory) => memory.id));

  assert.equal(source.tweets.length, 1331);
  assert.equal(archive.memories.length, 1331);
  assert.equal(archiveIds.size, 1331);
  assert.deepEqual(archiveIds, sourceIds);
  assert.equal(archive.stats.postCount, 676);
  assert.equal(archive.stats.replyCount, 655);
});

test('every temple artifact has one cluster, one stable visual seed, and one index entry', () => {
  const clusterIds = new Set(archive.clusters.map((cluster) => cluster.id));
  const listedIds = archive.clusters.flatMap((cluster) => cluster.memoryIds);
  const visualSeeds = new Set<number>();

  assert.equal(archive.clusters.length, 8);
  assert.equal(new Set(archive.clusters.map((cluster) => cluster.installation)).size, 8);
  assert.equal(listedIds.length, archive.memories.length);
  assert.equal(new Set(listedIds).size, archive.memories.length);

  for (const memory of archive.memories) {
    assert.ok(clusterIds.has(memory.clusterId));
    assert.ok(Number.isInteger(memory.visualSeed));
    visualSeeds.add(memory.visualSeed);
    assert.equal(memory.sourceUrl, `https://x.com/jmilldotdev/status/${memory.id.replace('tweet-', '')}`);
  }
  assert.equal(visualSeeds.size, archive.memories.length);
});
