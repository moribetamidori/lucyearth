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

test('maps the repository projects to Jupiter, Saturn, and the Galilean moons', () => {
  assert.deepEqual(CLUSTER_LOCATIONS.lucyearth, { planetId: 'earth' });
  assert.deepEqual(CLUSTER_LOCATIONS['autonomous-signals'], { planetId: 'jupiter' });
  assert.deepEqual(CLUSTER_LOCATIONS['personal-site'], { planetId: 'saturn' });
  assert.deepEqual(CLUSTER_LOCATIONS.eden, {
    planetId: 'saturn',
    moonName: 'TITAN',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['deliciously-broken-code'], {
    planetId: 'jupiter',
    moonName: 'IO',
  });
  assert.deepEqual(CLUSTER_LOCATIONS.introverse, {
    planetId: 'jupiter',
    moonName: 'EUROPA',
  });
  assert.deepEqual(CLUSTER_LOCATIONS.overemployed, {
    planetId: 'jupiter',
    moonName: 'GANYMEDE',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['desert-internet'], {
    planetId: 'jupiter',
    moonName: 'CALLISTO',
  });
});

test('maps every Pluto moon to its Bombay Beach site', () => {
  assert.deepEqual(CLUSTER_LOCATIONS['pluto-garage'], {
    planetId: 'pluto',
    moonName: 'CHARON',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['pluto-future-garden'], {
    planetId: 'pluto',
    moonName: 'STYX',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['pluto-yellow-tree'], {
    planetId: 'pluto',
    moonName: 'NIX',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['pluto-globetrot'], {
    planetId: 'pluto',
    moonName: 'KERBEROS',
  });
  assert.deepEqual(CLUSTER_LOCATIONS['pluto-big-tree'], {
    planetId: 'pluto',
    moonName: 'HYDRA',
  });
});

test('maps Florida as Earth\'s resting-place moon', () => {
  const earth = OBSERVATORY_PLANETS.find((planet) => planet.id === 'earth');
  assert.deepEqual(earth?.moons, ['MOON']);
  assert.deepEqual(CLUSTER_LOCATIONS['florida-rest'], {
    planetId: 'earth',
    moonName: 'MOON',
    archiveName: 'FLORIDA',
  });
});
