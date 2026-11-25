// Landing (siyah tema) ve ortak parçalar — bkz. page.tsx, SiteChrome.tsx.
// Bütün kurallar .ev altında.
export const CSS = `
html:has(.ev) { background: #07080a; scroll-behavior: smooth; }
html:has(.ev) body { background: #07080a; }
html:has(.ev .video-dialog[open]) { overflow: hidden; }
/* Landing ↔ yasal ↔ kayıt ↔ giriş arası yumuşak geçiş; menü yerinde durur. */
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
  .ev .nav { view-transition-name: ev-nav; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: .22s; }
}
@media (prefers-reduced-motion: reduce) { html:has(.ev) { scroll-behavior: auto; } }

.ev {
  --bg: #07080a; --bg-2: #0b0d10; --card: #111318; --card-2: #171a21;
  --line: #22262e; --line-2: #2f343e; --hair: rgba(244,244,241,.08);
  --fg: #f4f4f1; --muted: #a3a8b2; --faint: #7f8590; --dim: #6b717c;
  --yellow: #ffcf3d; --green: #3dd68c; --orange: #ff8a4c; --blue: #7aa7ff;
  position: relative; overflow-x: clip; background: var(--bg); color: var(--fg);
  font-family: var(--font-geist), "Segoe UI", sans-serif; font-size: 16px; line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.ev *, .ev *::before, .ev *::after { box-sizing: border-box; }
.ev h1, .ev h2, .ev h3, .ev p, .ev ul, .ev ol { margin: 0; padding: 0; list-style: none; }
.ev a { color: inherit; text-decoration: none; }
.ev b { font-weight: 500; }
.ev :is(a, button, summary):focus-visible { outline: 2px solid var(--yellow); outline-offset: 3px; }
.ev [hidden] { display: none !important; }
.ev [id] { scroll-margin-top: 110px; }
.ev .wrap { width: 100%; max-width: 1248px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
.ev .mono { font-family: var(--font-geist-mono), ui-monospace, monospace; font-weight: 500; font-size: 12px; line-height: 16px; letter-spacing: .1em; }
.ev .faint { color: var(--faint); }
.ev .yellow { color: var(--yellow); }
.ev .green { color: var(--green); }
.ev .orange { color: var(--orange); }
.ev .card-surface {
  background: linear-gradient(180deg, var(--card-2), var(--card)); border: 1px solid var(--hair);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}

.ev .bg-grid {
  position: absolute; inset: 0 0 auto; height: 1100px; pointer-events: none;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 80px 80px; background-position: center top;
  -webkit-mask-image: radial-gradient(60% 55% at 50% 50%, #000, transparent);
  mask-image: radial-gradient(60% 55% at 50% 50%, #000, transparent);
}
.ev .bg-glow {
  position: absolute; left: 50%; top: 480px; width: min(1500px, 170vw); height: 820px; transform: translateX(-50%); pointer-events: none;
  background: radial-gradient(closest-side, rgba(255,207,61,.24), rgba(255,207,61,.08) 50%, transparent);
}

/* düğmeler */
.ev .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 14px 20px 14px 24px;
  border-radius: 999px; border: 1px solid transparent; font-size: 15px; line-height: 18px; letter-spacing: -.1px; font-weight: 500; white-space: nowrap;
  transition: transform .15s ease, background .15s ease, box-shadow .15s ease;
}
.ev .btn-sm { min-height: 38px; padding: 9px 14px 9px 18px; }
.ev .btn-block { width: 100%; }
.ev .btn-primary { background: var(--yellow); color: var(--bg); box-shadow: 0 8px 28px -6px rgba(255,207,61,.35), inset 0 1px 0 rgba(255,255,255,.45); }
.ev .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 34px -6px rgba(255,207,61,.5), inset 0 1px 0 rgba(255,255,255,.45); }
.ev :is(.btn-light, .btn-ghost):not(.btn-sm) { min-height: 50px; padding-right: 22px; }
.ev .btn-ghost.btn-sm { min-height: 40px; }
.ev .btn-light { background: var(--fg); color: var(--bg); }
.ev .btn-light:hover { background: #fff; }
.ev .btn-ghost { background: rgba(244,244,241,.06); border-color: rgba(244,244,241,.14); color: var(--fg); }
.ev .btn-ghost:hover { background: rgba(244,244,241,.11); }
.ev .arrow { flex: none; transition: transform .15s ease; }
.ev a:hover > .arrow { transform: translateX(2px); }
.ev .actions { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 12px; }
.ev .check { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; line-height: 21px; }
.ev .check svg { flex: none; }

/* üst menü */
.ev .nav { position: sticky; top: 0; z-index: 50; padding: 20px 24px 0; pointer-events: none; }
.ev .nav-pill {
  pointer-events: auto; position: relative; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; height: 56px; margin: 0 auto;
  padding: 0 8px 0 20px; border-radius: 999px; border: 1px solid rgba(244,244,241,.1);
  background: rgba(20,21,24,.78); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
}
.ev .logo { display: flex; border-radius: 8px; }
.ev .logo svg { width: 104px; height: 31px; }
.ev .nav-links { display: flex; gap: 32px; font-size: 14px; font-weight: 500; color: var(--muted); }
.ev .nav-links a, .ev .nav-login { transition: color .15s ease; }
.ev .nav-links a:hover { color: var(--fg); }
.ev .nav-actions { display: flex; align-items: center; gap: 16px; }
.ev .nav-login { font-size: 14px; font-weight: 500; }
.ev .nav-login:hover, .ev .nav-login[aria-current] { color: var(--yellow); }
.ev .menu, .ev .only-narrow, .ev .chips { display: none !important; }

/* hero */
.ev .hero { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 104px; }
.ev .announce {
  display: inline-flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 14px 6px 6px; border-radius: 999px;
  background: var(--fg); color: var(--bg); font-size: 14px; line-height: 21px;
}
.ev .announce .arrow { width: 14px; height: 14px; color: #8b909a; }
.ev .announce-tag { padding: 4px 10px; border-radius: 999px; background: var(--yellow); color: var(--bg); font-size: 11px; line-height: 14px; }
.ev h1 { margin-top: 28px; font-size: clamp(46px, 7.22vw, 104px); line-height: .945; letter-spacing: -.053em; font-weight: 600; padding-right: .053em; }
.ev h1 em { font-style: normal; color: var(--yellow); background: linear-gradient(90deg, #ffda69, #ffc735); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; padding-right: .06em; margin-right: -.06em; }
.ev .hero-lead { max-width: 640px; margin-top: 28px; font-size: 19px; line-height: 29px; letter-spacing: -.2px; color: var(--muted); }
.ev .hero .actions { margin-top: 28px; }
.ev .checks { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; margin-top: 28px; }

/* demo videosu */
.ev .video-dialog { width: min(1080px, calc(100vw - 32px), calc((100dvh - 120px) * 16 / 9)); max-width: none; max-height: none; margin: auto; padding: 0; border: 0; background: none; color: var(--fg); overflow: visible; }
.ev .video-dialog::backdrop { background: rgba(4,5,6,.86); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.ev .video-box { display: flex; flex-direction: column; gap: 12px; }
.ev .video-close { align-self: flex-end; display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(244,244,241,.16); border-radius: 50%; background: rgba(23,26,33,.9); color: var(--fg); cursor: pointer; }
.ev .video-close:hover { background: #262a33; }
.ev .video-frame { aspect-ratio: 16 / 9; border: 1px solid rgba(244,244,241,.12); border-radius: 18px; overflow: hidden; background: #000; }
.ev .video-frame iframe { display: block; width: 100%; height: 100%; border: 0; }

/* hero ürün görseli */
.ev .visual { position: relative; width: 100%; max-width: 1200px; margin-top: 76px; text-align: left; font-size: 13px; line-height: 20px; }
.ev .frame { padding: 8px; border-radius: 22px; border: 1px solid rgba(244,244,241,.1); background: rgba(244,244,241,.04); box-shadow: 0 40px 80px rgba(0,0,0,.6); }
.ev .ui { display: flex; overflow: hidden; border-radius: 14px; border: 1px solid var(--line); background: var(--card); min-height: 622px; }
.ev .ui-side { flex: none; width: 220px; padding: 18px 12px; border-right: 1px solid var(--line); background: var(--bg-2); display: flex; flex-direction: column; gap: 2px; }
.ev .ui-logo { width: 87px; height: 26px; margin: 0 0 18px 8px; }
.ev .ui-link { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--muted); }
.ev .ui-link::before { content: ""; width: 14px; height: 14px; border-radius: 4px; background: rgba(244,244,241,.18); }
.ev .ui-link.on { background: rgba(244,244,241,.07); color: var(--fg); font-weight: 500; }
.ev .ui-link.on::before { background: var(--yellow); }
.ev .ui-main { flex: 1; min-width: 0; padding: 20px 24px 0; display: flex; flex-direction: column; gap: 16px; }
.ev .ui-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ev .ui-title { display: block; font-size: 18px; line-height: 23px; font-weight: 500; letter-spacing: -.02em; }
.ev .ui-sub { color: var(--dim); font-size: 12px; line-height: 18px; }
.ev .ui-tools { display: flex; gap: 8px; }
.ev .ui-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card-2); color: var(--dim); font-size: 12px; white-space: nowrap; }
.ev .ui-search .mono { font-size: 11px; }
.ev .ui-new { padding: 10px 16px; font-size: 15px; line-height: 18px; border-radius: 999px; background: var(--yellow); color: var(--bg); font-weight: 500; white-space: nowrap; }
.ev .ui-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.ev .ui-stat { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--card-2); color: var(--dim); font-size: 12px; white-space: nowrap; }
.ev .ui-stat b { font-size: 24px; line-height: 28px; font-weight: 600; letter-spacing: -.04em; color: var(--fg); }
.ev .ui-stat i { margin-left: 4px; font-style: normal; font-weight: 500; }
.ev .ui-cols { flex: 1; display: grid; grid-template-columns: minmax(0, 610fr) minmax(0, 290fr); gap: 12px; }
.ev .ui-jobs, .ev .ui-store { border: 1px solid var(--line); border-radius: 10px; background: var(--card-2); }
.ev .ui-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 70px 110px; gap: 12px; align-items: center; min-height: 60px; padding: 10px 14px; border-top: 1px solid var(--line); }
.ev .ui-row.ui-head { min-height: 0; border-top: 0; font-size: 10px; line-height: 13px; color: var(--dim); }
.ev .ui-job b, .ev .ui-job span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev .ui-job span { color: var(--dim); font-size: 12px; line-height: 18px; }
.ev .ui-status { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 12px; }
.ev .ui-status::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ev .ui-status span { color: var(--muted); }
.ev .ui-status.blue { color: var(--blue); }
.ev .plate { display: inline-block; padding: 3px 7px; border-radius: 5px; background: var(--fg); color: var(--bg); font-size: 11px; line-height: 14px; white-space: nowrap; }
.ev .plate-sm { padding: 2px 6px; border-radius: 4px; font-size: 10px; line-height: 13px; }
.ev .plate-lg { padding: 6px 12px; border-radius: 8px; font-size: 18px; line-height: 23px; letter-spacing: .06em; }
.ev .ui-store { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.ev .ui-store-head { display: flex; justify-content: space-between; align-items: center; }
.ev .ui-store-head .mono { font-size: 11px; color: var(--dim); }
.ev .ui-store-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: rgba(244,244,241,.03); color: var(--muted); font-size: 12px; line-height: 18px; white-space: nowrap; overflow: hidden; }
.ev .ui-store-row.hot { border-color: rgba(255,207,61,.45); background: rgba(255,207,61,.1); color: var(--yellow); font-weight: 500; }
.ev .float {
  position: absolute; display: flex; align-items: center; gap: 12px; padding: 12px 18px 12px 12px; border-radius: 14px; border: 1px solid rgba(244,244,241,.12);
  background: rgba(23,26,33,.88); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,.45);
}
.ev .float b, .ev .float b + span { display: block; white-space: nowrap; }
.ev .float b + span { color: var(--faint); font-size: 12px; line-height: 18px; }
.ev .float-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: rgba(61,214,140,.16); }
.ev .float-wa-icon { width: 18px; height: 18px; }
.ev .float-stock { left: -60px; bottom: 62px; }
.ev .float-wa { right: 20px; top: -40px; }

/* hizmet şeridi */
.ev .services { padding: 108px 0 24px; text-align: center; }
.ev .marquee { margin-top: 24px; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 200px calc(100% - 200px), transparent); mask-image: linear-gradient(90deg, transparent, #000 200px calc(100% - 200px), transparent); }
.ev .marquee-track { display: flex; width: max-content; animation: ev-marquee 48s linear infinite; }
.ev .marquee:hover .marquee-track { animation-play-state: paused; }
.ev .marquee ul { display: flex; flex: none; }
.ev .marquee li { display: flex; align-items: center; font-size: 22px; line-height: 40px; font-weight: 500; letter-spacing: -.02em; color: var(--muted); white-space: nowrap; }
.ev .marquee li::after { content: ""; width: 6px; height: 6px; margin: 0 28px; border-radius: 50%; background: var(--yellow); }
@keyframes ev-marquee { to { transform: translateX(-50%); } }

/* bölüm başlıkları */
.ev .tag { display: flex; align-items: center; gap: 10px; color: var(--muted); }
.ev .tag::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: var(--yellow); }
.ev h2 { margin-top: 20px; font-size: clamp(34px, 4.45vw, 64px); line-height: 1; letter-spacing: -.047em; font-weight: 600; text-wrap: balance; font-variant-ligatures: none; }
.ev .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px 80px; }
.ev .head-lead { flex: none; width: 420px; max-width: 100%; font-size: 19px; line-height: 29px; letter-spacing: -.2px; color: var(--muted); }
.ev .lead { font-size: 16px; line-height: 25px; letter-spacing: -.1px; color: var(--muted); }

/* özellik sekmeleri */
.ev .features { padding-top: 140px; }
.ev .showcase { margin-top: 40px; }
.ev .tabs, .ev .billing { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; border: 1px solid var(--hair); background: rgba(244,244,241,.04); max-width: 100%; }
.ev .tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border: 0; border-radius: 999px; background: none; color: var(--muted); font-family: inherit; font-size: 14px; line-height: 21px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: color .15s ease, background .15s ease; }
.ev .tab:hover { color: var(--fg); }
.ev .tab:is([aria-selected="true"], [aria-pressed="true"], [aria-current="page"]) { background: var(--fg); color: var(--bg); }
.ev .show-panel { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); align-items: center; gap: 56px; margin-top: 40px; min-height: 541px; padding: 48px 40px 48px 56px; border-radius: 28px; }
.ev .show-text { display: flex; flex-direction: column; gap: 20px; }
.ev .show-text h3 { font-size: 34px; line-height: 39px; letter-spacing: -.03em; font-weight: 500; }
.ev .show-text ul { display: grid; gap: 12px; }
.ev .mock { display: flex; flex-direction: column; gap: 12px; padding: 24px; border-radius: 18px; border: 1px solid var(--line); background: var(--bg-2); font-size: 14px; line-height: 21px; }
.ev .mock-head { display: flex; justify-content: space-between; align-items: center; font-size: 17px; line-height: 22px; letter-spacing: -.02em; }
.ev .mock-head .mono { color: #868c97; }
.ev .line { display: flex; align-items: center; gap: 14px; min-height: 66px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: rgba(244,244,241,.04); }
.ev .line > b { white-space: nowrap; }
.ev .plate-line { border-color: rgba(255,207,61,.4); background: var(--card-2); }
.ev .line.hot { border-color: rgba(255,207,61,.4); background: rgba(255,207,61,.08); }
.ev .line-text { flex: 1; min-width: 0; }
.ev .line-text b, .ev .line-text span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev .line-text span { color: #868c97; font-size: 12px; line-height: 18px; }
.ev .line-qty { color: var(--muted); letter-spacing: .04em; white-space: nowrap; }
.ev .pays { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ev .pay { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(244,244,241,.04); color: #868c97; }
.ev .pay .mono { display: block; font-size: 10px; line-height: 13px; margin-bottom: 2px; }
.ev .pay.on { border-color: rgba(255,207,61,.4); background: rgba(255,207,61,.08); }
.ev .pay.on .mono { color: var(--yellow); }
.ev .pay.on b { color: var(--fg); }
.ev .mock-total { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 6px; }
.ev .mock-total .mono { display: block; font-size: 10px; line-height: 15px; color: #868c97; }
.ev .mock-total b { font-size: 30px; line-height: 34px; font-weight: 600; letter-spacing: -.033em; }
.ev .mock-total .right { text-align: right; }
.ev .mock-total .right b { font-size: 22px; line-height: 25px; }
.ev .wa-pill { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px 9px 12px; border-radius: 999px; background: #1fa855; color: #fff; font-weight: 500; font-size: 13px; white-space: nowrap; }
.ev .wa-pill svg { width: 20px; height: 20px; }

/* bento */
.ev .bento { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 40px; padding-top: 24px; padding-bottom: 160px; }
.ev .cell { display: flex; flex-direction: column; gap: 10px; min-height: 309px; padding: 28px; border-radius: 24px; min-width: 0; }
.ev .cell > .mono { font-size: 11px; line-height: 14px; }
.ev .cell h3 { font-size: 22px; line-height: 29px; letter-spacing: -.02em; font-weight: 500; }
.ev .cell-text { font-size: 15px; line-height: 23px; color: var(--muted); }
.ev .c-stock { width: calc((100% - 32.1px) * .47945); }
.ev .c-hotel, .ev .c-cari { width: calc((100% - 32.1px) * .26027); }
.ev .c-third { width: calc((100% - 32.1px) / 3); }
.ev .rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 20px; }
.ev .row { display: flex; align-items: center; gap: 12px; min-height: 47px; padding: 11px 14px; border: 1px solid var(--line); border-radius: 12px; background: rgba(244,244,241,.04); }
.ev .row.hot { border-color: rgba(255,207,61,.4); background: rgba(255,207,61,.08); }
.ev .row .mono { letter-spacing: .06em; }
.ev .row span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 13px; }
.ev .row i { font-style: normal; color: #ff6b6b; }
.ev .row b { font-size: 18px; line-height: 23px; font-weight: 600; letter-spacing: -.02em; }
.ev .big { display: flex; align-items: baseline; gap: 10px; margin-top: 20px; color: var(--muted); font-size: 14px; white-space: nowrap; }
.ev .big b { font-size: 72px; line-height: 72px; font-weight: 600; letter-spacing: -.042em; color: var(--yellow); }
.ev .pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ev .pills span { padding: 5px 10px; border: 1px solid var(--line-2); border-radius: 999px; color: var(--muted); font-size: 12px; line-height: 18px; }
.ev .chat { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-top: 20px; font-size: 12px; line-height: 18px; }
.ev .bubble { padding: 10px 12px; border-radius: 14px; }
.ev .bubble.out { background: #005c4a; border-bottom-right-radius: 4px; }
.ev .bubble.out b { display: flex; align-items: center; gap: 8px; }
.ev .bubble.out > .mono { color: #a9c5ff !important; }
.ev .pdf { padding: 6px 5px; border-radius: 5px; background: #c53030; font-size: 9px !important; line-height: 12px !important; }
.ev .bubble.out > .mono { display: block; margin-top: 4px; font-size: 10px; line-height: 13px; color: var(--blue); }
.ev .bubble.in { align-self: flex-end; border: 1px solid var(--line); background: var(--card-2); border-bottom-left-radius: 4px; }
.ev .bars { display: flex; align-items: flex-end; gap: 6px; height: 110px; margin-top: 20px; }
.ev .bars span { flex: 1; border-radius: 5px 5px 0 0; background: rgba(244,244,241,.08); }
.ev .bars .on { background: linear-gradient(#ffe07a, #ffbf1a); }
.ev .slots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 20px; }
.ev .slots span { padding: 9px 14px; border: 1px solid var(--line); border-radius: 10px; background: rgba(244,244,241,.04); }
.ev .slots .full { color: var(--dim); text-decoration: line-through; }
.ev .slots .on { background: var(--yellow); border-color: var(--yellow); color: var(--bg); }
.ev .more { margin-top: 20px; }
.ev .more li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; line-height: 21px; }
.ev .more li::before { content: ""; width: 6px; height: 6px; border-radius: 1px; background: var(--yellow); }
.ev .soon { padding: 2px 8px; border-radius: 999px; background: rgba(255,207,61,.12); color: var(--yellow); font-size: 10px; line-height: 14px; }

/* karşılaştırma */
.ev .why { padding-bottom: 140px; }
.ev .compare { position: relative; display: grid; grid-template-columns: 1fr 1fr; margin-top: 48px; border: 1px solid var(--hair); border-radius: 24px; overflow: hidden; background: rgba(244,244,241,.01); }
.ev .compare::before { content: ""; position: absolute; inset: 0 0 0 50%; border-left: 1px solid rgba(244,244,241,.06); background: linear-gradient(rgba(255,207,61,.08), transparent); pointer-events: none; }
.ev .cmp-head { padding: 28px 36px 12px; }
.ev .cmp-row { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid rgba(244,244,241,.06); }
.ev .cmp-row p { position: relative; display: flex; gap: 14px; padding: 20px 36px; font-size: 18px; line-height: 27px; }
.ev .cmp-row .old { color: var(--dim); }
.ev .cmp-row .now .cmp-mark { color: var(--yellow); }

/* adımlar */
.ev .steps { padding-bottom: 140px; }
.ev .step-row { display: grid; grid-template-columns: 378fr 411fr 411fr; margin-top: 56px; border-top: 1px solid var(--hair); }
.ev .step-row li { padding: 32px 40px 0 32px; }
.ev .step-row li:first-child { padding-left: 0; }
.ev .step-row li + li { border-left: 1px solid var(--hair); }
.ev .step-row .mono { display: block; font-size: 13px; line-height: 17px; }
.ev .step-row h3 { margin-top: 14px; font-size: 26px; line-height: 30px; letter-spacing: -.038em; font-weight: 500; }
.ev .step-row p { margin-top: 14px; color: var(--muted); line-height: 25px; }

/* fiyat */
.ev .pricing { display: flex; flex-direction: column; align-items: center; padding-bottom: 140px; text-align: center; }
.ev .pricing > .head-lead { width: 600px; margin-top: 20px; }
.ev .billing { margin-top: 40px; }
.ev .billing .tab { padding: 10px 20px; }
.ev .save { padding: 2px 8px; border-radius: 999px; background: var(--yellow); color: var(--bg); font: 500 11px/14px var(--font-geist-mono), monospace; letter-spacing: .06em; }
.ev .price-card { display: grid; grid-template-columns: 1fr 1fr; width: 100%; max-width: 960px; margin-top: 40px; border-radius: 28px; overflow: hidden; text-align: left; }
.ev .price-main, .ev .price-side { padding: 44px; }
.ev .price-main { display: flex; flex-direction: column; gap: 18px; }
.ev .price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 19px; }
.ev .price strong { font-size: 88px; line-height: 83px; font-weight: 600; letter-spacing: -.0625em; color: var(--fg); padding-right: .04em; }
.ev .price-note { color: var(--faint); font-size: 14px; line-height: 21px; }
.ev .pay-note > span:first-child { margin-right: 4px; font-size: .78em; }
.ev .pay-note { color: var(--faint); font-size: 13px; }
.ev .price-side { border-left: 1px solid var(--hair); background: rgba(244,244,241,.03); }
.ev .price-side ul { display: grid; gap: 16px; margin-top: 16px; }
.ev .price-side .check { color: var(--fg); font-size: 15px; line-height: 23px; }

/* SSS */
.ev .faq { display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 96px; padding-bottom: 140px; }
.ev .faq-side { display: flex; flex-direction: column; align-items: flex-start; gap: 20px; }
.ev .faq-side h2 { margin-top: 0; max-width: 300px; }
.ev .faq-list { border-top: 1px solid var(--hair); }
.ev details { border-bottom: 1px solid var(--hair); }
.ev summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 0; font-size: 19px; line-height: 29px; letter-spacing: -.02em; font-weight: 500; cursor: pointer; list-style: none; }
.ev summary::-webkit-details-marker { display: none; }
.ev .faq-sign { position: relative; flex: none; width: 14px; height: 14px; color: var(--muted); }
.ev .faq-sign::before, .ev .faq-sign::after { content: ""; position: absolute; inset: 6px 1px auto; height: 1.75px; background: currentColor; transition: transform .2s ease; }
.ev .faq-sign::after { transform: rotate(90deg); }
.ev details[open] .faq-sign::after { transform: none; }
.ev details p { max-width: 640px; margin-top: -12px; padding-bottom: 24px; color: var(--muted); line-height: 25px; }

/* kapanış + alt bilgi */
.ev .final { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 140px 24px 160px; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); text-align: center; background: radial-gradient(52% 50% at 50% 36%, rgba(255,207,61,.2), rgba(255,207,61,0)); }
.ev .final h2 { margin: 0; font-size: clamp(46px, 6.67vw, 96px); line-height: .94; letter-spacing: -.057em; padding-right: .057em; }
.ev .final .head-lead { width: auto; }
.ev .footer { padding-top: 30px; text-align: center; overflow: hidden; }
.ev .footer-about { color: var(--muted); font-size: 14px; }
.ev .footer-contact { margin-top: 14px; color: var(--faint); font-size: 13px; line-height: 20px; }
.ev .footer-legal { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 12px; margin-top: 40px; color: var(--muted); font-size: 14px; }
.ev .footer a { transition: color .15s ease; }
.ev .footer a:hover { color: var(--fg); }
.ev .footer-bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-top: 48px; color: var(--faint); font-size: 13px; }
.ev .footer-bottom img { height: 18px; width: auto; opacity: .7; }
.ev .wordmark { margin: 48px 0 0; padding-right: .067em; font-size: clamp(110px, 23vw, 330px); line-height: .8; font-weight: 600; letter-spacing: -.067em; color: transparent; background: linear-gradient(rgba(255,255,255,.1), transparent); -webkit-background-clip: text; background-clip: text; user-select: none; }

/* sabit düğmeler */
.ev .sticky-cta { display: none; }
@media (max-width: 1340px) { .ev .float-stock { left: -12px; } }

@media (max-width: 1080px) {
  .ev .ui-side { display: none; }
  .ev .head { flex-direction: column; align-items: flex-start; gap: 20px; }
  .ev .head-lead { width: 100%; max-width: 640px; }
  .ev .show-panel { grid-template-columns: 1fr; gap: 36px; padding: 40px; min-height: 0; }
  .ev .c-stock { width: 100%; }
  .ev .c-hotel, .ev .c-cari, .ev .c-third { width: calc((100% - 16.1px) / 2); }
  .ev .c-third:last-child { width: 100%; min-height: 0; }
  .ev .faq { grid-template-columns: 1fr; gap: 40px; }
  .ev .faq-side h2 { max-width: none; }
}

@media (max-width: 860px) {
  .ev .nav-links, .ev .nav-login { display: none; }
  .ev .menu { display: block !important; }
  .ev .menu-btn { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: rgba(244,244,241,.06); color: var(--fg); cursor: pointer; }
  .ev .menu-panel { position: absolute; top: calc(100% + 8px); left: 0; right: 0; display: grid; padding: 10px; border: 1px solid rgba(244,244,241,.12); border-radius: 24px; background: #14161b; box-shadow: 0 24px 60px rgba(0,0,0,.6); }
  .ev .menu-panel a { padding: 13px 16px; border-radius: 14px; font-size: 16px; font-weight: 500; }
  .ev .menu-panel a:hover { background: rgba(244,244,241,.06); }
  .ev .nav-actions { gap: 6px; }
  .ev .ui-cols { grid-template-columns: 1fr; }
  .ev .ui-store { display: none; }
  .ev .ui { min-height: 0; }
  .ev .ui-stats { grid-template-columns: 1fr 1fr; }
  .ev .price-card { grid-template-columns: 1fr; }
  .ev .price-side { border-left: 0; border-top: 1px solid var(--hair); }
}

@media (max-width: 640px) {
  .ev .wrap { padding-left: 20px; padding-right: 20px; }
  .ev [id] { scroll-margin-top: 84px; }
  .ev .only-wide, .ev .nav .btn .arrow, .ev .showcase, .ev .marquee { display: none !important; }
  .ev span.only-narrow { display: inline !important; }
  .ev .cell.only-narrow { display: flex !important; }
  .ev :is(p, svg).only-narrow { display: block !important; }
  .ev ul.only-narrow { display: grid !important; }
  .ev .nav { padding: 12px 12px 0; }
  .ev .nav-pill { height: 52px; padding: 0 6px 0 14px; }
  .ev .logo svg { width: 90px; height: 27px; }
  .ev .nav .btn-sm { padding: 9px 14px 9px 18px; }
  .ev .bg-glow { top: 420px; height: 520px; }

  .ev .hero { align-items: stretch; padding-top: 48px; text-align: left; }
  .ev .announce { align-self: flex-start; background: rgba(244,244,241,.05); border: 1px solid rgba(244,244,241,.12); color: var(--fg); }
  .ev .announce .arrow { color: var(--muted); }
  .ev h1 { margin-top: 22px; font-size: clamp(38px, 11.8vw, 46px); line-height: 1; letter-spacing: -.048em; }
  .ev .hero-lead { margin-top: 22px; font-size: 17px; line-height: 26px; text-wrap: pretty; }
  .ev .actions { flex-direction: column; align-items: stretch; align-self: stretch; gap: 10px; }
  .ev .hero .actions { margin-top: 22px; }
  .ev .hero .btn-light { background: rgba(244,244,241,.06); border-color: rgba(244,244,241,.14); color: var(--fg); }
  .ev .checks { justify-content: flex-start; gap: 8px 14px; margin-top: 22px; }

  /* hero görseli: mobil tasarımdaki kısa liste */
  .ev .visual { margin-top: 22px; }
  .ev .frame { padding: 0; border: 0; background: none; border-radius: 18px; box-shadow: 0 24px 50px rgba(0,0,0,.5); }
  .ev .ui { border-radius: 18px; border-color: rgba(244,244,241,.1); }
  .ev .ui-main { padding: 14px 12px; gap: 10px; }
  .ev .ui-search, .ev .ui-head, .ev .float { display: none; }
  .ev .ui-row.ui-head { display: none; }
  .ev .ui-title { font-size: 15px; line-height: 20px; }
  .ev .ui-sub { font-size: 11px; line-height: 16px; display: block; }
  .ev .ui-new { padding: 6px 12px; font-size: 12px; line-height: 18px; }
  .ev .ui-stats { gap: 8px; }
  .ev .ui-stat { padding: 9px 10px; gap: 2px; font-size: 11px; line-height: 16px; }
  .ev .ui-stat:nth-child(2), .ev .ui-stat:nth-child(3) { display: none; }
  .ev .ui-stat b { font-size: 19px; line-height: 25px; }
  .ev .ui-stat i { margin-left: 2px; font-size: 10px; }
  .ev .ui-jobs { border: 0; background: none; border-radius: 0; }
  .ev .ui-row { grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 10px; min-height: 0; padding: 9px 0; font-size: 12px; }
  .ev .ui-row:nth-child(n+5) { display: none; }
  .ev .ui-jobs { display: flex; flex-direction: column; }
  .ev .ui-row:nth-child(3) { order: 1; }
  .ev .ui-row .plate { padding: 2px 6px; border-radius: 4px; font-size: 10px; line-height: 13px; }
  .ev .ui-job b, .ev .ui-status span { display: none; }
  .ev .ui-job span { color: var(--muted); }

  .ev .services { padding: 56px 0 0; text-align: left; }
  .ev .services > p { padding: 0 20px; }
  .ev .chips { display: flex !important; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding: 0 20px; }
  .ev .chips li { padding: 7px 12px; border: 1px solid var(--line-2); border-radius: 999px; color: var(--muted); font-size: 13px; line-height: 20px; }

  .ev h2 { margin-top: 20px; line-height: 1.06; letter-spacing: -.041em; text-wrap: wrap; }
  .ev .features h2 { margin-top: 12px; }
  .ev .steps h2 { margin-top: 16px; }
  .ev .faq h2 { margin: -20px 0 0; }
  .ev .head-lead { font-size: 16px; line-height: 25px; }
  .ev .features, .ev .why, .ev .steps, .ev .pricing, .ev .faq { padding-top: 72px; padding-bottom: 0; }
  .ev .plate-total { display: flex; align-items: center; gap: 10px; margin-top: 4px; padding: 10px 12px; border: 1px solid rgba(255,207,61,.5); border-radius: 12px; background: var(--card-2); font-size: 17px; }
  .ev .plate-total b { font-weight: 600; letter-spacing: -.02em; }
  .ev .plate-lg { padding: 5px 10px; border-radius: 6px; font-size: 15px; line-height: 19px; }
  .ev .bento { gap: 12px; margin-top: 12px; padding: 0; }
  .ev .cell.cell { width: 100%; }
  .ev .cell { min-height: 0; padding: 20px; gap: 8px; border-radius: 20px; }
  .ev .cell h3 { font-size: 19px; line-height: 25px; }
  .ev .cell-text { font-size: 14px; line-height: 21px; }
  .ev .rows, .ev .chat, .ev .bars, .ev .slots, .ev .more { margin-top: 8px; }
  .ev .rows { gap: 8px; }
  .ev .row { min-height: 41px; padding: 9px 12px; gap: 10px; border-radius: 10px; }
  .ev .row span:nth-child(2) { display: none; }
  .ev .row span:first-child { flex: 1; }
  .ev .row i { color: var(--orange); }
  .ev .row b { font-size: 16px; line-height: 21px; }
  .ev .big { margin-top: 0; }
  .ev .big b { font-size: 52px; line-height: 55px; }

  .ev .compare { display: block; margin-top: 20px; border-radius: 20px; }
  .ev .compare::before, .ev .cmp-head { display: none; }
  .ev .cmp-row { display: block; padding: 16px 18px; }
  .ev .cmp-row:first-of-type { border-top: 0; }
  .ev .cmp-row p { padding: 0; gap: 8px; }
  .ev .cmp-row .old { font-size: 14px; line-height: 21px; color: var(--faint); }
  .ev .cmp-row .now { margin-top: 6px; font-size: 16px; line-height: 25px; font-weight: 500; }

  .ev .step-row { grid-template-columns: 1fr; gap: 16px; margin-top: 16px; border-top: 0; }
  .ev .step-row li, .ev .step-row li:first-child { display: flex; gap: 16px; padding: 16px 0 0; border-top: 1px solid var(--hair); }
  .ev .step-row li + li { border-left: 0; }
  .ev .step-row .mono { line-height: 25px; }
  .ev .step-row h3 { margin: 0; font-size: 19px; line-height: 25px; letter-spacing: -.02em; }
  .ev .step-row p { margin-top: 4px; font-size: 14px; line-height: 21px; }

  .ev .pricing { align-items: flex-start; text-align: left; }
  .ev .pricing > .head-lead { width: 100%; margin-top: 16px; }
  .ev .billing { margin-top: 20px; }
  .ev .price-card { margin-top: 20px; border-radius: 24px; }
  .ev .price-card { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
  .ev .price-main { display: contents; }
  .ev .price-main > .mono { display: none; }
  .ev .price-side { padding: 0; border: 0; background: none; }
  .ev .price-side ul { margin: 0; }
  .ev .price-side .check { font-size: 14px; line-height: 21px; }
  .ev .pay-note { order: 1; font-size: 12px; line-height: 18px; }
  .ev .billing .tab { padding: 8px 16px; gap: 4px; }
  .ev .save { padding: 0; background: none; font: inherit; letter-spacing: 0; color: inherit; }
  .ev .price strong { font-size: 56px; line-height: 56px; letter-spacing: -.04em; }
  .ev .price { font-size: 16px; gap: 6px; }

  .ev .faq { gap: 0; }
  .ev summary { padding: 18px 0; font-size: 16px; line-height: 26px; }
  .ev details p { margin-top: -8px; padding-bottom: 18px; font-size: 14px; line-height: 21px; }
  .ev .final { border: 0; gap: 20px; margin-top: 72px; padding: 88px 20px; }
  .ev .final h2 { font-size: 46px; line-height: 1; letter-spacing: -.048em; }

  .ev .footer-logo { width: 121px; height: 36px; margin-bottom: 14px; }
  .ev .footer { padding-top: 40px; text-align: left; }
  .ev .footer-legal { justify-content: flex-start; margin-top: 14px; font-size: 13px; }
  .ev .footer-bottom { margin-top: 14px; font-size: 12px; }
  .ev .wordmark { margin: 14px 0 0; padding: 0; font-size: 30.2vw; white-space: nowrap; }

  .ev .sticky-cta {
    position: fixed; left: 16px; right: 16px; bottom: max(20px, env(safe-area-inset-bottom)); z-index: 45; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 8px 8px 20px; border-radius: 999px; border: 1px solid rgba(244,244,241,.12); background: rgba(23,26,33,.86);
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: 0 12px 30px rgba(0,0,0,.5);
  }
  .ev .sticky-cta b, .ev .sticky-cta b + span { display: block; white-space: nowrap; }
  .ev .sticky-cta b { font-size: 14px; line-height: 18px; }
  .ev .sticky-cta b + span { font-size: 12px; line-height: 16px; color: var(--faint); }
  .ev .sticky-cta .btn { flex: none; }
}
@media (max-width: 374px) { .ev .sticky-cta b + span { display: none; } }

@media (prefers-reduced-motion: reduce) {
  .ev .marquee-track { animation: none; }
  .ev *, .ev *::before, .ev *::after { transition: none !important; }
}
`;

