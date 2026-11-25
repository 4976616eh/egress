import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearLocal, downloadLocalCopy } from '../store/persist';
import { useProject } from '../store/useProject';
import { Btn } from './ui';

interface Props {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** When this changes, a shown error is cleared and the children are tried again. */
  resetKey?: unknown;
}

/** Keeps a rendering error from turning the whole page blank. */
export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/** Whole-app failure: the stored project is still in the browser, so offer to save it before anything is cleared. */
export function CrashScreen({ error }: { error: Error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-base p-6 text-ink">
      <div className="max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h1 className="font-display text-xl font-bold">Нещо се счупи</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Приложението срещна грешка и спря. Запазеният проект е непокътнат в този браузър. Свали копие, преди да правиш друго.
        </p>
        <p className="mt-2 break-words rounded-md bg-raised px-3 py-2 text-xs text-ink-dim">{error.message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => location.reload()}>Презареди</Btn>
          <Btn variant="ghost" onClick={() => downloadLocalCopy('current')}>Свали запазения проект</Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              if (!confirm('Запазеният проект ще бъде изтрит от браузъра. Свали го първо. Продължавам?')) return;
              clearLocal();
              location.reload();
            }}
          >
            Изтрий и започни отначало
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** 3D failed (often WebGL), the editor still works. */
export function ViewCrash() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm rounded-xl bg-surface p-5 text-center shadow">
        <p className="text-sm text-ink">3D изгледът не може да се покаже (проблем с WebGL или с изобразяването). Редакторът и симулацията работят в 2D.</p>
        <Btn className="mt-3" onClick={() => useProject.getState().set({ view: '2d' })}>Към 2D</Btn>
      </div>
    </div>
  );
}
