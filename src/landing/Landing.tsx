import { useEffect, useRef, useState, type ReactNode } from 'react';
import egressIcon from '../assets/egress-icon.png';
import HeroSim from './HeroSim';
import './landing.css';

/**
 * Demo video. Put a file in `public/` (e.g. '/demo.mp4') or paste a YouTube/Vimeo embed link
 * (e.g. 'https://www.youtube.com/embed/VIDEO_ID'). While empty, a placeholder is shown.
 */
const DEMO_VIDEO_URL = '/demo-v2.mp4';

/** Adds `.in` to every `.lp-reveal` element once it scrolls into view. */
function useReveal(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll('.lp-reveal') ?? [];
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

function CountUp({ to, prefix = '' }: { to: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(to);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 1400);
        setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{prefix}{v}</span>;
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`lp-reveal ${className}`} style={{ ['--d' as string]: `${delay}s` }}>
      {children}
    </div>
  );
}

function OpenBtn({ onOpen, big, children }: { onOpen: () => void; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`lp-sheen group inline-flex items-center gap-2 rounded-xl bg-accent font-semibold text-white shadow-[0_10px_30px_-8px_var(--color-accent)] transition hover:-translate-y-0.5 hover:bg-accent-bright active:translate-y-0 ${
        big ? 'px-7 py-4 text-lg' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
      <svg viewBox="0 0 24 24" className={big ? 'h-5 w-5' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" className="transition group-hover:translate-x-0.5" />
      </svg>
    </button>
  );
}

const STEPS = [
  { n: 1, title: 'Начертай сградата', text: 'Качи снимка на евакуационния план и го обходи със стени, врати, изходи и стълби. Или рисувай от нулата.', icon: 'M3 5h18v14H3zM3 12h8M11 5v14M16 9h2M16 15h2' },
  { n: 2, title: 'Засели я с хора', text: 'За всяка стая задай възрастни, деца и хора с намалена подвижност. Всеки става самостоятелен агент.', icon: 'M12 8a3 3 0 100-6 3 3 0 000 6zM5 21v-2a5 5 0 015-5h4a5 5 0 015 5v2' },
  { n: 3, title: 'Избери бедствие', text: 'Пожар, земетресение, наводнение или газ. Влачиш началната точка и избираш колко бързо се развива.', icon: 'M12 2c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z' },
  { n: 4, title: 'Виж и поправи', text: 'Топлинна карта, време по стаи и препоръки с бутон „Приложи“. Пускаш отново и виждаш разликата.', icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
];

const FEATURES = [
  { t: '3D сграда от чертежа', d: 'Стените се издигат автоматично. Върти, увеличавай, следи клас или срежи стените.', i: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7' },
  { t: 'Препоръки с „Приложи“', d: 'Не само диагноза: нов изход край най-проблемната стая или по-широк проход - с едно кликване и отмяна.', i: 'M5 12l5 5L20 7' },
  { t: 'Методът „Монте Карло“', d: '20, 50 или 100 учения наведнъж: средно, най-лошо време и най-рискови стаи. Най-лошият случай се пуска на живо.', i: 'M4 20h16M7 20V10M12 20V4M17 20v-7' },
  { t: 'Четири бедствия', d: 'Различна механика за всяко: огън и дим, отломки и вторични трусове, вода, невидим газ.', i: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  { t: 'Всичко в браузъра', d: 'Без сървър и без вход. Планът на сградата не напуска компютъра ти; проектите се пазят локално и се експортират.', i: 'M3 12a9 9 0 1018 0 9 9 0 00-18 0zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18' },
  { t: 'Отчет за печат', d: 'Страница с резултатите и снимка на симулацията, готова за печат като PDF.', i: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6' },
];

export default function Landing({ onOpen }: { onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const demoVideo = useRef<HTMLVideoElement>(null);
  useReveal(root);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  const isEmbed = /youtube\.com|youtu\.be|vimeo\.com/.test(DEMO_VIDEO_URL);

  return (
    <div ref={root} className="lp relative min-h-full overflow-x-clip bg-base text-ink">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-line/60 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <a href="#top" className="flex items-center gap-2.5">
            <img src={egressIcon} alt="" className="h-8 w-auto" />
            <span className="font-display text-xl font-bold tracking-tight">Egress</span>
          </a>
          <div className="ml-6 hidden items-center gap-6 text-sm font-medium text-ink-dim md:flex">
            <a href="#how" className="transition hover:text-ink">Как работи</a>
            <a href="#hazards" className="transition hover:text-ink">Бедствия</a>
            <a href="#demo" className="transition hover:text-ink">Демо</a>
            <a href="#features" className="transition hover:text-ink">Възможности</a>
          </div>
          <div className="flex-1" />
          <OpenBtn onOpen={onOpen}>Отвори симулацията</OpenBtn>
        </div>
      </nav>

      {/* Hero */}
      <header id="top" className="relative isolate overflow-hidden">
        <div className="lp-grid absolute inset-0 -z-10" />
        <div className="lp-blob -left-24 top-10 -z-10 h-80 w-80 bg-accent-bright" />
        <div className="lp-blob -right-20 top-40 -z-10 h-96 w-96 bg-plum/60" style={{ animationDelay: '-6s' }} />
        <div className="lp-blob bottom-0 left-1/3 -z-10 h-64 w-64 bg-amber-300/60" style={{ animationDelay: '-11s' }} />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-medium text-ink-dim shadow-sm ring-1 ring-black/5">
                <span className="lp-blink h-2 w-2 rounded-full bg-accent" />
                Симулация на евакуация · работи в браузъра
              </span>
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                Безопасността не трябва да е{' '}
                <span className="lp-shimmer">предположение.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-dim">
                Egress пуска стотици виртуални евакуации на всяка сграда - при пожар, земетресение, наводнение или газ - и показва къде хората заседават и какво да се промени.
              </p>
            </Reveal>
            <Reveal delay={0.3} className="mt-9 flex flex-wrap items-center gap-4">
              <OpenBtn onOpen={onOpen} big>Отвори симулацията</OpenBtn>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-6 py-4 text-lg font-semibold text-ink shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:bg-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-plum" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Гледай демото
              </a>
            </Reveal>
            <Reveal delay={0.4} className="mt-8 flex items-center gap-3 text-sm text-ink-dim">
              <div className="flex -space-x-1.5">
                {['#2563eb', '#f59e0b', '#a855f7', '#ef4444', '#16a34a'].map((c, i) => (
                  <span key={c} className="lp-float h-5 w-5 rounded-full ring-2 ring-base" style={{ background: c, ['--d' as string]: `${i * 0.3}s` }} />
                ))}
              </div>
              Всеки човек е самостоятелен агент, който търси най-близкия безопасен изход.
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <HeroSim />
          </Reveal>
        </div>
      </header>

      {/* Stats */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-10 md:grid-cols-4">
          {[
            { v: <CountUp to={4} />, l: 'вида бедствия' },
            { v: <CountUp to={334} />, l: 'души в демо сградата' },
            { v: <CountUp to={4} prefix="~" />, l: 'секунди за 50 учения' },
            { v: <CountUp to={0} />, l: 'сървъра - всичко е в браузъра' },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.1} className="text-center">
              <div className="font-display text-5xl font-bold tabular-nums text-accent">{s.v}</div>
              <div className="mt-1 text-sm text-ink-dim">{s.l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">Едно учение. Нула данни.</h2>
          <p className="mt-4 text-lg text-ink-dim">Реалното учение е рядко, стресиращо и почти нищо не измерва. Тъкмо когато е най-важно, не го репетираме.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { t: 'Няма измерими отговори', d: 'След учението знаем „минахме за няколко минути“, но не къде се образува опашка и коя стая излиза последна.' },
            { t: 'Само лесните случаи', d: 'Никой не репетира земетресение с блокирана стълба, наводнение, газ или затворен изход.' },
            { t: 'Промените не се проверяват', d: 'Нов изход или преместена врата - помага ли? Без ново учение, което прекъсва часовете, няма как да разберем.' },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.12}>
              <div className="h-full rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 font-display text-lg font-bold text-red-600">{i + 1}</div>
                <h3 className="font-display text-xl font-bold">{c.t}</h3>
                <p className="mt-2 leading-relaxed text-ink-dim">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold tracking-tight">От чертеж до отговор за минути</h2>
            <p className="mt-4 text-lg text-ink-dim">Не е нужен инженер. Резултатът е на разбираем език.</p>
          </Reveal>
          <div className="relative mt-14 grid gap-8 md:grid-cols-4">
            <Reveal className="absolute left-[12%] right-[12%] top-7 hidden md:block">
              <div className="lp-line h-0.5 bg-gradient-to-r from-accent via-plum to-accent" />
            </Reveal>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.15} className="relative text-center">
                <div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright text-white shadow-lg shadow-accent/30">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                  <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-plum text-xs font-bold ring-2 ring-surface">{s.n}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Hazards */}
      <section id="hazards" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">Платформа, не единичен сценарий</h2>
          <p className="mt-4 text-lg text-ink-dim">Един и същ план, четири различни бедствия. Смени с едно кликване.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Fire */}
          <Reveal>
            <HazardCard title="Пожар" text="Разпространява се клетка по клетка. Димът забавя хората, огънят блокира коридори и изходи." tint="from-orange-100 to-amber-50">
              <div className="relative flex h-full items-end justify-center gap-1 pb-3">
                {[{ w: 38, h: 80, d: 0 }, { w: 50, h: 112, d: 0.25 }, { w: 36, h: 68, d: 0.5 }].map((f, i) => (
                  <div key={i} className="lp-flame rounded-[50%_50%_45%_45%/70%_70%_30%_30%] bg-[radial-gradient(circle_at_50%_70%,#fde047,#f97316_55%,#dc2626)]" style={{ width: f.w, height: f.h, animationDelay: `${f.d}s` }} />
                ))}
              </div>
            </HazardCard>
          </Reveal>
          {/* Earthquake */}
          <Reveal delay={0.1}>
            <HazardCard title="Земетресение" text="Падни, прикрий се, задръж. После отломки на случайни места и вторични трусове - понякога затварят цяла стая." tint="from-stone-200 to-amber-50">
              <div className="lp-shake flex h-full items-end justify-center gap-1.5 pb-3">
                {[50, 78, 60, 90, 54].map((h, i) => (
                  <div key={i} className="w-9 rounded-t bg-stone-500/70" style={{ height: h }}>
                    <div className="mx-auto mt-2 h-1.5 w-3 rounded bg-white/50" />
                  </div>
                ))}
                <svg viewBox="0 0 60 40" className="absolute right-6 top-4 h-12 w-16 text-stone-700" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 4l14 10-8 6 16 8-6 8" /></svg>
              </div>
            </HazardCard>
          </Reveal>
          {/* Flood */}
          <Reveal delay={0.2}>
            <HazardCard title="Наводнение" text="Водата се покачва и дълбоката вода е непроходима. Хората търсят път нагоре." tint="from-sky-100 to-cyan-50">
              <div className="absolute inset-x-0 bottom-0 h-24 overflow-hidden">
                <svg viewBox="0 0 400 60" className="lp-wave slow absolute bottom-0 left-0 h-20 w-[200%] text-sky-400/50" preserveAspectRatio="none" fill="currentColor"><path d="M0 30 Q50 5 100 30 T200 30 T300 30 T400 30 V60 H0z" /></svg>
                <svg viewBox="0 0 400 60" className="lp-wave absolute bottom-0 left-0 h-16 w-[200%] text-sky-500/60" preserveAspectRatio="none" fill="currentColor"><path d="M0 34 Q50 12 100 34 T200 34 T300 34 T400 34 V60 H0z" /></svg>
              </div>
            </HazardCard>
          </Reveal>
          {/* Gas */}
          <Reveal delay={0.3}>
            <HazardCard title="Изтичане на газ" text="Невидима зона, която се разширява. Изходите в нея стават опасни и хората се пренасочват." tint="from-emerald-100 to-lime-50">
              <div className="relative h-full">
                {[
                  { x: '18%', y: '28%', s: 70, d: 0 },
                  { x: '46%', y: '48%', s: 86, d: 1 },
                  { x: '66%', y: '18%', s: 60, d: 2 },
                  { x: '30%', y: '60%', s: 52, d: 3 },
                ].map((b, i) => (
                  <div key={i} className="lp-drift absolute rounded-full bg-emerald-500/50 blur-md" style={{ left: b.x, top: b.y, width: b.s, height: b.s, ['--d' as string]: `${b.d * -1}s` }} />
                ))}
              </div>
            </HazardCard>
          </Reveal>
        </div>
      </section>

      {/* Demo video */}
      <section id="demo" className="relative isolate overflow-hidden bg-ink py-24 text-white">
        <div className="lp-blob -left-20 top-0 -z-10 h-72 w-72 bg-accent" />
        <div className="lp-blob -right-10 bottom-0 -z-10 h-80 w-80 bg-plum/70" style={{ animationDelay: '-8s' }} />
        <div className="mx-auto max-w-5xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold tracking-tight">Вижте го в действие</h2>
            <p className="mt-4 text-lg text-white/70">Три минути: от плана до решението, което намалява времето за евакуация.</p>
          </Reveal>
          <Reveal delay={0.15} className="mt-12">
            <div className="overflow-hidden rounded-2xl bg-white/5 shadow-2xl ring-1 ring-white/15 backdrop-blur">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 text-xs text-white/50">egress - демонстрация</span>
              </div>
              <div className="relative aspect-video w-full bg-gradient-to-br from-ink via-[#26283d] to-ink">
                {DEMO_VIDEO_URL ? (
                  isEmbed ? (
                    <iframe src={DEMO_VIDEO_URL} title="Демонстрация на Egress" className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                  ) : (
                    <video
                      ref={demoVideo}
                      src={DEMO_VIDEO_URL}
                      controls
                      muted
                      playsInline
                      preload="none"
                      poster="/demo-poster-v2.jpg"
                      onVolumeChange={() => {
                        const video = demoVideo.current;
                        if (video && (!video.muted || video.volume !== 0)) {
                          video.muted = true;
                          video.volume = 0;
                        }
                      }}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="lp-grid absolute inset-0 opacity-30" />
                    <div className="relative text-center">
                      <div className="lp-ring relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-white text-accent shadow-xl">
                        <svg viewBox="0 0 24 24" className="ml-1 h-10 w-10" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                      <div className="mt-6 font-display text-xl font-bold">Тук ще се появи демонстрационното видео</div>
                      <div className="mt-1 text-sm text-white/50">16:9 · добавете файла в src/landing/Landing.tsx (DEMO_VIDEO_URL)</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">Отговорите, които учението не дава</h2>
          <p className="mt-4 text-lg text-ink-dim">Колко време? Къде е тясното място? Коя стая е в опасност? Какво да променим?</p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 0.1}>
              <div className="group h-full rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:ring-accent/30">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={f.i} /></svg>
                </div>
                <h3 className="font-display text-xl font-bold">{f.t}</h3>
                <p className="mt-2 leading-relaxed text-ink-dim">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10">
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm font-medium text-ink-dim">
            {['Многоизточников Dijkstra', 'Агентен модел', 'Детерминистични seed-ове', 'Web Workers', 'React + Three.js', 'Без бекенд'].map((t) => (
              <span key={t} className="rounded-full bg-surface px-3.5 py-1.5 ring-1 ring-black/5">{t}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="px-5 pb-24">
        <Reveal>
          <div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-[#4a7b81] to-plum p-12 text-center text-white shadow-2xl shadow-accent/30 sm:p-16">
            <div className="lp-blob -left-10 -top-10 -z-10 h-56 w-56 bg-white/40" />
            <div className="lp-blob -bottom-16 right-0 -z-10 h-64 w-64 bg-amber-300/40" style={{ animationDelay: '-7s' }} />
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Пуснете първото си виртуално учение</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">Демо сградата е заредена и готова. Изберете бедствие и натиснете „Старт“.</p>
            <button
              type="button"
              onClick={onOpen}
              className="lp-sheen mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-bold text-accent shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
            >
              Отвори симулацията
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-8 text-sm text-ink-dim">
          <img src={egressIcon} alt="" className="h-6 w-auto" />
          <span className="font-display font-bold text-ink">Egress</span>
          <span>· git-happens · JA Hack 2026</span>
          <div className="flex-1" />
          <a href="#top" className="transition hover:text-ink">Нагоре ↑</a>
          <button type="button" onClick={onOpen} className="font-semibold text-accent transition hover:text-accent-bright">Отвори симулацията →</button>
        </div>
      </footer>
    </div>
  );
}

function HazardCard({ title, text, tint, children }: { title: string; text: string; tint: string; children: ReactNode }) {
  return (
    <div className="group h-full overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl">
      <div className={`relative h-52 overflow-hidden bg-gradient-to-b ${tint}`}>{children}</div>
      <div className="p-5">
        <h3 className="font-display text-xl font-bold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{text}</p>
      </div>
    </div>
  );
}
