import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "WhatsOrder — Commission-free WhatsApp ordering for cafés and restaurants",
  description:
    "Take orders on WhatsApp with your own menu link, a live order board, customer loyalty and shift cash-up. AED 2 a day, no commission, free for 14 days.",
  applicationName: "WhatsOrder",
};

export const viewport: Viewport = {
  themeColor: "#0B3D2E",
  width: "device-width",
  initialScale: 1,
};

const landingStyles = String.raw`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Sans+Malayalam:wght@400;500;600;700&display=swap");

:root{
    --pine:#0B3D2E;
    --emerald:#0FA36B;
    --emerald-bright:#12B87B;
    --karak:#E8912D;
    --karak-deep:#C97615;
    --paper:#FDFDFB;
    --paper-2:#EAF6F0;
    --ink:#1A2420;
    --ink-soft:#4C5650;
    --line:#E2EAE5;
    --wa:#25D366;
    --white:#ffffff;
    --r-lg:22px;
    --r-md:14px;
    --r-sm:9px;
    --maxw:1180px;
    --shadow:0 1px 2px rgba(11,61,46,.06), 0 18px 40px -22px rgba(11,61,46,.28);
    --shadow-soft:0 1px 2px rgba(11,61,46,.05), 0 10px 30px -20px rgba(11,61,46,.25);
  }

  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    margin:0;
    background:var(--paper);
    color:var(--ink);
    font-family:"Instrument Sans",system-ui,sans-serif;
    font-size:17px;
    line-height:1.6;
    -webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;
    overflow-x:hidden;
  }
  a{color:inherit;text-decoration:none}
  img{max-width:100%;display:block}
  button{font-family:inherit}

  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}

  .eyebrow{
    font-family:"Geist Mono",ui-monospace,monospace;
    font-size:.72rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;
    color:var(--karak-deep);
    display:inline-flex;align-items:center;gap:.55rem;
  }

  /* ---------- focus + a11y ---------- */
  a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible{
    outline:3px solid var(--karak);outline-offset:3px;border-radius:6px;
  }

  /* ---------- buttons ---------- */
  .btn{
    display:inline-flex;align-items:center;gap:.55rem;
    font-weight:600;font-size:1rem;
    padding:.85rem 1.4rem;border-radius:999px;border:1.5px solid transparent;
    cursor:pointer;transition:transform .15s ease, box-shadow .2s ease, background .2s ease;
    white-space:nowrap;
  }
  .btn-primary{background:var(--emerald);color:#fff;box-shadow:0 10px 24px -12px rgba(15,163,107,.7)}
  .btn-primary:hover{background:var(--emerald-bright);transform:translateY(-2px)}
  .btn-ghost{background:transparent;color:var(--pine);border-color:var(--line)}
  .btn-ghost:hover{border-color:var(--pine);transform:translateY(-2px);background:#fff}
  .btn-wa{background:var(--wa);color:#073b24}
  .btn-wa:hover{transform:translateY(-2px);filter:brightness(1.04)}

  /* ---------- header ---------- */
  header{position:sticky;top:0;z-index:50;background:rgba(253,253,251,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .nav{display:flex;align-items:center;justify-content:space-between;gap:20px;height:68px}
  .brand{display:flex;align-items:center;gap:.6rem;font-family:"Bricolage Grotesque";font-weight:700;font-size:1.18rem;letter-spacing:-.02em;color:var(--pine);white-space:nowrap;flex:0 0 auto}
  .brand-mark{width:30px;height:30px;flex:0 0 auto}
  .nav-links{display:flex;align-items:center;flex-wrap:nowrap;gap:1.3rem;font-size:.95rem;color:var(--ink-soft);font-weight:500}
  .nav-links a{white-space:nowrap}
  .nav-links a:hover{color:var(--pine)}
  .nav-cta{display:flex;align-items:center;gap:.7rem;flex:0 0 auto}
  @media(max-width:1230px){.nav-links{gap:1rem}.nav-cta .btn-ghost{display:none}}
  @media(max-width:980px){.nav-links{display:none}}
  body.lang-ml .nav-links{font-size:.85rem;gap:.9rem}
  body.lang-ar .nav-links{font-size:.9rem;gap:1.05rem}
  @media(max-width:1440px){
    body.lang-ar .nav-cta .btn-ghost,body.lang-ml .nav-cta .btn-ghost{display:none}
  }
  @media(max-width:1080px){
    body.lang-ar .nav-links,body.lang-ml .nav-links{display:none}
  }

  /* ---------- hero ---------- */
  .hero{position:relative;padding:72px 0 30px;isolation:isolate}
  .hero::before{content:"";position:absolute;inset:-10% 0 0;z-index:-1;pointer-events:none;
    background:
      radial-gradient(46% 42% at 80% 26%,rgba(15,163,107,.14),transparent 70%),
      radial-gradient(34% 34% at 10% 8%,rgba(232,145,45,.12),transparent 70%);}
  .hero-grid{position:relative;display:grid;grid-template-columns:1.02fr .98fr;gap:54px;align-items:center}
  .hero h1{font-size:clamp(2.5rem,5.4vw,4.25rem);margin:.7rem 0 0;color:var(--pine)}
  .hero p.lede{font-size:1.18rem;color:var(--ink-soft);margin:1.4rem 0 0;max-width:33ch}
  .hero-cta{display:flex;gap:.8rem;margin-top:2rem;flex-wrap:wrap}

  /* hero signature device: chat -> ticket */
  .device{position:relative}
  .stage{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:center}
  .arrow{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;
    width:46px;height:46px;border-radius:50%;background:var(--pine);display:grid;place-items:center;box-shadow:0 10px 24px -10px rgba(11,61,46,.6)}
  .arrow svg{width:22px;height:22px}
  @media(max-width:560px){.arrow{transform:translate(-50%,-50%) rotate(90deg)}}

  .chatcard, .ticket{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow);overflow:hidden}
  .card-top{display:flex;align-items:center;gap:.55rem;padding:.7rem .85rem;border-bottom:1px solid var(--line);font-size:.78rem;font-weight:600;color:var(--ink-soft)}
  .card-top .dot{width:9px;height:9px;border-radius:50%}
  .chatcard .card-top{background:#075E54;color:#dff3e9;border-bottom:none}
  .chatcard .card-top .ava{width:24px;height:24px;border-radius:50%;background:#25d366;display:grid;place-items:center;color:#073b24;font-weight:700;font-size:.7rem;font-family:"Bricolage Grotesque"}
  .chat-body{padding:.85rem .8rem;background:linear-gradient(#ECE5DD,#ECE5DD);display:flex;flex-direction:column;gap:.5rem;min-height:230px}
  .bubble{max-width:86%;padding:.5rem .68rem;border-radius:12px;font-size:.86rem;line-height:1.4;box-shadow:0 1px 1px rgba(0,0,0,.06);opacity:0;transform:translateY(8px)}
  .bubble.in{background:#fff;align-self:flex-start;border-top-left-radius:3px}
  .bubble.out{background:#DCF8C6;align-self:flex-end;border-top-right-radius:3px}
  .bubble .t{display:block;font-size:.62rem;color:#667;text-align:right;margin-top:.15rem;font-family:"Geist Mono",monospace}

  .ticket .card-top{background:var(--paper-2);justify-content:space-between}
  .ticket .card-top .lbl{display:flex;align-items:center;gap:.5rem}
  .ticket .badge{font-family:"Geist Mono",monospace;font-size:.62rem;color:var(--emerald);background:rgba(15,163,107,.1);padding:.18rem .45rem;border-radius:5px;letter-spacing:.04em}
  .ticket-body{padding:.9rem .95rem;font-family:"Geist Mono",monospace;font-size:.82rem}
  .trow{display:flex;justify-content:space-between;padding:.32rem 0;border-bottom:1px dashed var(--line);opacity:0;transform:translateY(6px)}
  .trow .qty{color:var(--ink-soft)}
  .tmeta{margin-top:.7rem;display:flex;flex-direction:column;gap:.3rem;font-size:.74rem;color:var(--ink-soft);opacity:0;transform:translateY(6px)}
  .tmeta .row{display:flex;gap:.5rem;align-items:flex-start}
  .tmeta svg{width:13px;height:13px;flex:0 0 auto;margin-top:.12rem;color:var(--emerald)}
  .ttotal{margin-top:.7rem;padding-top:.6rem;border-top:2px solid var(--ink);display:flex;justify-content:space-between;font-weight:600;font-size:.95rem;color:var(--pine);opacity:0;transform:translateY(6px)}

  /* mini dashboard chip under device */

  /* reveal animation */
  @keyframes pop{to{opacity:1;transform:translateY(0)}}
  .anim .bubble{animation:pop .42s ease forwards}
  .anim .bubble:nth-child(1){animation-delay:.12s}
  .anim .bubble:nth-child(2){animation-delay:.42s}
  .anim .bubble:nth-child(3){animation-delay:.72s}
  .anim .bubble:nth-child(4){animation-delay:1.0s}
  .anim .trow{animation:pop .4s ease forwards}
  .anim .trow:nth-child(1){animation-delay:1.15s}
  .anim .trow:nth-child(2){animation-delay:1.28s}
  .anim .trow:nth-child(3){animation-delay:1.41s}
  .anim .tmeta{animation:pop .4s ease forwards;animation-delay:1.56s}
  .anim .ttotal{animation:pop .4s ease forwards;animation-delay:1.7s}

  /* ---------- section scaffolding ---------- */
  section{padding:84px 0}
  .sec-head{max-width:62ch}
  .sec-head h2{font-family:"Bricolage Grotesque";font-weight:700;font-size:clamp(1.85rem,3.4vw,2.7rem);line-height:1.07;letter-spacing:-.02em;color:var(--pine);margin:.7rem 0 0}
  .sec-head p{color:var(--ink-soft);font-size:1.1rem;margin:.9rem 0 0;max-width:54ch}

  /* ---------- money / calculator ---------- */
  .money{background:var(--pine);color:#eaf3ee}
  .money h2{color:#fff}
  .money .sec-head p{color:#bcd3c8}
  .calc{margin-top:42px;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
  .calc-control label{font-family:"Geist Mono",monospace;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#9fc0b2}
  .bignum{font-family:"Bricolage Grotesque";font-weight:700;font-size:clamp(2.2rem,5vw,3.2rem);color:#fff;line-height:1;margin:.4rem 0 1.3rem}
  .bignum small{font-size:1rem;color:#9fc0b2;font-family:"Geist Mono",monospace;font-weight:400;letter-spacing:.04em}
  input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:#1c5a45;outline-offset:6px}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:var(--karak);border:4px solid #0B3D2E;cursor:pointer;box-shadow:0 0 0 1px var(--karak)}
  input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--karak);border:4px solid #0B3D2E;cursor:pointer}
  .rng-scale{display:flex;justify-content:space-between;font-family:"Geist Mono",monospace;font-size:.7rem;color:#7da491;margin-top:.5rem}
  .calc-out{background:#0a3527;border:1px solid #1c5a45;border-radius:var(--r-lg);padding:26px;box-shadow:var(--shadow)}
  .breakdown{display:flex;flex-direction:column;gap:14px}
  .brk{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:14px;border-bottom:1px dashed #1c5a45}
  .brk .k{color:#bcd3c8;font-size:.95rem}
  .brk .v{font-family:"Geist Mono",monospace;font-size:1.15rem;font-weight:500}
  .brk.bad .v{color:#ff9a8b}
  .brk.flat .v{color:#eaf3ee}
  .keep{margin-top:6px;background:var(--karak);color:#3a2406;border-radius:var(--r-md);padding:16px 18px}
  .keep .k{font-size:.78rem;font-family:"Geist Mono",monospace;letter-spacing:.06em;text-transform:uppercase}
  .keep .v{font-family:"Bricolage Grotesque";font-weight:700;font-size:2rem;line-height:1.1}
  .keep .yr{font-family:"Geist Mono",monospace;font-size:.82rem;opacity:.85}
  .calc-foot{margin-top:18px;font-size:.8rem;color:#7da491}

  /* ---------- problem cards ---------- */

  /* ---------- solution flow ---------- */
  .step:not(:last-child)::after{content:"";position:absolute;top:19px;right:-2px;left:calc(50% + 26px);height:2px;background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 12px)}

  /* ---------- features ---------- */

  /* ---------- experience split ---------- */

  /* ---------- owner value ---------- */

  /* ---------- pricing ---------- */
  .pricing{background:var(--paper-2)}
  .price-wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:34px;margin-top:42px;align-items:center}
  .incl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7rem}
  .incl li{display:flex;gap:.7rem;align-items:center;font-size:1.03rem}
  .incl svg{width:20px;height:20px;color:var(--emerald);flex:0 0 auto}

  /* ---------- faq ---------- */
  .faq-list{margin-top:38px;border-top:1px solid var(--line)}
  details{border-bottom:1px solid var(--line)}
  summary{list-style:none;cursor:pointer;padding:22px 4px;display:flex;justify-content:space-between;align-items:center;gap:1rem;font-family:"Bricolage Grotesque";font-weight:600;font-size:1.12rem;color:var(--pine)}
  summary::-webkit-details-marker{display:none}
  .chev{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;transition:transform .25s ease,background .2s ease}
  details[open] .chev{transform:rotate(45deg);background:var(--karak);border-color:var(--karak);color:#fff}
  .chev svg{width:15px;height:15px}
  details p{margin:0 0 22px;color:var(--ink-soft);font-size:1.02rem;max-width:62ch}

  /* ---------- final cta ---------- */
  .cta{background:var(--pine);color:#fff;text-align:center}
  .cta h2{font-family:"Bricolage Grotesque";font-weight:700;font-size:clamp(2rem,4vw,3rem);letter-spacing:-.02em;color:#fff;max-width:18ch;margin:0 auto}
  .cta p{color:#bcd3c8;font-size:1.15rem;margin:1.2rem auto 0;max-width:48ch}
  .cta-row{display:flex;gap:.9rem;justify-content:center;margin-top:2.2rem;flex-wrap:wrap}

  /* ---------- footer ---------- */
  footer{background:#08301f;color:#9fc0b2;padding:46px 0 40px}
  .foot-grid{display:flex;justify-content:space-between;align-items:flex-start;gap:30px;flex-wrap:wrap}
  .foot-brand{display:flex;align-items:center;gap:.6rem;color:#fff;font-family:"Bricolage Grotesque";font-weight:700;font-size:1.15rem}
  .foot-links{display:flex;gap:1.6rem;font-size:.95rem}
  .foot-links a:hover{color:#fff}
  .foot-bottom{margin-top:30px;padding-top:20px;border-top:1px solid #134736;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:.85rem;font-family:"Geist Mono",monospace}

  /* ---------- responsive ---------- */
  @media(max-width:960px){
    .hero-grid{grid-template-columns:1fr;gap:46px}
    .hero p.lede{max-width:46ch}
    .calc{grid-template-columns:1fr;gap:30px}
    .step:not(:last-child)::after{display:none}
    .price-wrap{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    body{font-size:16px}
    section{padding:60px 0}
    .wrap{padding:0 18px}
    .stage{grid-template-columns:1fr;gap:46px}
    .hero-cta .btn{flex:1;justify-content:center}
  }

  @media(prefers-reduced-motion:reduce){
    html{scroll-behavior:auto}
    *{animation:none !important;transition:none !important}
    .bubble,.trow,.tmeta,.ttotal{opacity:1 !important;transform:none !important}
    .btn:hover{transform:none}
  }

  /* ===== operating-system section (front / back of house) ===== */


  /* feedback signature card */
  .fb-msg{background:#fff;border-radius:12px;border-top-left-radius:3px;padding:.6rem .75rem;font-size:.84rem;max-width:92%;box-shadow:0 1px 1px rgba(0,0,0,.06)}
  .fb-msg .stars{color:var(--karak);letter-spacing:2px;font-size:1rem}
  .fb-reply{align-self:flex-end;background:#DCF8C6;border-radius:12px;border-top-right-radius:3px;padding:.55rem .75rem;font-size:.84rem;max-width:80%}
  .fb-chip{display:inline-flex;align-items:center;gap:.45rem;align-self:flex-start;margin-top:.2rem;background:var(--pine);color:#dff3e9;font-family:"Geist Mono",monospace;font-size:.72rem;padding:.4rem .7rem;border-radius:999px}
  .fb-chip b{color:#fff}

  /* shift / cash reconciliation slip */
  .srow{display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px dashed var(--line);color:var(--ink)}
  .srow .lab{color:var(--ink-soft)}
  .srow.out .val{color:var(--karak-deep)}
  .sresult{display:flex;justify-content:space-between;align-items:center;margin-top:.7rem;padding-top:.7rem;border-top:2px solid var(--ink)}
  .sresult .lab{font-family:"Instrument Sans";font-weight:600;color:var(--pine)}
  .balanced{display:inline-flex;align-items:center;gap:.4rem;background:rgba(15,163,107,.12);color:var(--emerald);font-weight:600;padding:.3rem .6rem;border-radius:999px;font-size:.8rem}
  .balanced svg{width:14px;height:14px}

  /* AI menu card */
  .ai .aiitem.s1{width:90%}.ai .aiitem.s2{width:70%}.ai .aiitem.s3{width:80%}

  /* pwa strip */

  @media(max-width:960px){
  }
  @media(max-width:560px){
  }

  /* ===== proof band (live pilot) ===== */
  @media(max-width:860px){.proof-band{grid-template-columns:1fr;gap:26px;padding:30px}}

  /* ===== comparison table ===== */
  .compare{margin-top:42px;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-soft)}
  .crow{display:grid;grid-template-columns:1.5fr 1fr 1fr}
  .crow:not(:last-child){border-bottom:1px solid var(--line)}
  .crow .cc{padding:16px 20px;display:flex;align-items:center;gap:.5rem;font-size:.98rem;line-height:1.3}
  .crow .cc.feat-lbl{color:var(--ink);font-weight:500}
  .crow .cc.mkt{color:var(--ink-soft);border-left:1px solid var(--line)}
  .crow .cc.wo{background:rgba(15,163,107,.055);border-left:1px solid var(--line);color:var(--pine);font-weight:600}
  .crow.chead .cc{font-family:"Geist Mono",monospace;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;font-weight:500;background:var(--paper-2);color:var(--ink-soft)}
  .crow.chead .cc.wo{background:var(--pine);color:#fff}
  .crow .cc svg{width:17px;height:17px;flex:0 0 auto}
  .cc.wo svg{color:var(--emerald)}
  .cc.mkt svg{color:var(--karak-deep)}
  @media(max-width:600px){
    .crow{grid-template-columns:1fr}
    .crow.chead{display:none}
    .crow .cc.feat-lbl{font-weight:700;background:var(--paper-2);padding-bottom:8px}
    .crow .cc.mkt,.crow .cc.wo{border-left:none;padding-top:8px}
    .cc.mkt::before{content:"Marketplace";font-family:"Geist Mono",monospace;font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--karak-deep);width:88px;flex:0 0 auto}
    .cc.wo::before{content:"WhatsOrder";font-family:"Geist Mono",monospace;font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--emerald);width:88px;flex:0 0 auto}
  }

  /* ===== growth / AI section ===== */
  .recap-msg{background:#fff;border-radius:12px;border-top-left-radius:3px;padding:.7rem .8rem;font-size:.84rem;line-height:1.5;max-width:95%;box-shadow:0 1px 1px rgba(0,0,0,.06)}
  .recap-msg b{color:var(--pine)}
  .recap-msg .rec-head{display:flex;align-items:center;gap:.4rem;font-family:"Geist Mono",monospace;font-size:.64rem;letter-spacing:.06em;text-transform:uppercase;color:var(--emerald);margin-bottom:.35rem}
  .recap-msg .rec-head::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--emerald)}

  /* ===== sticky mobile CTA ===== */
  .mobile-cta{display:none}
  @media(max-width:860px){
    .mobile-cta{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:.55rem;
      padding:.7rem .9rem calc(.7rem + env(safe-area-inset-bottom));
      background:rgba(251,247,239,.94);backdrop-filter:blur(12px);border-top:1px solid var(--line)}
    .mobile-cta .btn{flex:1;justify-content:center;padding:.8rem 1rem}
    body{padding-bottom:78px}
  }
  @media(prefers-reduced-motion:reduce){.proof-band::before{display:none}}

  /* ===== language switcher + i18n ===== */
  .lang-switch{display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px}
  .lang-switch button{border:0;background:transparent;cursor:pointer;font-family:"Geist Mono",ui-monospace,monospace;font-size:.7rem;font-weight:600;color:var(--ink-soft);padding:.32rem .5rem;border-radius:999px;transition:background .15s ease,color .15s ease;white-space:nowrap}
  .lang-switch button:hover{color:var(--pine)}
  .lang-switch button.on{background:var(--pine);color:#fff}
  @media(max-width:560px){.nav-cta .btn-primary{display:none}}

  body.lang-ar{font-family:"IBM Plex Sans Arabic","Instrument Sans",system-ui,sans-serif}
  body.lang-ml{font-family:"Noto Sans Malayalam","Instrument Sans",system-ui,sans-serif}
  body.lang-ar *{letter-spacing:0 !important}
  body.lang-ml *{letter-spacing:normal !important}
  body.lang-ar :is(h1,h2,h3,h4,summary,.display,.bignum,.keep .v,.price-amt,.eyebrow,.band-desc b){font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}
  body.lang-ml :is(h1,h2,h3,h4,summary,.display,.bignum,.keep .v,.price-amt,.eyebrow,.band-desc b){font-family:"Noto Sans Malayalam",system-ui,sans-serif}
  body.lang-ar .hero h1{line-height:1.2}
  body.lang-ar h2,body.lang-ar h3{line-height:1.25}
  body.lang-ml .hero h1{font-size:clamp(2rem,4.4vw,3.3rem);line-height:1.3}
  body.lang-ml h2{line-height:1.3}
  body.lang-ml h3,body.lang-ml summary{line-height:1.4}
  [dir=rtl] .step:not(:last-child)::after{display:none}
  [dir=rtl] [data-no-i18n]{direction:ltr;text-align:left}
  [dir=rtl] .crow .cc.mkt,[dir=rtl] .crow .cc.wo{border-left:none;border-right:1px solid var(--line)}
  [dir=rtl] .crow.chead .cc.wo{border-right:none}

  /* ===== 2026-11 landing refresh ===== */
  h1,h2,h3{text-wrap:balance}
  .btn-lg{padding:1rem 1.6rem;font-size:1.04rem}
  .kicker{margin:0;font-weight:600;font-size:.98rem;color:var(--karak-deep)}
  .hero{padding:64px 0 0}
  .hero h1{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;line-height:1.02;letter-spacing:-.03em;font-size:clamp(2.6rem,5.6vw,4.5rem);margin:.9rem 0 0}
  .hero h1 span{display:block}
  .hero p.lede{max-width:40ch;font-size:1.2rem}
  .hero-note{margin:1.1rem 0 0;font-size:.95rem;color:var(--ink-soft)}
  .device-cap{margin:14px 0 0;text-align:center;font-size:.9rem;color:var(--ink-soft)}
  .ticket .badge{letter-spacing:0;font-size:.68rem}

  .facts{margin:64px 0 0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line)}
  .facts > div{padding:26px 24px 30px 0}
  .facts > div + div{padding-left:24px;border-left:1px solid var(--line)}
  .facts dt{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:clamp(1.7rem,3vw,2.3rem);line-height:1;letter-spacing:-.02em;color:var(--pine)}
  .facts dd{margin:.45rem 0 0;color:var(--ink-soft);font-size:.98rem;line-height:1.35}
  [dir=rtl] .facts > div{padding:26px 0 30px 24px}
  [dir=rtl] .facts > div + div{padding-right:24px;border-left:none;border-right:1px solid var(--line)}

  .money .calc-foot{max-width:44ch}

  .steps3{list-style:none;margin:48px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
  .steps3 li{border-top:2px solid var(--pine);padding-top:18px}
  .steps3 .n{display:block;font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:3.2rem;line-height:1;color:var(--karak)}
  .steps3 h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:1.3rem;line-height:1.2;margin:.8rem 0 .4rem;color:var(--pine)}
  .steps3 p{margin:0;color:var(--ink-soft);font-size:1rem}

  .live{margin-top:64px;background:var(--pine);color:#eaf3ee;border-radius:var(--r-lg);padding:34px 38px;display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap}
  .live-copy{flex:1 1 420px}
  .live h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:clamp(1.45rem,2.6vw,1.9rem);line-height:1.12;letter-spacing:-.02em;color:#fff;margin:0 0 .5rem}
  .live p{margin:0;color:#bcd3c8;max-width:52ch}
  .live-cta{display:flex;flex-direction:column;align-items:flex-start;gap:.7rem}
  .live-dot{display:inline-flex;align-items:center;gap:.5rem;font-size:.88rem;color:#a9e7c9}
  .live-dot i{width:9px;height:9px;border-radius:50%;background:var(--wa);box-shadow:0 0 0 4px rgba(37,211,102,.22)}

  .feat-sec{background:var(--paper-2)}
  .cols3{margin-top:46px;display:grid;grid-template-columns:repeat(3,1fr);gap:0;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden}
  .cols3 .col{padding:30px 30px 32px}
  .cols3 .col + .col{border-left:1px solid var(--line)}
  [dir=rtl] .cols3 .col + .col{border-left:none;border-right:1px solid var(--line)}
  .cols3 h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:1.35rem;line-height:1.2;color:var(--pine);margin:0 0 1rem}
  .cols3 ul{list-style:none;margin:0;padding:0}
  .cols3 li{position:relative;padding:.62rem 0 .62rem 1.7rem;border-top:1px solid var(--line);font-size:1rem;line-height:1.4;color:var(--ink)}
  .cols3 li::before{content:"";position:absolute;left:.15rem;top:1.02rem;width:.8rem;height:.42rem;border-left:2px solid var(--emerald);border-bottom:2px solid var(--emerald);transform:rotate(-45deg)}
  [dir=rtl] .cols3 li{padding:.62rem 1.7rem .62rem 0}
  [dir=rtl] .cols3 li::before{left:auto;right:.15rem}
  .cols3 li.is-soon{color:var(--ink-soft)}
  .cols3 li.is-soon::before{border-color:var(--karak)}

  .show{margin-top:22px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  .show-item{margin:0;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;display:flex;flex-direction:column}
  .show-ui{min-height:206px;padding:22px;display:flex;flex-direction:column;gap:.55rem;justify-content:center}
  .show-ui.chatbg{background:#ECE5DD}
  .show-ui.slipbg{background:var(--pine)}
  .mini-slip{background:#fff;border-radius:10px;padding:12px 16px;font-family:"Geist Mono",ui-monospace,monospace;font-size:.8rem}
  .mini-slip .srow{padding:.3rem 0}
  .mini-slip .sresult{margin-top:.5rem;padding-top:.5rem}
  .show-item figcaption{padding:22px 24px 26px;border-top:1px solid var(--line)}
  .show-item h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:1.15rem;line-height:1.25;color:var(--pine);margin:0 0 .4rem}
  .show-item p{margin:0;color:var(--ink-soft);font-size:.96rem}

  .pricing .price-wrap{grid-template-columns:minmax(0,420px) 1fr;gap:56px;align-items:start}
  .receipt{position:relative;background:#fff;padding:30px 30px 34px;font-family:"Geist Mono",ui-monospace,monospace;font-size:.95rem;color:var(--ink);box-shadow:var(--shadow);border-radius:6px 6px 0 0;transform:rotate(-1.2deg)}
  .receipt::after{content:"";position:absolute;left:0;right:0;bottom:-10px;height:10px;background:linear-gradient(135deg,#fff 50%,transparent 50%) 0 0/14px 10px repeat-x,linear-gradient(-135deg,#fff 50%,transparent 50%) 0 0/14px 10px repeat-x}
  .rc-head{text-align:center;padding-bottom:16px;margin-bottom:8px;border-bottom:2px dashed var(--line)}
  .rc-head b{display:block;font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:1.35rem;letter-spacing:-.01em;color:var(--pine)}
  .rc-head span{font-size:.8rem;color:var(--karak-deep)}
  .rc-row{display:flex;justify-content:space-between;gap:16px;padding:.55rem 0;border-bottom:1px dashed var(--line)}
  .rc-row span:first-child{color:var(--ink-soft)}
  .rc-total{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:14px;padding-top:14px;border-top:2px solid var(--ink);font-weight:600;color:var(--pine)}
  .rc-total span:last-child{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:2rem;line-height:1}
  .price-side h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;font-size:1.3rem;color:var(--pine);margin:0 0 1rem}
  .price-side .incl{display:grid;grid-template-columns:1fr 1fr;gap:.75rem 1.6rem}
  .price-side .incl li{align-items:flex-start;font-size:1rem;line-height:1.4}
  .price-side .incl svg{margin-top:.15rem}
  .price-cta{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}
  .pricing .btn-ghost{background:#fff}

  .faq-wrap{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px;align-items:start}
  .faq-wrap .faq-list{margin-top:0}
  @media(min-width:961px){.faq-wrap .sec-head{position:sticky;top:100px}}

  .cta h2{line-height:1.05;max-width:16ch}
  .cta-mail{font-size:.95rem !important;margin-top:1.6rem !important}
  .cta-mail a{color:#fff;text-decoration:underline;text-underline-offset:3px}
  .foot-tag{margin:.7rem 0 0;max-width:38ch;font-size:.92rem}
  .foot-links{flex-wrap:wrap;gap:.8rem 1.6rem}

  .mobile-cta{transform:translateY(110%);transition:transform .25s ease}
  .mobile-cta.show{transform:none}

  body.lang-ar :is(.facts dt,.steps3 .n,.rc-head b,.rc-total span){font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}
  body.lang-ml :is(.facts dt,.rc-head b){font-family:"Noto Sans Malayalam",system-ui,sans-serif}
  body.lang-ar .hero h1,body.lang-ml .hero h1{max-width:16ch;letter-spacing:0}
  body.lang-ar .hero h1{line-height:1.25}
  body.lang-ml .hero h1{font-size:clamp(1.9rem,4vw,3rem);line-height:1.35}
  body.lang-ar .receipt,body.lang-ml .receipt{font-family:inherit}

  @media(max-width:960px){
    .facts{grid-template-columns:1fr 1fr}
    .facts > div{padding:22px 16px 22px 0}
    .facts > div + div{padding-left:0;border-left:none}
    .facts > div:nth-child(even){padding-left:20px;border-left:1px solid var(--line)}
    .facts > div:nth-child(n+3){border-top:1px solid var(--line)}
    .steps3{grid-template-columns:1fr;gap:30px}
    .cols3{grid-template-columns:1fr}
    .cols3 .col + .col{border-left:none;border-top:1px solid var(--line)}
    .show{grid-template-columns:1fr}
    .pricing .price-wrap{grid-template-columns:1fr;gap:44px}
    .receipt{max-width:420px}
    .faq-wrap{grid-template-columns:1fr;gap:30px}
  }
  @media(max-width:560px){
    .hero{padding-top:40px}
    .facts{margin-top:44px}
    .live{padding:26px 22px}
    .cols3 .col{padding:24px 20px}
    .price-side .incl{grid-template-columns:1fr}
    .price-cta .btn,.live-cta .btn{width:100%;justify-content:center}
    .live-cta{width:100%}
    .receipt{transform:none}
  }
  @media(prefers-reduced-motion:reduce){.receipt{transform:none}}`;

