import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGeofence, OSU_VENUES, validBounds } from '../src/pilot.ts';
import { assessItem, DIETARY_RESTRICTIONS } from '../src/dayOne.ts';
import catalog from '../data/pilot-catalog.json' with { type: 'json' };
import { missingOfficialMenuSources, officialAllergenUrl, officialMenuUrl } from '../src/menuSources.ts';
import { BUILDING_POINTS, buildingForVenue } from '../src/locations.ts';
import { campusCoordinate, parseWalkingRoute } from '../src/walking.ts';

test('directory concepts have distinct IDs for per-venue fences', () => {
  assert.equal(OSU_VENUES.length, 27);
  assert.equal(new Set(OSU_VENUES.map((venue) => venue.id)).size, OSU_VENUES.length);
});

test('all concepts have official source links and fictional food records are absent', () => {
  assert.deepEqual(missingOfficialMenuSources(), []);
  assert.equal(catalog.items.length, 0);
  assert.equal(DIETARY_RESTRICTIONS.length, 10);
  for (const venue of OSU_VENUES) {
    assert.match(officialMenuUrl(venue.id), /^https:\/\/dining\.okstate\.edu\//);
    assert.match(officialAllergenUrl(venue.id), /^https:\/\//);
  }
});

test('accuracy circle must be fully inside a valid rectangle', () => {
  const box = { south: 36.12, north: 36.122, west: -97.08, east: -97.078 };
  assert.equal(validBounds(box), true);
  assert.equal(evaluateGeofence(box, 36.121, -97.079, 10), 'inside');
  assert.equal(evaluateGeofence(box, 36.121, -97.079, 100), 'uncertain');
  assert.equal(evaluateGeofence(box, 36.13, -97.079, 10), 'outside');
  assert.equal(evaluateGeofence(box, 36.122, -97.079, 10), 'uncertain');
});

test('invalid and absent areas never claim an inside visit', () => {
  assert.equal(evaluateGeofence(null, 36.12, -97.08, 5), 'unconfigured');
  assert.equal(evaluateGeofence({ south: 36.122, north: 36.12, west: -97.08, east: -97.078 }, 36.12, -97.08, 5), 'unconfigured');
  assert.equal(evaluateGeofence({ south: 36.12, north: 36.122, west: -97.08, east: -97.078 }, 36.121, -97.079, 500), 'uncertain');
});

test('an expired reviewed menu is never treated as current, even with no filter', () => {
  const item = { isDemo: false, reviewedAt: '2026-09-01T00:00:00Z', expiresAt: '2026-09-02T00:00:00Z', ingredients: ['wheat'], allergens: ['wheat'], vegetarian: true };
  assert.equal(assessItem(item, [], new Date('2026-09-17T00:00:00Z')).state, 'verify');
  assert.equal(assessItem(item, ['wheat'], new Date('2026-09-17T00:00:00Z')).state, 'verify');
});

test('fictional and malformed-dated items cannot pass a dietary assessment', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const item = { isDemo: false, reviewedAt: '2026-09-17T00:00:00Z', expiresAt: '2026-09-18T00:00:00Z', ingredients: ['rice'], allergens: [], vegetarian: true };
  assert.equal(assessItem(item, ['milk'], now).state, 'no-listed-conflict');
  for (const invalid of [{ isDemo: true }, { reviewedAt: 'invalid' }, { expiresAt: 'invalid' }, { reviewedAt: null }, { expiresAt: null }, { reviewedAt: '2026-09-19T00:00:00Z' }]) {
    assert.equal(assessItem({ ...item, ...invalid }, ['milk'], now).state, 'verify');
    assert.equal(assessItem({ ...item, ...invalid }, [], now).state, 'verify');
  }
});

test('all 27 concepts resolve to one of eight sourced host buildings', () => {
  assert.equal(BUILDING_POINTS.length, 8);
  for (const venue of OSU_VENUES) {
    const point = buildingForVenue(venue.id);
    assert.ok(point, venue.id);
    assert.ok(point.osmWayId > 0);
    assert.ok(campusCoordinate(point.lat, point.lon));
  }
  assert.notEqual(buildingForVenue('cafe-libro').id, buildingForVenue('barkin-brews').id);
});

test('walking distance accepts only plausible campus coordinates and pedestrian route summaries', () => {
  assert.equal(campusCoordinate(36.123, -97.071), true);
  assert.equal(campusCoordinate(35.5, -97.071), false);
  assert.deepEqual(parseWalkingRoute({ trip: { summary: { length: 0.494, time: 349.705 } } }), { meters: 494, minutes: 6, provider: 'Valhalla pedestrian demo' });
  assert.throws(() => parseWalkingRoute({ trip: { summary: { length: -1, time: 0 } } }), /invalid route/);
});
