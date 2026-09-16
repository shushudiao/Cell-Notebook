export type Scientific = { m: number; e: number };
export type Reading = {
  slide: number;
  reading: number;
  total: Scientific;
  live: Scientific;
  dead: Scientific;
};
export type Container = {
  type: string;
  volume: number;
  wells: { name: string; volume: number }[];
};
export type Project = {
  id: string;
  name: string;
  cellType: string;
  source: string;
  notes: string;
  createdAt: string;
};
export type Culture = {
  id: string;
  projectId: string;
  name: string;
  passage: string;
  container: Container;
};
export type Treatment = {
  id: string;
  at: string;
  kind: string;
  remove: number;
  add: number;
  notes: string;
  experimentId?: string;
};
export type Count = {
  id: string;
  projectId: string;
  cultureId: string;
  at: string;
  timezone: string;
  passage: string;
  container: Container;
  readings: Reading[];
  basis: 'liveDead' | 'total';
  notes: string;
  treatments: Treatment[];
};
export type Experiment = {
  id: string;
  projectId: string;
  cultureId: string;
  countId: string;
  name: string;
  at: string;
  used: number;
  notes: string;
  before: Count;
  after?: {
    at: string;
    volume: number;
    readings: Reading[];
    basis: 'liveDead' | 'total';
    notes: string;
  };
};
export type Notebook = {
  schema: 1;
  projects: Project[];
  cultures: Culture[];
  counts: Count[];
  experiments: Experiment[];
};
export const emptyNotebook = (): Notebook => ({
  schema: 1,
  projects: [],
  cultures: [],
  counts: [],
  experiments: [],
});
export const containerTypes = [
  'T25 Flask',
  'T75 Flask',
  'T175 Flask',
  '6-well plate',
  '12-well plate',
  '24-well plate',
  '48-well plate',
  '96-well plate',
  'Tube',
  'Custom',
];
export const treatmentTypes = [
  '添加培养液',
  '移除培养液',
  '更换培养液',
  '计数取样',
  '实验取样',
  '传代 / 分瓶',
  '离心 / 重悬',
  '添加试剂',
  '冻存 / 复苏',
  '其他处理',
];
export const uid = () => crypto.randomUUID();
export const value = (s: Scientific) => s.m * 10 ** s.e;

export function deleteCount(notebook: Notebook, countId: string) {
  const count = notebook.counts.find((item) => item.id === countId);
  if (!count) throw new Error('找不到要删除的计数记录');
  const experimentIds = new Set(
    notebook.experiments
      .filter((item) => item.countId === countId)
      .map((item) => item.id),
  );
  notebook.counts = notebook.counts.filter((item) => item.id !== countId);
  notebook.experiments = notebook.experiments.filter(
    (item) => item.countId !== countId,
  );
  notebook.counts.forEach((item) => {
    item.treatments = item.treatments.filter(
      (treatment) =>
        !treatment.experimentId ||
        !experimentIds.has(treatment.experimentId),
    );
  });
  return { experiments: experimentIds.size };
}

export function deleteProject(notebook: Notebook, projectId: string) {
  const project = notebook.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('找不到要删除的项目');
  const cultures = notebook.cultures.filter(
    (item) => item.projectId === projectId,
  ).length;
  const counts = notebook.counts.filter(
    (item) => item.projectId === projectId,
  ).length;
  const experiments = notebook.experiments.filter(
    (item) => item.projectId === projectId,
  ).length;
  notebook.projects = notebook.projects.filter((item) => item.id !== projectId);
  notebook.cultures = notebook.cultures.filter(
    (item) => item.projectId !== projectId,
  );
  notebook.counts = notebook.counts.filter(
    (item) => item.projectId !== projectId,
  );
  notebook.experiments = notebook.experiments.filter(
    (item) => item.projectId !== projectId,
  );
  return { cultures, counts, experiments };
}
export function sci(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(n)));
  return `${Number((n / 10 ** e).toPrecision(4))} × 10${String(e)
    .split('')
    .map(
      (c) =>
        ({
          '-': '⁻',
          '0': '⁰',
          '1': '¹',
          '2': '²',
          '3': '³',
          '4': '⁴',
          '5': '⁵',
          '6': '⁶',
          '7': '⁷',
          '8': '⁸',
          '9': '⁹',
        })[c],
    )
    .join('')}`;
}
export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export function stats(
  readings: Reading[],
  basis: 'liveDead' | 'total' = 'liveDead',
) {
  const all = (key: 'total' | 'live' | 'dead') =>
    readings.map((r) => value(r[key]));
  const total = mean(all('total')),
    live = mean(all('live')),
    dead = mean(all('dead'));
  const spread = (xs: number[]) =>
    xs.length > 1
      ? Math.sqrt(
          xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1),
        )
      : null;
  const sd = spread(all('total')),
    liveSD = spread(all('live')),
    deadSD = spread(all('dead'));
  const vs = readings
    .map((r) => {
      const d =
        basis === 'total' ? value(r.total) : value(r.live) + value(r.dead);
      return d > 0 ? (value(r.live) / d) * 100 : null;
    })
    .filter((n): n is number => n != null);
  return {
    total,
    live,
    dead,
    viability: vs.length ? mean(vs) : null,
    sd,
    liveSD,
    deadSD,
    cv: sd != null && total > 0 ? (sd / total) * 100 : null,
    n: readings.length,
  };
}
export const volumeOf = (c: Container) =>
  c.type.includes('well')
    ? c.wells.reduce((n, w) => n + w.volume, 0)
    : c.volume;
