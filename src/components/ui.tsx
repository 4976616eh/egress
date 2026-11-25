import type { ReactNode } from 'react';

export function Section({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-[1rem] font-semibold text-ink">
        {step !== undefined && (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-plum text-[11px] text-white">{step}</span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Btn({
  children, onClick, active, variant = 'default', className = '', disabled, title,
}: {
  children: ReactNode; onClick?: () => void; active?: boolean; variant?: 'default' | 'primary' | 'danger' | 'ghost';
  className?: string; disabled?: boolean; title?: string;
}) {
  const base = 'rounded-lg px-3 py-1.5 text-[1rem] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    default: active
      ? 'bg-accent text-white'
      : 'bg-raised text-ink ring-1 ring-line hover:bg-line',
    primary: 'bg-accent text-white hover:bg-accent-bright shadow-[0_0_24px_-6px_var(--color-accent)]',
    danger: 'bg-raised text-red-600 ring-1 ring-red-500/40 hover:bg-red-500/10',
    ghost: 'text-ink-dim hover:bg-raised hover:text-ink',
  }[variant];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function NumberField({ label, value, onChange, min = 0, max = 500 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[1rem]">
      <span className="text-ink-dim">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="w-20 rounded-md border border-line bg-raised px-2 py-1 text-right text-ink tabular-nums focus:border-accent focus:outline-none"
      />
    </label>
  );
}