const landingMarkup = String.raw`<!-- ===== HEADER ===== -->
<header>
  <div class="wrap nav">
    <a class="brand" href="#top" aria-label="WhatsOrder home">
      <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#0FA36B"/>
        <path d="M9 22.5 10.4 19A7 7 0 1 1 13 21.6L9 22.5Z" fill="#FFFFFF"/>
        <path d="M13.2 15.6l2 2 3.8-4.2" stroke="#0FA36B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      WhatsOrder
    </a>
    <nav class="nav-links" aria-label="Primary">
      <a href="#how">How it works</a>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-cta">
      <div class="lang-switch" role="group" aria-label="Language">
        <button type="button" data-lang="en" class="on">EN</button>
        <button type="button" data-lang="ar" lang="ar">عربي</button>
        <button type="button" data-lang="ml" lang="ml">മലയാളം</button>
      </div>
      <a class="btn btn-ghost" href="/r/chaixpress">Live demo</a>
      <a class="btn btn-primary" href="/try">Start free trial</a>
    </div>
  </div>
</header>

<main id="top">

<!-- ===== HERO ===== -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="kicker">For cafés and small restaurants in the UAE</p>
      <h1><span>Take orders on WhatsApp.</span> <span>Keep every dirham.</span></h1>
      <p class="lede">WhatsOrder gives your café its own menu link, turns each chat into a clean order ticket, and remembers every customer. AED 2 a day, with no commission.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/try">Start 14-day free trial</a>
        <a class="btn btn-ghost btn-lg" href="/r/chaixpress">Order from the live demo</a>
      </div>
      <p class="hero-note">Build your menu from a photo in about 2 minutes. No card needed.</p>
    </div>

    <!-- signature device -->
    <div class="device">
      <div class="stage" id="stage" data-no-i18n>
        <div class="chatcard">
          <div class="card-top">
            <span class="ava">A</span>
            <span>Customer · WhatsApp</span>
          </div>
          <div class="chat-body">
            <div class="bubble in">2 karak chai &amp; one zinger burger pls</div>
            <div class="bubble out">Anything else?</div>
            <div class="bubble in">ya add a lime juice. deliver to rawdha 3 near the masjid</div>
            <div class="bubble in">cash on delivery<span class="t">8:41 PM</span></div>
          </div>
        </div>
        <div class="arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15m0 0-6-6m6 6-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="ticket">
          <div class="card-top">
            <span class="lbl"><span class="dot" style="background:var(--emerald)"></span> Order #1043</span>
            <span class="badge">Ready to make</span>
          </div>
          <div class="ticket-body">
            <div class="trow"><span>Karak Tea <span class="qty">×2</span></span><span>AED&nbsp;4</span></div>
            <div class="trow"><span>Zinger Burger <span class="qty">×1</span></span><span>AED&nbsp;15</span></div>
            <div class="trow"><span>Fresh Lime Juice <span class="qty">×1</span></span><span>AED&nbsp;8</span></div>
            <div class="tmeta">
              <div class="row"><svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="2"/></svg> Rawdha 3, near the masjid</div>
              <div class="row"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2"/></svg> Cash on delivery</div>
            </div>
            <div class="ttotal"><span>Total</span><span>AED&nbsp;27</span></div>
          </div>
        </div>
      </div>
      <p class="device-cap">The same order, before and after WhatsOrder.</p>
    </div>
  </div>

  <!-- key facts -->
  <div class="wrap">
    <dl class="facts">
      <div><dt>0%</dt><dd>commission on every order</dd></div>
      <div><dt>AED 2</dt><dd>a day, one flat price</dd></div>
      <div><dt>14 days</dt><dd>free to try with your real menu</dd></div>
      <div><dt>2 min</dt><dd>to build a menu from a photo</dd></div>
    </dl>
  </div>
</section>

<!-- ===== MONEY / CALCULATOR ===== -->
<section class="money" id="math">
  <div class="wrap">
    <div class="sec-head">
      <h2>Delivery apps take a cut of every order. Direct orders don't.</h2>
      <p>Move some of your regulars to your own WhatsApp link and that commission stays with you. Drag the slider to match your numbers.</p>
    </div>
    <div class="calc">
      <div class="calc-control">
        <label for="vol">Monthly orders you move to direct</label>
        <div class="bignum" id="volOut">AED 20,000 <small>/ month</small></div>
        <input type="range" id="vol" min="5000" max="100000" step="5000" value="20000" aria-describedby="volOut">
        <div class="rng-scale" data-no-i18n><span>AED 5k</span><span>AED 50k</span><span>AED 100k</span></div>
        <p class="calc-foot">Assumes about 27% delivery-app commission. Real rates vary by platform and plan.</p>
      </div>
      <div class="calc-out" aria-live="polite">
        <div class="breakdown">
          <div class="brk bad">
            <span class="k">Delivery-app commission on those orders (27%)</span>
            <span class="v" id="commOut">−AED 5,400</span>
          </div>
          <div class="brk flat">
            <span class="k">WhatsOrder Starter (AED 2 a day)</span>
            <span class="v" id="flatOut">AED 60</span>
          </div>
        </div>
        <div class="keep">
          <div class="k">You keep, every month</div>
          <div class="v" id="keepOut">AED 5,340</div>
          <div class="yr" id="yrOut">≈ AED 64,080 a year back in your pocket</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== HOW IT WORKS ===== -->
<section id="how">
  <div class="wrap">
    <div class="sec-head">
      <h2>Three steps from paper menu to first order.</h2>
      <p>Your customers keep ordering on WhatsApp, exactly as they do now. You get the order in a form your kitchen can use.</p>
    </div>
    <ol class="steps3">
      <li>
        <span class="n" aria-hidden="true">1</span>
        <h3>Snap your menu</h3>
        <p>Photograph your paper menu. AI turns it into categories, items and prices. You check it, fix anything, and add photos.</p>
      </li>
      <li>
        <span class="n" aria-hidden="true">2</span>
        <h3>Share your link</h3>
        <p>You get one link and a QR code for your WhatsApp status, Instagram bio, tables and flyers. Customers order in their browser with nothing to install.</p>
      </li>
      <li>
        <span class="n" aria-hidden="true">3</span>
        <h3>Orders arrive ready to make</h3>
        <p>Each order lands as a clean WhatsApp message and on your order board, with items, address and payment method. Print a kitchen ticket if you want one.</p>
      </li>
    </ol>

    <div class="live">
      <div class="live-copy">
        <h3>Running every day at Chai Xpress, Ajman.</h3>
        <p>WhatsOrder is built inside a working café, not a lab. Open the real menu, add a karak to your cart and see exactly what your customers would see.</p>
      </div>
      <div class="live-cta">
        <a class="btn btn-wa btn-lg" href="/r/chaixpress">Order from the live menu</a>
        <span class="live-dot"><i></i>Live now</span>
      </div>
    </div>
  </div>
</section>

<!-- ===== FEATURES ===== -->
<section class="feat-sec" id="features">
  <div class="wrap">
    <div class="sec-head">
      <h2>Everything a small café runs on, in one app.</h2>
      <p>Ordering is the front door. Behind it is what you need to bring customers back and close the day without a notebook.</p>
    </div>

    <div class="cols3">
      <div class="col">
        <h3>Take orders</h3>
        <ul>
          <li>Menu link and QR code</li>
          <li>Delivery, pickup, car pickup and dine-in</li>
          <li>Sizes, add-ons and offers</li>
          <li>Menu in English and Arabic</li>
          <li>Live order board with sound alerts</li>
          <li>Kitchen ticket printing</li>
          <li>Counter orders entered by staff</li>
        </ul>
      </div>
      <div class="col">
        <h3>Bring customers back</h3>
        <ul>
          <li>Customer list built from every order</li>
          <li>New, repeat, VIP and inactive groups</li>
          <li>Stamp-card loyalty</li>
          <li>Feedback request after each order</li>
          <li>AI daily recap with one move for today</li>
          <li>Marketing posters made from your menu</li>
          <li class="is-soon">WhatsApp campaigns, coming soon</li>
        </ul>
      </div>
      <div class="col">
        <h3>Close the day</h3>
        <ul>
          <li>Shift open and cash-up</li>
          <li>Supplier pay-outs logged against the shift</li>
          <li>Sales reports with CSV export</li>
          <li>Delivery-app sales recorded alongside</li>
          <li>Customer credit accounts</li>
          <li>Delivery riders assigned to orders</li>
          <li>Installs on your phone like an app</li>
        </ul>
      </div>
    </div>

    <div class="show">
      <figure class="show-item">
        <div class="show-ui chatbg" aria-hidden="true" data-no-i18n>
          <div class="recap-msg">
            <div class="rec-head">Daily recap · Tuesday</div>
            Solid Tuesday — <b>41 orders, AED 1,490</b>, your best in 4 weeks. <b>Karak Tea is rising</b> (+30% on last week). Make it today's hero: pair it with samosa from 4–6 PM to lift your quiet hour.
          </div>
        </div>
        <figcaption>
          <h3>A morning recap that tells you what to do</h3>
          <p>AI reads yesterday's sales against your usual weekday and sends one clear move for today.</p>
        </figcaption>
      </figure>
      <figure class="show-item">
        <div class="show-ui chatbg" aria-hidden="true" data-no-i18n>
          <div class="fb-msg">How was order <b>#1043</b>? <div class="stars">★★★★★</div></div>
          <div class="fb-reply">5/5 — karak was perfect 🔥</div>
          <span class="fb-chip">This week: <b>★ 4.7</b> · 12 reviews</span>
        </div>
        <figcaption>
          <h3>Feedback tied to the exact order</h3>
          <p>Every completed order asks one question, so you can spot a bad night by item and fix it.</p>
        </figcaption>
      </figure>
      <figure class="show-item">
        <div class="show-ui slipbg" aria-hidden="true" data-no-i18n>
          <div class="mini-slip">
            <div class="srow"><span class="lab">Opening float</span><span class="val">AED 300</span></div>
            <div class="srow"><span class="lab">Cash sales</span><span class="val">AED 1,240</span></div>
            <div class="srow out"><span class="lab">Paid out · milk supplier</span><span class="val">−AED 180</span></div>
            <div class="srow"><span class="lab">Counted</span><span class="val">AED 1,360</span></div>
            <div class="sresult">
              <span class="lab">Variance</span>
              <span class="balanced"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg> AED 0 · balanced</span>
            </div>
          </div>
        </div>
        <figcaption>
          <h3>A cash drawer that ties out</h3>
          <p>Open a shift, log pay-outs as they happen, count at close. The app shows any difference straight away.</p>
        </figcaption>
      </figure>
    </div>
  </div>
</section>

<!-- ===== COMPARISON ===== -->
<section id="compare">
  <div class="wrap">
    <div class="sec-head">
      <h2>Same orders. You keep the margin — and the customer.</h2>
      <p>You can keep your delivery apps for new customers. WhatsOrder is for the regulars who already know you.</p>
    </div>
    <div class="compare">
      <div class="crow chead">
        <div class="cc feat-lbl"></div>
        <div class="cc mkt">Marketplace app</div>
        <div class="cc wo">WhatsOrder</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Commission on every order</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> 15–30%, forever</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Zero, ever</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Who owns the customer</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> The platform</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> You do</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Customer history &amp; insights</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Hidden from you</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Built in</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Feedback tied to each order</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> No</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Yes</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Shifts, cash &amp; vendor payouts</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Not included</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Built in</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">What it costs you</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> A cut of all sales</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ≈ AED 60 flat / month</div>
      </div>
    </div>
  </div>
</section>

<!-- ===== PRICING ===== -->
<section class="pricing" id="pricing">
  <div class="wrap">
    <div class="sec-head">
      <h2>AED 2 a day. Free for the first 14 days.</h2>
      <p>One flat price, about the cost of a karak a day. We never take a percentage of your sales.</p>
    </div>
    <div class="price-wrap">
      <div class="receipt" aria-label="Starter plan price summary">
        <div class="rc-head">
          <b>WhatsOrder Starter</b>
          <span>Founding offer</span>
        </div>
        <div class="rc-row"><span>Per day</span><span data-no-i18n>AED 2</span></div>
        <div class="rc-row"><span>Per month, about</span><span data-no-i18n>AED 60</span></div>
        <div class="rc-row"><span>Commission on orders</span><span data-no-i18n>AED 0</span></div>
        <div class="rc-row"><span>Setup help</span><span>Free</span></div>
        <div class="rc-row"><span>First 14 days</span><span>Free</span></div>
        <div class="rc-total"><span>Due today</span><span data-no-i18n>AED 0</span></div>
      </div>
      <div class="price-side">
        <h3>What you get</h3>
        <ul class="incl">
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Menu link and QR code</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> WhatsApp ordering and live order board</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Customer list, groups and stamp-card loyalty</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Feedback after every order</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> AI daily recap and sales reports</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Shift cash-up and supplier pay-outs</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> AI menu builder</li>
          <li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Setup help on WhatsApp</li>
        </ul>
        <div class="price-cta">
          <a class="btn btn-primary btn-lg" href="/try">Start 14-day free trial</a>
          <a class="btn btn-ghost btn-lg" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20start%20a%20free%20trial%20for%20my%20restaurant." target="_blank" rel="noopener">Ask a question on WhatsApp</a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== FAQ ===== -->
<section id="faq">
  <div class="wrap faq-wrap">
    <div class="sec-head">
      <h2>The questions owners ask first.</h2>
      <p>Still unsure about something? Message us on WhatsApp and a person will answer.</p>
    </div>
    <div class="faq-list">
      <details open>
        <summary>How does the 14-day free trial work? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Build your menu, share your link and take real orders for 14 days at no cost. If you want to carry on, Starter is AED 2 a day, about AED 60 a month. If not, you stop. There is no commission either way.</p>
      </details>
      <details>
        <summary>What do I need to get started? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>A phone or tablet and your WhatsApp number. There are no terminals to buy. A printer is optional, for kitchen tickets and receipts.</p>
      </details>
      <details>
        <summary>How long does setup take? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>The menu builder reads a photo of your menu in about two minutes. After that you check prices, add photos and share your link. Setup help is free if you want us to do it with you.</p>
      </details>
      <details>
        <summary>How do customers pay? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Cash or card when the order is delivered or collected, straight to you. WhatsOrder never holds your money.</p>
      </details>
      <details>
        <summary>Who delivers the orders? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Your own riders or staff. You set the delivery fee, minimum order and delivery area, and you can assign a rider to each order.</p>
      </details>
      <details>
        <summary>Can I keep my delivery apps? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Yes. WhatsOrder handles your direct orders and works alongside them. You can also record delivery-app sales at shift close, so the day's totals sit in one place.</p>
      </details>
      <details>
        <summary>Do customers need to install an app? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.</p>
      </details>
      <details>
        <summary>Does WhatsOrder replace WhatsApp? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.</p>
      </details>
      <details>
        <summary>Who owns the customer data? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>You do. Every order adds to your own customer list, and you can export your reports as a CSV file whenever you like.</p>
      </details>
      <details>
        <summary>Which languages does it support? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Customers can read your menu in English or Arabic. This site is also available in Malayalam.</p>
      </details>
      <details>
        <summary>Is there any commission? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.</p>
      </details>
      <details>
        <summary>How do I get help? <span class="chev"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Message us on WhatsApp. WhatsOrder is built in Ajman by people who run a café themselves.</p>
      </details>
    </div>
  </div>
</section>

<!-- ===== FINAL CTA ===== -->
<section class="cta" id="contact">
  <div class="wrap">
    <h2>Put your menu on WhatsApp today.</h2>
    <p>Start your 14-day free trial, or message us and we'll set it up with you.</p>
    <div class="cta-row">
      <a class="btn btn-primary btn-lg" href="/try">Start 14-day free trial</a>
      <a class="btn btn-wa btn-lg" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20start%20a%20free%20trial%20for%20my%20restaurant." target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 2 1.2 2.3 1.4.2.1.4.1.6-.1l.7-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4Z"/></svg> Message us on WhatsApp</a>
    </div>
    <p class="cta-mail">Prefer email? <a href="mailto:whatsorder.ae@gmail.com?subject=WhatsOrder%20free%20trial" data-no-i18n>whatsorder.ae@gmail.com</a></p>
  </div>
</section>

</main>

<!-- ===== FOOTER ===== -->
<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="foot-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0FA36B"/><path d="M9 22.5 10.4 19A7 7 0 1 1 13 21.6L9 22.5Z" fill="#FFFFFF"/><path d="m13.2 15.6 2 2 3.8-4.2" stroke="#0FA36B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          WhatsOrder
        </div>
        <p class="foot-tag">Commission-free WhatsApp ordering for cafés and small restaurants. Built in Ajman.</p>
      </div>
      <nav class="foot-links" aria-label="Footer">
        <a href="/r/chaixpress">Live demo</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
        <a href="/jobs">Restaurant jobs</a>
        <a href="/jobs/post">Post a job</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </div>
    <div class="foot-bottom" data-no-i18n>
      <span>© <span id="yr"></span> WhatsOrder · @whatsorder.ae</span>
      <span>whatsorder.ae@gmail.com</span>
    </div>
  </div>
</footer>

<!-- ===== STICKY MOBILE CTA ===== -->
<div class="mobile-cta" id="mobileCta">
  <a class="btn btn-wa" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20start%20a%20free%20trial%20for%20my%20restaurant." target="_blank" rel="noopener" aria-label="Message WhatsOrder on WhatsApp"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 2 1.2 2.3 1.4.2.1.4.1.6-.1l.7-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4Z"/></svg> WhatsApp</a>
  <a class="btn btn-primary" href="/try">Start free trial</a>
</div>`;