export const remaining = (c: Count) =>
  Number(
    (
      volumeOf(c.container) +
      c.treatments.reduce((v, t) => v + t.add - t.remove, 0)
    ).toFixed(8),
  );
export const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const localTimeInput = (iso = new Date().toISOString()) => {
  const d = new Date(iso);
  return `${localDate(iso)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
export const percent = (n: number | null) =>
  n == null ? '—' : `${n.toFixed(1)}%`;
export function change(before: number, after: number) {
  return before === 0 ? null : ((after - before) / before) * 100;
}
export function wellNames(type: string) {
  const n = parseInt(type);
  const cols = (
    { 6: 3, 12: 4, 24: 6, 48: 8, 96: 12 } as Record<number, number>
  )[n];
  return cols
    ? Array.from(
        { length: n },
        (_, i) =>
          `${String.fromCharCode(65 + Math.floor(i / cols))}${(i % cols) + 1}`,
      )
    : [];
}
function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function num(x: unknown, name: string, max = 1e15) {
  requireThat(
    typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max,
    `${name}必须是有效的非负数`,
  );
}
function str(x: unknown, name: string, required = false) {
  requireThat(
    typeof x === 'string' && x.length <= 10000 && (!required || x.trim()),
    `${name}不能为空或过长`,
  );
}
function date(x: string) {
  requireThat(
    typeof x === 'string' && Number.isFinite(Date.parse(x)),
    '日期时间无效',
  );
}
export function validateReadings(rs: Reading[], basis: string) {
  requireThat(
    Array.isArray(rs) && rs.length >= 2 && rs.length <= 1000,
    '每次计数至少录入两次读数',
  );
  requireThat(['liveDead', 'total'].includes(basis), '存活率计算方式无效');
  const slides = new Map<number, Set<number>>();
  rs.forEach((r) => {
    requireThat(
      Number.isInteger(r.slide) &&
        r.slide > 0 &&
        Number.isInteger(r.reading) &&
        r.reading > 0,
      'Slide 和读数编号必须为正整数',
    );
    const ids = slides.get(r.slide) ?? new Set<number>();
    requireThat(!ids.has(r.reading), '同一张 Slide 的读数编号不能重复');
    ids.add(r.reading);
    slides.set(r.slide, ids);
    (['total', 'live', 'dead'] as const).forEach((k) => {
      num(r[k]?.m, `${k} 系数`, 1e9);
      requireThat(
        Number.isInteger(r[k].e) && r[k].e >= -6 && r[k].e <= 12,
        '指数应为 −6 至 12 的整数',
      );
      num(value(r[k]), k);
    });
    if (basis === 'total')
      requireThat(
        value(r.live) <= value(r.total),
        '以 Total 计算时，Live 不能大于 Total',
      );
  });
  for (const ids of slides.values())
    requireThat(ids.size >= 2, '每张 Slide 至少需要两次完整读数');
}
export function validateContainer(c: Container) {
  requireThat(c && containerTypes.includes(c.type), '请选择有效容器');
  num(c.volume, '体积', 1e6);
  requireThat(Array.isArray(c.wells), '孔板数据无效');
  if (c.type.includes('well')) {
    const names = wellNames(c.type);
    requireThat(
      c.wells.length > 0 && c.wells.length <= names.length,
      '请选择使用的孔',
    );
    const used = new Set();
    c.wells.forEach((w) => {
      requireThat(
        names.includes(w.name) && !used.has(w.name),
        '孔位不能重复或超出孔板范围',
      );
      used.add(w.name);
      num(w.volume, '每孔体积', 1e6);
      requireThat(w.volume > 0, '每孔体积应大于 0');
    });
  }
  requireThat(volumeOf(c) > 0, '培养体积应大于 0');
}
export function validateNotebook(input: unknown): Notebook {
  const d = input as Notebook;
  requireThat(d?.schema === 1, '无法识别的备份格式');
  for (const k of ['projects', 'cultures', 'counts', 'experiments'] as const)
    requireThat(
      Array.isArray(d[k]) && d[k].length <= 20000,
      '备份数据结构无效或记录过多',
    );
  const ids = new Set<string>();
  const id = (x: string) => {
    str(x, '记录 ID', true);
    requireThat(!ids.has(x), '记录 ID 重复');
    ids.add(x);
  };
  d.projects.forEach((p) => {
    id(p.id);
    str(p.name, '项目名称', true);
    str(p.cellType, '细胞类型');
    str(p.source, '来源');
    str(p.notes, '备注');
    date(p.createdAt);
  });
  const projects = new Set(d.projects.map((p) => p.id));
  d.cultures.forEach((c) => {
    id(c.id);
    requireThat(projects.has(c.projectId), '培养容器所属项目不存在');
    str(c.name, '容器编号', true);
    str(c.passage, '代次');
    validateContainer(c.container);
  });
  const cultures = new Map(d.cultures.map((c) => [c.id, c]));
  const validateCount = (c: Count) => {
    requireThat(
      projects.has(c.projectId) &&
        cultures.get(c.cultureId)?.projectId === c.projectId,
      '计数所属项目或容器无效',
    );
    date(c.at);
    str(c.timezone, '时区', true);
    str(c.passage, '代次');
    str(c.notes, '备注');
    validateContainer(c.container);
    validateReadings(c.readings, c.basis);
    requireThat(Array.isArray(c.treatments), '处理记录无效');
    let v = volumeOf(c.container);
    const treatmentIds = new Set<string>();
    c.treatments.forEach((t) => {
      str(t.id, '处理 ID', true);
      requireThat(!treatmentIds.has(t.id), '处理 ID 重复');
      treatmentIds.add(t.id);
      date(t.at);
      requireThat(t.at >= c.at, '处理时间不能早于计数时间');
      requireThat(treatmentTypes.includes(t.kind), '处理类型无效');
      str(t.notes, '处理备注');
      num(t.remove, '移除体积', 1e6);
      num(t.add, '添加体积', 1e6);
      requireThat(
        t.remove <= v + 1e-8,
        '移除或实验用量不能超过该次记录的剩余体积',
      );
      v += t.add - t.remove;
    });
  };
  d.counts.forEach((c) => {
    id(c.id);
    validateCount(c);
  });
  d.experiments.forEach((e) => {
    id(e.id);
    str(e.name, '实验名称', true);
    str(e.notes, '实验备注');
    date(e.at);
    const c = d.counts.find((c) => c.id === e.countId);
    requireThat(
      c && c.projectId === e.projectId && c.cultureId === e.cultureId,
      '实验来源记录无效',
    );
    validateCount(e.before);
    requireThat(
      e.before.id === e.countId &&
        e.before.projectId === e.projectId &&
        e.before.cultureId === e.cultureId,
      '实验前快照无效',
    );
    requireThat(e.at >= e.before.at, '实验时间不能早于原计数');
    num(e.used, '实验用量', 1e6);
    requireThat(
      e.used > 0 && e.used <= remaining(e.before) + 1e-8,
      '实验用量应大于 0 且不能超过剩余体积',
    );
    const log = c.treatments.find((t) => t.experimentId === e.id);
    requireThat(
      log && log.remove === e.used && log.add === 0,
      '实验用量与处理记录不一致',
    );
    if (e.after) {
      date(e.after.at);
      requireThat(e.after.at >= e.at, '实验后计数不能早于实验时间');
      num(e.after.volume, '实验后体积', 1e6);
      requireThat(e.after.volume > 0, '实验后体积应大于 0');
      validateReadings(e.after.readings, e.after.basis);
      str(e.after.notes, '实验后备注');
    }
  });
  return d;
}

