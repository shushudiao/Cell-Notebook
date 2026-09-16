import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  emptyNotebook,
  deleteCount,
  deleteProject,
  stats,
  remaining,
  validateNotebook,
  validateReadings,
  volumeOf,
  type Count,
  type Notebook,
} from '../lib/model';
import { csvText, exportExcel, exportPDF, exportSheets } from '../lib/export';
import { googleDriveErrorMessage } from '../lib/drive';
const r = (reading: number, total: number, live: number, dead: number) => ({
  slide: 1,
  reading,
  total: { m: total, e: 6 },
  live: { m: live, e: 6 },
  dead: { m: dead, e: 6 },
});
const readings = [r(1, 1.5, 1.4, 0.1), r(2, 1.7, 1.5, 0.2)];
const s = stats(readings);
assert.equal(s.total, 1600000);
assert.equal(s.live, 1450000);
assert.ok(Math.abs(s.sd! - 141421.356237) < 0.01);
assert.ok(Math.abs(s.viability! - (1.4 / 1.5 + 1.5 / 1.7) * 50) < 1e-10);
assert.equal(stats([r(1, 0, 0, 0), r(2, 0, 0, 0)]).viability, null);
assert.throws(() => validateReadings([readings[0]], 'liveDead'));
assert.throws(() =>
  validateReadings([readings[0], { ...readings[1], slide: 2 }], 'liveDead'),
);
assert.match(
  googleDriveErrorMessage(403, {
    error: {
      message:
        'Google Drive API has not been used in project 955130926814 before or it is disabled.',
      status: 'PERMISSION_DENIED',
    },
  }),
  /尚未.*启用/,
);
assert.match(
  googleDriveErrorMessage(403, {
    error: { errors: [{ reason: 'insufficientPermissions' }] },
  }),
  /drive\.appdata/,
);
assert.throws(() =>
  validateReadings(
    [readings[0], { ...readings[1], total: { m: NaN, e: 6 } }],
    'liveDead',
  ),
);
const d: Notebook = emptyNotebook();
d.projects.push({
  id: 'p-test',
  name: 'Verification project',
  cellType: 'Test',
  source: 'Synthetic test fixture',
  notes: 'Not real cell data',
  createdAt: '2026-09-15T10:00:00.000Z',
});
d.cultures.push({
  id: 'c-test',
  projectId: 'p-test',
  name: 'Plate A',
  passage: 'P3',
  container: {
    type: '6-well plate',
    volume: 0,
    wells: [
      { name: 'A1', volume: 2 },
      { name: 'B3', volume: 3 },
    ],
  },
});
const c: Count = {
  id: 'count-test',
  projectId: 'p-test',
  cultureId: 'c-test',
  at: '2026-09-15T12:00:00.000Z',
  timezone: 'America/Los_Angeles',
  passage: 'P3',
  container: structuredClone(d.cultures[0].container),
  readings,
  basis: 'liveDead',
  notes: 'fixture',
  treatments: [],
};
d.counts.push(c);
assert.equal(volumeOf(c.container), 5);
c.treatments.push({
  id: 't-1',
  at: '2026-09-15T13:00:00.000Z',
  kind: '更换培养液',
  remove: 2.5,
  add: 2.5,
  notes: '50%',
});
assert.equal(remaining(c), 5);
const before = structuredClone(c);
d.experiments.push({
  id: 'e-test',
  projectId: 'p-test',
  cultureId: 'c-test',
  countId: c.id,
  name: 'Test experiment',
  at: '2026-09-15T14:00:00.000Z',
  used: 2,
  notes: 'fixture',
  before,
  after: {
    at: '2026-09-15T15:00:00.000Z',
    volume: 1.5,
    readings: [r(1, 1, 0.8, 0.2), r(2, 1.2, 1, 0.2)],
    basis: 'liveDead',
    notes: 'after',
  },
});
c.treatments.push({
  id: 't-2',
  at: '2026-09-15T14:00:00.000Z',
  kind: '实验取样',
  remove: 2,
  add: 0,
  notes: 'Test experiment',
  experimentId: 'e-test',
});
assert.equal(remaining(c), 3);
validateNotebook(d);
const countDeleted = structuredClone(d);
assert.deepEqual(deleteCount(countDeleted, 'count-test'), { experiments: 1 });
assert.equal(countDeleted.counts.length, 0);
assert.equal(countDeleted.experiments.length, 0);
validateNotebook(countDeleted);
const projectDeleted = structuredClone(d);
assert.deepEqual(deleteProject(projectDeleted, 'p-test'), {
  cultures: 1,
  counts: 1,
  experiments: 1,
});
assert.equal(projectDeleted.projects.length, 0);
assert.equal(projectDeleted.cultures.length, 0);
assert.equal(projectDeleted.counts.length, 0);
assert.equal(projectDeleted.experiments.length, 0);
validateNotebook(projectDeleted);
const invalid = structuredClone(d);
invalid.counts[0].treatments[0].remove = 6;
assert.throws(() => validateNotebook(invalid));
const invalidWell = structuredClone(d);
invalidWell.cultures[0].container.wells[0].name = 'Z99';
assert.throws(() => validateNotebook(invalidWell));
const sheets = exportSheets(d, d.counts, 'p-test');
assert.equal(sheets['Raw Measurements'].length, 2);
assert.equal(sheets.Treatments.length, 2);
assert.equal(sheets.Experiments[0].EstimatedLiveCellsUsed, 2900000);
assert.equal(sheets['Count Sessions'][0].MeanTotal_cells_mL, 1600000);
assert.match(csvText([{ x: '=cmd', y: 'a,"b"\nc' }]), /"'=cmd"/);
let blob: Blob | undefined;
const original = URL.createObjectURL;
URL.createObjectURL = (b) => {
  blob = b as Blob;
  return 'blob:test';
};
URL.revokeObjectURL = () => {};
(globalThis as any).document = {
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} },
};
await exportExcel(d, d.counts, 'test', 'p-test');
assert.ok(blob);
const ExcelJS = await import('exceljs');
const wb = new ExcelJS.default.Workbook();
await wb.xlsx.load(await blob.arrayBuffer());
assert.deepEqual(
  wb.worksheets.map((s) => s.name),
  [
    'Summary',
    'Count Sessions',
    'Raw Measurements',
    'Treatments',
    'Experiments',
  ],
);
assert.equal(wb.getWorksheet('Raw Measurements')!.rowCount, 3);
writeFileSync('work/verification.xlsx', Buffer.from(await blob.arrayBuffer()));
let html = '';
(globalThis as any).window = {
  open: () => ({
    document: {
      write: (s: string) => {
        html = s;
      },
      close() {},
    },
    focus() {},
    print() {},
  }),
};
exportPDF(d, d.counts, '<script>bad</script>');
assert.ok(!html.includes('<script>bad'));
assert.ok(html.includes('&lt;script&gt;bad'));
assert.ok(html.includes('Raw Measurements'));
writeFileSync('work/fixture.json', JSON.stringify(d));
URL.createObjectURL = original;
console.log(
  'PASS: repeated counts, sample SD, zero denominators, per-slide validation, well volumes, treatment conservation, experiment snapshots, CSV escaping, Excel round-trip, PDF report escaping.',
);

