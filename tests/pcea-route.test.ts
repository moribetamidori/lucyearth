import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePolyline, formatDistance, formatDuration, stopLetter } from '../lib/pcea/route';

test('stop letters go A…Z then AA', () => {
  assert.deepEqual([0, 1, 2, 25, 26, 27].map(stopLetter), ['A', 'B', 'C', 'Z', 'AA', 'AB']);
});

test('decodes Google encoded polylines', () => {
  // Example from Google's polyline algorithm documentation.
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.deepEqual(decodePolyline(''), []);
});

test('formats drive times and distances', () => {
  assert.equal(formatDuration(0, 'en'), '0 min');
  assert.equal(formatDuration(20, 'en'), '1 min');
  assert.equal(formatDuration(25 * 60, 'en'), '25 min');
  assert.equal(formatDuration(3600, 'en'), '1 h');
  assert.equal(formatDuration(3900, 'en'), '1 h 5 min');
  assert.equal(formatDuration(3900, 'zh'), '1小时5分钟');
  assert.equal(formatDuration(600, 'zh'), '10分钟');
  assert.equal(formatDistance(1609.344 * 2.5, 'en-US'), '2.5 mi');
  assert.equal(formatDistance(42_000, 'zh-CN'), '42 km');
});
