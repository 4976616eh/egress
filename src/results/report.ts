import type { SimResults } from './metrics';
import { DISASTERS, fmtTime } from '../components/labels';
import { floorName } from '../sim/floors';
import { verticalSpreadDescription } from '../hazards/vertical';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Builds a self-contained, printable HTML report of a simulation's results. */
export function buildReportHtml(r: SimResults, target: number, snapshot?: string | null): string {
  const ok = r.trapped === 0 && r.totalTime <= target;
  const date = new Date().toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' });
  const stamp = new Date().toLocaleString('bg-BG');
  const m = r.meta;
  const sortedRooms = [...r.rooms].sort((a, b) => (b.time ?? Infinity) - (a.time ?? Infinity));

  const recommendationsHtml = r.recommendations.length
    ? `<ol class="rec">${r.recommendations.map((rec) => `<li>${esc(rec.text)}</li>`).join('')}</ol>`
    : '<p class="muted">Няма препоръки - резултатът е в рамките на целта.</p>';

  const exitsHtml = r.exits
    .map(
      (e) => `
      <div class="exit-row">
        <div class="exit-label"><span>${esc(e.name)}</span><span class="muted">${e.count} души · ${Math.round(e.share * 100)}%</span></div>
        <div class="bar"><div class="bar-fill ${e.share > 0.5 ? 'bar-danger' : ''}" style="width:${Math.round(e.share * 100)}%"></div></div>
      </div>`,
    )
    .join('');

  const snapshotHtml = snapshot
    ? `<h2>Моментна снимка от симулацията</h2><img src="${snapshot}" alt="Изглед от симулацията" class="snapshot" />`
    : '';

  const multiFloor = sortedRooms.some((x) => x.floor > 0);
  const roomsHtml = sortedRooms
    .map(
      (x) => `
      <tr>
        <td>${esc(x.name)}${multiFloor ? ` <span class="muted">${esc(floorName(x.floor))}</span>` : ''}</td>
        <td class="num">${x.evacuated}/${x.people}</td>
        <td class="num ${x.time === null ? 'danger' : ''}">${x.time === null ? '-' : fmtTime(x.time)}</td>
        <td>${esc(x.exitName)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="UTF-8" />
<title>Egress - отчет от симулация</title>
<style>
  :root { --accent: #55868c; --plum: #9c528b; --ink: #1d1e2c; --dim: #696c80; --line: #d7dfe8; --base: #e5ecf4; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background: var(--base); margin: 0; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 32px 80px; line-height: 1.5; background: #fff; }
  @media print { body { background: #fff; } .page { padding: 0 24px; } }
  header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 3px solid var(--plum); padding-bottom: 16px; margin-bottom: 28px; }
  h1 { font-size: 22px; margin: 0; }
  .date { color: var(--dim); font-size: 14px; }
  .hero { border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; background: ${ok ? '#e7f0ef' : '#fef2f2'}; }
  .hero .label { text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; color: var(--dim); }
  .hero .time { font-size: 48px; font-weight: 800; margin: 4px 0; }
  .hero .time-note { font-size: 13px; color: var(--dim); margin-top: -4px; margin-bottom: 4px; }
  .hero .status { font-weight: 600; color: ${ok ? '#355458' : '#b91c1c'}; }
  .stats { display: flex; gap: 16px; margin-bottom: 28px; }
  .stat { flex: 1; border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; }
  .stat .label { font-size: 12px; color: var(--dim); }
  .stat .value { font-size: 24px; font-weight: 700; }
  h2 { font-size: 15px; margin: 0 0 12px; padding-top: 24px; border-top: 1px solid var(--line); }
  .rec { margin: 0; padding-left: 20px; }
  .rec li { margin-bottom: 8px; }
  .muted { color: var(--dim); font-size: 13px; }
  .exit-row { margin-bottom: 10px; }
  .exit-label { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px; }
  .bar { height: 8px; background: #f1f1f4; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); }
  .bar-fill.bar-danger { background: #ef4444; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
  th { text-align: left; font-size: 12px; color: var(--dim); font-weight: 500; padding: 0 16px 6px 0; }
  th.num, td.num { text-align: right; }
  th:last-child, td:last-child { padding-right: 0; }
  td { padding: 6px 16px 6px 0; border-top: 1px solid var(--line); }
  th:nth-child(1), td:nth-child(1) { width: 22%; }
  th:nth-child(2), td:nth-child(2) { width: 20%; }
  th:nth-child(3), td:nth-child(3) { width: 20%; }
  th:nth-child(4), td:nth-child(4) { width: 38%; }
  td.danger { color: #b91c1c; font-weight: 600; }
  footer { margin-top: 40px; color: var(--dim); font-size: 12px; }
  .kv { display: grid; grid-template-columns: 230px 1fr; gap: 4px 16px; font-size: 14px; margin: 0; }
  .kv dt { color: var(--dim); }
  .kv dd { margin: 0; }
  .snapshot { width: 100%; border-radius: 12px; border: 1px solid var(--line); display: block; margin-bottom: 4px; }
  .print-btn { position: fixed; top: 24px; right: 24px; background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px 16px; font-size: 14px; cursor: pointer; font-family: inherit; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Принтирай / Запази като PDF</button>
  <div class="page">
    <header>
      <h1>Egress - отчет от евакуационна симулация</h1>
      <span class="date">${date}</span>
    </header>

    <div class="hero">
      <div class="label">${esc(DISASTERS[r.disaster].label)} · ${r.trapped > 0 ? 'евакуацията не е пълна' : 'общо време за евакуация'}</div>
      <div class="time">${r.evacuated > 0 ? fmtTime(r.totalTime) : 'няма излезли'}</div>
      ${r.trapped > 0 && r.evacuated > 0 ? '<div class="time-note">(последният излязъл)</div>' : ''}
      <div class="status">
        Цел ${fmtTime(target)} ·
        ${r.trapped > 0 ? `${r.trapped} души не излязоха` : ok ? 'в рамките на целта' : `над целта с ${fmtTime(r.totalTime - target)}`}
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Евакуирани</div><div class="value">${r.evacuated}/${r.total}</div></div>
      <div class="stat"><div class="label">Неевакуирани</div><div class="value" style="${r.trapped ? 'color:#b91c1c' : ''}">${r.trapped}</div></div>
    </div>

    ${snapshotHtml}

    <h2>Препоръки</h2>
    ${recommendationsHtml}

    <h2>Натоварване на изходите</h2>
    ${exitsHtml}

    <h2>Стаи</h2>
    <table>
      <thead><tr><th>Стая</th><th class="num">Хора</th><th class="num">Време</th><th>Изход</th></tr></thead>
      <tbody>${roomsHtml}</tbody>
    </table>

    <h2>Параметри на сценария</h2>
    <dl class="kv">
      <dt>Бедствие</dt><dd>${esc(DISASTERS[r.disaster].label)}</dd>
      <dt>Начална точка</dt><dd>${esc(m.origin)}</dd>
      <dt>Скорост на разпространение</dt><dd>${m.spreadSpeed.toFixed(1)}×</dd>
      <dt>Етажи</dt><dd>${m.floors}</dd>
      <dt>Разпространение между етажите</dt><dd>${esc(verticalSpreadDescription(r.disaster, m.spreadSpeed, m.floors))}</dd>
      <dt>Хора</dt><dd>${r.total} (деца ${m.children}, възрастни ${m.adults}, с намалена подвижност ${m.reduced})</dd>
      <dt>Целево време</dt><dd>${fmtTime(target)}</dd>
      <dt>Seed (същият пуск може да се повтори)</dt><dd>${m.seed}</dd>
      <dt>Генериран</dt><dd>${esc(stamp)}</dd>
    </dl>



    <footer>Генерирано от Egress - симулация на евакуация.</footer>
  </div>
</body>
</html>`;
}

/** Grabs whatever the 2D/3D view is currently showing (heatmap, final positions) as a PNG. */
function captureSnapshot(): string | null {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null; // a tainted canvas can't be read back - report still works without the image
  }
}

/** Opens the report as a live page in a new tab, with a snapshot of the simulation embedded. */
export function openReport(r: SimResults, target: number) {
  const html = buildReportHtml(r, target, captureSnapshot());
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked - fall back to a download so the report isn't lost.
    const a = document.createElement('a');
    a.href = url;
    a.download = 'egress-otchet.html';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