// Yasal sayfalar ve /kayit — CSS'in üstüne eklenir.
export const INNER_CSS = `
.ev-inner { min-height: 100vh; }
.ev-inner .bg-glow { top: -260px; height: 620px; opacity: .75; }
.ev-inner .bg-grid { height: 640px; }

.ev .legal { position: relative; display: grid; grid-template-columns: 260px minmax(0, 760px); gap: 96px; padding-top: 96px; padding-bottom: 140px; }
.ev .legal-side { position: sticky; top: 116px; align-self: start; }
.ev .legal-nav { display: grid; gap: 2px; margin: 20px 0 0 -14px; }
.ev .legal-nav a { padding: 9px 14px; border-radius: 10px; color: var(--muted); font-size: 14px; line-height: 21px; font-weight: 500; transition: color .15s ease, background .15s ease; }
.ev .legal-nav a:hover { color: var(--fg); }
.ev .legal-nav a[aria-current="page"] { background: rgba(244,244,241,.07); color: var(--fg); }
.ev .legal-body h1 { margin: -6px 0 0; padding: 0; font-size: clamp(34px, 4.1vw, 56px); line-height: 1.04; letter-spacing: -.045em; text-wrap: balance; overflow-wrap: break-word; }
.ev .legal-body .updated { margin: 18px 0 40px; padding-bottom: 32px; border-bottom: 1px solid var(--hair); color: var(--faint); font-size: 14px; line-height: 21px; }
.ev .legal-body h2 { margin: 44px 0 12px; font-size: 22px; line-height: 29px; letter-spacing: -.02em; font-weight: 500; }
.ev .legal-body p, .ev .legal-body li { color: var(--muted); font-size: 16px; line-height: 26px; }
.ev .legal-body p { margin: 0 0 14px; }
.ev .legal-body ul { display: grid; gap: 8px; margin: 0 0 16px; }
.ev .legal-body li { position: relative; padding-left: 20px; }
.ev .legal-body li::before { content: ""; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; border-radius: 1px; background: var(--yellow); }
.ev .legal-body strong { color: var(--fg); font-weight: 500; }
.ev .legal-body a, .ev .legal-body p button { color: var(--yellow) !important; text-decoration: underline; text-decoration-color: rgba(255,207,61,.4); text-underline-offset: 3px; overflow-wrap: anywhere; }
.ev .legal-body a:hover { text-decoration-color: currentColor; }
.ev .legal-body code { padding: 2px 6px; border-radius: 5px; background: rgba(244,244,241,.08); color: var(--fg); font-family: var(--font-geist-mono), monospace; font-size: .85em; overflow-wrap: anywhere; }
.ev .legal-body .company-box { margin: 20px 0 8px; padding: 24px 28px; border: 1px solid var(--hair); border-radius: 20px; background: linear-gradient(180deg, var(--card-2), var(--card)); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
.ev .legal-body .company-box p { margin: 0 0 6px; font-size: 15px; line-height: 24px; overflow-wrap: anywhere; }
.ev .legal-body .company-box p:last-child { margin: 0; }

/* giriş ve kayıt (AuthShell) */
.ev-auth .bg-glow { top: 120px; left: 30%; height: 760px; opacity: .9; }
.ev-auth .bg-grid { height: 1000px; }
.ev .auth-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin-bottom: 28px; }
.ev .auth-tabs .tab { justify-content: center; }
.ev .signup { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 80px; align-items: start; padding-top: 88px; padding-bottom: 120px; }
.ev .signup-side { padding-top: 24px; }
.ev .signup-side .big-title em { font-style: normal; color: var(--yellow); background: linear-gradient(90deg, #ffda69, #ffc735); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; padding-right: .06em; margin-right: -.06em; }
.ev .side-floats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 48px; font-size: 13px; line-height: 20px; }
.ev .side-floats .float { position: static; box-shadow: 0 16px 32px rgba(0,0,0,.35); }
.ev .side-floats .plate { padding: 7px 9px; }
.ev .signup-side p.big-title { margin-top: 20px; font-size: clamp(44px, 5vw, 72px); line-height: .96; letter-spacing: -.05em; font-weight: 600; text-wrap: balance; }
.ev .signup-side .head-lead { width: auto; max-width: 460px; margin-top: 24px; }
.ev .signup-side .checks { flex-direction: column; justify-content: flex-start; gap: 12px; }
.ev .signup-card { padding: 36px; border-radius: 28px; }
.ev .signup-card h1 { margin: 0; padding: 0; font-size: 28px; line-height: 34px; letter-spacing: -.035em; }
.ev .signup-card .sub { margin-top: 6px; color: var(--muted); font-size: 15px; line-height: 23px; }
.ev .signup-form { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; margin-top: 28px; }
.ev .field { display: grid; gap: 7px; grid-column: 1 / -1; min-width: 0; }
.ev .field.half { grid-column: auto; }
.ev .field span { color: var(--muted); font-size: 14px; line-height: 20px; font-weight: 500; }
.ev .field input {
  width: 100%; height: 48px; padding: 0 16px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--bg-2); color: var(--fg);
  font: inherit; font-size: 16px; color-scheme: dark; transition: border-color .15s ease, box-shadow .15s ease;
}
.ev .field input::placeholder { color: var(--faint); opacity: 1; }
.ev .field input:hover { border-color: #454b57; }
.ev .field input:focus { outline: none; border-color: var(--yellow); box-shadow: 0 0 0 3px rgba(255,207,61,.18); }
.ev .field input:-webkit-autofill { -webkit-text-fill-color: var(--fg); box-shadow: 0 0 0 60px var(--bg-2) inset; caret-color: var(--fg); }
/* Panelden çıkışta <html data-ui="v2"> kalır; panelin genel input kuralları
   (globals.css) daha özgül olduğundan burada !important gerekir — yoksa kutular
   beyaz, yazı da beyaz olur. */
html[data-ui] .ev .field input { background: var(--bg-2) !important; color: var(--fg) !important; border-color: var(--line-2) !important; font-family: inherit !important; }
html[data-ui] .ev .field input:focus { border-color: var(--yellow) !important; box-shadow: 0 0 0 3px rgba(255,207,61,.18) !important; outline: none !important; }
html[data-ui] .ev .field input::placeholder { color: var(--faint) !important; }
html[data-ui] .ev .consent input { -webkit-appearance: auto !important; appearance: auto !important; width: 18px !important; height: 18px !important; margin: 2px 0 0 !important; border: 0 !important; background: none !important; box-shadow: none !important; }
html[data-ui] .ev .consent input::before, html[data-ui] .ev .consent input::after { content: none !important; }
html[data-ui]:has(.ev) body, html[data-ui]:has(.ev) body.bg-gray-50 { background: #07080a !important; }
.ev .consent { display: flex; align-items: flex-start; gap: 10px; grid-column: 1 / -1; margin-top: 4px; color: var(--muted); font-size: 14px; line-height: 21px; cursor: pointer; }
.ev .consent input { flex: none; width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--yellow); color-scheme: dark; }
.ev .consent a { color: var(--yellow); text-decoration: underline; text-decoration-color: rgba(255,207,61,.4); text-underline-offset: 3px; }
.ev .signup-form .btn { grid-column: 1 / -1; width: 100%; margin-top: 4px; font-family: inherit; cursor: pointer; }
.ev .signup-form .btn:disabled { opacity: .45; box-shadow: none; transform: none; cursor: not-allowed; }

@media (max-width: 1080px) {
  .ev .legal { grid-template-columns: minmax(0, 1fr); gap: 36px; padding-top: 56px; }
  .ev .legal-side { position: static; }
  .ev .legal-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-left: 0; }
  .ev .legal-nav a { padding: 7px 14px; border: 1px solid var(--line-2); border-radius: 999px; }
  .ev .legal-nav a[aria-current="page"] { border-color: var(--fg); background: var(--fg); color: var(--bg); }
  .ev .signup { grid-template-columns: minmax(0, 520px); justify-content: center; gap: 36px; padding-top: 48px; padding-bottom: 80px; }
  .ev .signup-side { padding-top: 0; }
  .ev .signup-side .checks, .ev .side-floats { display: none; }
  .ev .signup-side p.big-title { font-size: 46px; }
  .ev .signup-side .head-lead { margin-top: 14px; }
}
@media (max-width: 640px) {
  .ev .legal { padding-top: 40px; padding-bottom: 8px; }
  .ev .legal-nav { margin-top: 14px; }
  .ev .legal-nav a { font-size: 13px; line-height: 20px; }
  .ev .legal-body h2 { margin: 32px 0 10px; font-size: 19px; line-height: 25px; letter-spacing: -.02em; }
  .ev .legal-body p, .ev .legal-body li { font-size: 15px; line-height: 24px; }
  .ev .legal-body .company-box { padding: 18px 20px; }
  .ev .signup { gap: 24px; padding-top: 32px; padding-bottom: 64px; }
  .ev .auth-tabs.tabs { display: grid; margin: 0 0 22px; padding: 4px; border: 1px solid var(--hair); border-radius: 999px; background: rgba(244,244,241,.04); }
  .ev .signup-side .big-title br { display: none; }
  .ev .signup-side .head-lead, .ev .signup-side .tag { display: none; }
  .ev .signup-side p.big-title { margin: 0; font-size: clamp(32px, 9.6vw, 38px); line-height: 1; }
  .ev .signup-card { padding: 24px 20px; border-radius: 24px; }
  .ev .signup-form { margin-top: 22px; }
}
@media (max-width: 480px) { .ev .field.half { grid-column: 1 / -1; } }
`;
