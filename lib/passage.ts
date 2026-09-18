import { type Notebook, type Reading, type Count, type Scientific, remaining, uid, value, validateReadings, validateNotebook } from './model';

export type PassageDraft = {
  at: string;
  passage: string;
  type: string;
  notes: string;
  stockReadings: Reading[];
  stockBasis: Count['basis'];
  targets: { name: string; stock: number; medium: number }[];
};

export function applyPassage(data: Notebook, sourceId: string, draft: PassageDraft): Notebook {
  const next = structuredClone(data);
  const source = next.counts.find(c => c.id === sourceId);
  if (!source) throw new Error('原瓶计数不存在，请刷新');
  const culture = next.cultures.find(c => c.id === source.cultureId)!;
  const latest = next.counts.filter(c => c.cultureId === source.cultureId).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (latest?.id !== source.id) throw new Error('请从原瓶最新的一次计数开始分瓶，避免重复使用旧记录中的体积');
  if (culture.endedAt) throw new Error('原瓶已分完，请选择其他培养瓶');
  if (!draft.targets.length || draft.targets.length > 50) throw new Error('新瓶数量应为 1–50');
  if (draft.at < source.at || source.treatments.some(t => t.at > draft.at)) throw new Error('传代时间不能早于原瓶已有记录或处理');
  if (!['T25 Flask', 'T75 Flask', 'T175 Flask', 'Tube', 'Custom'].includes(draft.type)) throw new Error('请选择有效的新培养容器');
  validateReadings(draft.stockReadings, draft.stockBasis);
  const names = new Set(next.cultures.filter(c => c.projectId === source.projectId).map(c => c.name.trim()));
  for (const target of draft.targets) {
    const name = target.name.trim();
    if (!name || names.has(name)) throw new Error('新瓶名称不能为空，且不能与同项目容器重名');
    names.add(name);
    if (!Number.isFinite(target.stock) || target.stock <= 0 || !Number.isFinite(target.medium) || target.medium < 0) throw new Error('每瓶原液应大于 0，培养液不能为负数');
  }
  const totalStock = draft.targets.reduce((sum, t) => sum + t.stock, 0);
  if (totalStock > remaining(source) + 1e-8) throw new Error('分出的原液总量不能超过原瓶剩余体积；重新悬浮后请先新增一次计数');
  const treatmentId = uid();
  const destinations = draft.targets.map(target => {
    const cultureId = uid(), countId = uid();
    const volume = target.stock + target.medium;
    const scale = (s: Scientific): Scientific => {
      const scaled = value(s) * target.stock / volume;
      const e = scaled === 0 ? 0 : Math.min(12, Math.max(-6, Math.floor(Math.log10(scaled))));
      return { m: scaled / 10 ** e, e };
    };
    const container = { type: draft.type, volume, wells: [] };
    next.cultures.push({ id: cultureId, projectId: source.projectId, name: target.name.trim(), passage: draft.passage, container: structuredClone(container) });
    const count: Count = {
      id: countId, projectId: source.projectId, cultureId, at: draft.at,
      timezone: source.timezone, passage: draft.passage, container,
      readings: draft.stockReadings.map(r => ({ ...r, total: scale(r.total), live: scale(r.live), dead: scale(r.dead) })),
      basis: draft.stockBasis, treatments: [],
      notes: `分瓶起始估算（非实测）：来自 ${culture.name}；原液 ${target.stock} mL + 培养液 ${target.medium} mL。${draft.notes}`,
      origin: { kind: 'passage', sourceCountId: source.id, sourceCultureName: culture.name, treatmentId, stock: target.stock, medium: target.medium },
    };
    next.counts.push(count);
    return { cultureId, countId, name: target.name.trim(), stock: target.stock, medium: target.medium };
  });
  source.treatments.push({ id: treatmentId, at: draft.at, kind: '传代 / 分瓶', remove: totalStock, add: 0, notes: draft.notes, passage: { targets: destinations, stockReadings: structuredClone(draft.stockReadings), basis: draft.stockBasis } });
  if (remaining(source) <= 1e-8) culture.endedAt = draft.at;
  return validateNotebook(next);
}
