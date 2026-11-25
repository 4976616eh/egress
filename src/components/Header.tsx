import { useRef } from 'react';
import { useProject } from '../store/useProject';
import { buildDemoSchool } from '../demo/demoSchool';
import { deserialize, serialize } from '../store/persist';
import { simRef } from '../store/simControl';
import { Btn } from './ui';
import egressIcon from '../assets/egress-icon.png';

export default function Header() {
  const mode = useProject((s) => s.mode);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = mode === 'run';

  const loadDemo = () => {
    if (!confirm('Да заредя демо сградата? Текущият проект ще бъде заменен.')) return;
    simRef.current = null;
    useProject.getState().loadProject({ ...buildDemoSchool(), backgrounds: [null] });
    useProject.getState().set({ view: '3d' });
  };
  const newProject = () => {
    if (!confirm('Нов празен проект? Текущият ще бъде изтрит.')) return;
    simRef.current = null;
    useProject.getState().newProject(80, 50);
  };
  const exportJson = () => {
    const s = useProject.getState();
    const data = serialize({ grid: s.grid, rooms: s.rooms, backgrounds: s.backgrounds, scenario: s.scenario, targetTime: s.targetTime, exitNames: s.exitNames });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'egress-proekt.json';
    document.body.appendChild(a); // some browsers ignore a click on a link that is not in the page
    a.click();
    a.remove();
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const importJson = async (f: File) => {
    try {
      simRef.current = null;
      useProject.getState().loadProject(deserialize(JSON.parse(await f.text())));
    } catch (e) {
      alert(`Файлът не може да бъде зареден.${e instanceof Error ? ` ${e.message}` : ''}`);
    }
  };

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 bg-surface px-4 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-plum after:to-transparent">
      <a href="#" title="Към началната страница" className="flex items-center gap-3">
        <img src={egressIcon} alt="" className="h-7 w-auto" />
        <div className="font-display text-lg font-bold tracking-tight text-ink">Egress</div>
      </a>
      <div className="flex-1" />
      <Btn variant="ghost" onClick={loadDemo} disabled={busy}>Демо сграда</Btn>
      <Btn variant="ghost" onClick={newProject} disabled={busy}>Нов проект</Btn>
      <Btn variant="ghost" onClick={exportJson} disabled={busy}>Експорт</Btn>
      <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Импорт</Btn>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
    </header>
  );
}
