import {
  Count,
  Notebook,
  dateLabel,
  localDate,
  remaining,
  stats,
  value,
  volumeOf,
} from './model';
type Row = Record<string, string | number | null>;
export function exportSheets(d: Notebook, counts: Count[], projectId?: string) {
  const project = (id: string) => d.projects.find((p) => p.id === id),
    culture = (id: string) => d.cultures.find((c) => c.id === id);
  const meta = (c: Count) => ({
    Project: project(c.projectId)?.name ?? '',
    CellType: project(c.projectId)?.cellType ?? '',
    Source: project(c.projectId)?.source ?? '',
    Culture: culture(c.cultureId)?.name ?? '',
    Passage: c.passage,
    CountID: c.id,
    RecordType: c.origin ? 'Passage starting estimate (not measured)' : 'Measured count',
    SourceCountID: c.origin?.sourceCountId ?? '',
    SourceCulture: c.origin?.sourceCultureName ?? '',
    StockVolume_mL: c.origin?.stock ?? null,
    AddedMedium_mL: c.origin?.medium ?? null,
    DateTimeUTC: c.at,
    TimeZone: c.timezone,
    LocalDate: localDate(c.at),
    Container: c.container.type,
    InitialVolume_mL: volumeOf(c.container),
    RemainingVolume_mL: remaining(c),
    UsedWells: c.container.wells.length,
    WellVolumes: JSON.stringify(c.container.wells),
    ViabilityFormula: c.basis === 'total' ? 'Live/Total' : 'Live/(Live+Dead)',
  });
  const summaries: Row[] = counts.map((c) => {
    const s = stats(c.readings, c.basis);
    return {
      ...meta(c),
      Readings: s.n,
      MeanTotal_cells_mL: s.total,
      MeanLive_cells_mL: s.live,
      MeanDead_cells_mL: s.dead,
      MeanViability_pct: s.viability,
      TotalSD: s.sd,
      LiveSD: s.liveSD,
      DeadSD: s.deadSD,
      TotalCV_pct: s.cv,
      EstimatedLiveCellsAtCount: s.live * volumeOf(c.container),
      Notes: c.notes,
    };
  });
  const raw: Row[] = counts.flatMap((c) =>
    c.readings.map((r) => ({
      ...meta(c),
      Slide: r.slide,
      Reading: r.reading,
      TotalCoefficient: r.total.m,
      TotalExponent: r.total.e,
      Total_cells_mL: value(r.total),
      LiveCoefficient: r.live.m,
      LiveExponent: r.live.e,
      Live_cells_mL: value(r.live),
      DeadCoefficient: r.dead.m,
      DeadExponent: r.dead.e,
      Dead_cells_mL: value(r.dead),
      Viability_pct: stats([r], c.basis).viability,
    })),
  );
  const treatments: Row[] = counts.flatMap((c) => {
    let v = volumeOf(c.container);
    return c.treatments.map((t) => {
      const before = v;
      v = v - t.remove + t.add;
      return {
        ...meta(c),
        TreatmentID: t.id,
        TreatmentTimeUTC: t.at,
        Type: t.kind,
        Before_mL: before,
        Removed_mL: t.remove,
        Added_mL: t.add,
        After_mL: v,
        ExperimentID: t.experimentId ?? '',
        PassageDestinations: t.passage ? JSON.stringify(t.passage.targets) : '',
        PassageStockReadings: t.passage?.stockReadings ? JSON.stringify(t.passage.stockReadings) : '',
        Notes: t.notes,
      };
    });
  });
  const selected = new Set(counts.map((c) => c.id));
  const experiments: Row[] = d.experiments
    .filter((e) => selected.has(e.countId))
    .map((e) => {
      const b = stats(e.before.readings, e.before.basis),
        a = e.after ? stats(e.after.readings, e.after.basis) : null;
      return {
        Project: project(e.projectId)?.name ?? '',
        Culture: culture(e.cultureId)?.name ?? '',
        ExperimentID: e.id,
        Experiment: e.name,
        SourceCountID: e.countId,
        StartedUTC: e.at,
        Used_mL: e.used,
        BeforeTotal: b.total,
        BeforeLive: b.live,
        BeforeDead: b.dead,
        BeforeViability_pct: b.viability,
        BeforeBasis: e.before.basis,
        EstimatedLiveCellsUsed: b.live * e.used,
        AfterTimeUTC: e.after?.at ?? '',
        AfterVolume_mL: e.after?.volume ?? null,
        AfterTotal: a?.total ?? null,
        AfterLive: a?.live ?? null,
        AfterDead: a?.dead ?? null,
        AfterViability_pct: a?.viability ?? null,
        AfterBasis: e.after?.basis ?? '',
        EstimatedLiveCellsAfter: a && e.after ? a.live * e.after.volume : null,
        BeforeRawMeasurements: JSON.stringify(e.before.readings),
        AfterRawMeasurements: JSON.stringify(e.after?.readings ?? []),
        Notes: e.notes,
        AfterNotes: e.after?.notes ?? '',
      };
    });
  const summary: Row[] = [
    { Field: 'ExportedAtUTC', Value: new Date().toISOString() },
    {
      Field: 'Scope',
      Value: projectId ? (project(projectId)?.name ?? '') : 'All projects',
    },
    { Field: 'CountSessions', Value: counts.length },
    { Field: 'Concentration unit', Value: 'cells/mL' },
    { Field: 'SD', Value: 'Sample standard deviation (n-1)' },
    {
      Field: 'Viability',
      Value:
        'Mean of individual reading viability; denominator recorded per session',
    },
    { Field: 'Zero denominator', Value: 'Blank / unavailable' },
    {
      Field: 'Estimates',
      Value:
        'Concentration × volume; measured concentrations are not extrapolated after treatments',
    },
  ];
  return {
    Summary: summary,
    'Count Sessions': summaries,
    'Raw Measurements': raw,
    Treatments: treatments,
    Experiments: experiments,
  };
}
export function downloadFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export const safeFilename = (s: string) =>
  s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100) || 'CellNotebook';