const landingScript = String.raw`// year
  document.getElementById('yr').textContent = new Date().getFullYear();

  // reveal animation on hero device (respect reduced motion)
  (function(){
    var stage = document.getElementById('stage');
    if(!stage) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){ stage.classList.add('anim'); return; }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ stage.classList.add('anim'); io.disconnect(); } });
    }, {threshold:.4});
    io.observe(stage);
  })();

  // commission calculator
  (function(){
    var vol = document.getElementById('vol');
    if(!vol) return;
    var fmt = new Intl.NumberFormat('en-AE');
    var RATE = 0.27, FLAT = 60;
    function render(){
      var m = +vol.value;
      var comm = Math.round(m * RATE);
      var keep = comm - FLAT;
      var t = window.__woCalcI18n || { month: '/ month', yr: '≈ AED {v} a year back in your pocket' };
      document.getElementById('volOut').innerHTML = 'AED ' + fmt.format(m) + ' <small>' + t.month + '</small>';
      document.getElementById('commOut').textContent = '−AED ' + fmt.format(comm);
      document.getElementById('flatOut').textContent = 'AED ' + FLAT;
      document.getElementById('keepOut').textContent = 'AED ' + fmt.format(keep);
      document.getElementById('yrOut').textContent = t.yr.replace('{v}', fmt.format(keep * 12));
    }
    vol.addEventListener('input', render);
    window.__woCalcRender = render;
    render();
  })();

  // ===== i18n (EN / AR / ML) =====
  (function(){
    var AR = {
      "How it works": "كيف يعمل",
      "Features": "المزايا",
      "Pricing": "الأسعار",
      "FAQ": "الأسئلة الشائعة",
      "Live demo": "عرض مباشر",
      "Start free trial": "ابدأ التجربة المجانية",
      "For cafés and small restaurants in the UAE": "للمقاهي والمطاعم الصغيرة في الإمارات",
      "Take orders on WhatsApp.": "استقبل الطلبات على واتساب.",
      "Keep every dirham.": "واحتفظ بكل درهم.",
      "WhatsOrder gives your café its own menu link, turns each chat into a clean order ticket, and remembers every customer. AED 2 a day, with no commission.": "واتس أوردر يمنح مقهاك رابط قائمة خاصاً به، ويحوّل كل محادثة إلى تذكرة طلب واضحة، ويتذكّر كل عميل. بدرهمين في اليوم، ومن دون عمولة.",
      "Start 14-day free trial": "ابدأ تجربة مجانية لمدة 14 يوماً",
      "Order from the live demo": "اطلب من العرض المباشر",
      "Build your menu from a photo in about 2 minutes. No card needed.": "أنشئ قائمتك من صورة في نحو دقيقتين. لا حاجة إلى بطاقة.",
      "The same order, before and after WhatsOrder.": "الطلب نفسه، قبل واتس أوردر وبعده.",
      "commission on every order": "عمولة على كل طلب",
      "a day, one flat price": "في اليوم، بسعر ثابت واحد",
      "14 days": "14 يوماً",
      "free to try with your real menu": "تجربة مجانية بقائمتك الحقيقية",
      "2 min": "دقيقتان",
      "to build a menu from a photo": "لإنشاء قائمة من صورة",
      "Delivery apps take a cut of every order. Direct orders don't.": "تطبيقات التوصيل تقتطع من كل طلب. الطلبات المباشرة لا.",
      "Move some of your regulars to your own WhatsApp link and that commission stays with you. Drag the slider to match your numbers.": "انقل بعض زبائنك الدائمين إلى رابط واتساب الخاص بك وستبقى تلك العمولة معك. حرّك المؤشر ليطابق أرقامك.",
      "Monthly orders you move to direct": "الطلبات الشهرية التي تنقلها إلى الطلب المباشر",
      "Assumes about 27% delivery-app commission. Real rates vary by platform and plan.": "بافتراض عمولة تطبيقات توصيل بنحو 27%. النسب الفعلية تختلف حسب المنصة والباقة.",
      "Delivery-app commission on those orders (27%)": "عمولة تطبيق التوصيل على تلك الطلبات (27%)",
      "WhatsOrder Starter (AED 2 a day)": "واتس أوردر ستارتر (درهمان في اليوم)",
      "You keep, every month": "يبقى لك كل شهر",
      "Three steps from paper menu to first order.": "ثلاث خطوات من القائمة الورقية إلى أول طلب.",
      "Your customers keep ordering on WhatsApp, exactly as they do now. You get the order in a form your kitchen can use.": "يواصل عملاؤك الطلب عبر واتساب تماماً كما يفعلون الآن. ويصلك الطلب بصيغة يستطيع مطبخك العمل بها.",
      "Snap your menu": "صوّر قائمتك",
      "Photograph your paper menu. AI turns it into categories, items and prices. You check it, fix anything, and add photos.": "صوّر قائمتك الورقية. الذكاء الاصطناعي يحوّلها إلى أقسام وأصناف وأسعار. راجعها وصحّح ما يلزم وأضف الصور.",
      "Share your link": "شارك رابطك",
      "You get one link and a QR code for your WhatsApp status, Instagram bio, tables and flyers. Customers order in their browser with nothing to install.": "تحصل على رابط واحد ورمز QR لحالة واتساب وصفحة إنستغرام والطاولات والمنشورات. العملاء يطلبون من المتصفح من دون تثبيت أي شيء.",
      "Orders arrive ready to make": "الطلبات تصل جاهزة للتحضير",
      "Each order lands as a clean WhatsApp message and on your order board, with items, address and payment method. Print a kitchen ticket if you want one.": "كل طلب يصل كرسالة واتساب واضحة وعلى لوحة الطلبات، مع الأصناف والعنوان وطريقة الدفع. اطبع تذكرة للمطبخ إن أردت.",
      "Running every day at Chai Xpress, Ajman.": "يعمل كل يوم في تشاي إكسبرس، عجمان.",
      "WhatsOrder is built inside a working café, not a lab. Open the real menu, add a karak to your cart and see exactly what your customers would see.": "واتس أوردر بُني داخل مقهى يعمل فعلاً، لا في مختبر. افتح القائمة الحقيقية، أضف كوب كرك إلى سلتك وشاهد ما سيراه عملاؤك تماماً.",
      "Order from the live menu": "اطلب من القائمة المباشرة",
      "Live now": "يعمل الآن",
      "Everything a small café runs on, in one app.": "كل ما يحتاجه مقهى صغير ليعمل، في تطبيق واحد.",
      "Ordering is the front door. Behind it is what you need to bring customers back and close the day without a notebook.": "الطلبات هي الباب الأمامي. وخلفه ما تحتاجه لإعادة العملاء وإقفال اليوم من دون دفتر.",
      "Take orders": "استقبل الطلبات",
      "Menu link and QR code": "رابط القائمة ورمز QR",
      "Delivery, pickup, car pickup and dine-in": "توصيل واستلام واستلام من السيارة وطلب داخل المحل",
      "Sizes, add-ons and offers": "أحجام وإضافات وعروض",
      "Menu in English and Arabic": "قائمة بالإنجليزية والعربية",
      "Live order board with sound alerts": "لوحة طلبات مباشرة مع تنبيهات صوتية",
      "Kitchen ticket printing": "طباعة تذاكر المطبخ",
      "Counter orders entered by staff": "طلبات الكاونتر يدخلها الموظفون",
      "Bring customers back": "أعِد العملاء",
      "Customer list built from every order": "قائمة عملاء تُبنى من كل طلب",
      "New, repeat, VIP and inactive groups": "مجموعات: جديد ومتكرر وVIP وغير نشط",
      "Stamp-card loyalty": "ولاء ببطاقة الأختام",
      "Feedback request after each order": "طلب تقييم بعد كل طلب",
      "AI daily recap with one move for today": "ملخص يومي بالذكاء الاصطناعي مع خطوة واحدة لليوم",
      "Marketing posters made from your menu": "ملصقات تسويقية تُصنع من قائمتك",
      "WhatsApp campaigns, coming soon": "حملات واتساب، قريباً",
      "Close the day": "أقفل اليوم",
      "Shift open and cash-up": "فتح الوردية وجرد النقد",
      "Supplier pay-outs logged against the shift": "مدفوعات الموردين تُسجّل على الوردية",
      "Sales reports with CSV export": "تقارير مبيعات مع تصدير CSV",
      "Delivery-app sales recorded alongside": "مبيعات تطبيقات التوصيل تُسجّل إلى جانبها",
      "Customer credit accounts": "حسابات آجلة للعملاء",
      "Delivery riders assigned to orders": "تعيين سائقي التوصيل للطلبات",
      "Installs on your phone like an app": "يُثبَّت على هاتفك كأي تطبيق",
      "A morning recap that tells you what to do": "ملخص صباحي يخبرك بما تفعله",
      "AI reads yesterday's sales against your usual weekday and sends one clear move for today.": "يقرأ الذكاء الاصطناعي مبيعات الأمس مقارنةً بيومك المعتاد من الأسبوع ويرسل خطوة واحدة واضحة لليوم.",
      "Feedback tied to the exact order": "تقييم مرتبط بالطلب نفسه",
      "Every completed order asks one question, so you can spot a bad night by item and fix it.": "كل طلب مكتمل يطرح سؤالاً واحداً، فتعرف أي صنف أفسد الليلة وتعالجه.",
      "A cash drawer that ties out": "درج نقد مطابق دائماً",
      "Open a shift, log pay-outs as they happen, count at close. The app shows any difference straight away.": "افتح الوردية، سجّل المدفوعات عند حدوثها، وعُدّ النقد عند الإقفال. التطبيق يُظهر أي فرق فوراً.",
      "Same orders. You keep the margin — and the customer.": "نفس الطلبات. أنت تحتفظ بالهامش — وبالعميل.",
      "You can keep your delivery apps for new customers. WhatsOrder is for the regulars who already know you.": "يمكنك إبقاء تطبيقات التوصيل للعملاء الجدد. واتس أوردر لزبائنك الدائمين الذين يعرفونك.",
      "Marketplace app": "تطبيق المنصة",
      "Commission on every order": "عمولة على كل طلب",
      "15–30%, forever": "‏15–30%، للأبد",
      "Zero, ever": "صفر، دائماً",
      "Who owns the customer": "من يملك العميل",
      "The platform": "المنصة",
      "You do": "أنت",
      "Customer history & insights": "تاريخ العملاء والرؤى",
      "Hidden from you": "محجوب عنك",
      "Built in": "مدمج",
      "Feedback tied to each order": "تقييم مرتبط بكل طلب",
      "No": "لا",
      "Yes": "نعم",
      "Shifts, cash & vendor payouts": "الورديات والنقدية ودفعات الموردين",
      "Not included": "غير متوفرة",
      "What it costs you": "ماذا يكلفك",
      "A cut of all sales": "نسبة من كل مبيعاتك",
      "≈ AED 60 flat / month": "≈ 60 درهماً ثابتة شهرياً",
      "AED 2 a day. Free for the first 14 days.": "درهمان في اليوم. مجاناً لأول 14 يوماً.",
      "One flat price, about the cost of a karak a day. We never take a percentage of your sales.": "سعر ثابت واحد، بنحو ثمن كوب كرك يومياً. لا نأخذ أبداً نسبة من مبيعاتك.",
      "WhatsOrder Starter": "واتس أوردر ستارتر",
      "Founding offer": "عرض التأسيس",
      "Per day": "في اليوم",
      "Per month, about": "في الشهر، تقريباً",
      "Commission on orders": "العمولة على الطلبات",
      "Setup help": "المساعدة في الإعداد",
      "Free": "مجاناً",
      "First 14 days": "أول 14 يوماً",
      "Due today": "المستحق اليوم",
      "What you get": "ما تحصل عليه",
      "WhatsApp ordering and live order board": "طلبات واتساب ولوحة طلبات مباشرة",
      "Customer list, groups and stamp-card loyalty": "قائمة العملاء والمجموعات وولاء بطاقة الأختام",
      "Feedback after every order": "تقييم بعد كل طلب",
      "AI daily recap and sales reports": "ملخص يومي بالذكاء الاصطناعي وتقارير مبيعات",
      "Shift cash-up and supplier pay-outs": "جرد نقد الوردية ومدفوعات الموردين",
      "AI menu builder": "منشئ القائمة بالذكاء الاصطناعي",
      "Setup help on WhatsApp": "مساعدة في الإعداد عبر واتساب",
      "Ask a question on WhatsApp": "اطرح سؤالاً على واتساب",
      "The questions owners ask first.": "الأسئلة التي يطرحها المُلّاك أولاً.",
      "Still unsure about something? Message us on WhatsApp and a person will answer.": "ما زال لديك استفسار؟ راسلنا على واتساب وسيجيبك شخص حقيقي.",
      "How does the 14-day free trial work?": "كيف تعمل التجربة المجانية لمدة 14 يوماً؟",
      "Build your menu, share your link and take real orders for 14 days at no cost. If you want to carry on, Starter is AED 2 a day, about AED 60 a month. If not, you stop. There is no commission either way.": "أنشئ قائمتك، شارك رابطك واستقبل طلبات حقيقية لمدة 14 يوماً من دون أي تكلفة. إن أردت الاستمرار فباقة ستارتر بدرهمين في اليوم، أي نحو 60 درهماً في الشهر. وإن لم ترد، تتوقف. لا عمولة في الحالتين.",
      "What do I need to get started?": "ماذا أحتاج لأبدأ؟",
      "A phone or tablet and your WhatsApp number. There are no terminals to buy. A printer is optional, for kitchen tickets and receipts.": "هاتف أو جهاز لوحي ورقم واتساب الخاص بك. لا أجهزة تشتريها. الطابعة اختيارية، لتذاكر المطبخ والإيصالات.",
      "How long does setup take?": "كم يستغرق الإعداد؟",
      "The menu builder reads a photo of your menu in about two minutes. After that you check prices, add photos and share your link. Setup help is free if you want us to do it with you.": "منشئ القائمة يقرأ صورة قائمتك في نحو دقيقتين. بعدها تراجع الأسعار وتضيف الصور وتشارك رابطك. المساعدة في الإعداد مجانية إن أردت أن ننجزه معك.",
      "How do customers pay?": "كيف يدفع العملاء؟",
      "Cash or card when the order is delivered or collected, straight to you. WhatsOrder never holds your money.": "نقداً أو بالبطاقة عند توصيل الطلب أو استلامه، مباشرةً إليك. واتس أوردر لا يحتفظ بأموالك أبداً.",
      "Who delivers the orders?": "من يوصّل الطلبات؟",
      "Your own riders or staff. You set the delivery fee, minimum order and delivery area, and you can assign a rider to each order.": "سائقوك أو موظفوك. أنت تحدد رسوم التوصيل والحد الأدنى للطلب ومنطقة التوصيل، ويمكنك تعيين سائق لكل طلب.",
      "Can I keep my delivery apps?": "هل أستطيع إبقاء تطبيقات التوصيل؟",
      "Yes. WhatsOrder handles your direct orders and works alongside them. You can also record delivery-app sales at shift close, so the day's totals sit in one place.": "نعم. واتس أوردر يدير طلباتك المباشرة ويعمل إلى جانبها. ويمكنك أيضاً تسجيل مبيعات تطبيقات التوصيل عند إقفال الوردية، لتكون إجماليات اليوم في مكان واحد.",
      "Do customers need to install an app?": "هل يحتاج العملاء إلى تثبيت تطبيق؟",
      "No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.": "لا. يفتحون رابط القائمة أو يمسحون رمز QR في المتصفح — بلا تنزيل ولا حساب ولا عناء.",
      "Does WhatsOrder replace WhatsApp?": "هل يستبدل واتس أوردر واتساب؟",
      "No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.": "لا. إنه يعمل إلى جانب واتساب ويجعل الطلبات التي تصل إليه نظيفة ومنظمة فحسب. يبقى عملاؤك يراسلونك حيث اعتادوا تماماً.",
      "Who owns the customer data?": "من يملك بيانات العملاء؟",
      "You do. Every order adds to your own customer list, and you can export your reports as a CSV file whenever you like.": "أنت. كل طلب يُضاف إلى قائمة عملائك الخاصة، ويمكنك تصدير تقاريرك كملف CSV متى شئت.",
      "Which languages does it support?": "ما اللغات التي يدعمها؟",
      "Customers can read your menu in English or Arabic. This site is also available in Malayalam.": "يمكن للعملاء قراءة قائمتك بالإنجليزية أو العربية. وهذا الموقع متاح أيضاً بالمالايالامية.",
      "Is there any commission?": "هل هناك أي عمولة؟",
      "None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.": "لا شيء. واتس أوردر رسم شهري ثابت، ولا نأخذ أبداً نسبة من مبيعاتك.",
      "How do I get help?": "كيف أحصل على المساعدة؟",
      "Message us on WhatsApp. WhatsOrder is built in Ajman by people who run a café themselves.": "راسلنا على واتساب. واتس أوردر صُنع في عجمان على يد أشخاص يديرون مقهى بأنفسهم.",
      "Put your menu on WhatsApp today.": "ضع قائمتك على واتساب اليوم.",
      "Start your 14-day free trial, or message us and we'll set it up with you.": "ابدأ تجربتك المجانية لمدة 14 يوماً، أو راسلنا وسنجهّزها معك.",
      "Message us on WhatsApp": "راسلنا على واتساب",
      "Prefer email?": "تفضّل البريد الإلكتروني؟",
      "Commission-free WhatsApp ordering for cafés and small restaurants. Built in Ajman.": "طلبات واتساب بلا عمولة للمقاهي والمطاعم الصغيرة. صُنع في عجمان.",
      "Restaurant jobs": "وظائف المطاعم",
      "Post a job": "انشر وظيفة",
      "Privacy": "الخصوصية",
      "WhatsApp": "واتساب"
    };
    var ML = {
      "How it works": "എങ്ങനെ പ്രവർത്തിക്കുന്നു",
      "Features": "ഫീച്ചറുകൾ",
      "Pricing": "വില",
      "FAQ": "ചോദ്യങ്ങൾ",
      "Live demo": "ലൈവ് ഡെമോ",
      "Start free trial": "സൗജന്യ ട്രയൽ തുടങ്ങൂ",
      "For cafés and small restaurants in the UAE": "യുഎഇയിലെ കഫേകൾക്കും ചെറുകിട റെസ്റ്ററന്റുകൾക്കും",
      "Take orders on WhatsApp.": "വാട്ട്സ്ആപ്പിൽ ഓർഡർ എടുക്കൂ.",
      "Keep every dirham.": "ഓരോ ദിർഹവും നിങ്ങൾക്കു തന്നെ.",
      "WhatsOrder gives your café its own menu link, turns each chat into a clean order ticket, and remembers every customer. AED 2 a day, with no commission.": "WhatsOrder നിങ്ങളുടെ കഫേയ്ക്ക് സ്വന്തം മെനു ലിങ്ക് നൽകുന്നു, ഓരോ ചാറ്റും വ്യക്തമായ ഓർഡർ ടിക്കറ്റാക്കുന്നു, ഓരോ കസ്റ്റമറെയും ഓർത്തുവയ്ക്കുന്നു. ദിവസം AED 2, കമ്മീഷൻ ഇല്ല.",
      "Start 14-day free trial": "14 ദിവസത്തെ സൗജന്യ ട്രയൽ തുടങ്ങൂ",
      "Order from the live demo": "ലൈവ് ഡെമോയിൽ ഓർഡർ ചെയ്തു നോക്കൂ",
      "Build your menu from a photo in about 2 minutes. No card needed.": "ഒരു ഫോട്ടോയിൽ നിന്ന് ഏകദേശം 2 മിനിറ്റിൽ മെനു തയ്യാറാക്കാം. കാർഡ് വേണ്ട.",
      "The same order, before and after WhatsOrder.": "ഒരേ ഓർഡർ, WhatsOrder-നു മുമ്പും ശേഷവും.",
      "commission on every order": "ഓരോ ഓർഡറിലും കമ്മീഷൻ",
      "a day, one flat price": "ദിവസം, ഒറ്റ നിശ്ചിത വില",
      "14 days": "14 ദിവസം",
      "free to try with your real menu": "നിങ്ങളുടെ യഥാർത്ഥ മെനുവുമായി സൗജന്യമായി പരീക്ഷിക്കാം",
      "2 min": "2 മിനിറ്റ്",
      "to build a menu from a photo": "ഫോട്ടോയിൽ നിന്ന് മെനു തയ്യാറാക്കാൻ",
      "Delivery apps take a cut of every order. Direct orders don't.": "ഡെലിവറി ആപ്പുകൾ ഓരോ ഓർഡറിൽ നിന്നും ഒരു പങ്ക് എടുക്കുന്നു. നേരിട്ടുള്ള ഓർഡറുകളിൽ അതില്ല.",
      "Move some of your regulars to your own WhatsApp link and that commission stays with you. Drag the slider to match your numbers.": "സ്ഥിരം കസ്റ്റമർമാരിൽ ചിലരെ നിങ്ങളുടെ സ്വന്തം വാട്ട്സ്ആപ്പ് ലിങ്കിലേക്ക് മാറ്റൂ; ആ കമ്മീഷൻ നിങ്ങളുടെ കൈയിൽ തന്നെ നിൽക്കും. നിങ്ങളുടെ കണക്കിനനുസരിച്ച് സ്ലൈഡർ നീക്കൂ.",
      "Monthly orders you move to direct": "നേരിട്ടുള്ള ഓർഡറിലേക്ക് മാറ്റുന്ന മാസ വിൽപ്പന",
      "Assumes about 27% delivery-app commission. Real rates vary by platform and plan.": "ഏകദേശം 27% ഡെലിവറി ആപ്പ് കമ്മീഷൻ കണക്കാക്കിയിരിക്കുന്നു. യഥാർത്ഥ നിരക്ക് പ്ലാറ്റ്ഫോമും പ്ലാനും അനുസരിച്ച് മാറും.",
      "Delivery-app commission on those orders (27%)": "ആ ഓർഡറുകളിലെ ഡെലിവറി ആപ്പ് കമ്മീഷൻ (27%)",
      "WhatsOrder Starter (AED 2 a day)": "WhatsOrder സ്റ്റാർട്ടർ (ദിവസം AED 2)",
      "You keep, every month": "ഓരോ മാസവും നിങ്ങൾക്കു കിട്ടുന്നത്",
      "Three steps from paper menu to first order.": "പേപ്പർ മെനുവിൽ നിന്ന് ആദ്യ ഓർഡറിലേക്ക് മൂന്ന് ഘട്ടങ്ങൾ.",
      "Your customers keep ordering on WhatsApp, exactly as they do now. You get the order in a form your kitchen can use.": "കസ്റ്റമർമാർ ഇപ്പോഴത്തെപ്പോലെ തന്നെ വാട്ട്സ്ആപ്പിൽ ഓർഡർ ചെയ്യും. അടുക്കളയ്ക്ക് ഉപയോഗിക്കാവുന്ന രൂപത്തിൽ ഓർഡർ നിങ്ങൾക്കു കിട്ടും.",
      "Snap your menu": "മെനുവിന്റെ ഫോട്ടോ എടുക്കൂ",
      "Photograph your paper menu. AI turns it into categories, items and prices. You check it, fix anything, and add photos.": "പേപ്പർ മെനുവിന്റെ ഫോട്ടോ എടുക്കൂ. AI അതിനെ വിഭാഗങ്ങളും ഇനങ്ങളും വിലകളുമാക്കും. നിങ്ങൾ പരിശോധിച്ച് തിരുത്തി ഫോട്ടോകൾ ചേർക്കൂ.",
      "Share your link": "ലിങ്ക് പങ്കിടൂ",
      "You get one link and a QR code for your WhatsApp status, Instagram bio, tables and flyers. Customers order in their browser with nothing to install.": "വാട്ട്സ്ആപ്പ് സ്റ്റാറ്റസിനും ഇൻസ്റ്റാഗ്രാം ബയോയ്ക്കും ടേബിളുകൾക്കും ഫ്ലയറുകൾക്കുമായി ഒരു ലിങ്കും QR കോഡും കിട്ടും. കസ്റ്റമർമാർ ഒന്നും ഇൻസ്റ്റാൾ ചെയ്യാതെ ബ്രൗസറിൽ ഓർഡർ ചെയ്യും.",
      "Orders arrive ready to make": "ഓർഡറുകൾ തയ്യാറാക്കാൻ പാകത്തിൽ എത്തുന്നു",
      "Each order lands as a clean WhatsApp message and on your order board, with items, address and payment method. Print a kitchen ticket if you want one.": "ഓരോ ഓർഡറും ഇനങ്ങളും വിലാസവും പേയ്മെന്റ് രീതിയും സഹിതം വ്യക്തമായ വാട്ട്സ്ആപ്പ് സന്ദേശമായും ഓർഡർ ബോർഡിലും എത്തും. വേണമെങ്കിൽ കിച്ചൻ ടിക്കറ്റ് പ്രിന്റ് ചെയ്യാം.",
      "Running every day at Chai Xpress, Ajman.": "അജ്മാനിലെ ചായ് എക്സ്പ്രസിൽ എല്ലാ ദിവസവും പ്രവർത്തിക്കുന്നു.",
      "WhatsOrder is built inside a working café, not a lab. Open the real menu, add a karak to your cart and see exactly what your customers would see.": "WhatsOrder നിർമിച്ചത് ലാബിലല്ല, പ്രവർത്തിക്കുന്ന ഒരു കഫേയ്ക്കുള്ളിലാണ്. യഥാർത്ഥ മെനു തുറന്ന് ഒരു കരക് കാർട്ടിലിട്ട് നിങ്ങളുടെ കസ്റ്റമർമാർ കാണുന്നത് അതേപടി കാണൂ.",
      "Order from the live menu": "ലൈവ് മെനുവിൽ ഓർഡർ ചെയ്യൂ",
      "Live now": "ഇപ്പോൾ ലൈവ്",
      "Everything a small café runs on, in one app.": "ഒരു ചെറിയ കഫേ നടത്താൻ വേണ്ടതെല്ലാം, ഒറ്റ ആപ്പിൽ.",
      "Ordering is the front door. Behind it is what you need to bring customers back and close the day without a notebook.": "ഓർഡറിംഗ് മുൻവാതിൽ മാത്രം. കസ്റ്റമർമാരെ തിരികെ കൊണ്ടുവരാനും നോട്ടുബുക്കില്ലാതെ ദിവസം ക്ലോസ് ചെയ്യാനും വേണ്ടത് അതിനു പിന്നിലുണ്ട്.",
      "Take orders": "ഓർഡർ എടുക്കാൻ",
      "Menu link and QR code": "മെനു ലിങ്കും QR കോഡും",
      "Delivery, pickup, car pickup and dine-in": "ഡെലിവറി, പിക്കപ്പ്, കാർ പിക്കപ്പ്, ഡൈൻ-ഇൻ",
      "Sizes, add-ons and offers": "സൈസുകൾ, ആഡ്-ഓണുകൾ, ഓഫറുകൾ",
      "Menu in English and Arabic": "ഇംഗ്ലീഷിലും അറബിയിലും മെനു",
      "Live order board with sound alerts": "ശബ്ദ അലേർട്ടുള്ള ലൈവ് ഓർഡർ ബോർഡ്",
      "Kitchen ticket printing": "കിച്ചൻ ടിക്കറ്റ് പ്രിന്റിംഗ്",
      "Counter orders entered by staff": "സ്റ്റാഫ് ചേർക്കുന്ന കൗണ്ടർ ഓർഡറുകൾ",
      "Bring customers back": "കസ്റ്റമർമാരെ തിരികെ കൊണ്ടുവരാൻ",
      "Customer list built from every order": "ഓരോ ഓർഡറിൽ നിന്നും രൂപപ്പെടുന്ന കസ്റ്റമർ ലിസ്റ്റ്",
      "New, repeat, VIP and inactive groups": "പുതിയവർ, സ്ഥിരക്കാർ, VIP, നിഷ്ക്രിയർ എന്നീ ഗ്രൂപ്പുകൾ",
      "Stamp-card loyalty": "സ്റ്റാമ്പ് കാർഡ് ലോയൽറ്റി",
      "Feedback request after each order": "ഓരോ ഓർഡറിനു ശേഷവും ഫീഡ്ബാക്ക് അഭ്യർത്ഥന",
      "AI daily recap with one move for today": "ഇന്നത്തേക്ക് ഒരു നീക്കം നിർദേശിക്കുന്ന AI പ്രതിദിന റീക്യാപ്പ്",
      "Marketing posters made from your menu": "നിങ്ങളുടെ മെനുവിൽ നിന്ന് തയ്യാറാക്കുന്ന മാർക്കറ്റിംഗ് പോസ്റ്ററുകൾ",
      "WhatsApp campaigns, coming soon": "വാട്ട്സ്ആപ്പ് ക്യാമ്പെയ്നുകൾ, ഉടൻ വരുന്നു",
      "Close the day": "ദിവസം ക്ലോസ് ചെയ്യാൻ",
      "Shift open and cash-up": "ഷിഫ്റ്റ് ഓപ്പണും ക്യാഷ്-അപ്പും",
      "Supplier pay-outs logged against the shift": "ഷിഫ്റ്റിൽ രേഖപ്പെടുത്തുന്ന സപ്ലയർ പേ-ഔട്ടുകൾ",
      "Sales reports with CSV export": "CSV എക്സ്പോർട്ടുള്ള സെയിൽസ് റിപ്പോർട്ടുകൾ",
      "Delivery-app sales recorded alongside": "ഡെലിവറി ആപ്പ് വിൽപ്പനയും ഒപ്പം രേഖപ്പെടുത്താം",
      "Customer credit accounts": "കസ്റ്റമർ ക്രെഡിറ്റ് അക്കൗണ്ടുകൾ",
      "Delivery riders assigned to orders": "ഓർഡറുകൾക്ക് ഡെലിവറി റൈഡർമാരെ നിയോഗിക്കാം",
      "Installs on your phone like an app": "ഒരു ആപ്പ് പോലെ ഫോണിൽ ഇൻസ്റ്റാൾ ചെയ്യാം",
      "A morning recap that tells you what to do": "എന്തു ചെയ്യണമെന്നു പറയുന്ന രാവിലത്തെ റീക്യാപ്പ്",
      "AI reads yesterday's sales against your usual weekday and sends one clear move for today.": "AI ഇന്നലത്തെ വിൽപ്പന നിങ്ങളുടെ സാധാരണ ദിവസവുമായി താരതമ്യം ചെയ്ത് ഇന്നത്തേക്കുള്ള ഒരു വ്യക്തമായ നീക്കം അയയ്ക്കും.",
      "Feedback tied to the exact order": "അതേ ഓർഡറുമായി ബന്ധിപ്പിച്ച ഫീഡ്ബാക്ക്",
      "Every completed order asks one question, so you can spot a bad night by item and fix it.": "പൂർത്തിയായ ഓരോ ഓർഡറും ഒരു ചോദ്യം ചോദിക്കും; മോശം രാത്രിക്കു കാരണമായ ഇനം കണ്ടെത്തി പരിഹരിക്കാം.",
      "A cash drawer that ties out": "കണക്കൊക്കുന്ന ക്യാഷ് ഡ്രോയർ",
      "Open a shift, log pay-outs as they happen, count at close. The app shows any difference straight away.": "ഷിഫ്റ്റ് തുറക്കൂ, പേ-ഔട്ടുകൾ അപ്പപ്പോൾ രേഖപ്പെടുത്തൂ, ക്ലോസിംഗിൽ എണ്ണൂ. വ്യത്യാസമുണ്ടെങ്കിൽ ആപ്പ് ഉടൻ കാണിക്കും.",
      "Same orders. You keep the margin — and the customer.": "അതേ ഓർഡറുകൾ. മാർജിനും കസ്റ്റമറും നിങ്ങൾക്കു സ്വന്തം.",
      "You can keep your delivery apps for new customers. WhatsOrder is for the regulars who already know you.": "പുതിയ കസ്റ്റമർമാർക്കായി ഡെലിവറി ആപ്പുകൾ തുടരാം. WhatsOrder നിങ്ങളെ അറിയുന്ന സ്ഥിരക്കാർക്കുള്ളതാണ്.",
      "Marketplace app": "മാർക്കറ്റ്പ്ലേസ് ആപ്പ്",
      "Commission on every order": "ഓരോ ഓർഡറിലും കമ്മീഷൻ",
      "15–30%, forever": "15–30%, എന്നും",
      "Zero, ever": "പൂജ്യം, എപ്പോഴും",
      "Who owns the customer": "കസ്റ്റമർ ആരുടേത്",
      "The platform": "പ്ലാറ്റ്ഫോമിന്റേത്",
      "You do": "നിങ്ങളുടേത്",
      "Customer history & insights": "കസ്റ്റമർ ചരിത്രവും ഉൾക്കാഴ്ചകളും",
      "Hidden from you": "നിങ്ങളിൽ നിന്നു മറച്ചത്",
      "Built in": "ബിൽറ്റ്-ഇൻ",
      "Feedback tied to each order": "ഓരോ ഓർഡറുമായും ബന്ധിച്ച ഫീഡ്ബാക്ക്",
      "No": "ഇല്ല",
      "Yes": "ഉണ്ട്",
      "Shifts, cash & vendor payouts": "ഷിഫ്റ്റ്, ക്യാഷ്, വെണ്ടർ പേയ്മെന്റുകൾ",
      "Not included": "ഉൾപ്പെടുന്നില്ല",
      "What it costs you": "നിങ്ങൾക്കുള്ള ചെലവ്",
      "A cut of all sales": "എല്ലാ വിൽപ്പനയുടെയും വിഹിതം",
      "≈ AED 60 flat / month": "മാസം ≈ AED 60 ഫ്ലാറ്റ്",
      "AED 2 a day. Free for the first 14 days.": "ദിവസം AED 2. ആദ്യ 14 ദിവസം സൗജന്യം.",
      "One flat price, about the cost of a karak a day. We never take a percentage of your sales.": "ഒറ്റ നിശ്ചിത വില, ദിവസം ഒരു കരക്കിന്റെ വില മാത്രം. വിൽപ്പനയുടെ ശതമാനം ഞങ്ങൾ ഒരിക്കലും എടുക്കില്ല.",
      "WhatsOrder Starter": "WhatsOrder സ്റ്റാർട്ടർ",
      "Founding offer": "ഫൗണ്ടിംഗ് ഓഫർ",
      "Per day": "ദിവസം",
      "Per month, about": "മാസം, ഏകദേശം",
      "Commission on orders": "ഓർഡറുകളിലെ കമ്മീഷൻ",
      "Setup help": "സെറ്റപ്പ് സഹായം",
      "Free": "സൗജന്യം",
      "First 14 days": "ആദ്യ 14 ദിവസം",
      "Due today": "ഇന്ന് അടയ്ക്കേണ്ടത്",
      "What you get": "നിങ്ങൾക്കു കിട്ടുന്നത്",
      "WhatsApp ordering and live order board": "വാട്ട്സ്ആപ്പ് ഓർഡറിംഗും ലൈവ് ഓർഡർ ബോർഡും",
      "Customer list, groups and stamp-card loyalty": "കസ്റ്റമർ ലിസ്റ്റ്, ഗ്രൂപ്പുകൾ, സ്റ്റാമ്പ് കാർഡ് ലോയൽറ്റി",
      "Feedback after every order": "ഓരോ ഓർഡറിനു ശേഷവും ഫീഡ്ബാക്ക്",
      "AI daily recap and sales reports": "AI പ്രതിദിന റീക്യാപ്പും സെയിൽസ് റിപ്പോർട്ടുകളും",
      "Shift cash-up and supplier pay-outs": "ഷിഫ്റ്റ് ക്യാഷ്-അപ്പും സപ്ലയർ പേ-ഔട്ടുകളും",
      "AI menu builder": "AI മെനു ബിൽഡർ",
      "Setup help on WhatsApp": "വാട്ട്സ്ആപ്പിലൂടെ സെറ്റപ്പ് സഹായം",
      "Ask a question on WhatsApp": "വാട്ട്സ്ആപ്പിൽ ഒരു ചോദ്യം ചോദിക്കൂ",
      "The questions owners ask first.": "ഉടമകൾ ആദ്യം ചോദിക്കുന്ന ചോദ്യങ്ങൾ.",
      "Still unsure about something? Message us on WhatsApp and a person will answer.": "ഇനിയും സംശയമുണ്ടോ? വാട്ട്സ്ആപ്പിൽ മെസേജ് ചെയ്യൂ; ഒരാൾ നേരിട്ട് മറുപടി തരും.",
      "How does the 14-day free trial work?": "14 ദിവസത്തെ സൗജന്യ ട്രയൽ എങ്ങനെയാണ്?",
      "Build your menu, share your link and take real orders for 14 days at no cost. If you want to carry on, Starter is AED 2 a day, about AED 60 a month. If not, you stop. There is no commission either way.": "മെനു തയ്യാറാക്കി ലിങ്ക് പങ്കിട്ട് 14 ദിവസം ചെലവില്ലാതെ യഥാർത്ഥ ഓർഡറുകൾ എടുക്കൂ. തുടരണമെങ്കിൽ സ്റ്റാർട്ടർ ദിവസം AED 2, മാസം ഏകദേശം AED 60. വേണ്ടെങ്കിൽ നിർത്താം. രണ്ടായാലും കമ്മീഷൻ ഇല്ല.",
      "What do I need to get started?": "തുടങ്ങാൻ എന്തൊക്കെ വേണം?",
      "A phone or tablet and your WhatsApp number. There are no terminals to buy. A printer is optional, for kitchen tickets and receipts.": "ഒരു ഫോണോ ടാബ്ലെറ്റോ, നിങ്ങളുടെ വാട്ട്സ്ആപ്പ് നമ്പറും. വാങ്ങേണ്ട ടെർമിനലുകളില്ല. കിച്ചൻ ടിക്കറ്റിനും രസീതിനും പ്രിന്റർ വേണമെങ്കിൽ മാത്രം.",
      "How long does setup take?": "സെറ്റപ്പിന് എത്ര സമയമെടുക്കും?",
      "The menu builder reads a photo of your menu in about two minutes. After that you check prices, add photos and share your link. Setup help is free if you want us to do it with you.": "മെനു ബിൽഡർ നിങ്ങളുടെ മെനുവിന്റെ ഫോട്ടോ ഏകദേശം രണ്ടു മിനിറ്റിൽ വായിക്കും. അതിനു ശേഷം വില പരിശോധിച്ച് ഫോട്ടോകൾ ചേർത്ത് ലിങ്ക് പങ്കിടാം. ഞങ്ങൾ കൂടെ ചെയ്തുതരണമെങ്കിൽ സെറ്റപ്പ് സഹായം സൗജന്യമാണ്.",
      "How do customers pay?": "കസ്റ്റമർമാർ എങ്ങനെ പണം നൽകും?",
      "Cash or card when the order is delivered or collected, straight to you. WhatsOrder never holds your money.": "ഓർഡർ ഡെലിവർ ചെയ്യുമ്പോഴോ വാങ്ങുമ്പോഴോ ക്യാഷായോ കാർഡായോ നേരിട്ട് നിങ്ങൾക്ക്. WhatsOrder നിങ്ങളുടെ പണം ഒരിക്കലും കൈവശം വയ്ക്കില്ല.",
      "Who delivers the orders?": "ഓർഡറുകൾ ആരാണ് ഡെലിവർ ചെയ്യുന്നത്?",
      "Your own riders or staff. You set the delivery fee, minimum order and delivery area, and you can assign a rider to each order.": "നിങ്ങളുടെ സ്വന്തം റൈഡർമാരോ സ്റ്റാഫോ. ഡെലിവറി ഫീസും മിനിമം ഓർഡറും ഡെലിവറി ഏരിയയും നിങ്ങൾ തീരുമാനിക്കും; ഓരോ ഓർഡറിനും റൈഡറെ നിയോഗിക്കാം.",
      "Can I keep my delivery apps?": "ഡെലിവറി ആപ്പുകൾ തുടരാമോ?",
      "Yes. WhatsOrder handles your direct orders and works alongside them. You can also record delivery-app sales at shift close, so the day's totals sit in one place.": "തുടരാം. WhatsOrder നിങ്ങളുടെ നേരിട്ടുള്ള ഓർഡറുകൾ കൈകാര്യം ചെയ്ത് അവയ്ക്കൊപ്പം പ്രവർത്തിക്കും. ഷിഫ്റ്റ് ക്ലോസിൽ ഡെലിവറി ആപ്പ് വിൽപ്പനയും രേഖപ്പെടുത്താം; ദിവസത്തെ മൊത്തം കണക്ക് ഒരിടത്ത് കിട്ടും.",
      "Do customers need to install an app?": "കസ്റ്റമർമാർ ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യണോ?",
      "No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.": "വേണ്ട. ബ്രൗസറിൽ മെനു ലിങ്ക് തുറക്കുകയോ QR സ്കാൻ ചെയ്യുകയോ ചെയ്യുന്നു — ഡൗൺലോഡില്ല, അക്കൗണ്ടില്ല, തടസ്സമില്ല.",
      "Does WhatsOrder replace WhatsApp?": "WhatsOrder വാട്ട്സ്ആപ്പിനു പകരമാണോ?",
      "No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.": "അല്ല. വാട്ട്സ്ആപ്പിനൊപ്പം പ്രവർത്തിച്ച്, അവിടെ എത്തുന്ന ഓർഡറുകൾ വൃത്തിയും ചിട്ടയുമുള്ളതാക്കുന്നു. കസ്റ്റമർമാർ പതിവുപോലെ അവിടെത്തന്നെ മെസേജ് ചെയ്യുന്നു.",
      "Who owns the customer data?": "കസ്റ്റമർ ഡാറ്റ ആരുടേതാണ്?",
      "You do. Every order adds to your own customer list, and you can export your reports as a CSV file whenever you like.": "നിങ്ങളുടേത്. ഓരോ ഓർഡറും നിങ്ങളുടെ സ്വന്തം കസ്റ്റമർ ലിസ്റ്റിൽ ചേരും; റിപ്പോർട്ടുകൾ എപ്പോൾ വേണമെങ്കിലും CSV ഫയലായി എക്സ്പോർട്ട് ചെയ്യാം.",
      "Which languages does it support?": "ഏതൊക്കെ ഭാഷകൾ പിന്തുണയ്ക്കുന്നു?",
      "Customers can read your menu in English or Arabic. This site is also available in Malayalam.": "കസ്റ്റമർമാർക്ക് മെനു ഇംഗ്ലീഷിലോ അറബിയിലോ വായിക്കാം. ഈ സൈറ്റ് മലയാളത്തിലും ലഭ്യമാണ്.",
      "Is there any commission?": "കമ്മീഷൻ ഉണ്ടോ?",
      "None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.": "ഇല്ല. WhatsOrder ഫ്ലാറ്റ് മാസവരിയാണ്. വിൽപ്പനയുടെ ശതമാനം ഞങ്ങൾ ഒരിക്കലും എടുക്കില്ല.",
      "How do I get help?": "സഹായം എങ്ങനെ കിട്ടും?",
      "Message us on WhatsApp. WhatsOrder is built in Ajman by people who run a café themselves.": "വാട്ട്സ്ആപ്പിൽ മെസേജ് ചെയ്യൂ. സ്വന്തമായി കഫേ നടത്തുന്നവർ അജ്മാനിൽ നിർമിച്ചതാണ് WhatsOrder.",
      "Put your menu on WhatsApp today.": "നിങ്ങളുടെ മെനു ഇന്നു തന്നെ വാട്ട്സ്ആപ്പിലാക്കൂ.",
      "Start your 14-day free trial, or message us and we'll set it up with you.": "14 ദിവസത്തെ സൗജന്യ ട്രയൽ തുടങ്ങൂ, അല്ലെങ്കിൽ മെസേജ് ചെയ്യൂ; ഞങ്ങൾ കൂടെ സെറ്റ് ചെയ്തുതരാം.",
      "Message us on WhatsApp": "വാട്ട്സ്ആപ്പിൽ മെസേജ് ചെയ്യൂ",
      "Prefer email?": "ഇമെയിൽ ആണോ ഇഷ്ടം?",
      "Commission-free WhatsApp ordering for cafés and small restaurants. Built in Ajman.": "കഫേകൾക്കും ചെറുകിട റെസ്റ്ററന്റുകൾക്കും കമ്മീഷനില്ലാത്ത വാട്ട്സ്ആപ്പ് ഓർഡറിംഗ്. അജ്മാനിൽ നിർമിച്ചത്.",
      "Restaurant jobs": "റെസ്റ്ററന്റ് ജോലികൾ",
      "Post a job": "ജോലി പോസ്റ്റ് ചെയ്യൂ",
      "Privacy": "സ്വകാര്യത",
      "WhatsApp": "വാട്ട്സ്ആപ്പ്"
    };
    var CALC = {
      en: { month: '/ month', yr: '≈ AED {v} a year back in your pocket' },
      ar: { month: '/ شهرياً', yr: '≈ AED {v} تعود إلى جيبك كل سنة' },
      ml: { month: '/ മാസം', yr: 'വർഷം ≈ AED {v} നിങ്ങളുടെ പോക്കറ്റിൽ തിരികെ' }
    };
    var DICTS = { en: {}, ar: AR, ml: ML };
    function applyLang(lang){
      if(!DICTS[lang]) lang = 'en';
      var dict = DICTS[lang];
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var n;
      while((n = walker.nextNode())){
        var p = n.parentElement;
        if(!p || p.closest('script,style,[data-no-i18n],.lang-switch')) continue;
        if(n.__o === undefined) n.__o = n.nodeValue;
        var key = n.__o.trim();
        if(!key) continue;
        var tr = dict[key];
        n.nodeValue = tr ? n.__o.replace(key, tr) : n.__o;
      }
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.body.classList.toggle('lang-ar', lang === 'ar');
      document.body.classList.toggle('lang-ml', lang === 'ml');
      document.querySelectorAll('.lang-switch button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-lang') === lang);
      });
      window.__woCalcI18n = CALC[lang];
      if(window.__woCalcRender) window.__woCalcRender();
      try{ localStorage.setItem('wo-lang', lang); }catch(e){}
    }
    document.querySelectorAll('.lang-switch button').forEach(function(b){
      b.addEventListener('click', function(){ applyLang(b.getAttribute('data-lang')); });
    });
    var saved = 'en';
    try{ saved = localStorage.getItem('wo-lang') || 'en'; }catch(e){}
    if(saved !== 'en') applyLang(saved);
  })();

  // sticky mobile bar: show once the hero buttons are off screen
  (function(){
    var bar = document.getElementById('mobileCta');
    var hero = document.querySelector('.hero-cta');
    if(!bar) return;
    if(!hero || !('IntersectionObserver' in window)){ bar.classList.add('show'); return; }
    new IntersectionObserver(function(entries){
      bar.classList.toggle('show', !entries[0].isIntersecting);
    }).observe(hero);
  })();`;

export default function LandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: landingStyles }} />
      <div dangerouslySetInnerHTML={{ __html: landingMarkup }} />
      <Script id="whatsorder-landing-interactions" strategy="afterInteractive">
        {landingScript}
      </Script>
    </>
  );
}
