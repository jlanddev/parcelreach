// Unit tests for the clean-params -> v2 body translator.
// Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFilterRequest, rejectedMlsKeys, canonicalParams, zipToFilter,
  LAND_PROPERTY_TYPE, ONMARKET_PLAUSIBILITY_CEILING,
} from '../lib/landportal-filters.mjs';

const byKey = (filters, key) => filters.find((f) => f.key === key);

test('requires a location scope', () => {
  assert.throws(() => buildFilterRequest({ acres_min: 5 }), /location scope is required/i);
});

test('fips is top-level (array), not in filters', () => {
  const { body } = buildFilterRequest({ fips: ['47153'] });
  assert.deepEqual(body.fips, ['47153']);
  assert.ok(!byKey(body.filters, 'fips'), 'fips must not appear inside filters[]');
});

test('polygon/bbox become top-level geometry', () => {
  const poly = buildFilterRequest({ polygon: '-88 36,-89 36,-89 35,-88 36' });
  assert.equal(poly.body.geometry.polygon, '-88 36,-89 36,-89 35,-88 36');
  const bb = buildFilterRequest({ bbox: '-88 36,-87 35' });
  assert.equal(bb.body.geometry.bbox, '-88 36,-87 35');
});

test('acres becomes an is_between range with include_nulls:false', () => {
  const { body } = buildFilterRequest({ fips: ['47153'], acres_min: 30, acres_max: 60 });
  const f = byKey(body.filters, 'lotsizeacres');
  assert.deepEqual(f, { key: 'lotsizeacres', operator: 'range', comparison: 'is_between', include_nulls: false, value: { min: 30, max: 60 } });
});

test('frontage_min is a min-only range (no max key)', () => {
  const { body } = buildFilterRequest({ fips: ['47153'], frontage_min: 800 });
  const f = byKey(body.filters, 'road_frontage');
  assert.deepEqual(f.value, { min: 800 });
  assert.ok(!('max' in f.value));
});

test('status for_sale emits mls_for_sale active + default 30d window + Land type', () => {
  const { body, submittedMlsKeys, isMarketQuery } = buildFilterRequest({ fips: ['53039'], status: 'for_sale' });
  const m = byKey(body.filters, 'mls_for_sale');
  assert.deepEqual(m, { key: 'mls_for_sale', operator: 'mls_condition', value: 'active', days: 30 });
  const t = byKey(body.filters, 'mls_propertytype');
  assert.deepEqual(t.value, [LAND_PROPERTY_TYPE]);
  assert.ok(submittedMlsKeys.includes('mls_for_sale') && submittedMlsKeys.includes('mls_propertytype'));
  assert.equal(isMarketQuery, true);
});

test('listed_within_days overrides the for_sale window', () => {
  const { body } = buildFilterRequest({ fips: ['53039'], status: 'for_sale', listed_within_days: 90 });
  assert.equal(byKey(body.filters, 'mls_for_sale').days, 90);
});

test('status sold uses sold_within_days default 365', () => {
  const { body } = buildFilterRequest({ fips: ['53039'], status: 'sold' });
  assert.equal(byKey(body.filters, 'mls_sold').days, 365);
});

test('off_market excludes active listings', () => {
  const { body, isMarketQuery } = buildFilterRequest({ fips: ['53039'], status: 'off_market' });
  assert.equal(byKey(body.filters, 'active_listing_toggle').value, 'exclude');
  assert.equal(isMarketQuery, false, 'off_market is not a market (listing) query for plausibility purposes');
});

test('acquisition pull: vacant + frontage + out_of_state + land_locked:false + exclusions', () => {
  const { body } = buildFilterRequest({
    fips: ['47153'], vacant: true, frontage_min: 800, owner_out_of_state: true,
    land_locked: false, exclude_wetlands: true, exclude_flood: true, exclude_active_listings: true,
  });
  assert.equal(byKey(body.filters, 'vacant').value, true);
  assert.equal(byKey(body.filters, 'out_of_state').value, true);
  assert.equal(byKey(body.filters, 'land_locked').value, false);
  assert.equal(byKey(body.filters, 'wetlands_cover_percentage').value.max, 0);
  assert.equal(byKey(body.filters, 'wetlands_cover_percentage').include_nulls, true);
  assert.equal(byKey(body.filters, 'fema_cover_percentage').value.max, 0);
  assert.equal(byKey(body.filters, 'active_listing_toggle').value, 'exclude');
});

test('price / ppa ranges are MLS keys and tracked for rejection', () => {
  const { submittedMlsKeys } = buildFilterRequest({ fips: ['53039'], price_min: 10000, ppa_max: 5000 });
  assert.ok(submittedMlsKeys.includes('mls_price'));
  assert.ok(submittedMlsKeys.includes('mls_priceperacre'));
});

test('last sale window emits a date filter', () => {
  const { body } = buildFilterRequest({ fips: ['47153'], last_sale_from: '2020-01-01', last_sale_to: '2024-12-31' });
  const f = byKey(body.filters, 'currentsalerecordingdate');
  assert.equal(f.operator, 'date');
  assert.deepEqual(f.value, { min: '2020-01-01', max: '2024-12-31' });
});

test('rejectedMlsKeys detects a rejected submitted key (fatal case)', () => {
  const meta = { rejected_filters: [{ key: 'mls_for_sale', reason: 'no access' }] };
  assert.deepEqual(rejectedMlsKeys(meta, ['mls_for_sale', 'mls_propertytype']), ['mls_for_sale']);
  assert.deepEqual(rejectedMlsKeys({ rejected_filters: [] }, ['mls_for_sale']), []);
  assert.deepEqual(rejectedMlsKeys(null, ['mls_for_sale']), []);
});

test('canonicalParams is stable regardless of key order / array order', () => {
  const a = canonicalParams({ fips: ['b', 'a'], status: 'for_sale', acres_min: 30 });
  const b = canonicalParams({ acres_min: 30, status: 'for_sale', fips: ['a', 'b'] });
  assert.equal(a, b);
});

test('canonicalParams drops empty values', () => {
  const c = canonicalParams({ fips: ['47153'], zip: '', price_min: null, status: undefined });
  assert.equal(c, JSON.stringify({ fips: ['47153'] }));
});

test('zipToFilter shapes a situszip5 condition', () => {
  assert.deepEqual(zipToFilter('86024'), { key: 'situszip5', operator: 'condition', comparison: 'is', value: '86024' });
});

test('single zip rides in filters as situszip5', () => {
  const { body } = buildFilterRequest({ fips: ['04005'], zip: '86024' });
  assert.equal(byKey(body.filters, 'situszip5').value, '86024');
});

test('plausibility ceiling constant is exported and sane', () => {
  assert.equal(typeof ONMARKET_PLAUSIBILITY_CEILING, 'number');
  assert.ok(ONMARKET_PLAUSIBILITY_CEILING >= 1000);
});