export function csvText(rows: Row[]) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const quote = (v: unknown) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    '\ufeff' +
    [columns, ...rows.map((r) => columns.map((k) => r[k] ?? ''))]
      .map((r) => r.map(quote).join(','))
      .join('\r\n')
  );
}
export async function exportExcel(
  d: Notebook,
  counts: Count[],
  name: string,
  projectId?: string,
) {
  const module = await import('exceljs');
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cell Notebook';
  for (const [title, rows] of Object.entries(
    exportSheets(d, counts, projectId),
  )) {
    const sheet = workbook.addWorksheet(title);
    const keys = [...new Set(rows.flatMap(Object.keys))];
    sheet.columns = keys.map((k) => ({
      header: k,
      key: k,
      width: Math.min(36, Math.max(18, k.length + 3)),
    }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (keys.length) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: keys.length },
      };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF086D78' },
      };
    }
    sheet.eachRow((row, i) => {
      row.alignment = { vertical: 'top', wrapText: true };
      if (i > 1)
        row.eachCell((cell) => {
          if (typeof cell.value === 'number' && Math.abs(cell.value) >= 1e4)
            cell.numFmt = '0.000E+00';
        });
    });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  downloadFile(
    bytes as unknown as BlobPart,
    `${safeFilename(name)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
export function exportCSV(d: Notebook, counts: Count[], name: string) {
  const sheets = exportSheets(d, counts);
  const rows = sheets['Raw Measurements'].map((row) => ({
    ...row,
    ...sheets['Count Sessions'].find((s) => s.CountID === row.CountID),
    Treatments: JSON.stringify(
      sheets.Treatments.filter((t) => t.CountID === row.CountID),
    ),
    Experiments: JSON.stringify(
      sheets.Experiments.filter((e) => e.SourceCountID === row.CountID),
    ),
  }));
  downloadFile(
    csvText(rows),
    `${safeFilename(name)}.csv`,
    'text/csv;charset=utf-8',
  );
}
const esc = (x: unknown) =>
  String(x ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function exportPDF(d: Notebook, counts: Count[], name: string) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('请允许此网站打开打印窗口，再重试。');
  const sheets = exportSheets(d, counts);
  const tables = Object.entries(sheets)
    .filter(([k]) => k !== 'Summary')
    .map(([title, rows]) => {
      const keys =
        title === 'Count Sessions'
          ? [
              'Project',
              'Culture',
              'DateTimeUTC',
              'MeanTotal_cells_mL',
              'MeanLive_cells_mL',
              'MeanDead_cells_mL',
              'MeanViability_pct',
              'InitialVolume_mL',
              'RemainingVolume_mL',
            ]
          : title === 'Raw Measurements'
            ? [
                'Culture',
                'DateTimeUTC',
                'Slide',
                'Reading',
                'Total_cells_mL',
                'Live_cells_mL',
                'Dead_cells_mL',
              ]
            : title === 'Treatments'
              ? [
                  'Culture',
                  'TreatmentTimeUTC',
                  'Type',
                  'Removed_mL',
                  'Added_mL',
                  'After_mL',
                  'Notes',
                ]
              : [
                  'Experiment',
                  'StartedUTC',
                  'Used_mL',
                  'BeforeLive',
                  'BeforeViability_pct',
                  'AfterLive',
                  'AfterViability_pct',
                  'AfterVolume_mL',
                  'Notes',
                ];
      return `<h2>${esc(title)}</h2>${rows.length ? `<table><thead><tr>${keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${esc(typeof r[k] === 'number' ? Number((r[k] as number).toPrecision(5)) : r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>无记录</p>'}`;
    })
    .join('');
  const groups = new Map<string, Count[]>();
  counts.forEach((c) =>
    groups.set(c.cultureId, [...(groups.get(c.cultureId) || []), c]),
  );
  const charts = [...groups.entries()]
    .map(([id, cs]) => {
      const sorted = cs.toSorted((a, b) => a.at.localeCompare(b.at)),
        ys = sorted.map((c) => stats(c.readings, c.basis).live),
        max = Math.max(...ys, 1),
        pts = ys.map(
          (y, i) =>
            `${50 + (i * 650) / Math.max(1, ys.length - 1)},${160 - (y / max) * 130}`,
        );
      return `<h3>${esc(d.cultures.find((c) => c.id === id)?.name)} · Live concentration (cells/mL)</h3><svg width="740" height="200" viewBox="0 0 740 200"><line x1="50" y1="160" x2="710" y2="160" stroke="#bbb"/><text x="0" y="25" font-size="11">${max.toExponential(2)}</text><text x="20" y="160" font-size="11">0</text><polyline points="${pts.join(' ')}" fill="none" stroke="#08747d" stroke-width="2"/>${pts
        .map((p) => {
          const [x, y] = p.split(',');
          return `<circle cx="${x}" cy="${y}" r="3" fill="#08747d"/>`;
        })
        .join(
          '',
        )}<text x="50" y="190" font-size="11">${esc(dateLabel(sorted[0].at))}</text><text x="620" y="190" font-size="11">${esc(dateLabel(sorted.at(-1)!.at))}</text></svg>`;
    })
    .join('');
  win.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(name)}</title><style>body{font:11px Arial,'Microsoft YaHei',sans-serif;color:#163148;padding:20px}h1{font-size:24px}h2{margin-top:30px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:9px}th,td{padding:6px;border:1px solid #ccd8e2;word-break:break-word;text-align:left}th{background:#e8f3f3}thead{display:table-header-group}tr{break-inside:avoid}svg{max-width:100%;break-inside:avoid}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}}</style></head><body><button onclick="window.print()">打印 / 另存为 PDF</button><h1>Cell Notebook · ${esc(name)}</h1><p>导出时间：${esc(new Date().toLocaleString('zh-CN'))} · ${counts.length} 次计数。浓度 cells/mL，体积 mL。原始日期以 UTC 标注。</p>${charts}${tables}<p>存活率为单次读数百分比的平均值；SD 为样本标准差。完整字段和实验前后原始读数请同时导出 Excel。</p></body></html>`,
  );
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
