import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLUSTER_LOCATIONS,
  OBSERVATORY_PLANETS,
} from '../lib/birthday/observatory';

test('uses a unique astronomical symbol for every observatory planet', () => {
  assert.equal(OBSERVATORY_PLANETS.length, 9);
  assert.equal(
    new Set(OBSERVATORY_PLANETS.map((planet) => planet.symbol)).size,
    OBSERVATORY_PLANETS.length
  );
});

test('maps every archive to a planet or one of its visible moons', () => {
  for (const [clusterId, location] of Object.entries(CLUSTER_LOCATIONS)) {
    const planet = OBSERVATORY_PLANETS.find((candidate) => candidate.id === location.planetId);
    assert.ok(planet, `${clusterId} points to an unknown planet`);
    if (location.moonName) {
      assert.ok(
        planet.moons.includes(location.moonName),
        `${clusterId} points to a moon missing from the planet menu`
      );
    }
  }
});
