import assert from 'node:assert/strict';
import { emptyNotebook, validateNotebook, stats, remaining, deleteCount, type Count } from '../lib/model';
import { applyPassage, type PassageDraft } from '../lib/passage';
import { exportSheets } from '../lib/export';

const data = emptyNotebook();
data.projects.push({ id: 'p', name: 'Project', cellType: '', source: '', notes: '', createdAt: '2026-09-01T10:00:00.000Z' });
data.cultures.push({ id: 'a', projectId: 'p', name: 'A', passage: 'P3', container: { type: 'T75 Flask', volume: 4, wells: [] } });
const source: Count = {
  id: 'c', projectId: 'p', cultureId: 'a', at: '2026-09-18T10:00:00.000Z', timezone: 'UTC', passage: 'P3',
  container: { type: 'T75 Flask', volume: 4, wells: [] }, basis: 'liveDead', notes: 'original', treatments: [],
  readings: [1, 2].map(reading => ({ slide: 1, reading, total: { m: 2, e: 6 }, live: { m: 1.8, e: 6 }, dead: { m: 0.2, e: 6 } })),
};
data.counts.push(source);
const draft: PassageDraft = {
  at: '2026-09-18T11:00:00.000Z', passage: 'P4', type: 'T25 Flask', notes: 'split',
  stockReadings: structuredClone(source.readings), stockBasis: source.basis,
  targets: [{ name: 'B', stock: 1, medium: 3 }, { name: 'C', stock: 3, medium: 3 }],
};
const before = JSON.stringify(data);
const next = applyPassage(data, source.id, draft);
assert.equal(JSON.stringify(data), before, 'input notebook must not be mutated');
assert.equal(next.cultures.length, 3);
assert.equal(next.counts.length, 3);
assert.deepEqual(next.counts[0].readings, source.readings);
assert.equal(next.counts[0].notes, 'original');
assert.equal(remaining(next.counts[0]), 0);
assert.equal(next.cultures[0].endedAt, draft.at);
assert.equal(stats(next.counts[1].readings).live, 450000);
assert.equal(stats(next.counts[2].readings).live, 900000);
assert.equal(next.counts[1].origin?.sourceCountId, source.id);
assert.equal(next.counts[0].treatments[0].passage?.targets.length, 2);
assert.ok(next.counts.every(c => c.projectId === 'p'));
assert.equal(next.counts[1].passage, 'P4');
validateNotebook(JSON.parse(JSON.stringify(next)));
const partial = applyPassage(data, source.id, { ...draft, targets: [draft.targets[0]] });
assert.equal(remaining(partial.counts[0]), 3);
assert.equal(partial.cultures[0].endedAt, undefined);
assert.throws(() => applyPassage(data, source.id, { ...draft, targets: [{ name: 'A', stock: 1, medium: 2 }] }), /重名/);
assert.throws(() => applyPassage(data, source.id, { ...draft, targets: [{ name: 'B', stock: 5, medium: 2 }] }), /超过/);
assert.throws(() => applyPassage(data, source.id, { ...draft, targets: [{ name: 'B', stock: 0, medium: 2 }] }), /大于 0/);
assert.throws(() => applyPassage(data, source.id, { ...draft, at: '2026-09-18T09:00:00.000Z' }), /时间/);
const newer = structuredClone(data);
newer.counts.push({ ...structuredClone(source), id: 'new', at: '2026-09-18T12:00:00.000Z' });
assert.throws(() => applyPassage(newer, source.id, draft), /最新/);
const handled = structuredClone(data);
handled.counts[0].treatments.push({ id: 'used', at: draft.at, kind: '移除培养液', remove: 2, add: 0, notes: '' });
assert.throws(() => applyPassage(handled, source.id, draft), /超过/);
const high = structuredClone(draft);
high.stockReadings.forEach(r => { r.total = { m: 2, e: 12 }; r.live = { m: 1.8, e: 12 }; r.dead = { m: 0.2, e: 12 }; });
validateNotebook(applyPassage(data, source.id, high));
const deleted = structuredClone(next);
deleteCount(deleted, source.id);
validateNotebook(deleted);
assert.equal(deleted.counts.length, 2, 'deleting source must not delete child records');
const sheets = exportSheets(next, next.counts);
assert.equal(sheets['Raw Measurements'][2].RecordType, 'Passage starting estimate (not measured)');
console.log('PASS: passage dilution, original history, volume conservation, archival, stale records, atomic validation, high concentrations, backup round-trip, exports and deletion.');
