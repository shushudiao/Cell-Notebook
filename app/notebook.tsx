'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Cloud,
  Database,
  Download,
  FileSpreadsheet,
  FlaskConical,
  History,
  LogOut,
  Microscope,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Choice, DataTable, Field, Modal } from './controls';
import {
  AfterForm,
  CountForm,
  CultureForm,
  ExperimentForm,
  ProjectForm,
  TreatmentForm,
} from './forms';
import {
  Count,
  Culture,
  Experiment,
  Notebook,
  change,
  deleteCount,
  deleteProject,
  dateLabel,
  emptyNotebook,
  localDate,
  percent,
  remaining,
  sci,
  stats,
  uid,
  validateNotebook,
  value,
  volumeOf,
} from '@/lib/model';
import {
  downloadFile,
  exportCSV,
  exportExcel,
  exportPDF,
  safeFilename,
} from '@/lib/export';
import {
  apiNotebookStorage,
  type NotebookStorage,
} from '@/lib/notebook-storage';
type DriveFile = { id: string; name: string; modifiedTime: string };
type ViewModal = { type: string; id?: string } | null;
const palette = [
  '#07838e',
  '#5269b7',
  '#b77722',
  '#963c86',
  '#467a42',
  '#cc604b',
];
const metricOptions = [
  { value: 'live', label: 'Live · 活细胞浓度' },
  { value: 'total', label: 'Total · 总浓度' },
  { value: 'dead', label: 'Dead · 死细胞浓度' },
  { value: 'viability', label: 'Viability · 存活率' },
  { value: 'volume', label: '培养液体积' },
  { value: 'estimated', label: '计数时估算活细胞总量' },
];
export default function NotebookApp({
  userName,
  storage = apiNotebookStorage,
  onSignOut,
  googleDriveEnabled = true,
}: {
  userName: string;
  storage?: NotebookStorage;
  onSignOut?: () => void | Promise<void>;
  googleDriveEnabled?: boolean;
}) {
  const [data, setData] = useState<Notebook>(emptyNotebook),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [updated, setUpdated] = useState('');
  const [projectId, setProjectId] = useState(''),
    [cultureId, setCultureId] = useState('all'),
    [tab, setTab] = useState('overview'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [metric, setMetric] = useState('live'),
    [modal, setModal] = useState<ViewModal>(null),
    [restore, setRestore] = useState<Notebook | null>(null),
    [restoreSource, setRestoreSource] = useState('');
  const stateRef = useRef({ data, revision });
  stateRef.current = { data, revision };
  const saveLock = useRef(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const result = await storage.load();
      setData(validateNotebook(result.data));
      setRevision(result.revision);
      setUpdated(result.updatedAt);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    }
  }, [storage]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const save = useCallback(async (next: Notebook) => {
    if (saveLock.current) throw new Error('正在保存，请稍后再试');
    validateNotebook(next);
    saveLock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await storage.save(next, stateRef.current.revision);
      setData(next);
      setRevision(result.revision);
      stateRef.current = { data: next, revision: result.revision };
      setUpdated(result.updatedAt);
      setNotice('已保存到云端');
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }, [storage]);
  const mutate = async (fn: (d: Notebook) => void) => {
    const next = structuredClone(stateRef.current.data);
    fn(next);
    await save(next);
    setModal(null);
  };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'list_cell_projects',
      description: 'Read saved cell projects and record counts.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        projects: stateRef.current.data.projects.map((p) => ({
          id: p.id,
          name: p.name,
          countSessions: stateRef.current.data.counts.filter(
            (c) => c.projectId === p.id,
          ).length,
        })),
      }),
    });
    register({
      name: 'open_cell_project',
      description:
        'Navigate to an existing cell project; does not create or modify records.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const id = (input as { projectId?: unknown })?.projectId;
        if (
          typeof id !== 'string' ||
          !stateRef.current.data.projects.some((p) => p.id === id)
        )
          throw new Error('Project not found');
        setProjectId(id);
        setCultureId('all');
        setTab('overview');
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
        return { projectId: id, view: 'overview' };
      },
    });
    return () => lifecycle.abort();
  }, []);
  const project = data.projects.find((p) => p.id === projectId),
    cultures = data.cultures.filter((c) => c.projectId === projectId);
  const projectCounts = data.counts
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => b.at.localeCompare(a.at));
  const counts = projectCounts.filter(
    (c) =>
      (cultureId === 'all' || c.cultureId === cultureId) &&
      (!from || localDate(c.at) >= from) &&
      (!to || localDate(c.at) <= to),
  );
  const experiments = data.experiments
    .filter(
      (e) =>
        e.projectId === projectId &&
        (cultureId === 'all' || e.cultureId === cultureId) &&
        (!from || localDate(e.at) >= from) &&
        (!to || localDate(e.at) <= to),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const latest = counts[0],
    latestStats = latest ? stats(latest.readings, latest.basis) : null;
  const selectedCount = modal?.id
      ? data.counts.find((c) => c.id === modal.id)
      : undefined,
    selectedExperiment = modal?.id
      ? data.experiments.find((e) => e.id === modal.id)
      : undefined;
  const openProject = (id: string) => {
    setProjectId(id);
    setCultureId('all');
    setFrom('');
    setTo('');
    setTab('overview');
  };
  async function undo() {
    try {
      setRestore(validateNotebook(await storage.history(revision - 1)));
      setRestoreSource('上一次保存之前的记录');
      setModal({ type: 'restore' });
    } catch (e) {
      setError(String((e as Error).message));
    }
  }
  const nameOf = (id: string) =>
    data.cultures.find((c) => c.id === id)?.name ?? '未知容器';
  return (
    <main className="notebook">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setProjectId('')}>
          <Microscope />
          Cell Notebook<span>细胞培养记录</span>
        </button>
        <div className="top-actions">
          <span className="sync-state">
            <span className={`status-dot ${busy ? 'pending' : ''}`} />
            {busy ? '保存中' : loaded ? '已保存至云端' : '正在连接'}
          </span>
          <button
            className="icon-button"
            title="重新读取云端数据"
            aria-label="重新读取云端数据"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="secondary"
            onClick={() => setModal({ type: 'settings' })}
          >
            <Cloud size={17} />
            <span>同步与备份</span>
          </button>
          {onSignOut && (
            <button
              className="icon-button"
              title="退出 Google 账号"
              aria-label="退出 Google 账号"
              onClick={() => void onSignOut()}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      <section className="workspace">
        {error && (
          <div className="error" role="alert">
            {error}{' '}
            <button className="text-button" onClick={() => void load()}>
              重新读取
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {!project ? (
          <>
            <div className="eyebrow">YOUR LAB, RECORDED.</div>
            <div className="title-row">
              <div>
                <h1>我的细胞项目</h1>
                <p className="muted">每一次计数，都有迹可循。</p>
              </div>
              <button
                className="primary"
                disabled={!loaded}
                onClick={() => setModal({ type: 'project' })}
              >
                <Plus size={18} />
                新建项目
              </button>
            </div>
            <div className="home-summary">
              <span>
                <b>{data.projects.length}</b>细胞项目
              </span>
              <span>
                <b>{data.cultures.length}</b>培养容器
              </span>
              <span>
                <b>{data.counts.length}</b>计数记录
              </span>
              <span>
                <b>{data.experiments.length}</b>实验记录
              </span>
            </div>
            {!loaded ? (
              <article className="panel empty">
                <Database size={32} />
                <h2>{error ? '暂时无法打开记录' : '正在读取你的记录'}</h2>
                <p>数据读取成功后即可开始计数。</p>
                <button className="secondary" onClick={() => void load()}>
                  重试
                </button>
              </article>
            ) : data.projects.length === 0 ? (
              <div className="intro-grid">
                <article className="panel empty">
                  <FlaskConical size={40} />
                  <h2>开始记录第一瓶细胞</h2>
                  <p>创建项目，添加培养容器，保存每张 slide 的原始读数。</p>
                  <button
                    className="primary"
                    onClick={() => setModal({ type: 'project' })}
                  >
                    <Plus size={17} />
                    创建细胞项目
                  </button>
                </article>
                <article className="panel">
                  <h2>把培养过程连在一起</h2>
                  <p className="feature">
                    <Activity />
                    计数、存活率与多日变化
                  </p>
                  <p className="feature">
                    <FlaskConical />
                    换液、取样与实验前后对比
                  </p>
                  <p className="feature">
                    <FileSpreadsheet />
                    Excel、CSV 和 PDF 报告
                  </p>
                  <p className="feature">
                    <Cloud />
                    跨设备记录与 Google Drive 备份
                  </p>
                </article>
              </div>
            ) : (
              <div className="project-grid">
                {data.projects.map((p) => {
                  const cs = data.counts
                      .filter((c) => c.projectId === p.id)
                      .sort((a, b) => b.at.localeCompare(a.at)),
                    last = cs[0],
                    s = last ? stats(last.readings, last.basis) : null;
                  return (
                    <button
                      key={p.id}
                      className="project-card"
                      onClick={() => openProject(p.id)}
                    >
                      <div className="section-heading">
                        <span className="project-icon">
                          <FlaskConical size={23} />
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <h2>{p.name}</h2>
                      <p className="muted">
                        {p.cellType || '细胞项目'}
                        {p.source ? ` · ${p.source}` : ''}
                      </p>
                      <div className="project-value">
                        {s ? sci(s.live) : '等待首次计数'}
                        {s && <small>live cells/mL</small>}
                      </div>
                      <div className="project-meta">
                        <span>
                          存活率 <b>{s ? percent(s.viability) : '—'}</b>
                        </span>
                        <span>{cs.length} 次计数</span>
                      </div>
                      <div className="card-footer">
                        {last
                          ? `${nameOf(last.cultureId)} · ${dateLabel(last.at)}`
                          : `${data.cultures.filter((c) => c.projectId === p.id).length} 个培养容器`}
                        <span>打开项目 →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="footer-note">
              <span>{userName} · 个人实验记录</span>
              <span>{updated ? `最近保存 ${dateLabel(updated)}` : ''}</span>
            </div>
          </>
        ) : (
          <>
            <button className="back-button" onClick={() => setProjectId('')}>
              <ArrowLeft size={16} />
              所有项目
            </button>
            <div className="title-row">
              <div>
                <div className="eyebrow">CELL PROJECT</div>
                <h1>{project.name}</h1>
                <p className="muted">
                  {project.cellType}
                  {project.source ? ` · ${project.source}` : ''} ·{' '}
                  {cultures.length} 个培养容器
                </p>
              </div>
              <div className="actions">
                <button
                  className="danger-button"
                  onClick={() => setModal({ type: 'deleteProject', id: project.id })}
                >
                  <Trash2 size={17} />
                  删除项目
                </button>
                <button
                  className="secondary"
                  onClick={() => setModal({ type: 'export' })}
                >
                  <Download size={17} />
                  导出
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    setModal({ type: cultures.length ? 'count' : 'culture' })
                  }
                >
                  <Plus size={18} />
                  {cultures.length ? '新增计数' : '添加培养容器'}
                </button>
              </div>
            </div>
            <div className="filterbar">
              <Field label="培养容器">
                <Choice
                  label="筛选培养容器"
                  value={cultureId}
                  onChange={setCultureId}
                  options={[
                    { value: 'all', label: '全部容器' },
                    ...cultures.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
              <Field label="开始日期">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="结束日期">
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
              <div className="quick-ranges">
                <button
                  className="text-button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 6);
                    setFrom(localDate(d.toISOString()));
                    setTo(localDate(new Date().toISOString()));
                  }}
                >
                  近 7 天
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                >
                  全部日期
                </button>
              </div>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList variant="line" className="main-tabs">
                <TabsTrigger value="overview">培养概览</TabsTrigger>
                <TabsTrigger value="timeline">
                  计数记录 <span>{counts.length}</span>
                </TabsTrigger>
                <TabsTrigger value="experiments">
                  实验对比 <span>{experiments.length}</span>
                </TabsTrigger>
                <TabsTrigger value="data">数据与项目</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <div className="metrics">
                  <Metric
                    title="最新 Live 浓度"
                    value={sci(latestStats?.live)}
                    unit="cells/mL"
                  />
                  <Metric
                    title="平均存活率"
                    value={latestStats ? percent(latestStats.viability) : '—'}
                    unit={latest ? `${latestStats?.n} 次重复测量` : ''}
                  />
                  <Metric
                    title="培养液剩余量"
                    value={latest ? String(remaining(latest)) : '—'}
                    unit="mL · 所选最新记录"
                  />
                  <Metric
                    title="Total 变异系数"
                    value={latestStats ? percent(latestStats.cv) : '—'}
                    unit="CV · 样本标准差 / 均值"
                  />
                </div>
                {latest && (
                  <p className="metric-source">
                    来源：{nameOf(latest.cultureId)} · {dateLabel(latest.at)}
                    {cultureId === 'all' && cultures.length > 1
                      ? ' · 下方曲线按容器分别显示'
                      : ''}
                  </p>
                )}
                <article className="panel chart-panel">
                  <div className="section-heading">
                    <div>
                      <h2>培养趋势</h2>
                      <p className="muted">
                        {counts.length} 次计数 · 点击数据点查看原始记录
                      </p>
                    </div>
                    <Choice
                      label="趋势指标"
                      value={metric}
                      onChange={setMetric}
                      options={metricOptions}
                    />
                  </div>
                  {counts.length ? (
                    <Trend
                      counts={counts}
                      cultures={cultures}
                      metric={metric}
                      onSelect={(id) => setModal({ type: 'detail', id })}
                    />
                  ) : (
                    <div className="chart-empty">
                      <Activity size={30} />
                      <p>记录第一次计数，开始观察变化。</p>
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({
                            type: cultures.length ? 'count' : 'culture',
                          })
                        }
                      >
                        ＋ {cultures.length ? '添加计数' : '添加容器'}
                      </button>
                    </div>
                  )}
                </article>
                <div className="section-heading culture-title">
                  <h2>培养容器</h2>
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: 'culture' })}
                  >
                    ＋ 添加容器
                  </button>
                </div>
                <div className="culture-grid">
                  {cultures.map((c) => {
                    const last = projectCounts.find(
                        (x) => x.cultureId === c.id,
                      ),
                      container = last?.container ?? c.container;
                    return (
                      <article className="panel culture-card" key={c.id}>
                        <div className="section-heading">
                          <FlaskConical size={20} />
                          <span className="pill">
                            {last?.passage ?? c.passage}
                          </span>
                        </div>
                        <h3>{c.name}</h3>
                        <p className="muted">
                          {container.type}
                          {container.wells.length
                            ? ` · ${container.wells.length} 孔`
                            : ''}
                        </p>
                        <strong>
                          {last ? remaining(last) : volumeOf(c.container)}{' '}
                          <small>mL</small>
                        </strong>
                        <p className="muted">
                          {last ? `最近计数 ${dateLabel(last.at)}` : '尚无计数'}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setCultureId(c.id);
                            setTab('timeline');
                          }}
                        >
                          查看记录 →
                        </button>
                      </article>
                    );
                  })}
                  {!cultures.length && (
                    <article className="panel empty small">
                      <p>添加一瓶细胞或一个孔板。</p>
                      <button
                        className="primary"
                        onClick={() => setModal({ type: 'culture' })}
                      >
                        添加容器
                      </button>
                    </article>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="timeline">
                <article className="panel records-panel">
                  <div className="section-heading">
                    <h2>计数记录</h2>
                    <span className="muted">按日期时间排序</span>
                  </div>
                  {counts.length ? (
                    <DataTable
                      headers={[
                        '日期 / 时间',
                        '培养容器',
                        'Mean Total',
                        'Mean Live',
                        'Mean Dead',
                        '存活率',
                        '读数',
                        '',
                      ]}
                      rows={counts.map((c) => {
                        const s = stats(c.readings, c.basis);
                        return [
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: 'detail', id: c.id })
                            }
                          >
                            {dateLabel(c.at)}
                          </button>,
                          nameOf(c.cultureId),
                          sci(s.total),
                          sci(s.live),
                          sci(s.dead),
                          percent(s.viability),
                          s.n,
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: 'detail', id: c.id })
                            }
                          >
                            查看 →
                          </button>,
                        ];
                      })}
                    />
                  ) : (
                    <Empty text="这个日期范围内还没有计数记录。" />
                  )}
                </article>
              </TabsContent>
              <TabsContent value="experiments">
                <div className="section-heading">
                  <div>
                    <h2>实验前后对比</h2>
                    <p className="muted">
                      从任意计数记录创建实验，保留当时的原始数据。
                    </p>
                  </div>
                </div>
                {experiments.length ? (
                  <div className="experiment-list">
                    {experiments.map((e) => (
                      <ExperimentCard
                        key={e.id}
                        experiment={e}
                        culture={nameOf(e.cultureId)}
                        onAfter={() => setModal({ type: 'after', id: e.id })}
                        onSource={() =>
                          setModal({ type: 'detail', id: e.countId })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <article className="panel empty">
                    <FlaskConical size={30} />
                    <h2>还没有实验记录</h2>
                    <p>
                      打开一次计数，选择“用于实验”，填写使用体积。实验完成后可追加测量结果。
                    </p>
                    <button
                      className="secondary"
                      onClick={() => setTab('timeline')}
                    >
                      选择计数记录
                    </button>
                  </article>
                )}
              </TabsContent>
              <TabsContent value="data">
                <div className="intro-grid">
                  <article className="panel">
                    <h2>项目资料</h2>
                    <dl className="details">
                      <dt>名称</dt>
                      <dd>{project.name}</dd>
                      <dt>细胞类型</dt>
                      <dd>{project.cellType || '—'}</dd>
                      <dt>来源</dt>
                      <dd>{project.source || '—'}</dd>
                      <dt>创建时间</dt>
                      <dd>{dateLabel(project.createdAt)}</dd>
                    </dl>
                    <p className="prewrap">{project.notes}</p>
                    <button
                      className="secondary"
                      onClick={() => setModal({ type: 'editProject' })}
                    >
                      编辑项目资料
                    </button>
                  </article>
                  <article className="panel">
                    <h2>导出与历史</h2>
                    <p>
                      导出当前项目、指定日期或单次计数。原始读数和汇总统计同时保留。
                    </p>
                    <div className="stack">
                      <button
                        className="secondary"
                        onClick={() => setModal({ type: 'export' })}
                      >
                        <Download size={17} />
                        导出计数数据
                      </button>
                      <button
                        className="secondary"
                        disabled={revision === 0 || busy}
                        onClick={() => void undo()}
                      >
                        <History size={17} />
                        恢复上一次保存之前的记录
                      </button>
                    </div>
                    <p className="muted">
                      恢复操作也会保存新版本，不会删除已有历史。
                    </p>
                  </article>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </section>
      <Modal
        open={modal?.type === 'project' || modal?.type === 'editProject'}
        onClose={() => setModal(null)}
        title={modal?.type === 'editProject' ? '编辑项目' : '新建细胞项目'}
      >
        {(modal?.type === 'project' || modal?.type === 'editProject') && (
          <ProjectForm
            initial={modal?.type === 'editProject' ? project : undefined}
            onSave={async (p) => {
              await mutate((d) => {
                const i = d.projects.findIndex((x) => x.id === p.id);
                if (i >= 0) d.projects[i] = p;
                else d.projects.push(p);
              });
              openProject(p.id);
            }}
          />
        )}
      </Modal>
      <DeleteDialog
        open={modal?.type === 'deleteProject'}
        title={`删除项目“${project?.name ?? ''}”？`}
        description={
          project
            ? `将同时删除 ${cultures.length} 个培养容器、${projectCounts.length} 次计数和 ${data.experiments.filter((e) => e.projectId === project.id).length} 个实验。此操作保存后仍可通过“撤销上次保存”恢复。`
            : ''
        }
        busy={busy}
        confirmLabel="删除整个项目"
        onClose={() => setModal(null)}
        onConfirm={async () => {
          if (!project) return;
          try {
            await mutate((d) => deleteProject(d, project.id));
            setProjectId('');
            setCultureId('all');
            setNotice('项目及其关联记录已删除');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <DeleteDialog
        open={modal?.type === 'deleteCount'}
        title="删除这次计数？"
        description={
          selectedCount
            ? `${dateLabel(selectedCount.at)} · ${nameOf(selectedCount.cultureId)}。与本次计数关联的 ${data.experiments.filter((e) => e.countId === selectedCount.id).length} 个实验也会删除。`
            : ''
        }
        busy={busy}
        confirmLabel="删除这次计数"
        onClose={() => setModal(null)}
        onConfirm={async () => {
          if (!selectedCount) return;
          try {
            await mutate((d) => deleteCount(d, selectedCount.id));
            setNotice('计数及其关联实验已删除');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <Modal
        open={modal?.type === 'culture'}
        onClose={() => setModal(null)}
        title="添加培养容器"
      >
        {modal?.type === 'culture' && project && (
          <CultureForm
            projectId={project.id}
            onSave={async (c) => {
              await mutate((d) => d.cultures.push(c));
              setCultureId(c.id);
            }}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'count' || modal?.type === 'editCount'}
        onClose={() => setModal(null)}
        title={modal?.type === 'editCount' ? '修改计数记录' : '新增细胞计数'}
        wide
      >
        {(modal?.type === 'count' || modal?.type === 'editCount') &&
          project &&
          cultures.length > 0 && (
            <CountForm
              key={modal.id ?? 'new'}
              projectId={project.id}
              cultures={
                cultureId === 'all' || modal.type === 'editCount'
                  ? cultures
                  : cultures.filter((c) => c.id === cultureId)
              }
              counts={projectCounts}
              initial={modal.type === 'editCount' ? selectedCount : undefined}
              onSave={(c) =>
                mutate((d) => {
                  const i = d.counts.findIndex((x) => x.id === c.id);
                  if (i >= 0) d.counts[i] = c;
                  else d.counts.push(c);
                })
              }
            />
          )}
      </Modal>
      <Modal
        open={modal?.type === 'detail'}
        onClose={() => setModal(null)}
        title="计数详情"
        wide
      >
        {selectedCount && modal?.type === 'detail' && (
          <CountDetail
            count={selectedCount}
            culture={nameOf(selectedCount.cultureId)}
            onAction={(type) => setModal({ type, id: selectedCount.id })}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'treatment'}
        onClose={() => setModal(null)}
        title="添加处理记录"
      >
        {selectedCount && modal?.type === 'treatment' && (
          <TreatmentForm
            count={selectedCount}
            onSave={(t) =>
              mutate((d) =>
                d.counts
                  .find((c) => c.id === selectedCount.id)!
                  .treatments.push(t),
              )
            }
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'experiment'}
        onClose={() => setModal(null)}
        title="用于实验 · 保留计数快照"
      >
        {selectedCount && modal?.type === 'experiment' && (
          <ExperimentForm
            count={selectedCount}
            onSave={(e) =>
              mutate((d) => {
                d.experiments.push(e);
                d.counts
                  .find((c) => c.id === selectedCount.id)!
                  .treatments.push({
                    id: uid(),
                    at: e.at,
                    kind: '实验取样',
                    remove: e.used,
                    add: 0,
                    notes: e.name,
                    experimentId: e.id,
                  });
              })
            }
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'after'}
        onClose={() => setModal(null)}
        title={`${selectedExperiment?.name ?? ''} · 实验后计数`}
        wide
      >
        {selectedExperiment && modal?.type === 'after' && (
          <AfterForm
            experiment={selectedExperiment}
            onSave={(a) =>
              mutate((d) => {
                d.experiments.find(
                  (e) => e.id === selectedExperiment.id,
                )!.after = a;
              })
            }
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'export'}
        onClose={() => setModal(null)}
        title="导出细胞计数"
      >
        {modal?.type === 'export' && (
          <ExportPanel
            data={data}
            projectId={projectId}
            selectedCount={selectedCount}
            from={from}
            to={to}
            cultureId={cultureId}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'settings'}
        onClose={() => setModal(null)}
        title="同步与备份"
        wide
      >
        {modal?.type === 'settings' && (
          <BackupPanel
            data={data}
            loaded={loaded}
            updated={updated}
            googleDriveEnabled={googleDriveEnabled}
            onRestore={(d, source) => {
              setRestore(d);
              setRestoreSource(source);
              setModal({ type: 'restore' });
            }}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === 'restore'}
        onClose={() => setModal(null)}
        title="恢复记录"
        description="恢复后，当前数据会保存到历史版本中。"
      >
        {restore && (
          <>
            <p>来源：{restoreSource}</p>
            <div className="info-box">
              {restore.projects.length} 个项目 · {restore.cultures.length}{' '}
              个容器 · {restore.counts.length} 次计数 ·{' '}
              {restore.experiments.length} 个实验
            </div>
            <p>此操作将以这份记录替换当前工作数据。</p>
            <button
              disabled={busy}
              className="primary"
              onClick={async () => {
                try {
                  await save(restore);
                  setRestore(null);
                  setModal(null);
                  setProjectId('');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {busy ? '正在恢复…' : '确认恢复这份记录'}
            </button>
          </>
        )}
      </Modal>
    </main>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="chart-empty">
      <Database size={28} />
      <p>{text}</p>
    </div>
  );
}
function Metric({
  title,
  value,
  unit,
}: {
  title: string;
  value: string;
  unit: string;
}) {
  return (
    <article className="metric">
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{unit}</small>
    </article>
  );
}
function Trend({
  counts,
  cultures,
  metric,
  onSelect,
}: {
  counts: Count[];
  cultures: Culture[];
  metric: string;
  onSelect: (id: string) => void;
}) {
  const used = cultures.filter((c) => counts.some((x) => x.cultureId === c.id));
  const points = counts
    .toSorted((a, b) => a.at.localeCompare(b.at))
    .map((c) => {
      const s = stats(c.readings, c.basis);
      const v =
        metric === 'volume'
          ? remaining(c)
          : metric === 'estimated'
            ? s.live * volumeOf(c.container)
            : s[metric as 'live' | 'total' | 'dead' | 'viability'];
      return { time: Date.parse(c.at), id: c.id, [c.cultureId]: v };
    });
  return (
    <>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 15, right: 20, left: 5, bottom: 5 }}
          >
            <CartesianGrid
              stroke="#e4ebf1"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(n) =>
                new Date(n).toLocaleDateString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                })
              }
              tick={{ fontSize: 12, fill: '#6c7c8c' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={76}
              domain={metric === 'viability' ? [0, 100] : [0, 'auto']}
              tickFormatter={(n) =>
                Math.abs(n) >= 1e4
                  ? n.toExponential(1)
                  : String(Number(n.toFixed(2)))
              }
              tick={{ fontSize: 12, fill: '#6c7c8c' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(n) =>
                new Date(Number(n)).toLocaleString('zh-CN')
              }
              formatter={(v: unknown, name: unknown) => [
                metric === 'viability'
                  ? percent(Number(v))
                  : metric === 'volume'
                    ? `${Number(v)} mL`
                    : sci(Number(v)),
                String(name),
              ]}
            />
            {used.map((c, i) => (
              <Line
                key={c.id}
                type="linear"
                dataKey={c.id}
                name={c.name}
                stroke={palette[i % palette.length]}
                strokeWidth={2.5}
                connectNulls
                isAnimationActive={false}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null) return <g key={payload?.id} />;
                  return (
                    <circle
                      key={payload.id}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={palette[i % palette.length]}
                      stroke="white"
                      strokeWidth={2}
                      role="button"
                      tabIndex={0}
                      aria-label={`查看 ${dateLabel(new Date(payload.time).toISOString())} 的计数`}
                      onClick={() => onSelect(payload.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(payload.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                }}
                activeDot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {used.map((c, i) => (
          <span key={c.id}>
            <i style={{ background: palette[i % palette.length] }} />
            {c.name}
          </span>
        ))}
      </div>
      <p className="muted">
        {metric === 'volume'
          ? '体积包含该次计数后的已登记处理。'
          : metric === 'estimated'
            ? '按计数时的浓度 × 当时体积估算。'
            : metric === 'viability'
              ? '每次记录按其所选公式计算；详情中可查看。'
              : '各次计数的重复测量均值，单位 cells/mL。'}
      </p>
    </>
  );
}
function CountDetail({
  count: c,
  culture,
  onAction,
}: {
  count: Count;
  culture: string;
  onAction: (t: string) => void;
}) {
  const s = stats(c.readings, c.basis);
  let v = volumeOf(c.container);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{culture}</h2>
          <p className="muted">
            {new Date(c.at).toLocaleString('zh-CN')} · {c.passage} ·{' '}
            {c.container.type}
          </p>
        </div>
        <span className="pill">{c.readings.length} 次测量</span>
      </div>
      <div className="inline-stats">
        <span>
          Total <b>{sci(s.total)}</b>
        </span>
        <span>
          Live <b>{sci(s.live)}</b>
        </span>
        <span>
          Dead <b>{sci(s.dead)}</b>
        </span>
        <span>
          存活率 <b>{percent(s.viability)}</b>
        </span>
        <span>
          样本 SD <b>{sci(s.sd)}</b>
        </span>
        <span>
          Total CV <b>{percent(s.cv)}</b>
        </span>
      </div>
      <p className="muted">
        存活率：{c.basis === 'total' ? 'Live / Total' : 'Live / (Live + Dead)'}
        ，逐次计算后取均值。浓度单位 cells/mL。
      </p>
      <DataTable
        headers={['Slide', '读数', 'Total', 'Live', 'Dead', '存活率']}
        rows={c.readings.map((r) => [
          r.slide,
          r.reading,
          sci(value(r.total)),
          sci(value(r.live)),
          sci(value(r.dead)),
          percent(stats([r], c.basis).viability),
        ])}
      />
      <div className="info-box">
        计数时体积：{volumeOf(c.container)} mL · 剩余：{remaining(c)} mL
        <br />
        计数时估算活细胞总量：{sci(s.live * volumeOf(c.container))} cells
        {c.container.wells.length > 0 && (
          <p>
            {c.container.wells
              .map((w) => `${w.name}: ${w.volume} mL`)
              .join(' · ')}
          </p>
        )}
      </div>
      {c.notes && <p className="prewrap">{c.notes}</p>}
      <div className="section-heading">
        <h3>处理记录</h3>
        <button className="text-button" onClick={() => onAction('treatment')}>
          ＋ 添加处理
        </button>
      </div>
      {c.treatments.length ? (
        <DataTable
          headers={['时间', '操作', '移除', '添加', '剩余', '备注']}
          rows={c.treatments.map((t) => {
            v = v - t.remove + t.add;
            return [
              dateLabel(t.at),
              t.kind,
              `${t.remove} mL`,
              `${t.add} mL`,
              `${Number(v.toFixed(6))} mL`,
              t.notes,
            ];
          })}
        />
      ) : (
        <p className="muted">还没有处理记录。</p>
      )}
      <div className="form-footer">
        <div className="actions">
          <button className="secondary" onClick={() => onAction('editCount')}>
            修改计数
          </button>
          <button className="danger-button" onClick={() => onAction('deleteCount')}>
            <Trash2 size={16} />
            删除本次
          </button>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => onAction('export')}>
            <Download size={16} />
            导出本次
          </button>
          <button
            className="primary"
            disabled={remaining(c) <= 0}
            onClick={() => onAction('experiment')}
          >
            用于实验
          </button>
        </div>
      </div>
    </>
  );
}
function DeleteDialog({
  open,
  title,
  description,
  busy,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(value) => !value && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="danger-confirm"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? '正在删除…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
function ExperimentCard({
  experiment: e,
  culture,
  onAfter,
  onSource,
}: {
  experiment: Experiment;
  culture: string;
  onAfter: () => void;
  onSource: () => void;
}) {
  const b = stats(e.before.readings, e.before.basis),
    a = e.after ? stats(e.after.readings, e.after.basis) : null;
  const delta = (n: number | null) =>
    n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  const rows: React.ReactNode[][] = [
    [
      'Total 浓度',
      sci(b.total),
      sci(a?.total),
      a ? delta(change(b.total, a.total)) : '—',
    ],
    [
      'Live 浓度',
      sci(b.live),
      sci(a?.live),
      a ? delta(change(b.live, a.live)) : '—',
    ],
    [
      'Dead 浓度',
      sci(b.dead),
      sci(a?.dead),
      a ? delta(change(b.dead, a.dead)) : '—',
    ],
    [
      '存活率',
      percent(b.viability),
      a ? percent(a.viability) : '—',
      a?.viability != null && b.viability != null
        ? `${(a.viability - b.viability).toFixed(1)} 个百分点`
        : '—',
    ],
    [
      '估算活细胞总量',
      sci(b.live * e.used),
      a && e.after ? sci(a.live * e.after.volume) : '—',
      a && e.after
        ? delta(change(b.live * e.used, a.live * e.after.volume))
        : '—',
    ],
  ];
  return (
    <article className="panel experiment-card">
      <div className="section-heading">
        <div>
          <h2>{e.name}</h2>
          <p className="muted">
            {culture} · {dateLabel(e.at)} · 取用 {e.used} mL
          </p>
        </div>
        <span className={`pill ${e.after ? 'done' : ''}`}>
          {e.after ? '已完成' : '等待实验后结果'}
        </span>
      </div>
      <DataTable headers={['指标', '实验前', '实验后', '变化']} rows={rows} />
      {e.after && e.before.basis !== e.after.basis && (
        <p className="warning">
          前后使用了不同的存活率公式，请按相同定义解释百分比变化。
        </p>
      )}
      <p className="muted">
        浓度单位 cells/mL；实验前数据为创建实验时保留的快照。
        {e.after ? `实验后体积 ${e.after.volume} mL。` : ''}
      </p>
      {e.notes && <p className="prewrap">{e.notes}</p>}
      {e.after?.notes && <p className="prewrap">实验后：{e.after.notes}</p>}
      <div className="section-heading">
        <button className="text-button" onClick={onSource}>
          查看来源计数 →
        </button>
        <button className="primary" onClick={onAfter}>
          {e.after ? '查看 / 修改实验后读数' : '添加实验后计数'}
        </button>
      </div>
    </article>
  );
}
function ExportPanel({
  data,
  projectId,
  selectedCount,
  from,
  to,
  cultureId,
}: {
  data: Notebook;
  projectId: string;
  selectedCount?: Count;
  from: string;
  to: string;
  cultureId: string;
}) {
  const [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [scope, setScope] = useState(selectedCount ? 'single' : 'project'),
    [format, setFormat] = useState('xlsx'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const counts = data.counts.filter((c) =>
    scope === 'single'
      ? c.id === selectedCount?.id
      : (scope === 'all' || c.projectId === projectId) &&
        (scope === 'all' || cultureId === 'all' || c.cultureId === cultureId) &&
        (!start || localDate(c.at) >= start) &&
        (!end || localDate(c.at) <= end),
  );
  const name = `${data.projects.find((p) => p.id === projectId)?.name ?? 'CellNotebook'}_${localDate(new Date().toISOString())}`;
  return (
    <>
      <Field label="导出范围">
        <Choice
          label="导出范围"
          value={scope}
          onChange={setScope}
          options={[
            ...(selectedCount
              ? [{ value: 'single', label: '这一次计数（包含关联实验）' }]
              : []),
            { value: 'project', label: '当前项目 / 所选容器' },
            { value: 'all', label: '全部项目' },
          ]}
        />
      </Field>
      {scope !== 'single' && (
        <div className="form-grid">
          <Field label="开始日期">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="结束日期">
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field label="文件格式">
        <Choice
          label="文件格式"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'xlsx', label: 'Excel (.xlsx) · 完整多工作表' },
            { value: 'csv', label: 'CSV (.csv) · 每行一条原始读数' },
            { value: 'pdf', label: 'PDF 报告 · 打印 / 另存为 PDF' },
          ]}
        />
      </Field>
      <div className="info-box">
        将导出 <strong>{counts.length}</strong> 次计数和关联的处理、实验记录。
      </div>
      <p className="muted">
        Excel 包含 Summary、Count Sessions、Raw
        Measurements、Treatments、Experiments 五张表。PDF 包含趋势与主要数据。
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={
          busy || counts.length === 0 || Boolean(start && end && start > end)
        }
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            if (format === 'xlsx')
              await exportExcel(
                data,
                counts,
                name,
                scope === 'all' ? undefined : projectId,
              );
            else if (format === 'csv') exportCSV(data, counts, name);
            else exportPDF(data, counts, name);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={17} />
        {busy
          ? '正在生成…'
          : format === 'pdf'
            ? '打开 PDF 打印报告'
            : '下载文件'}
      </button>
    </>
  );
}
function BackupPanel({
  data,
  loaded,
  updated,
  googleDriveEnabled,
  onRestore,
}: {
  data: Notebook;
  loaded: boolean;
  updated: string;
  googleDriveEnabled: boolean;
  onRestore: (d: Notebook, source: string) => void;
}) {
  const [connected, setConnected] = useState(false),
    [configured, setConfigured] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [files, setFiles] = useState<DriveFile[]>([]);
  useEffect(() => {
    void fetch('/api/google/status', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as {
          configured?: boolean;
          connected?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || '无法读取连接状态');
        setConfigured(Boolean(result.configured));
        setConnected(Boolean(result.connected));
        if (result.connected) {
          const list = await fetch('/api/google/drive', { cache: 'no-store' });
          const body = (await list.json()) as {
            files?: DriveFile[];
            error?: string;
          };
          if (!list.ok) throw new Error(body.error || '无法读取 Drive 备份');
          setFiles(body.files ?? []);
        }
      })
      .catch((e) => setError(e.message));
  }, []);
  const listDrive = async () => {
    const response = await fetch('/api/google/drive', { cache: 'no-store' });
    const result = (await response.json()) as {
      files?: DriveFile[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || '无法读取 Drive 备份');
    return result.files ?? [];
  };
  const backupDrive = async () => {
    const response = await fetch('/api/google/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || '保存 Drive 备份失败');
  };
  const readDrive = async (id: string) => {
    const response = await fetch(
      `/api/google/drive?id=${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    );
    const result = (await response.json()) as {
      data?: unknown;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || '读取 Drive 备份失败');
    return validateNotebook(result.data);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="backup">
      <section>
        <h3>
          <Cloud size={19} />
          网页云端保存
        </h3>
        <p>
          计数和项目会保存到你的个人云端记录。在其他设备打开同一网址、登录同一账号即可读取。
        </p>
        <p className="muted">
          {updated
            ? `最近保存：${new Date(updated).toLocaleString('zh-CN')}`
            : '尚未读取数据'}
          。跨设备切换时点击顶部刷新按钮。
        </p>
      </section>
      <section>
        <h3>
          <Download size={19} />
          完整备份
        </h3>
        <p className="muted">
          JSON 备份包含所有项目、计数、处理与实验，可完整恢复。
        </p>
        <div className="actions">
          <button
            disabled={!loaded}
            className="secondary"
            onClick={() =>
              downloadFile(
                JSON.stringify(
                  {
                    app: 'CellNotebook',
                    exportedAt: new Date().toISOString(),
                    data,
                  },
                  null,
                  2,
                ),
                `CellNotebook-${localDate(new Date().toISOString())}.json`,
                'application/json',
              )
            }
          >
            <Download size={16} />
            下载备份
          </button>
          <label className="secondary upload-button">
            <Upload size={16} />
            读取备份
            <input
              type="file"
              accept=".json,application/json"
              disabled={!loaded || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  if (file.size > 3_000_000)
                    throw new Error('备份超过 3 MB，无法导入');
                  const json = JSON.parse(await file.text());
                  onRestore(validateNotebook(json.data ?? json), file.name);
                });
              }}
            />
          </label>
        </div>
      </section>
      {googleDriveEnabled && (
      <section>
        <h3>
          <Cloud size={19} />
          Google Drive 备份与读取
        </h3>
        <p>
          连接后，将完整数据保存到 Google Drive
          的应用专用备份目录。首次授权后，服务器会安全保存长期授权；以后打开网页会自动连接并续期。
        </p>
        <details>
          <summary>授权与隐私说明</summary>
          <p className="muted">
            应用只请求自己的 Drive 备份目录权限，不能浏览你的普通 Drive 文件。长期授权经加密后保存在服务器；断开时会删除保存的授权。
          </p>
        </details>
        <div className="actions">
          <a
            className="primary"
            aria-disabled={!loaded || busy || !configured}
            href={loaded && !busy && configured ? '/api/google/connect' : undefined}
          >
            {connected ? '重新授权 Google' : '连接 Google Drive'}
          </a>
          {connected && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await backupDrive();
                    setFiles(await listDrive());
                    setMessage('已保存一份新的 Google Drive 备份。');
                  })
                }
              >
                保存到 Drive
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => setFiles(await listDrive()))
                }
              >
                读取备份列表
              </button>
              <button
                className="text-button"
                onClick={() => {
                  void run(async () => {
                    const response = await fetch('/api/google/drive', {
                      method: 'DELETE',
                    });
                    const result = (await response.json()) as { error?: string };
                    if (!response.ok)
                      throw new Error(result.error || '断开 Google Drive 失败');
                    setConnected(false);
                    setFiles([]);
                    setMessage('已断开 Google Drive。');
                  });
                }}
              >
                断开
              </button>
            </>
          )}
        </div>
        {connected && (
          <div className="drive-files">
            {files.length ? (
              files.map((f) => (
                <div key={f.id}>
                  <span>
                    {new Date(f.modifiedTime).toLocaleString('zh-CN')}
                  </span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        onRestore(
                          await readDrive(f.id),
                          'Google Drive · ' + f.name,
                        ),
                      )
                    }
                  >
                    读取并预览 →
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">
                Drive 中还没有备份。可点击“保存到 Drive”。
              </p>
            )}
          </div>
        )}
        <p className="muted">
          Google Drive
          操作为手动备份和恢复；网页中的日常记录仍会自动保存到个人云端。正常情况下无需重复连接。
        </p>
        {!configured && (
          <p className="warning">Google Drive 持续连接正在完成服务器配置。</p>
        )}
      </section>
      )}
      {busy && <p role="status">正在处理…</p>}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

