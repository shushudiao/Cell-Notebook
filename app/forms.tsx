'use client';
import { useState } from 'react';
import {
  Choice,
  ContainerEditor,
  Field,
  firstReadings,
  Numeric,
  ReadingsEditor,
} from './controls';
import {
  Container,
  Count,
  Culture,
  Experiment,
  Project,
  Reading,
  Treatment,
  localTimeInput,
  remaining,
  sci,
  stats,
  treatmentTypes,
  uid,
  validateContainer,
  validateReadings,
  volumeOf,
} from '@/lib/model';
function Form({
  children,
  onSave,
  label = '保存记录',
}: {
  children: React.ReactNode;
  onSave: () => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSave();
        } catch (err) {
          setError(err instanceof Error ? err.message : '保存失败');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-footer">
          <span className="muted">原始数据与修改历史会保留</span>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? '正在保存…' : label}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function ProjectForm({
  onSave,
  initial,
}: {
  onSave: (p: Project) => Promise<void>;
  initial?: Project;
}) {
  const [p, setP] = useState<Project>(
    initial ?? {
      id: uid(),
      name: '',
      cellType: '',
      source: '',
      notes: '',
      createdAt: new Date().toISOString(),
    },
  );
  return (
    <Form onSave={() => onSave({ ...p, name: p.name.trim() })}>
      <Field label="项目名称">
        <input
          required
          placeholder="例如 Jurkat E6-1"
          value={p.name}
          onChange={(e) => setP({ ...p, name: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="细胞类型">
          <input
            placeholder="Jurkat"
            value={p.cellType}
            onChange={(e) => setP({ ...p, cellType: e.target.value })}
          />
        </Field>
        <Field label="细胞来源">
          <input
            placeholder="例如 ATCC TIB-152"
            value={p.source}
            onChange={(e) => setP({ ...p, source: e.target.value })}
          />
        </Field>
      </div>
      <Field label="项目备注">
        <textarea
          value={p.notes}
          onChange={(e) => setP({ ...p, notes: e.target.value })}
        />
      </Field>
    </Form>
  );
}
export function CultureForm({
  projectId,
  onSave,
}: {
  projectId: string;
  onSave: (c: Culture) => Promise<void>;
}) {
  const [c, setC] = useState<Culture>({
    id: uid(),
    projectId,
    name: '',
    passage: 'P0',
    container: { type: 'T75 Flask', volume: 15, wells: [] },
  });
  return (
    <Form
      onSave={async () => {
        validateContainer(c.container);
        await onSave(c);
      }}
    >
      <div className="form-grid">
        <Field label="培养容器编号">
          <input
            required
            placeholder="例如 JUR-P3-T75-001"
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
          />
        </Field>
        <Field label="Passage / 代次">
          <input
            value={c.passage}
            onChange={(e) => setC({ ...c, passage: e.target.value })}
          />
        </Field>
      </div>
      <ContainerEditor
        value={c.container}
        onChange={(container) => setC({ ...c, container })}
      />
    </Form>
  );
}
export function CountForm({
  projectId,
  cultures,
  counts,
  initial,
  onSave,
}: {
  projectId: string;
  cultures: Culture[];
  counts: Count[];
  initial?: Count;
  onSave: (c: Count) => Promise<void>;
}) {
  function containerFor(id: string) {
    const culture = cultures.find((c) => c.id === id)!;
    const latest = counts
      .filter((c) => c.cultureId === id)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!latest) return structuredClone(culture.container);
    const v = remaining(latest);
    return {
      ...structuredClone(latest.container),
      volume: v,
      wells: structuredClone(latest.container.wells),
    };
  }
  const [c, setC] = useState<Count>(
    initial
      ? structuredClone(initial)
      : {
          id: uid(),
          projectId,
          cultureId: cultures[0].id,
          at: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          passage: cultures[0].passage,
          container: containerFor(cultures[0].id),
          readings: firstReadings(),
          basis: 'liveDead',
          notes: '',
          treatments: [],
        },
  );
  return (
    <Form
      onSave={async () => {
        validateContainer(c.container);
        validateReadings(c.readings, c.basis);
        await onSave(c);
      }}
    >
      <div className="form-grid">
        <Field label="培养容器">
          <Choice
            label="培养容器"
            value={c.cultureId}
            options={cultures.map((x) => ({ value: x.id, label: x.name }))}
            onChange={(cultureId) => {
              if (initial) return;
              const culture = cultures.find((x) => x.id === cultureId)!;
              setC({
                ...c,
                cultureId,
                passage: culture.passage,
                container: containerFor(cultureId),
              });
            }}
          />
        </Field>
        <Field label="计数时间（设备本地时间）">
          <input
            type="datetime-local"
            required
            value={localTimeInput(c.at)}
            onChange={(e) =>
              e.target.value &&
              setC({ ...c, at: new Date(e.target.value).toISOString() })
            }
          />
        </Field>
        <Field label="Passage / 代次">
          <input
            value={c.passage}
            onChange={(e) => setC({ ...c, passage: e.target.value })}
          />
        </Field>
      </div>
      <ContainerEditor
        value={c.container}
        onChange={(container) => setC({ ...c, container })}
      />
      <ReadingsEditor
        readings={c.readings}
        onChange={(readings) => setC({ ...c, readings })}
        basis={c.basis}
        onBasis={(basis) => setC({ ...c, basis })}
      />
      <Field label="本次计数备注">
        <textarea
          placeholder="细胞状态、稀释方式或其他说明"
          value={c.notes}
          onChange={(e) => setC({ ...c, notes: e.target.value })}
        />
      </Field>
    </Form>
  );
}
export function TreatmentForm({
  count,
  onSave,
}: {
  count: Count;
  onSave: (t: Treatment) => Promise<void>;
}) {
  const [t, setT] = useState<Treatment>({
      id: uid(),
      at: new Date(Math.max(Date.now(), Date.parse(count.at))).toISOString(),
      kind: '添加培养液',
      remove: 0,
      add: 0,
      notes: '',
    }),
    [ratio, setRatio] = useState(50);
  const before = remaining(count);
  return (
    <Form
      onSave={async () => {
        if (t.remove > before) throw new Error('移除量不能大于剩余体积');
        await onSave(t);
      }}
    >
      <div className="form-grid">
        <Field label="处理类型">
          <Choice
            label="处理类型"
            value={t.kind}
            options={treatmentTypes.filter((x) => x !== '实验取样')}
            onChange={(kind) => setT({ ...t, kind, remove: 0, add: 0 })}
          />
        </Field>
        <Field label="处理时间">
          <input
            type="datetime-local"
            required
            value={localTimeInput(t.at)}
            onChange={(e) =>
              e.target.value &&
              setT({ ...t, at: new Date(e.target.value).toISOString() })
            }
          />
        </Field>
      </div>
      {t.kind === '更换培养液' && (
        <div className="ratio-box">
          <Field label="等体积换液比例（%）">
            <Numeric value={ratio} max={100} onChange={setRatio} />
          </Field>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setT({
                ...t,
                remove: Number(((before * ratio) / 100).toFixed(6)),
                add: Number(((before * ratio) / 100).toFixed(6)),
              })
            }
          >
            应用比例
          </button>
        </div>
      )}
      <div className="form-grid">
        <Field label="移除 / 用掉（mL）">
          <Numeric
            value={t.remove}
            max={before}
            onChange={(remove) => setT({ ...t, remove })}
          />
        </Field>
        <Field label="加入（mL）">
          <Numeric value={t.add} onChange={(add) => setT({ ...t, add })} />
        </Field>
      </div>
      <div className="volume-flow">
        <span>
          处理前 <b>{before} mL</b>
        </span>
        <span>→</span>
        <span>
          处理后 <b>{Number((before - t.remove + t.add).toFixed(6))} mL</b>
        </span>
      </div>
      <Field label="处理说明">
        <textarea
          placeholder="例如试剂、浓度、离心条件，或分瓶比例"
          value={t.notes}
          onChange={(e) => setT({ ...t, notes: e.target.value })}
        />
      </Field>
      <p className="muted">
        处理后的浓度需要重新测量。这里仅更新体积，不推算处理后的实际细胞浓度。
      </p>
    </Form>
  );
}
export function ExperimentForm({
  count,
  onSave,
}: {
  count: Count;
  onSave: (e: Experiment) => Promise<void>;
}) {
  const [e, setE] = useState<Experiment>({
    id: uid(),
    projectId: count.projectId,
    cultureId: count.cultureId,
    countId: count.id,
    name: '',
    at: new Date(Math.max(Date.now(), Date.parse(count.at))).toISOString(),
    used: 1,
    notes: '',
    before: structuredClone(count),
  });
  const s = stats(count.readings, count.basis);
  return (
    <Form
      label="创建实验并记录取样"
      onSave={async () => {
        if (e.used <= 0 || e.used > remaining(count))
          throw new Error('实验用量必须大于 0 且不超过剩余体积');
        await onSave(e);
      }}
    >
      <Field label="实验名称">
        <input
          required
          placeholder="例如药物处理 · 24 小时"
          value={e.name}
          onChange={(v) => setE({ ...e, name: v.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="实验开始时间">
          <input
            type="datetime-local"
            required
            value={localTimeInput(e.at)}
            onChange={(v) =>
              v.target.value &&
              setE({ ...e, at: new Date(v.target.value).toISOString() })
            }
          />
        </Field>
        <Field label={`实验使用体积（可用 ${remaining(count)} mL）`}>
          <Numeric
            value={e.used}
            min={0.000001}
            max={remaining(count)}
            onChange={(used) => setE({ ...e, used })}
          />
        </Field>
      </div>
      <div className="info-box">
        实验前活细胞浓度 <strong>{sci(s.live)} cells/mL</strong>
        <br />
        按所选计数估算取用 <strong>{sci(s.live * e.used)} live cells</strong>
      </div>
      {count.treatments.length > 0 && (
        <p className="warning">
          这次计数后已有处理。估算仍采用该次原始浓度；如果处理改变了浓度，请先新增一次计数。
        </p>
      )}
      <Field label="实验说明">
        <textarea
          value={e.notes}
          onChange={(v) => setE({ ...e, notes: v.target.value })}
        />
      </Field>
    </Form>
  );
}
export function AfterForm({
  experiment,
  onSave,
}: {
  experiment: Experiment;
  onSave: (a: NonNullable<Experiment['after']>) => Promise<void>;
}) {
  const [a, setA] = useState<NonNullable<Experiment['after']>>(
    experiment.after
      ? structuredClone(experiment.after)
      : {
          at: new Date(
            Math.max(Date.now(), Date.parse(experiment.at)),
          ).toISOString(),
          volume: experiment.used,
          readings: firstReadings(),
          basis: experiment.before.basis,
          notes: '',
        },
  );
  return (
    <Form
      label="保存实验后结果"
      onSave={async () => {
        validateReadings(a.readings, a.basis);
        await onSave(a);
      }}
    >
      <div className="form-grid">
        <Field label="实验后计数时间">
          <input
            type="datetime-local"
            required
            value={localTimeInput(a.at)}
            onChange={(e) =>
              e.target.value &&
              setA({ ...a, at: new Date(e.target.value).toISOString() })
            }
          />
        </Field>
        <Field label="实验后总体积（mL）">
          <Numeric
            value={a.volume}
            min={0.000001}
            onChange={(volume) => setA({ ...a, volume })}
          />
        </Field>
      </div>
      <ReadingsEditor
        readings={a.readings}
        onChange={(readings) => setA({ ...a, readings })}
        basis={a.basis}
        onBasis={(basis) => setA({ ...a, basis })}
      />
      <Field label="实验后备注">
        <textarea
          value={a.notes}
          onChange={(e) => setA({ ...a, notes: e.target.value })}
        />
      </Field>
    </Form>
  );
}

