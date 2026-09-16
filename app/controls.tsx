'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Container,
  Reading,
  Scientific,
  containerTypes,
  wellNames,
  volumeOf,
  stats,
  sci,
  percent,
} from '@/lib/model';
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
    >
      <SelectTrigger className="choice" aria-label={label}>
        <SelectValue>
          {options
            .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
            .find((o) => o.value === value)?.label || '请选择'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const x = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <SelectItem key={x.value} value={x.value}>
              {x.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`modal ${wide ? 'wide' : ''}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || '填写后保存到你的细胞培养记录。'}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Numeric({
  value,
  onChange,
  min = 0,
  max,
  step = 'any',
  label,
  required = true,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  label?: string;
  required?: boolean;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      inputMode="decimal"
      required={required}
      min={min}
      max={max}
      step={step}
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) =>
        onChange(e.target.value === '' ? NaN : Number(e.target.value))
      }
    />
  );
}
export const newReading = (slide = 1, reading = 1): Reading => ({
  slide,
  reading,
  total: { m: NaN, e: 6 },
  live: { m: NaN, e: 6 },
  dead: { m: NaN, e: 6 },
});
export const firstReadings = () => [newReading(), newReading(1, 2)];
function SciInput({
  value,
  onChange,
  label,
}: {
  value: Scientific;
  onChange: (v: Scientific) => void;
  label: string;
}) {
  return (
    <div className="sci-input">
      <Numeric
        label={`${label} 系数`}
        value={value.m}
        onChange={(m) => onChange({ ...value, m })}
      />
      <span>×10</span>
      <Numeric
        label={`${label} 指数`}
        value={value.e}
        onChange={(e) => onChange({ ...value, e })}
        min={-6}
        max={12}
        step={1}
      />
    </div>
  );
}
export function ReadingsEditor({
  readings,
  onChange,
  basis,
  onBasis,
}: {
  readings: Reading[];
  onChange: (rs: Reading[]) => void;
  basis: 'liveDead' | 'total';
  onBasis: (b: 'liveDead' | 'total') => void;
}) {
  const slides = [...new Set(readings.map((r) => r.slide))];
  const valid = readings.every((r) =>
      [r.total, r.live, r.dead].every(
        (n) => Number.isFinite(n.m) && Number.isFinite(n.e),
      ),
    ),
    s = valid ? stats(readings, basis) : null;
  return (
    <section className="readings">
      <div className="section-heading">
        <div>
          <h3>Slide 读数</h3>
          <p className="muted">
            浓度单位：cells/mL。每张 slide 至少两次；零值请填 0。
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const n = Math.max(...slides) + 1;
            onChange([...readings, newReading(n, 1), newReading(n, 2)]);
          }}
        >
          <Plus size={16} />
          添加 Slide
        </button>
      </div>
      {slides.map((slide) => (
        <div className="slide-block" key={slide}>
          <div className="section-heading">
            <strong>Slide {slide}</strong>
            <div className="actions">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onChange([
                    ...readings,
                    newReading(
                      slide,
                      Math.max(
                        ...readings
                          .filter((r) => r.slide === slide)
                          .map((r) => r.reading),
                      ) + 1,
                    ),
                  ])
                }
              >
                ＋ 追加读数
              </button>
              {slides.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除 Slide ${slide}`}
                  onClick={() =>
                    onChange(readings.filter((r) => r.slide !== slide))
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="reading-head">
            <span>次数</span>
            <span>Total</span>
            <span>Live</span>
            <span>Dead</span>
            <span />
          </div>
          {readings.map(
            (r, i) =>
              r.slide === slide && (
                <div className="reading-row" key={`${r.slide}-${r.reading}`}>
                  <span>#{r.reading}</span>
                  {(['total', 'live', 'dead'] as const).map((k) => (
                    <div key={k}>
                      <span className="mobile-label">{k}</span>
                      <SciInput
                        label={`Slide ${slide} 读数 ${r.reading} ${k}`}
                        value={r[k]}
                        onChange={(n) =>
                          onChange(
                            readings.map((rr, j) =>
                              j === i ? { ...rr, [k]: n } : rr,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`移除 Slide ${slide} 读数 ${r.reading}`}
                    disabled={
                      readings.filter((r) => r.slide === slide).length <= 2
                    }
                    onClick={() => onChange(readings.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ),
          )}
        </div>
      ))}
      <Field label="存活率计算">
        <Choice
          label="存活率计算"
          value={basis}
          onChange={(b) => onBasis(b as 'liveDead' | 'total')}
          options={[
            { value: 'liveDead', label: 'Live ÷ (Live + Dead)' },
            { value: 'total', label: 'Live ÷ Total' },
          ]}
        />
      </Field>
      {s && (
        <div className="inline-stats">
          <span>
            Mean Total <b>{sci(s.total)}</b>
          </span>
          <span>
            Mean Live <b>{sci(s.live)}</b>
          </span>
          <span>
            Mean Dead <b>{sci(s.dead)}</b>
          </span>
          <span>
            平均存活率 <b>{percent(s.viability)}</b>
          </span>
          <span>
            Total CV <b>{percent(s.cv)}</b>
          </span>
        </div>
      )}
      {s?.cv != null && s.cv > 10 && (
        <p className="warning">
          这组 Total 读数的 CV 超过 10%，请检查原始读数。
        </p>
      )}
      {valid &&
        readings.some(
          (r) =>
            Math.abs(
              r.total.m * 10 ** r.total.e -
                (r.live.m * 10 ** r.live.e + r.dead.m * 10 ** r.dead.e),
            ) >
            Math.max(1, r.total.m * 10 ** r.total.e) * 0.05,
        ) && (
          <p className="warning">
            部分 Total 与 Live + Dead 相差超过
            5%，请核对仪器定义或读数。原始数据会完整保留。
          </p>
        )}
    </section>
  );
}
export function ContainerEditor({
  value,
  onChange,
}: {
  value: Container;
  onChange: (c: Container) => void;
}) {
  const [perWell, setPerWell] = useState(2);
  const names = wellNames(value.type);
  return (
    <section>
      <div className="form-grid">
        <Field label="容器类型">
          <Choice
            label="容器类型"
            value={value.type}
            options={containerTypes}
            onChange={(type) => onChange({ ...value, type, wells: [] })}
          />
        </Field>
        {names.length === 0 ? (
          <Field label="培养液总体积（mL）">
            <Numeric
              value={value.volume}
              onChange={(volume) => onChange({ ...value, volume })}
              min={0.000001}
            />
          </Field>
        ) : (
          <Field label="新选择孔的默认体积（mL）">
            <Numeric value={perWell} min={0.000001} onChange={setPerWell} />
          </Field>
        )}
      </div>
      {names.length > 0 && (
        <>
          <div className="section-heading">
            <p className="muted">点击选择使用的孔；每个孔可单独填写体积。</p>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onChange({
                  ...value,
                  wells: names.map((name) => ({ name, volume: perWell })),
                })
              }
            >
              选择全部
            </button>
          </div>
          <div
            className="well-grid"
            style={{
              gridTemplateColumns: `repeat(${names.length === 6 ? 3 : names.length === 12 ? 4 : names.length === 24 ? 6 : names.length === 48 ? 8 : 12},1fr)`,
            }}
          >
            {names.map((name) => (
              <button
                type="button"
                key={name}
                aria-pressed={value.wells.some((w) => w.name === name)}
                className={
                  value.wells.some((w) => w.name === name) ? 'selected' : ''
                }
                onClick={() =>
                  onChange({
                    ...value,
                    wells: value.wells.some((w) => w.name === name)
                      ? value.wells.filter((w) => w.name !== name)
                      : [...value.wells, { name, volume: perWell }],
                  })
                }
              >
                {name}
              </button>
            ))}
          </div>
          <div className="well-inputs">
            {value.wells.map((w) => (
              <Field key={w.name} label={`${w.name} · mL`}>
                <Numeric
                  value={w.volume}
                  min={0.000001}
                  onChange={(volume) =>
                    onChange({
                      ...value,
                      wells: value.wells.map((x) =>
                        x.name === w.name ? { ...x, volume } : x,
                      ),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <p className="volume-summary">
            已选 {value.wells.length} / {names.length} 孔 · 总体积{' '}
            <strong>{Number(volumeOf(value).toFixed(4))} mL</strong>
          </p>
        </>
      )}
    </section>
  );
}
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h, i) => (
            <TableHead key={i}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((v, j) => (
              <TableCell key={j}>{v}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

