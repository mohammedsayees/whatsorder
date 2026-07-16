import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "WhatsOrder — The AI-enabled lightweight POS that runs on WhatsApp",
  description:
    "Commission-free, AI-enabled lightweight POS for small UAE restaurants: structured WhatsApp orders, AI daily growth insights, customer segments, loyalty and offers, shift and cash reconciliation, and AI-built menus.",
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

  .display{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:700;line-height:1.02;letter-spacing:-0.02em}
  .mono{font-family:"Geist Mono",ui-monospace,monospace}
  .eyebrow{
    font-family:"Geist Mono",ui-monospace,monospace;
    font-size:.72rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;
    color:var(--karak-deep);
    display:inline-flex;align-items:center;gap:.55rem;
  }
  .eyebrow::before{content:"";width:18px;height:1.5px;background:var(--karak)}

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
  .hero h1 .hl{color:var(--karak-deep);position:relative;white-space:nowrap}
  .hero h1 .hl::after{content:"";position:absolute;left:0;right:0;bottom:.06em;height:.16em;background:var(--karak);opacity:.32;border-radius:2px}
  .hero p.lede{font-size:1.18rem;color:var(--ink-soft);margin:1.4rem 0 0;max-width:33ch}
  .hero-cta{display:flex;gap:.8rem;margin-top:2rem;flex-wrap:wrap}
  .trust{display:flex;flex-wrap:wrap;gap:.5rem .65rem;margin-top:2rem;font-family:"Geist Mono",monospace;font-size:.78rem;color:var(--ink-soft)}
  .trust span{display:inline-flex;align-items:center;gap:.4rem;background:#fff;border:1px solid var(--line);padding:.34rem .7rem;border-radius:999px}
  .trust span::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--emerald)}

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
  .miniboard{margin-top:18px;display:flex;gap:10px}
  .stat{flex:1;background:var(--pine);color:#dff3e9;border-radius:var(--r-md);padding:.7rem .8rem}
  .stat b{font-family:"Bricolage Grotesque";font-size:1.45rem;display:block;color:#fff;line-height:1.1}
  .stat span{font-family:"Geist Mono",monospace;font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
  .stat.karak{background:var(--karak)}
  .stat.karak b,.stat.karak span{color:#3a2406}

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
  .money .eyebrow{color:#ffd9a8}
  .money .eyebrow::before{background:var(--karak)}
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
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:42px}
  .pcard{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;box-shadow:var(--shadow-soft);transition:transform .2s ease,box-shadow .2s ease}
  .pcard:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
  .pcard .ic{width:42px;height:42px;border-radius:11px;background:var(--paper-2);display:grid;place-items:center;margin-bottom:16px;color:var(--karak-deep)}
  .pcard .ic svg{width:21px;height:21px}
  .pcard h3{font-family:"Bricolage Grotesque";font-weight:600;font-size:1.12rem;margin:0 0 .4rem;color:var(--pine)}
  .pcard p{margin:0;color:var(--ink-soft);font-size:.96rem}

  /* ---------- solution flow ---------- */
  .flow{display:grid;grid-template-columns:repeat(5,1fr);gap:0;margin-top:46px;counter-reset:step}
  .step{position:relative;padding:0 18px}
  .step:not(:last-child)::after{content:"";position:absolute;top:19px;right:-2px;left:calc(50% + 26px);height:2px;background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 12px)}
  .step .num{width:40px;height:40px;border-radius:50%;background:var(--emerald);color:#fff;display:grid;place-items:center;font-family:"Bricolage Grotesque";font-weight:700;position:relative;z-index:2;box-shadow:0 8px 18px -10px rgba(15,163,107,.8)}
  .step h4{font-family:"Bricolage Grotesque";font-weight:600;font-size:1.02rem;margin:18px 0 .3rem;color:var(--pine)}
  .step p{margin:0;font-size:.9rem;color:var(--ink-soft)}

  /* ---------- features ---------- */
  .features{background:var(--paper-2)}
  .grid-feat{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:42px;background:var(--line);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden}
  .feat{background:var(--paper);padding:26px 22px;transition:background .2s ease}
  .feat:hover{background:#fff}
  .feat .fi{color:var(--emerald);margin-bottom:14px}
  .feat .fi svg{width:24px;height:24px}
  .feat h3{font-family:"Bricolage Grotesque";font-weight:600;font-size:1.05rem;margin:0 0 .35rem;color:var(--pine)}
  .feat p{margin:0;font-size:.92rem;color:var(--ink-soft)}

  /* ---------- experience split ---------- */
  .xp-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:42px}
  .xp{border-radius:var(--r-lg);padding:30px;border:1px solid var(--line)}
  .xp.cust{background:#fff}
  .xp.rest{background:var(--pine);color:#eaf3ee}
  .xp h3{font-family:"Bricolage Grotesque";font-weight:700;font-size:1.3rem;margin:0 0 1.2rem;display:flex;align-items:center;gap:.6rem}
  .xp.cust h3{color:var(--pine)}
  .xp.rest h3{color:#fff}
  .xp ol{list-style:none;margin:0;padding:0;counter-reset:x}
  .xp li{counter-increment:x;display:flex;gap:.85rem;align-items:center;padding:.55rem 0;font-size:1rem}
  .xp li::before{content:counter(x);flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:"Geist Mono",monospace;font-size:.78rem;font-weight:500}
  .xp.cust li::before{background:var(--paper-2);color:var(--karak-deep)}
  .xp.rest li::before{background:#1c5a45;color:#a9e7c9}
  .xp.rest li{border-bottom:1px solid #134736}
  .xp.cust li{border-bottom:1px solid var(--line)}
  .xp li:last-child{border-bottom:none}

  /* ---------- owner value ---------- */
  .ovgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:42px}
  .ov{display:flex;gap:.8rem;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:var(--r-md);padding:18px 20px}
  .ov svg{width:22px;height:22px;flex:0 0 auto;color:var(--emerald);margin-top:.1rem}
  .ov b{font-family:"Bricolage Grotesque";font-weight:600;color:var(--pine);font-size:1.02rem;display:block}
  .ov span{font-size:.9rem;color:var(--ink-soft)}

  /* ---------- pricing ---------- */
  .pricing{background:var(--paper-2)}
  .price-wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:34px;margin-top:42px;align-items:center}
  .price-card{background:var(--pine);color:#eaf3ee;border-radius:var(--r-lg);padding:34px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .price-card::before{content:"";position:absolute;right:-60px;top:-60px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(232,145,45,.35),transparent 70%)}
  .price-tag{display:inline-block;font-family:"Geist Mono",monospace;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;background:var(--karak);color:#3a2406;padding:.3rem .7rem;border-radius:999px;font-weight:600}
  .price-amt{font-family:"Bricolage Grotesque";font-weight:800;font-size:3.4rem;line-height:1;margin:1.1rem 0 .2rem;color:#fff}
  .price-amt small{font-size:1.05rem;font-weight:500;color:#bcd3c8;font-family:"Instrument Sans"}
  .price-sub{color:#bcd3c8;font-size:.95rem;margin-bottom:1.4rem}
  .price-card .btn{margin-top:.4rem}
  .incl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7rem}
  .incl li{display:flex;gap:.7rem;align-items:center;font-size:1.03rem}
  .incl svg{width:20px;height:20px;color:var(--emerald);flex:0 0 auto}
  .incl-head{font-family:"Geist Mono",monospace;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:1.1rem}

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
    .grid-4{grid-template-columns:1fr 1fr}
    .grid-feat{grid-template-columns:1fr 1fr}
    .flow{grid-template-columns:1fr 1fr 1fr;gap:28px 0}
    .step:not(:last-child)::after{display:none}
    .ovgrid{grid-template-columns:1fr 1fr}
    .price-wrap{grid-template-columns:1fr}
    .xp-grid{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    body{font-size:16px}
    section{padding:60px 0}
    .wrap{padding:0 18px}
    .stage{grid-template-columns:1fr;gap:46px}
    .grid-4{grid-template-columns:1fr}
    .grid-feat{grid-template-columns:1fr}
    .flow{grid-template-columns:1fr;gap:26px}
    .step{padding:0}
    .ovgrid{grid-template-columns:1fr}
    .hero-cta .btn{flex:1;justify-content:center}
  }

  @media(prefers-reduced-motion:reduce){
    html{scroll-behavior:auto}
    *{animation:none !important;transition:none !important}
    .bubble,.trow,.tmeta,.ttotal{opacity:1 !important;transform:none !important}
    .btn:hover,.pcard:hover,.os-card:hover{transform:none}
  }

  /* ===== operating-system section (front / back of house) ===== */
  .os{background:var(--paper)}
  .band{margin-top:54px}
  .band-label{display:flex;align-items:center;gap:.8rem;margin-bottom:22px}
  .band-tag{font-family:"Geist Mono",monospace;font-size:.72rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#fff;background:var(--pine);padding:.4rem .8rem;border-radius:999px}
  .band.back .band-tag{background:var(--karak-deep)}
  .band-desc{color:var(--ink-soft);font-size:1rem}
  .band-desc b{color:var(--pine);font-family:"Bricolage Grotesque";font-weight:600}

  .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .os-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;box-shadow:var(--shadow-soft);transition:transform .2s ease,box-shadow .2s ease}
  .os-card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
  .os-card .oi{width:40px;height:40px;border-radius:11px;background:var(--paper-2);display:grid;place-items:center;color:var(--emerald);margin-bottom:14px}
  .os-card .oi svg{width:21px;height:21px}
  .band.back .os-card .oi{color:var(--karak-deep)}
  .os-card h3{font-family:"Bricolage Grotesque";font-weight:600;font-size:1.08rem;margin:0 0 .35rem;color:var(--pine)}
  .os-card p{margin:0;color:var(--ink-soft);font-size:.94rem}
  .span2{grid-column:span 2}
  .span3{grid-column:span 3}

  /* feedback signature card */
  .fb{display:grid;grid-template-columns:1.05fr 1fr;gap:0;overflow:hidden;padding:0}
  .fb-left{padding:26px 26px 26px 26px}
  .fb-left .tagrow{display:flex;align-items:center;gap:.5rem;font-family:"Geist Mono",monospace;font-size:.7rem;letter-spacing:.05em;color:var(--emerald);text-transform:uppercase;margin-bottom:.7rem}
  .fb-left .tagrow .pill{background:rgba(15,163,107,.1);padding:.2rem .5rem;border-radius:5px}
  .fb-left h3{font-size:1.25rem;margin:0 0 .4rem}
  .fb-left p{font-size:.98rem}
  .fb-right{background:#ECE5DD;padding:22px;display:flex;flex-direction:column;gap:.55rem;justify-content:center;border-left:1px solid var(--line)}
  .fb-msg{background:#fff;border-radius:12px;border-top-left-radius:3px;padding:.6rem .75rem;font-size:.84rem;max-width:92%;box-shadow:0 1px 1px rgba(0,0,0,.06)}
  .fb-msg .stars{color:var(--karak);letter-spacing:2px;font-size:1rem}
  .fb-reply{align-self:flex-end;background:#DCF8C6;border-radius:12px;border-top-right-radius:3px;padding:.55rem .75rem;font-size:.84rem;max-width:80%}
  .fb-chip{display:inline-flex;align-items:center;gap:.45rem;align-self:flex-start;margin-top:.2rem;background:var(--pine);color:#dff3e9;font-family:"Geist Mono",monospace;font-size:.72rem;padding:.4rem .7rem;border-radius:999px}
  .fb-chip b{color:#fff}

  /* shift / cash reconciliation slip */
  .slip{padding:0;overflow:hidden;display:flex;flex-direction:column}
  .slip-head{background:var(--pine);color:#eaf3ee;padding:.85rem 1.1rem;display:flex;justify-content:space-between;align-items:center}
  .slip-head .st{font-family:"Bricolage Grotesque";font-weight:600;font-size:1.02rem;color:#fff}
  .slip-head .stt{font-family:"Geist Mono",monospace;font-size:.7rem;color:#9fc0b2}
  .slip-body{padding:18px 22px;font-family:"Geist Mono",monospace;font-size:.86rem}
  .srow{display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px dashed var(--line);color:var(--ink)}
  .srow .lab{color:var(--ink-soft)}
  .srow.out .val{color:var(--karak-deep)}
  .srow.vendor .lab span{display:block;font-size:.66rem;color:#9aa39d}
  .sresult{display:flex;justify-content:space-between;align-items:center;margin-top:.7rem;padding-top:.7rem;border-top:2px solid var(--ink)}
  .sresult .lab{font-family:"Instrument Sans";font-weight:600;color:var(--pine)}
  .balanced{display:inline-flex;align-items:center;gap:.4rem;background:rgba(15,163,107,.12);color:var(--emerald);font-weight:600;padding:.3rem .6rem;border-radius:999px;font-size:.8rem}
  .balanced svg{width:14px;height:14px}

  /* AI menu card */
  .ai .aiflow{display:flex;align-items:center;gap:.7rem;margin-top:1rem}
  .ai .photo{width:54px;height:54px;border-radius:10px;background:linear-gradient(135deg,var(--karak),#f0c08a);flex:0 0 auto;display:grid;place-items:center;color:#3a2406}
  .ai .photo svg{width:24px;height:24px}
  .ai .aiarrow{color:var(--ink-soft)}
  .ai .aiitems{flex:1;display:flex;flex-direction:column;gap:.35rem}
  .ai .aiitem{background:var(--paper-2);border-radius:7px;height:11px}
  .ai .aiitem.s1{width:90%}.ai .aiitem.s2{width:70%}.ai .aiitem.s3{width:80%}

  /* pwa strip */
  .pwa-strip{margin-top:16px;background:var(--pine);color:#dff3e9;border-radius:var(--r-lg);padding:22px 26px;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;justify-content:space-between}
  .pwa-strip .pw-l{display:flex;align-items:center;gap:.9rem}
  .pwa-strip .pw-ic{width:42px;height:42px;border-radius:11px;background:#16513c;display:grid;place-items:center;color:#a9e7c9;flex:0 0 auto}
  .pwa-strip h3{font-family:"Bricolage Grotesque";font-weight:600;color:#fff;font-size:1.08rem;margin:0}
  .pwa-strip p{margin:.15rem 0 0;font-size:.92rem;color:#bcd3c8}
  .pwa-strip .pw-tag{font-family:"Geist Mono",monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#9fc0b2;border:1px solid #2c6a54;padding:.4rem .7rem;border-radius:999px;white-space:nowrap}

  @media(max-width:960px){
    .bento{grid-template-columns:1fr 1fr}
    .span2,.span3{grid-column:span 2}
    .fb{grid-template-columns:1fr}
    .fb-right{border-left:none;border-top:1px solid var(--line)}
  }
  @media(max-width:560px){
    .bento{grid-template-columns:1fr}
    .span2,.span3{grid-column:span 1}
    .pwa-strip{flex-direction:column;align-items:flex-start}
  }

  /* ===== proof band (live pilot) ===== */
  .proof-band{position:relative;overflow:hidden;background:var(--pine);color:#eaf3ee;border-radius:var(--r-lg);padding:38px;display:grid;grid-template-columns:1.25fr 1fr;gap:34px;align-items:center;box-shadow:var(--shadow)}
  .proof-band::before{content:"";position:absolute;right:-80px;bottom:-90px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(232,145,45,.30),transparent 70%);pointer-events:none}
  .proof-band .eyebrow{color:#ffd9a8}
  .proof-band .eyebrow::before{background:var(--karak)}
  .proof-band h3{position:relative;font-family:"Bricolage Grotesque";font-weight:700;font-size:clamp(1.55rem,3vw,2.1rem);line-height:1.08;letter-spacing:-.02em;color:#fff;margin:.7rem 0 .55rem}
  .proof-band p{position:relative;color:#bcd3c8;margin:0 0 1.4rem;font-size:1.02rem;max-width:44ch}
  .proof-band .btn-wa{position:relative}
  .proof-tiles{position:relative;display:flex;flex-direction:column;gap:12px}
  .ptile{display:flex;align-items:center;gap:.75rem;background:#0a3527;border:1px solid #1c5a45;border-radius:var(--r-md);padding:14px 16px;font-size:.97rem;color:#eaf3ee}
  .ptile svg{width:20px;height:20px;color:var(--emerald-bright);flex:0 0 auto}
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
  .growth{background:var(--paper-2)}
  .growth .bento{margin-top:42px}
  .segchips{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:1rem}
  .segchips span{font-family:"Geist Mono",monospace;font-size:.7rem;letter-spacing:.05em;padding:.3rem .65rem;border-radius:999px;font-weight:500}
  .seg-new{background:rgba(15,163,107,.12);color:var(--emerald)}
  .seg-rep{background:rgba(11,61,46,.1);color:var(--pine)}
  .seg-vip{background:rgba(232,145,45,.16);color:var(--karak-deep)}
  .seg-ina{background:#eee7d8;color:var(--ink-soft)}
  .soon{display:inline-block;font-family:"Geist Mono",monospace;font-size:.62rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;background:var(--karak);color:#3a2406;padding:.2rem .55rem;border-radius:5px;margin-left:.5rem;vertical-align:middle}
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
  [dir=rtl] .crow.chead .cc.wo{border-right:none}`;

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
      <a href="#problem">Why</a>
      <a href="#how">How it works</a>
      <a href="#growth">AI growth</a>
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
      <a class="btn btn-ghost" href="https://whatsorder-taupe.vercel.app/r/chaixpress" target="_blank" rel="noopener">View live demo</a>
      <a class="btn btn-primary" href="#contact">Request a demo</a>
    </div>
  </div>
</header>

<main id="top">

<!-- ===== HERO ===== -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">For small UAE restaurants</span>
      <h1>WhatsApp takes the order. WhatsOrder runs <span class="hl">everything after it</span>.</h1>
      <p class="lede">Structured orders, AI daily growth insights, customer segments, loyalty, shift &amp; cash reconciliation, AI-built menus — a commission-free, AI-enabled lightweight POS running on the WhatsApp your customers already use.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#contact">Request a demo</a>
        <a class="btn btn-ghost" href="/try">See your menu live in 2 minutes →</a>
      </div>
      <div class="trust">
        <span>Commission-free</span>
        <span>Works with WhatsApp</span>
        <span>AI inside</span>
        <span>Built in Ajman</span>
      </div>
    </div>

    <!-- signature device -->
    <div class="device">
      <div class="stage" id="stage" data-no-i18n>
        <!-- messy chat -->
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

        <!-- transform arrow -->
        <div class="arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15m0 0-6-6m6 6-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>

        <!-- clean ticket -->
        <div class="ticket">
          <div class="card-top">
            <span class="lbl"><span class="dot" style="background:var(--emerald)"></span> Order #1043</span>
            <span class="badge">STRUCTURED</span>
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

      <div class="miniboard" aria-hidden="true" data-no-i18n>
        <div class="stat"><b>18</b><span>Orders today</span></div>
        <div class="stat"><b>★ 4.7</b><span>Feedback</span></div>
        <div class="stat karak"><b>AED 0</b><span>Cash variance</span></div>
      </div>
    </div>
  </div>
</section>

<!-- ===== MONEY / CALCULATOR ===== -->
<section class="money" id="math">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">The math</span>
      <h2>Marketplaces don't sell food. They sell your customers back to you.</h2>
      <p>Aggregators take a cut of every single order — and the customer stays theirs, not yours. Here's roughly what that costs a small restaurant each month.</p>
    </div>

    <div class="calc">
      <div class="calc-control">
        <label for="vol">Your monthly sales on WhatsApp</label>
        <div class="bignum" id="volOut">AED 50,000 <small>/ month</small></div>
        <input type="range" id="vol" min="10000" max="150000" step="5000" value="50000" aria-describedby="volOut">
        <div class="rng-scale"><span>AED 10k</span><span>AED 80k</span><span>AED 150k</span></div>
        <p class="calc-foot">Assumes a ~27% marketplace commission. Real rates vary by platform and plan — drag to match your own numbers.</p>
      </div>

      <div class="calc-out">
        <div class="breakdown">
          <div class="brk bad">
            <span class="k">A marketplace would take (27%)</span>
            <span class="v" id="commOut">−AED 13,500</span>
          </div>
          <div class="brk flat">
            <span class="k">WhatsOrder Starter (AED 2/day)</span>
            <span class="v" id="flatOut">AED 60</span>
          </div>
        </div>
        <div class="keep">
          <div class="k">You'd keep, every month</div>
          <div class="v" id="keepOut">AED 13,440</div>
          <div class="yr" id="yrOut">≈ AED 161,280 a year back in your pocket</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== PROBLEM ===== -->
<section id="problem">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">The problem</span>
      <h2>WhatsApp orders are easy to receive. The whole operation is hard to run.</h2>
      <p>Your customers are already messaging you. The trouble starts the moment a chat has to become a tracked order — and keeps going through the shift, the feedback, and the cash drawer.</p>
    </div>
    <div class="grid-4">
      <div class="pcard">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" stroke="currentColor" stroke-width="1.8"/></svg></div>
        <h3>Orders arrive as loose chat</h3>
        <p>Items, quantities, notes and payment preferences get scattered across a dozen messages.</p>
      </div>
      <div class="pcard">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg></div>
        <h3>Addresses get hunted down</h3>
        <p>Your delivery team burns time asking for pins, landmarks and exact building details every time.</p>
      </div>
      <div class="pcard">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.8"/></svg></div>
        <h3>Repeat customers vanish</h3>
        <p>Every order starts from scratch, so the history that makes regulars valuable is never captured.</p>
      </div>
      <div class="pcard">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
        <h3>The back office runs on paper</h3>
        <p>Shifts, cash counts, supplier payouts and customer feedback live in notebooks and memory — never in one place you can act on.</p>
      </div>
    </div>
  </div>
</section>

<!-- ===== SOLUTION FLOW ===== -->
<section id="how">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">How it works</span>
      <h2>Structure, without asking your customers to change a thing.</h2>
      <p>They still order on WhatsApp. You get a clean workflow from menu link to dashboard.</p>
    </div>
    <div class="flow">
      <div class="step">
        <div class="num">1</div>
        <h4>Share your menu link</h4>
        <p>One restaurant link or QR code — on your bio, table, or flyer.</p>
      </div>
      <div class="step">
        <div class="num">2</div>
        <h4>Customer picks items</h4>
        <p>They browse your menu with photos and tap to add to cart.</p>
      </div>
      <div class="step">
        <div class="num">3</div>
        <h4>Checkout, their way</h4>
        <p>Delivery with address, pickup, or a scheduled time.</p>
      </div>
      <div class="step">
        <div class="num">4</div>
        <h4>Clean WhatsApp order</h4>
        <p>A tidy, structured message lands in your chat — no guesswork.</p>
      </div>
      <div class="step">
        <div class="num">5</div>
        <h4>Saved to dashboard</h4>
        <p>The order, the customer and the totals are logged automatically.</p>
      </div>
    </div>
  </div>
</section>

<!-- ===== PROOF (LIVE PILOT) ===== -->
<section id="proof" style="padding-top:0">
  <div class="wrap">
    <div class="proof-band">
      <div>
        <span class="eyebrow">Live in production</span>
        <h3>Not a mockup — it's running today at Chai Xpress, Ajman.</h3>
        <p>WhatsOrder is built alongside a working UAE restaurant, taking real orders on the same WhatsApp their customers already use. Don't take our word for it — open the live menu and place a test order yourself.</p>
        <a class="btn btn-wa" href="https://whatsorder-taupe.vercel.app/r/chaixpress" target="_blank" rel="noopener">
          Try the live ordering flow
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M4 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
      <div class="proof-tiles" aria-hidden="true">
        <div class="ptile"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> A real menu, real prices, real photos</div>
        <div class="ptile"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Orders land as structured WhatsApp messages</div>
        <div class="ptile"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Run day to day from the owner's dashboard</div>
      </div>
    </div>
  </div>
</section>

<!-- ===== AI GROWTH ENGINE ===== -->
<section class="growth" id="growth">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">The AI growth engine</span>
      <h2>It doesn't just record your day. It tells you how to grow the next one.</h2>
      <p>Every order feeds a customer base you own. WhatsOrder's AI reads it and turns it into one clear move each morning — and WhatsApp is how you act on it.</p>
    </div>

    <div class="bento">
      <!-- signature: AI daily recap -->
      <div class="os-card fb span3">
        <div class="fb-left">
          <div class="tagrow"><span class="pill">AI inside</span> A daily recap written like a manager</div>
          <h3>Every morning, AI reads yesterday's numbers and prescribes one growth move.</h3>
          <p>Not a receipt of totals. It judges the day against its own weekday average, spots rising and fading items and quiet hours, and tells you exactly what to run today — with the upside quantified from your own data.</p>
        </div>
        <div class="fb-right" aria-hidden="true" data-no-i18n>
          <div class="recap-msg">
            <div class="rec-head">Daily recap · Tuesday</div>
            Solid Tuesday — <b>41 orders, AED 1,490</b>, your best in 4 weeks. <b>Karak Tea is rising</b> (+30% on last week). Make it today's hero: pair it with samosa from 4–6 PM to lift your quiet hour.
          </div>
        </div>
      </div>

      <div class="os-card">
        <div class="oi"><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke="currentColor" stroke-width="1.8"/><path d="M16 4.5a3 3 0 0 1 0 7M18.5 19c0-2-1.2-3.7-3-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
        <h3>Customer segments, ready to act on</h3>
        <p>Your customers are sorted automatically — message any of them on WhatsApp in one tap, consent-first.</p>
        <div class="segchips" aria-hidden="true" data-no-i18n>
          <span class="seg-new">NEW</span><span class="seg-rep">REPEAT</span><span class="seg-vip">VIP</span><span class="seg-ina">INACTIVE</span>
        </div>
      </div>

      <div class="os-card">
        <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="m3 11 15-6v14L3 13v-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 13.5V17a2 2 0 0 0 4 0v-2" stroke="currentColor" stroke-width="1.8"/></svg></div>
        <h3>WhatsApp campaigns <span class="soon">Coming soon</span></h3>
        <p>Write one message and send it to a whole segment — win back the inactive, reward the VIPs. Opt-in only, unsubscribe built in.</p>
      </div>

      <div class="os-card">
        <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.1 4.9L19 9l-3.8 3.4.9 5.1L12 15l-4.1 2.5.9-5.1L5 9l4.9-1.1L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
        <h3>Offers &amp; loyalty that upsell</h3>
        <p>Promote items at happy-hour prices to drive a slow hour, and reward regulars with points — bigger baskets, more returns.</p>
      </div>
    </div>
  </div>
</section>

<!-- ===== OPERATING SYSTEM: FRONT / BACK OF HOUSE ===== -->
<section class="os" id="features">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">More than ordering</span>
      <h2>One system, front of house to back of house.</h2>
      <p>The order is just the front door. WhatsOrder runs the customer relationship, the feedback loop, the shift, and the cash drawer behind it — all without commission.</p>
    </div>

    <!-- FRONT OF HOUSE -->
    <div class="band front">
      <div class="band-label">
        <span class="band-tag">Front of house</span>
        <span class="band-desc"><b>What your customers touch.</b> No app, no marketplace listing.</span>
      </div>
      <div class="bento">
        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <h3>Menu link &amp; QR</h3>
          <p>One restaurant link or QR code, with photo menus, to share anywhere.</p>
        </div>
        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M9 11l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <h3>Structured orders</h3>
          <p>Item, address, note and payment land as one clean WhatsApp message.</p>
        </div>
        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <h3>Delivery, pickup &amp; scheduled</h3>
          <p>With offers and promos when you want to drive a slow hour.</p>
        </div>

        <!-- signature: feedback tied to a completed order -->
        <div class="os-card fb span3">
          <div class="fb-left">
            <div class="tagrow"><span class="pill">Signature</span> Feedback that's tied to the order</div>
            <h3>Every completed order asks one question.</h3>
            <p>When an order is marked delivered, the customer gets a feedback request linked to that exact order — so the rating you get is real, attributable data you can act on, not a guess. Spot a bad night by item, not by vibe.</p>
          </div>
          <div class="fb-right" aria-hidden="true" data-no-i18n>
            <div class="fb-msg">How was order <b>#1043</b>? <div class="stars">★★★★★</div></div>
            <div class="fb-reply">5/5 — karak was perfect 🔥</div>
            <span class="fb-chip">This week: <b>★ 4.7</b> · 12 reviews</span>
          </div>
        </div>
      </div>
    </div>

    <!-- BACK OF HOUSE -->
    <div class="band back">
      <div class="band-label">
        <span class="band-tag">Back of house</span>
        <span class="band-desc"><b>What you run behind the counter.</b> In one installable app.</span>
      </div>
      <div class="bento">
        <!-- signature: shift + cash reconciliation -->
        <div class="os-card slip span2" data-no-i18n>
          <div class="slip-head">
            <span class="st">Evening shift · cash up</span>
            <span class="stt">closed 11:02 PM</span>
          </div>
          <div class="slip-body">
            <div class="srow"><span class="lab">Opening float</span><span class="val">AED 300</span></div>
            <div class="srow"><span class="lab">Cash sales</span><span class="val">AED 1,240</span></div>
            <div class="srow out vendor"><span class="lab">Paid out <span>Al Madina milk supplier</span></span><span class="val">−AED 180</span></div>
            <div class="srow"><span class="lab">Expected in drawer</span><span class="val">AED 1,360</span></div>
            <div class="srow"><span class="lab">Counted</span><span class="val">AED 1,360</span></div>
            <div class="sresult">
              <span class="lab">Variance</span>
              <span class="balanced"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg> AED 0 · balanced</span>
            </div>
          </div>
        </div>

        <div class="os-card ai">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg></div>
          <h3>AI menu builder &amp; food photos</h3>
          <p>Photograph a paper menu and AI structures it into categories, items and prices — and generates appetising photos for items missing one.</p>
          <div class="aiflow" aria-hidden="true">
            <span class="photo"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M8 6 9.5 4h5L16 6" stroke="currentColor" stroke-width="1.8"/></svg></span>
            <span class="aiarrow"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M4 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="aiitems"><span class="aiitem s1"></span><span class="aiitem s2"></span><span class="aiitem s3"></span></span>
          </div>
        </div>

        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M8 4v16" stroke="currentColor" stroke-width="1.8"/></svg></div>
          <h3>Live order board</h3>
          <p>Move orders through New, Preparing and Completed — with timings and kitchen printing.</p>
        </div>
        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.8"/><path d="m17 4 1.2 2.4L20.5 7l-1.7 1.6.4 2.4-2.2-1.1-2.2 1.1.4-2.4L13.5 7l2.3-.6L17 4Z" fill="currentColor" opacity=".5"/></svg></div>
          <h3>Customer insights &amp; loyalty</h3>
          <p>See who's new, repeat, VIP or gone quiet, what they reorder — and reward them with built-in loyalty points.</p>
        </div>
        <div class="os-card">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2Z" stroke="currentColor" stroke-width="1.8"/><path d="M4 7v10c0 1.1 3.6 2 8 2s8-.9 8-2V7" stroke="currentColor" stroke-width="1.8"/><path d="M12 12v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <h3>Vendor cash tracker</h3>
          <p>Log every cash payout to suppliers against a shift, so the drawer always ties out.</p>
        </div>

        <!-- wide sales insights -->
        <div class="os-card span3">
          <div class="oi"><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <h3>Sales insights at a glance</h3>
          <p style="margin-bottom:1rem">Revenue, average order value, order counts and your top sellers — without exporting a thing.</p>
          <div style="display:flex;gap:14px;flex-wrap:wrap" data-no-i18n>
            <div style="flex:1;min-width:130px;background:var(--paper-2);border-radius:12px;padding:14px 16px"><div class="mono" style="font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)">Revenue today</div><div class="display" style="font-size:1.5rem;color:var(--pine)">AED 642</div></div>
            <div style="flex:1;min-width:130px;background:var(--paper-2);border-radius:12px;padding:14px 16px"><div class="mono" style="font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)">Avg order value</div><div class="display" style="font-size:1.5rem;color:var(--pine)">AED 36</div></div>
            <div style="flex:1;min-width:130px;background:var(--paper-2);border-radius:12px;padding:14px 16px"><div class="mono" style="font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)">Top seller</div><div class="display" style="font-size:1.5rem;color:var(--pine)">Karak ×46</div></div>
          </div>
        </div>
      </div>

      <!-- PWA strip -->
      <div class="pwa-strip">
        <div class="pw-l">
          <span class="pw-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
          <div>
            <h3>Install it like an app — no app store</h3>
            <p>Add WhatsOrder to the home screen of the counter phone or tablet. Fast, full-screen, made for service.</p>
          </div>
        </div>
        <span class="pw-tag">Progressive web app</span>
      </div>
    </div>
  </div>
</section>

<!-- ===== OWNER VALUE ===== -->
<section id="owner">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">Owner value</span>
      <h2>Built for restaurants that live on regulars.</h2>
      <p>A more professional way to take direct orders — with the customer relationship staying firmly in your hands.</p>
    </div>
    <div class="ovgrid">
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>Zero commission</b><span>A flat monthly fee — never a cut of your sales.</span></div></div>
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>Own your customer data</b><span>Your regulars belong to you, not to a platform.</span></div></div>
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>Faster repeat orders</b><span>Saved details turn returning customers into one-tap orders.</span></div></div>
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>Clearer orders</b><span>Fewer mistakes, fewer "what did you mean?" messages.</span></div></div>
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>Easier menu management</b><span>Edit prices, photos and availability in seconds.</span></div></div>
      <div class="ov"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>A more professional feel</b><span>Look organised and modern without leaving WhatsApp.</span></div></div>
    </div>
  </div>
</section>

<!-- ===== COMPARISON ===== -->
<section id="compare">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">Marketplace vs WhatsOrder</span>
      <h2>Same orders. You keep the margin — and the customer.</h2>
      <p>Aggregators rent you demand and keep the relationship. WhatsOrder turns the WhatsApp you already have into an ordering system you own.</p>
    </div>
    <div class="compare">
      <div class="crow chead">
        <div class="cc feat-lbl"></div>
        <div class="cc mkt">Marketplace app</div>
        <div class="cc wo">WhatsOrder</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Commission on every order</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> 15–30%, forever</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Zero, ever</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Who owns the customer</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> The platform</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> You do</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Customer history &amp; insights</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Hidden from you</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Built in</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Feedback tied to each order</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> No</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Yes</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">AI insight on your own sales</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Nothing</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> A growth move daily</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">Shifts, cash &amp; vendor payouts</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Not included</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Built in</div>
      </div>
      <div class="crow">
        <div class="cc feat-lbl">What it costs you</div>
        <div class="cc mkt"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> A cut of all sales</div>
        <div class="cc wo"><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ≈ AED 60 flat / month</div>
      </div>
    </div>
  </div>
</section>

<!-- ===== PRICING ===== -->
<section class="pricing" id="pricing">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">Launch pricing</span>
      <h2>Starts at AED 2 a day. No commission, ever.</h2>
      <p>Early pricing for pilot restaurants who want structured WhatsApp ordering without a marketplace taking a cut.</p>
    </div>
    <div class="price-wrap">
      <div class="price-card">
        <span class="price-tag">Starter · founding offer</span>
        <div class="price-amt">AED 2<small> / day</small></div>
        <div class="price-sub">≈ AED 60 / month — about the price of one karak a day. Free setup included.</div>
        <a class="btn btn-wa" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20request%20a%20demo%20for%20my%20restaurant." target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 2 1.2 2.3 1.4.2.1.4.1.6-.1l.7-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4Z"/></svg>
          Request a demo on WhatsApp
        </a>
      </div>
      <div>
        <div class="incl-head">Every plan includes</div>
        <ul class="incl">
          <li><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Digital menu &amp; QR code</li>
          <li><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Structured WhatsApp ordering</li>
          <li><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Order dashboard</li>
          <li><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Customer database</li>
          <li><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Menu setup support</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- ===== FAQ ===== -->
<section id="faq">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">FAQ</span>
      <h2>The questions owners ask first.</h2>
      <p>Straight answers for restaurants already taking orders through WhatsApp.</p>
    </div>
    <div class="faq-list">
      <details open>
        <summary>Is WhatsOrder just for taking orders? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>No — ordering is the front door. Behind it sits an AI-enabled lightweight POS: an AI daily recap that prescribes a growth move each morning, customer segments and loyalty, post-order feedback, a live order board, shift and cash reconciliation, vendor cash tracking, sales insights, and an AI menu builder with generated food photos. WhatsApp campaigns to whole segments are coming next.</p>
      </details>
      <details>
        <summary>Is WhatsOrder a POS? Do I need new hardware? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>It's a lightweight POS that runs on the phone or tablet you already have — orders, staff entry, kitchen printing, shifts and cash, all in an installable web app. No terminals, no contracts, no new hardware.</p>
      </details>
      <details>
        <summary>Does WhatsOrder replace WhatsApp? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.</p>
      </details>
      <details>
        <summary>Do customers need to install an app? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.</p>
      </details>
      <details>
        <summary>Can I manage my own menu? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Yes. Add items, edit prices, mark things unavailable and upload photos yourself, any time.</p>
      </details>
      <details>
        <summary>Can returning customers reorder faster? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>Yes. Customer details can be saved so regulars don't have to re-enter everything each time.</p>
      </details>
      <details>
        <summary>Is there any commission? <span class="chev"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <p>None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.</p>
      </details>
    </div>
  </div>
</section>

<!-- ===== FINAL CTA ===== -->
<section class="cta" id="contact">
  <div class="wrap">
    <span class="eyebrow" style="color:#ffd9a8;justify-content:center">Try it with your workflow</span>
    <h2>Want to see WhatsOrder run your restaurant?</h2>
    <p>If you already take orders on WhatsApp, we'd love to understand your workflow and walk you through a live demo.</p>
    <div class="cta-row">
      <a class="btn btn-wa" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20request%20a%20demo%20for%20my%20restaurant." target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 2 1.2 2.3 1.4.2.1.4.1.6-.1l.7-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4Z"/></svg>
        Message us on WhatsApp
      </a>
      <a class="btn btn-ghost" style="background:transparent;color:#fff;border-color:#2c6a54" href="mailto:whatsorder.ae@gmail.com?subject=WhatsOrder%20demo%20request">Email whatsorder.ae@gmail.com</a>
    </div>
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
        <p style="margin:.7rem 0 0;max-width:34ch;font-size:.92rem">Structured WhatsApp ordering for small UAE restaurants. Built in Ajman.</p>
      </div>
      <div class="foot-links">
        <a href="https://whatsorder-taupe.vercel.app/r/chaixpress" target="_blank" rel="noopener">Live demo</a>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#contact">Contact</a>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© <span id="yr"></span> WhatsOrder · @whatsorder.ae</span>
      <span>whatsorder.ae@gmail.com</span>
    </div>
  </div>
</footer>

<!-- ===== STICKY MOBILE CTA ===== -->
<div class="mobile-cta">
  <a class="btn btn-wa" href="https://wa.me/971551150068?text=Hi%20WhatsOrder%2C%20I%20would%20like%20to%20request%20a%20demo%20for%20my%20restaurant." target="_blank" rel="noopener" aria-label="Message WhatsOrder on WhatsApp">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 2 1.2 2.3 1.4.2.1.4.1.6-.1l.7-.9c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4Z"/></svg>
    WhatsApp
  </a>
  <a class="btn btn-primary" href="#contact">Request a demo</a>
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
      "Why": "لماذا",
      "How it works": "كيف يعمل",
      "AI growth": "نمو بالذكاء الاصطناعي",
      "Features": "المزايا",
      "Pricing": "الأسعار",
      "FAQ": "الأسئلة الشائعة",
      "View live demo": "شاهد العرض المباشر",
      "Request a demo": "اطلب عرضاً تجريبياً",
      "For small UAE restaurants": "لمطاعم الإمارات الصغيرة",
      "WhatsApp takes the order. WhatsOrder runs": "واتساب يستقبل الطلب. وواتس أوردر يدير",
      "everything after it": "كل ما بعده",
      "Structured orders, AI daily growth insights, customer segments, loyalty, shift & cash reconciliation, AI-built menus — a commission-free, AI-enabled lightweight POS running on the WhatsApp your customers already use.": "طلبات منظمة، وتحليلات نمو يومية بالذكاء الاصطناعي، وشرائح عملاء، وولاء، وتسوية الورديات والنقدية، وقوائم مبنية بالذكاء الاصطناعي — نظام نقاط بيع خفيف مدعوم بالذكاء الاصطناعي وبدون عمولة، يعمل على واتساب الذي يستخدمه عملاؤك أصلاً.",
      "See it live at Chai Xpress →": "شاهده مباشرةً في تشاي إكسبرس",
      "See your menu live in 2 minutes →": "شاهد قائمتك مباشرةً خلال دقيقتين ←",
      "Commission-free": "بدون عمولة",
      "Works with WhatsApp": "يعمل مع واتساب",
      "AI inside": "مدعوم بالذكاء الاصطناعي",
      "Built in Ajman": "صُنع في عجمان",
      "The math": "الحسبة",
      "Marketplaces don't sell food. They sell your customers back to you.": "منصات التوصيل لا تبيع الطعام — إنها تبيعك عملاءك من جديد.",
      "Aggregators take a cut of every single order — and the customer stays theirs, not yours. Here's roughly what that costs a small restaurant each month.": "التطبيقات الوسيطة تقتطع نسبة من كل طلب — ويبقى العميل ملكها لا ملكك. هذا تقريباً ما يكلفه ذلك مطعماً صغيراً كل شهر.",
      "Your monthly sales on WhatsApp": "مبيعاتك الشهرية عبر واتساب",
      "Assumes a ~27% marketplace commission. Real rates vary by platform and plan — drag to match your own numbers.": "بافتراض عمولة منصة ~27%. النسب الفعلية تختلف حسب المنصة والخطة — حرّك المؤشر ليطابق أرقامك.",
      "A marketplace would take (27%)": "ما كانت ستأخذه المنصة (27%)",
      "WhatsOrder Starter (AED 2/day)": "باقة واتس أوردر ستارتر (درهمان يومياً)",
      "You'd keep, every month": "ما ستحتفظ به كل شهر",
      "The problem": "المشكلة",
      "WhatsApp orders are easy to receive. The whole operation is hard to run.": "استقبال الطلبات على واتساب سهل. إدارة العملية كاملة هي الصعبة.",
      "Your customers are already messaging you. The trouble starts the moment a chat has to become a tracked order — and keeps going through the shift, the feedback, and the cash drawer.": "عملاؤك يراسلونك بالفعل. المتاعب تبدأ لحظة تحويل المحادثة إلى طلب مُتتبع — وتستمر عبر الوردية والتقييمات ودرج النقدية.",
      "Orders arrive as loose chat": "الطلبات تصل كدردشة مبعثرة",
      "Items, quantities, notes and payment preferences get scattered across a dozen messages.": "الأصناف والكميات والملاحظات وطريقة الدفع تتشتت عبر عشرات الرسائل.",
      "Addresses get hunted down": "العناوين تحتاج إلى مطاردة",
      "Your delivery team burns time asking for pins, landmarks and exact building details every time.": "فريق التوصيل يهدر وقته في طلب المواقع والمعالم وتفاصيل المبنى في كل مرة.",
      "Repeat customers vanish": "العملاء المتكررون يختفون",
      "Every order starts from scratch, so the history that makes regulars valuable is never captured.": "كل طلب يبدأ من الصفر، فلا يُحفظ التاريخ الذي يجعل الزبائن الدائمين أثمن ما لديك.",
      "The back office runs on paper": "المكتب الخلفي يعمل على الورق",
      "Shifts, cash counts, supplier payouts and customer feedback live in notebooks and memory — never in one place you can act on.": "الورديات وجرد النقدية ودفعات الموردين وملاحظات العملاء تعيش في الدفاتر والذاكرة — لا في مكان واحد يمكنك التصرف بناءً عليه.",
      "Structure, without asking your customers to change a thing.": "تنظيم كامل، دون أن يغيّر عملاؤك شيئاً.",
      "They still order on WhatsApp. You get a clean workflow from menu link to dashboard.": "ما زالوا يطلبون عبر واتساب، وأنت تحصل على سير عمل نظيف من رابط القائمة إلى لوحة التحكم.",
      "Share your menu link": "شارك رابط قائمتك",
      "One restaurant link or QR code — on your bio, table, or flyer.": "رابط واحد أو رمز QR — في حسابك أو على الطاولة أو المنشور.",
      "Customer picks items": "العميل يختار الأصناف",
      "They browse your menu with photos and tap to add to cart.": "يتصفح قائمتك بالصور ويضيف إلى السلة بلمسة.",
      "Checkout, their way": "الدفع على طريقته",
      "Delivery with address, pickup, or a scheduled time.": "توصيل مع العنوان، أو استلام، أو وقت مجدول.",
      "Clean WhatsApp order": "طلب واتساب نظيف",
      "A tidy, structured message lands in your chat — no guesswork.": "رسالة مرتبة ومنظمة تصل إلى محادثتك — بلا تخمين.",
      "Saved to dashboard": "يُحفظ في لوحة التحكم",
      "The order, the customer and the totals are logged automatically.": "الطلب والعميل والمجاميع تُسجّل تلقائياً.",
      "Live in production": "يعمل فعلياً",
      "Not a mockup — it's running today at Chai Xpress, Ajman.": "ليس نموذجاً — إنه يعمل اليوم في تشاي إكسبرس، عجمان.",
      "WhatsOrder is built alongside a working UAE restaurant, taking real orders on the same WhatsApp their customers already use. Don't take our word for it — open the live menu and place a test order yourself.": "بُني واتس أوردر جنباً إلى جنب مع مطعم إماراتي حقيقي يستقبل طلبات حقيقية على واتساب نفسه الذي يستخدمه عملاؤه. لا تأخذ بكلامنا فقط — افتح القائمة المباشرة وجرّب طلباً بنفسك.",
      "Try the live ordering flow": "جرّب تجربة الطلب المباشرة",
      "A real menu, real prices, real photos": "قائمة حقيقية وأسعار حقيقية وصور حقيقية",
      "Orders land as structured WhatsApp messages": "الطلبات تصل كرسائل واتساب منظمة",
      "Run day to day from the owner's dashboard": "يُدار يومياً من لوحة تحكم المالك",
      "The AI growth engine": "محرك النمو بالذكاء الاصطناعي",
      "It doesn't just record your day. It tells you how to grow the next one.": "لا يكتفي بتسجيل يومك، بل يخبرك كيف تُنمّي اليوم التالي.",
      "Every order feeds a customer base you own. WhatsOrder's AI reads it and turns it into one clear move each morning — and WhatsApp is how you act on it.": "كل طلب يبني قاعدة عملاء تملكها أنت. الذكاء الاصطناعي في واتس أوردر يقرأها ويحوّلها إلى خطوة واضحة كل صباح — وواتساب هو وسيلتك لتنفيذها.",
      "A daily recap written like a manager": "ملخص يومي مكتوب بعقلية مدير",
      "Every morning, AI reads yesterday's numbers and prescribes one growth move.": "كل صباح، يقرأ الذكاء الاصطناعي أرقام الأمس ويصف لك خطوة نمو واحدة.",
      "Not a receipt of totals. It judges the day against its own weekday average, spots rising and fading items and quiet hours, and tells you exactly what to run today — with the upside quantified from your own data.": "ليس إيصال مجاميع. إنه يقيس اليوم مقابل متوسط يومه الأسبوعي، ويرصد الأصناف الصاعدة والمتراجعة والساعات الهادئة، ويخبرك بالضبط بما تديره اليوم — مع تقدير العائد من بياناتك نفسها.",
      "Customer segments, ready to act on": "شرائح عملاء جاهزة للتحرك",
      "Your customers are sorted automatically — message any of them on WhatsApp in one tap, consent-first.": "يُصنَّف عملاؤك تلقائياً — راسل أياً منهم على واتساب بلمسة واحدة، وبموافقتهم أولاً.",
      "WhatsApp campaigns": "حملات واتساب",
      "Coming soon": "قريباً",
      "Write one message and send it to a whole segment — win back the inactive, reward the VIPs. Opt-in only, unsubscribe built in.": "اكتب رسالة واحدة وأرسلها لشريحة كاملة — استعد الغائبين وكافئ كبار العملاء. بالاشتراك الطوعي فقط، مع إلغاء اشتراك مدمج.",
      "Offers & loyalty that upsell": "عروض وولاء يرفعان قيمة الطلب",
      "Promote items at happy-hour prices to drive a slow hour, and reward regulars with points — bigger baskets, more returns.": "روّج أصنافاً بأسعار مخفضة لتحريك الساعات البطيئة، وكافئ الدائمين بالنقاط — سلال أكبر وعودة أكثر.",
      "More than ordering": "أكثر من مجرد طلبات",
      "One system, front of house to back of house.": "نظام واحد، من الصالة إلى ما خلف الكاونتر.",
      "The order is just the front door. WhatsOrder runs the customer relationship, the feedback loop, the shift, and the cash drawer behind it — all without commission.": "الطلب مجرد الباب الأمامي. واتس أوردر يدير علاقة العميل وحلقة التقييم والوردية ودرج النقدية خلفه — كل ذلك بدون عمولة.",
      "Front of house": "واجهة المطعم",
      "What your customers touch.": "ما يلمسه عملاؤك.",
      "No app, no marketplace listing.": "بلا تطبيق ولا إدراج في منصات.",
      "Menu link & QR": "رابط القائمة ورمز QR",
      "One restaurant link or QR code, with photo menus, to share anywhere.": "رابط واحد أو رمز QR لقائمتك المصوّرة، شاركه في أي مكان.",
      "Structured orders": "طلبات منظمة",
      "Item, address, note and payment land as one clean WhatsApp message.": "الصنف والعنوان والملاحظة والدفع تصل كرسالة واتساب واحدة نظيفة.",
      "Delivery, pickup & scheduled": "توصيل واستلام وجدولة",
      "With offers and promos when you want to drive a slow hour.": "مع عروض وتخفيضات عندما تريد تحريك ساعة بطيئة.",
      "Signature": "مميز",
      "Feedback that's tied to the order": "تقييم مرتبط بالطلب نفسه",
      "Every completed order asks one question.": "كل طلب مكتمل يطرح سؤالاً واحداً.",
      "When an order is marked delivered, the customer gets a feedback request linked to that exact order — so the rating you get is real, attributable data you can act on, not a guess. Spot a bad night by item, not by vibe.": "عند تعليم الطلب كمُسلَّم، يصل العميل طلب تقييم مرتبط بذلك الطلب تحديداً — فيكون التقييم بيانات حقيقية قابلة للإسناد يمكنك التصرف بناءً عليها، لا تخميناً. اكتشف الليلة السيئة بالصنف، لا بالإحساس.",
      "Back of house": "خلف الكاونتر",
      "What you run behind the counter.": "ما تديره خلف الكاونتر.",
      "In one installable app.": "في تطبيق واحد قابل للتثبيت.",
      "AI menu builder & food photos": "منشئ القوائم وصور الأطعمة بالذكاء الاصطناعي",
      "Photograph a paper menu and AI structures it into categories, items and prices — and generates appetising photos for items missing one.": "صوّر قائمة ورقية وسيحوّلها الذكاء الاصطناعي إلى فئات وأصناف وأسعار — ويولّد صوراً شهية للأصناف التي تنقصها صورة.",
      "Live order board": "لوحة طلبات مباشرة",
      "Move orders through New, Preparing and Completed — with timings and kitchen printing.": "حرّك الطلبات بين جديد وقيد التحضير ومكتمل — مع التوقيت وطباعة المطبخ.",
      "Customer insights & loyalty": "رؤى العملاء والولاء",
      "See who's new, repeat, VIP or gone quiet, what they reorder — and reward them with built-in loyalty points.": "اعرف من هو جديد أو متكرر أو VIP أو غائب، وما يعيدون طلبه — وكافئهم بنقاط ولاء مدمجة.",
      "Vendor cash tracker": "متتبع نقدية الموردين",
      "Log every cash payout to suppliers against a shift, so the drawer always ties out.": "سجّل كل دفعة نقدية للموردين على الوردية، ليتطابق الدرج دائماً.",
      "Sales insights at a glance": "رؤى المبيعات بنظرة واحدة",
      "Revenue, average order value, order counts and your top sellers — without exporting a thing.": "الإيراد ومتوسط قيمة الطلب وعدد الطلبات وأفضل أصنافك — دون تصدير أي شيء.",
      "Install it like an app — no app store": "ثبّته كتطبيق — بلا متجر تطبيقات",
      "Add WhatsOrder to the home screen of the counter phone or tablet. Fast, full-screen, made for service.": "أضف واتس أوردر إلى الشاشة الرئيسية لهاتف أو جهاز الكاونتر. سريع، بملء الشاشة، ومصمم للخدمة.",
      "Progressive web app": "تطبيق ويب تقدمي",
      "Owner value": "قيمة للمالك",
      "Built for restaurants that live on regulars.": "صُمم للمطاعم التي تعيش على زبائنها الدائمين.",
      "A more professional way to take direct orders — with the customer relationship staying firmly in your hands.": "طريقة أكثر احترافية لاستقبال الطلبات المباشرة — مع بقاء علاقة العميل في يدك تماماً.",
      "Zero commission": "عمولة صفر",
      "A flat monthly fee — never a cut of your sales.": "رسم شهري ثابت — لا نسبة من مبيعاتك أبداً.",
      "Own your customer data": "بيانات عملائك ملكك",
      "Your regulars belong to you, not to a platform.": "زبائنك الدائمون ملكك أنت، لا ملك منصة.",
      "Faster repeat orders": "طلبات متكررة أسرع",
      "Saved details turn returning customers into one-tap orders.": "التفاصيل المحفوظة تجعل طلب العائدين بلمسة واحدة.",
      "Clearer orders": "طلبات أوضح",
      'Fewer mistakes, fewer "what did you mean?" messages.': "أخطاء أقل، ورسائل «ماذا قصدت؟» أقل.",
      "Easier menu management": "إدارة قائمة أسهل",
      "Edit prices, photos and availability in seconds.": "عدّل الأسعار والصور والتوفر في ثوانٍ.",
      "A more professional feel": "مظهر أكثر احترافية",
      "Look organised and modern without leaving WhatsApp.": "ابدُ منظماً وعصرياً دون مغادرة واتساب.",
      "Marketplace vs WhatsOrder": "المنصات مقابل واتس أوردر",
      "Same orders. You keep the margin — and the customer.": "نفس الطلبات. أنت تحتفظ بالهامش — وبالعميل.",
      "Aggregators rent you demand and keep the relationship. WhatsOrder turns the WhatsApp you already have into an ordering system you own.": "المنصات تؤجّرك الطلب وتحتفظ بالعلاقة. واتس أوردر يحوّل واتساب الذي تملكه أصلاً إلى نظام طلبات تملكه أنت.",
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
      "AI insight on your own sales": "رؤية ذكاء اصطناعي لمبيعاتك",
      "Nothing": "لا شيء",
      "A growth move daily": "خطوة نمو يومياً",
      "Shifts, cash & vendor payouts": "الورديات والنقدية ودفعات الموردين",
      "Not included": "غير متوفرة",
      "What it costs you": "ماذا يكلفك",
      "A cut of all sales": "نسبة من كل مبيعاتك",
      "≈ AED 60 flat / month": "≈ 60 درهماً ثابتة شهرياً",
      "Launch pricing": "أسعار الإطلاق",
      "Starts at AED 2 a day. No commission, ever.": "يبدأ من درهمين في اليوم. بلا عمولة أبداً.",
      "Early pricing for pilot restaurants who want structured WhatsApp ordering without a marketplace taking a cut.": "أسعار مبكرة للمطاعم الرائدة التي تريد طلبات واتساب منظمة دون أن تقتطع منصة نصيباً.",
      "Starter · founding offer": "ستارتر · عرض التأسيس",
      "/ day": "/ يوم",
      "≈ AED 60 / month — about the price of one karak a day. Free setup included.": "≈ 60 درهماً شهرياً — تقريباً ثمن كوب كرك واحد يومياً. الإعداد مجاني.",
      "Request a demo on WhatsApp": "اطلب عرضاً عبر واتساب",
      "Every plan includes": "كل باقة تشمل",
      "Digital menu & QR code": "قائمة رقمية ورمز QR",
      "Structured WhatsApp ordering": "طلبات واتساب منظمة",
      "Order dashboard": "لوحة تحكم بالطلبات",
      "Customer database": "قاعدة بيانات العملاء",
      "Menu setup support": "دعم إعداد القائمة",
      "The questions owners ask first.": "الأسئلة التي يطرحها المُلّاك أولاً.",
      "Straight answers for restaurants already taking orders through WhatsApp.": "إجابات مباشرة للمطاعم التي تستقبل طلباتها عبر واتساب بالفعل.",
      "Is WhatsOrder just for taking orders?": "هل واتس أوردر لاستقبال الطلبات فقط؟",
      "No — ordering is the front door. Behind it sits an AI-enabled lightweight POS: an AI daily recap that prescribes a growth move each morning, customer segments and loyalty, post-order feedback, a live order board, shift and cash reconciliation, vendor cash tracking, sales insights, and an AI menu builder with generated food photos. WhatsApp campaigns to whole segments are coming next.": "لا — الطلبات هي الباب الأمامي فقط. خلفه نظام نقاط بيع خفيف مدعوم بالذكاء الاصطناعي: ملخص يومي يصف خطوة نمو كل صباح، وشرائح عملاء وولاء، وتقييمات بعد الطلب، ولوحة طلبات مباشرة، وتسوية الورديات والنقدية، وتتبع نقدية الموردين، ورؤى المبيعات، ومنشئ قوائم بالذكاء الاصطناعي مع صور مولّدة. وحملات واتساب للشرائح كاملة قادمة قريباً.",
      "Is WhatsOrder a POS? Do I need new hardware?": "هل واتس أوردر نظام نقاط بيع؟ هل أحتاج أجهزة جديدة؟",
      "It's a lightweight POS that runs on the phone or tablet you already have — orders, staff entry, kitchen printing, shifts and cash, all in an installable web app. No terminals, no contracts, no new hardware.": "إنه نظام نقاط بيع خفيف يعمل على الهاتف أو الجهاز اللوحي الذي تملكه أصلاً — الطلبات وإدخال الموظفين وطباعة المطبخ والورديات والنقدية، كلها في تطبيق ويب قابل للتثبيت. بلا أجهزة طرفية ولا عقود ولا معدات جديدة.",
      "Does WhatsOrder replace WhatsApp?": "هل يستبدل واتس أوردر واتساب؟",
      "No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.": "لا. إنه يعمل إلى جانب واتساب ويجعل الطلبات التي تصل إليه نظيفة ومنظمة فحسب. يبقى عملاؤك يراسلونك حيث اعتادوا تماماً.",
      "Do customers need to install an app?": "هل يحتاج العملاء إلى تثبيت تطبيق؟",
      "No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.": "لا. يفتحون رابط القائمة أو يمسحون رمز QR في المتصفح — بلا تنزيل ولا حساب ولا عناء.",
      "Can I manage my own menu?": "هل يمكنني إدارة قائمتي بنفسي؟",
      "Yes. Add items, edit prices, mark things unavailable and upload photos yourself, any time.": "نعم. أضف أصنافاً وعدّل الأسعار وعلّم الأصناف غير المتوفرة وارفع الصور بنفسك في أي وقت.",
      "Can returning customers reorder faster?": "هل يعيد العملاء العائدون الطلب أسرع؟",
      "Yes. Customer details can be saved so regulars don't have to re-enter everything each time.": "نعم. يمكن حفظ تفاصيل العميل حتى لا يعيد الدائمون إدخال كل شيء في كل مرة.",
      "Is there any commission?": "هل هناك أي عمولة؟",
      "None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.": "لا شيء. واتس أوردر رسم شهري ثابت، ولا نأخذ أبداً نسبة من مبيعاتك.",
      "Try it with your workflow": "جرّبه على طريقة عملك",
      "Want to see WhatsOrder run your restaurant?": "أتريد أن ترى واتس أوردر يدير مطعمك؟",
      "If you already take orders on WhatsApp, we'd love to understand your workflow and walk you through a live demo.": "إن كنت تستقبل الطلبات على واتساب بالفعل، يسعدنا فهم طريقة عملك وأخذك في جولة تجريبية مباشرة.",
      "Message us on WhatsApp": "راسلنا على واتساب",
      "Email whatsorder.ae@gmail.com": "راسلنا: whatsorder.ae@gmail.com",
      "Structured WhatsApp ordering for small UAE restaurants. Built in Ajman.": "طلبات واتساب منظمة لمطاعم الإمارات الصغيرة. صُنع في عجمان.",
      "Live demo": "عرض مباشر",
      "Contact": "تواصل"
    };
    var ML = {
      "Why": "എന്തിന്",
      "How it works": "എങ്ങനെ പ്രവർത്തിക്കുന്നു",
      "AI growth": "AI വളർച്ച",
      "Features": "ഫീച്ചറുകൾ",
      "Pricing": "വില",
      "FAQ": "ചോദ്യങ്ങൾ",
      "View live demo": "ലൈവ് ഡെമോ കാണൂ",
      "Request a demo": "ഡെമോ ബുക്ക് ചെയ്യൂ",
      "For small UAE restaurants": "യുഎഇയിലെ ചെറുകിട റെസ്റ്ററന്റുകൾക്കായി",
      "WhatsApp takes the order. WhatsOrder runs": "വാട്ട്സ്ആപ്പ് ഓർഡർ എടുക്കുന്നു. WhatsOrder നടത്തുന്നത്",
      "everything after it": "അതിനു ശേഷമുള്ള എല്ലാം",
      "Structured orders, AI daily growth insights, customer segments, loyalty, shift & cash reconciliation, AI-built menus — a commission-free, AI-enabled lightweight POS running on the WhatsApp your customers already use.": "ചിട്ടയായ ഓർഡറുകൾ, AI ദിവസേനയുള്ള വളർച്ചാ ഉൾക്കാഴ്ചകൾ, കസ്റ്റമർ സെഗ്മെന്റുകൾ, ലോയൽറ്റി, ഷിഫ്റ്റ് & ക്യാഷ് കണക്ക്, AI ഉണ്ടാക്കുന്ന മെനുകൾ — നിങ്ങളുടെ കസ്റ്റമർമാർ ഇപ്പോൾ തന്നെ ഉപയോഗിക്കുന്ന വാട്ട്സ്ആപ്പിൽ പ്രവർത്തിക്കുന്ന, കമ്മീഷൻ ഇല്ലാത്ത, AI ശക്തിയുള്ള ലൈറ്റ്‌വെയ്റ്റ് POS.",
      "See it live at Chai Xpress →": "ചായ് എക്സ്പ്രസിൽ ലൈവ് കാണൂ →",
      "See your menu live in 2 minutes →": "നിങ്ങളുടെ മെനു 2 മിനിറ്റിൽ ലൈവായി കാണൂ →",
      "Commission-free": "കമ്മീഷൻ ഇല്ല",
      "Works with WhatsApp": "വാട്ട്സ്ആപ്പിനൊപ്പം",
      "AI inside": "AI ഉള്ളിൽ",
      "Built in Ajman": "അജ്മാനിൽ നിർമിതം",
      "The math": "കണക്ക്",
      "Marketplaces don't sell food. They sell your customers back to you.": "മാർക്കറ്റ്പ്ലേസുകൾ ഭക്ഷണം വിൽക്കുന്നില്ല. നിങ്ങളുടെ കസ്റ്റമർമാരെ നിങ്ങൾക്കു തന്നെ തിരികെ വിൽക്കുകയാണ്.",
      "Aggregators take a cut of every single order — and the customer stays theirs, not yours. Here's roughly what that costs a small restaurant each month.": "അഗ്രിഗേറ്ററുകൾ ഓരോ ഓർഡറിൽ നിന്നും വിഹിതം എടുക്കുന്നു — കസ്റ്റമർ അവരുടേതായി തുടരുന്നു, നിങ്ങളുടേതല്ല. ഒരു ചെറിയ റെസ്റ്ററന്റിന് ഇതു മാസം ഏകദേശം എത്ര ചെലവാകുമെന്നു നോക്കൂ.",
      "Your monthly sales on WhatsApp": "വാട്ട്സ്ആപ്പിലെ നിങ്ങളുടെ മാസ വിൽപ്പന",
      "Assumes a ~27% marketplace commission. Real rates vary by platform and plan — drag to match your own numbers.": "~27% മാർക്കറ്റ്പ്ലേസ് കമ്മീഷൻ കണക്കാക്കിയത്. യഥാർത്ഥ നിരക്കുകൾ പ്ലാറ്റ്ഫോം അനുസരിച്ചു മാറും — നിങ്ങളുടെ കണക്കിലേക്കു വലിച്ചു നീക്കൂ.",
      "A marketplace would take (27%)": "മാർക്കറ്റ്പ്ലേസ് എടുക്കുമായിരുന്നത് (27%)",
      "WhatsOrder Starter (AED 2/day)": "WhatsOrder സ്റ്റാർട്ടർ (ദിവസം AED 2)",
      "You'd keep, every month": "എല്ലാ മാസവും നിങ്ങൾക്കു മിച്ചം",
      "The problem": "പ്രശ്നം",
      "WhatsApp orders are easy to receive. The whole operation is hard to run.": "വാട്ട്സ്ആപ്പിൽ ഓർഡർ കിട്ടാൻ എളുപ്പം. മുഴുവൻ ഓപ്പറേഷനും നടത്താനാണു പ്രയാസം.",
      "Your customers are already messaging you. The trouble starts the moment a chat has to become a tracked order — and keeps going through the shift, the feedback, and the cash drawer.": "നിങ്ങളുടെ കസ്റ്റമർമാർ ഇപ്പോൾ തന്നെ മെസേജ് ചെയ്യുന്നുണ്ട്. ചാറ്റ് ട്രാക്ക് ചെയ്യാവുന്ന ഓർഡറാകേണ്ട നിമിഷം മുതലാണു ബുദ്ധിമുട്ടു തുടങ്ങുന്നത് — ഷിഫ്റ്റിലും ഫീഡ്ബാക്കിലും ക്യാഷ് ഡ്രോയറിലും അതു തുടരുന്നു.",
      "Orders arrive as loose chat": "ഓർഡറുകൾ ചിതറിയ ചാറ്റായി വരുന്നു",
      "Items, quantities, notes and payment preferences get scattered across a dozen messages.": "ഐറ്റങ്ങളും എണ്ണവും കുറിപ്പുകളും പേയ്മെന്റ് രീതിയും ഒരു ഡസൻ മെസേജുകളിലായി ചിതറുന്നു.",
      "Addresses get hunted down": "അഡ്രസിനായി വേട്ടയാടൽ",
      "Your delivery team burns time asking for pins, landmarks and exact building details every time.": "പിന്നും ലാൻഡ്മാർക്കും ബിൽഡിംഗ് വിവരവും ഓരോ തവണയും ചോദിച്ചു ഡെലിവറി ടീമിന്റെ സമയം പോകുന്നു.",
      "Repeat customers vanish": "സ്ഥിരം കസ്റ്റമർമാർ അപ്രത്യക്ഷമാകുന്നു",
      "Every order starts from scratch, so the history that makes regulars valuable is never captured.": "ഓരോ ഓർഡറും പൂജ്യത്തിൽ നിന്നു തുടങ്ങുന്നു; സ്ഥിരക്കാരെ വിലപ്പെട്ടവരാക്കുന്ന ചരിത്രം ഒരിക്കലും രേഖപ്പെടുന്നില്ല.",
      "The back office runs on paper": "ബാക്ക് ഓഫീസ് കടലാസിലാണ്",
      "Shifts, cash counts, supplier payouts and customer feedback live in notebooks and memory — never in one place you can act on.": "ഷിഫ്റ്റുകളും ക്യാഷ് കണക്കും സപ്ലയർ പേയ്മെന്റുകളും ഫീഡ്ബാക്കും നോട്ട്ബുക്കിലും ഓർമയിലും — പ്രവർത്തിക്കാവുന്ന ഒരിടത്തുമില്ല.",
      "Structure, without asking your customers to change a thing.": "കസ്റ്റമർമാരോട് ഒന്നും മാറ്റാൻ പറയാതെ, എല്ലാം ചിട്ടയിൽ.",
      "They still order on WhatsApp. You get a clean workflow from menu link to dashboard.": "അവർ പഴയപോലെ വാട്ട്സ്ആപ്പിൽ ഓർഡർ ചെയ്യുന്നു. നിങ്ങൾക്കു മെനു ലിങ്ക് മുതൽ ഡാഷ്ബോർഡ് വരെ വൃത്തിയുള്ള വർക്ക്ഫ്ലോ.",
      "Share your menu link": "മെനു ലിങ്ക് പങ്കിടൂ",
      "One restaurant link or QR code — on your bio, table, or flyer.": "ഒരൊറ്റ ലിങ്ക് അല്ലെങ്കിൽ QR കോഡ് — ബയോയിലോ മേശയിലോ ഫ്ലയറിലോ.",
      "Customer picks items": "കസ്റ്റമർ ഐറ്റങ്ങൾ തിരഞ്ഞെടുക്കുന്നു",
      "They browse your menu with photos and tap to add to cart.": "ഫോട്ടോ സഹിതം മെനു കണ്ടു ടാപ്പ് ചെയ്തു കാർട്ടിലേക്ക്.",
      "Checkout, their way": "അവരുടെ രീതിയിൽ ചെക്ക്ഔട്ട്",
      "Delivery with address, pickup, or a scheduled time.": "അഡ്രസോടെ ഡെലിവറി, പിക്കപ്പ്, അല്ലെങ്കിൽ ഷെഡ്യൂൾ ചെയ്ത സമയം.",
      "Clean WhatsApp order": "വൃത്തിയുള്ള വാട്ട്സ്ആപ്പ് ഓർഡർ",
      "A tidy, structured message lands in your chat — no guesswork.": "ചിട്ടയായ ഒരു മെസേജ് നിങ്ങളുടെ ചാറ്റിൽ എത്തുന്നു — ഊഹം വേണ്ട.",
      "Saved to dashboard": "ഡാഷ്ബോർഡിൽ സേവ്",
      "The order, the customer and the totals are logged automatically.": "ഓർഡറും കസ്റ്റമറും തുകകളും ഓട്ടോമാറ്റിക്കായി രേഖപ്പെടുന്നു.",
      "Live in production": "ലൈവായി പ്രവർത്തിക്കുന്നു",
      "Not a mockup — it's running today at Chai Xpress, Ajman.": "മോക്കപ്പ് അല്ല — അജ്മാനിലെ ചായ് എക്സ്പ്രസിൽ ഇന്നു തന്നെ ഓടുന്നു.",
      "WhatsOrder is built alongside a working UAE restaurant, taking real orders on the same WhatsApp their customers already use. Don't take our word for it — open the live menu and place a test order yourself.": "യഥാർത്ഥ യുഎഇ റെസ്റ്ററന്റിനൊപ്പമാണ് WhatsOrder നിർമിച്ചത് — അവരുടെ കസ്റ്റമർമാർ ഉപയോഗിക്കുന്ന അതേ വാട്ട്സ്ആപ്പിൽ യഥാർത്ഥ ഓർഡറുകൾ. ഞങ്ങളുടെ വാക്കു വിശ്വസിക്കേണ്ട — ലൈവ് മെനു തുറന്നു സ്വയം ഒരു ടെസ്റ്റ് ഓർഡർ ചെയ്യൂ.",
      "Try the live ordering flow": "ലൈവ് ഓർഡറിംഗ് പരീക്ഷിക്കൂ",
      "A real menu, real prices, real photos": "യഥാർത്ഥ മെനു, യഥാർത്ഥ വില, യഥാർത്ഥ ഫോട്ടോകൾ",
      "Orders land as structured WhatsApp messages": "ഓർഡറുകൾ ചിട്ടയായ വാട്ട്സ്ആപ്പ് മെസേജുകളായി എത്തുന്നു",
      "Run day to day from the owner's dashboard": "ഉടമയുടെ ഡാഷ്ബോർഡിൽ നിന്നു ദിവസവും നടത്താം",
      "The AI growth engine": "AI വളർച്ചാ എൻജിൻ",
      "It doesn't just record your day. It tells you how to grow the next one.": "നിങ്ങളുടെ ദിവസം രേഖപ്പെടുത്തുക മാത്രമല്ല. അടുത്തതു എങ്ങനെ വളർത്താമെന്നും പറയുന്നു.",
      "Every order feeds a customer base you own. WhatsOrder's AI reads it and turns it into one clear move each morning — and WhatsApp is how you act on it.": "ഓരോ ഓർഡറും നിങ്ങളുടേതായ കസ്റ്റമർ ബേസ് വളർത്തുന്നു. WhatsOrder-ന്റെ AI അതു വായിച്ച് എല്ലാ രാവിലെയും വ്യക്തമായ ഒരു നീക്കമാക്കുന്നു — അതു നടപ്പാക്കാനുള്ള വഴിയാണു വാട്ട്സ്ആപ്പ്.",
      "A daily recap written like a manager": "മാനേജരെപ്പോലെ എഴുതിയ ഡെയ്‌ലി റീക്യാപ്",
      "Every morning, AI reads yesterday's numbers and prescribes one growth move.": "എല്ലാ രാവിലെയും AI ഇന്നലത്തെ കണക്കുകൾ വായിച്ച് ഒരു വളർച്ചാ നീക്കം നിർദ്ദേശിക്കുന്നു.",
      "Not a receipt of totals. It judges the day against its own weekday average, spots rising and fading items and quiet hours, and tells you exactly what to run today — with the upside quantified from your own data.": "വെറും തുകകളുടെ രസീതല്ല. അതേ ആഴ്ചദിവസത്തിന്റെ ശരാശരിയുമായി താരതമ്യം ചെയ്ത്, കയറുന്നതും താഴുന്നതുമായ ഐറ്റങ്ങളും ഒഴിഞ്ഞ മണിക്കൂറുകളും കണ്ടെത്തി, ഇന്ന് എന്തു ചെയ്യണമെന്നു കൃത്യമായി പറയുന്നു — നേട്ടം നിങ്ങളുടെ സ്വന്തം ഡാറ്റയിൽ നിന്നു കണക്കാക്കി.",
      "Customer segments, ready to act on": "പ്രവർത്തിക്കാൻ തയ്യാറായ കസ്റ്റമർ സെഗ്മെന്റുകൾ",
      "Your customers are sorted automatically — message any of them on WhatsApp in one tap, consent-first.": "കസ്റ്റമർമാർ ഓട്ടോമാറ്റിക്കായി തരംതിരിയുന്നു — ആർക്കും ഒറ്റ ടാപ്പിൽ വാട്ട്സ്ആപ്പിൽ മെസേജ് അയയ്ക്കൂ, സമ്മതത്തോടെ മാത്രം.",
      "WhatsApp campaigns": "വാട്ട്സ്ആപ്പ് ക്യാമ്പെയ്‌നുകൾ",
      "Coming soon": "ഉടൻ വരുന്നു",
      "Write one message and send it to a whole segment — win back the inactive, reward the VIPs. Opt-in only, unsubscribe built in.": "ഒരു മെസേജ് എഴുതി ഒരു സെഗ്മെന്റിനു മുഴുവൻ അയയ്ക്കൂ — മാറിനിന്നവരെ തിരികെ കൊണ്ടുവരൂ, VIP-കളെ ആദരിക്കൂ. ഓപ്റ്റ്-ഇൻ മാത്രം, അൺസബ്സ്ക്രൈബ് ബിൽറ്റ്-ഇൻ.",
      "Offers & loyalty that upsell": "അപ്സെൽ ചെയ്യുന്ന ഓഫറുകളും ലോയൽറ്റിയും",
      "Promote items at happy-hour prices to drive a slow hour, and reward regulars with points — bigger baskets, more returns.": "മന്ദഗതിയിലുള്ള മണിക്കൂർ ഉണർത്താൻ കുറഞ്ഞ വിലയിൽ ഐറ്റങ്ങൾ പ്രമോട്ട് ചെയ്യൂ, സ്ഥിരക്കാർക്കു പോയിന്റുകൾ നൽകൂ — വലിയ ബാസ്കറ്റുകൾ, കൂടുതൽ മടങ്ങിവരവ്.",
      "More than ordering": "ഓർഡറിംഗിനും അപ്പുറം",
      "One system, front of house to back of house.": "ഒരൊറ്റ സിസ്റ്റം — ഫ്രണ്ട് ഓഫ് ഹൗസ് മുതൽ ബാക്ക് ഓഫ് ഹൗസ് വരെ.",
      "The order is just the front door. WhatsOrder runs the customer relationship, the feedback loop, the shift, and the cash drawer behind it — all without commission.": "ഓർഡർ വെറും മുൻവാതിലാണ്. അതിനു പിന്നിൽ കസ്റ്റമർ ബന്ധവും ഫീഡ്ബാക്ക് ലൂപ്പും ഷിഫ്റ്റും ക്യാഷ് ഡ്രോയറും WhatsOrder നടത്തുന്നു — എല്ലാം കമ്മീഷൻ ഇല്ലാതെ.",
      "Front of house": "ഫ്രണ്ട് ഓഫ് ഹൗസ്",
      "What your customers touch.": "നിങ്ങളുടെ കസ്റ്റമർമാർ തൊടുന്നത്.",
      "No app, no marketplace listing.": "ആപ്പ് വേണ്ട, മാർക്കറ്റ്പ്ലേസ് ലിസ്റ്റിംഗ് വേണ്ട.",
      "Menu link & QR": "മെനു ലിങ്കും QR-ഉം",
      "One restaurant link or QR code, with photo menus, to share anywhere.": "ഫോട്ടോ മെനുവോടെ ഒരൊറ്റ ലിങ്ക് അല്ലെങ്കിൽ QR കോഡ്, എവിടെയും പങ്കിടാം.",
      "Structured orders": "ചിട്ടയായ ഓർഡറുകൾ",
      "Item, address, note and payment land as one clean WhatsApp message.": "ഐറ്റം, അഡ്രസ്, കുറിപ്പ്, പേയ്മെന്റ് — എല്ലാം ഒരൊറ്റ വൃത്തിയുള്ള വാട്ട്സ്ആപ്പ് മെസേജിൽ.",
      "Delivery, pickup & scheduled": "ഡെലിവറി, പിക്കപ്പ്, ഷെഡ്യൂൾ",
      "With offers and promos when you want to drive a slow hour.": "മന്ദഗതിയിലുള്ള സമയം ഉണർത്താൻ ഓഫറുകളും പ്രമോകളും സഹിതം.",
      "Signature": "സിഗ്നേച്ചർ",
      "Feedback that's tied to the order": "ഓർഡറുമായി ബന്ധിപ്പിച്ച ഫീഡ്ബാക്ക്",
      "Every completed order asks one question.": "പൂർത്തിയായ ഓരോ ഓർഡറും ഒരു ചോദ്യം ചോദിക്കുന്നു.",
      "When an order is marked delivered, the customer gets a feedback request linked to that exact order — so the rating you get is real, attributable data you can act on, not a guess. Spot a bad night by item, not by vibe.": "ഓർഡർ ഡെലിവർ ആയെന്ന് അടയാളപ്പെടുത്തുമ്പോൾ, ആ ഓർഡറുമായി ബന്ധിപ്പിച്ച ഫീഡ്ബാക്ക് അഭ്യർത്ഥന കസ്റ്റമർക്കു ലഭിക്കുന്നു — കിട്ടുന്ന റേറ്റിംഗ് ഊഹമല്ല, പ്രവർത്തിക്കാവുന്ന യഥാർത്ഥ ഡാറ്റയാണ്. മോശം രാത്രിയെ ഐറ്റം അനുസരിച്ചു കണ്ടെത്തൂ, തോന്നലനുസരിച്ചല്ല.",
      "Back of house": "ബാക്ക് ഓഫ് ഹൗസ്",
      "What you run behind the counter.": "കൗണ്ടറിനു പിന്നിൽ നിങ്ങൾ നടത്തുന്നത്.",
      "In one installable app.": "ഇൻസ്റ്റാൾ ചെയ്യാവുന്ന ഒരൊറ്റ ആപ്പിൽ.",
      "AI menu builder & food photos": "AI മെനു ബിൽഡറും ഫുഡ് ഫോട്ടോകളും",
      "Photograph a paper menu and AI structures it into categories, items and prices — and generates appetising photos for items missing one.": "പേപ്പർ മെനുവിന്റെ ഫോട്ടോ എടുക്കൂ; AI അതിനെ വിഭാഗങ്ങളും ഐറ്റങ്ങളും വിലകളുമാക്കുന്നു — ഫോട്ടോ ഇല്ലാത്ത ഐറ്റങ്ങൾക്കു രുചികരമായ ചിത്രങ്ങളും ഉണ്ടാക്കുന്നു.",
      "Live order board": "ലൈവ് ഓർഡർ ബോർഡ്",
      "Move orders through New, Preparing and Completed — with timings and kitchen printing.": "ഓർഡറുകൾ ന്യൂ, പ്രിപ്പയറിംഗ്, കംപ്ലീറ്റഡ് എന്നിങ്ങനെ നീക്കൂ — സമയവും കിച്ചൻ പ്രിന്റിംഗും സഹിതം.",
      "Customer insights & loyalty": "കസ്റ്റമർ ഉൾക്കാഴ്ചകളും ലോയൽറ്റിയും",
      "See who's new, repeat, VIP or gone quiet, what they reorder — and reward them with built-in loyalty points.": "ആരാണു പുതിയത്, സ്ഥിരം, VIP, നിശ്ശബ്ദമായത് — അവർ വീണ്ടും ഓർഡർ ചെയ്യുന്നത് എന്തെന്നും അറിയൂ; ബിൽറ്റ്-ഇൻ ലോയൽറ്റി പോയിന്റുകളാൽ ആദരിക്കൂ.",
      "Vendor cash tracker": "വെണ്ടർ ക്യാഷ് ട്രാക്കർ",
      "Log every cash payout to suppliers against a shift, so the drawer always ties out.": "സപ്ലയർമാർക്കുള്ള ഓരോ ക്യാഷ് പേയ്മെന്റും ഷിഫ്റ്റിൽ രേഖപ്പെടുത്തൂ; ഡ്രോയർ എപ്പോഴും കൃത്യമായി ഒത്തുപോകും.",
      "Sales insights at a glance": "ഒറ്റനോട്ടത്തിൽ സെയിൽസ് ഉൾക്കാഴ്ചകൾ",
      "Revenue, average order value, order counts and your top sellers — without exporting a thing.": "വരുമാനം, ശരാശരി ഓർഡർ മൂല്യം, ഓർഡർ എണ്ണം, ടോപ്പ് സെല്ലറുകൾ — ഒന്നും എക്സ്പോർട്ട് ചെയ്യാതെ.",
      "Install it like an app — no app store": "ആപ്പ് പോലെ ഇൻസ്റ്റാൾ ചെയ്യൂ — ആപ്പ് സ്റ്റോർ വേണ്ട",
      "Add WhatsOrder to the home screen of the counter phone or tablet. Fast, full-screen, made for service.": "കൗണ്ടർ ഫോണിന്റെയോ ടാബ്‌ലെറ്റിന്റെയോ ഹോം സ്ക്രീനിൽ WhatsOrder ചേർക്കൂ. വേഗം, ഫുൾ-സ്ക്രീൻ, സർവീസിനായി നിർമിച്ചത്.",
      "Progressive web app": "പ്രോഗ്രസീവ് വെബ് ആപ്പ്",
      "Owner value": "ഉടമയ്ക്കുള്ള മൂല്യം",
      "Built for restaurants that live on regulars.": "സ്ഥിരം കസ്റ്റമർമാരിൽ ജീവിക്കുന്ന റെസ്റ്ററന്റുകൾക്കായി നിർമിച്ചത്.",
      "A more professional way to take direct orders — with the customer relationship staying firmly in your hands.": "നേരിട്ടുള്ള ഓർഡറുകൾ കൂടുതൽ പ്രൊഫഷണലായി എടുക്കാനുള്ള വഴി — കസ്റ്റമർ ബന്ധം പൂർണമായും നിങ്ങളുടെ കയ്യിൽ.",
      "Zero commission": "കമ്മീഷൻ പൂജ്യം",
      "A flat monthly fee — never a cut of your sales.": "ഫ്ലാറ്റ് മാസവരി — വിൽപ്പനയുടെ വിഹിതം ഒരിക്കലുമില്ല.",
      "Own your customer data": "കസ്റ്റമർ ഡാറ്റ നിങ്ങളുടേത്",
      "Your regulars belong to you, not to a platform.": "നിങ്ങളുടെ സ്ഥിരക്കാർ നിങ്ങളുടേതാണ്, ഒരു പ്ലാറ്റ്ഫോമിന്റേതല്ല.",
      "Faster repeat orders": "വേഗത്തിലുള്ള ആവർത്തിത ഓർഡറുകൾ",
      "Saved details turn returning customers into one-tap orders.": "സേവ് ചെയ്ത വിവരങ്ങൾ മടങ്ങിവരുന്നവരെ ഒറ്റ-ടാപ്പ് ഓർഡറാക്കുന്നു.",
      "Clearer orders": "വ്യക്തമായ ഓർഡറുകൾ",
      'Fewer mistakes, fewer "what did you mean?" messages.': 'കുറവു തെറ്റുകൾ, കുറവ് "എന്താണ് ഉദ്ദേശിച്ചത്?" മെസേജുകൾ.',
      "Easier menu management": "എളുപ്പമുള്ള മെനു മാനേജ്മെന്റ്",
      "Edit prices, photos and availability in seconds.": "വിലയും ഫോട്ടോയും ലഭ്യതയും നിമിഷങ്ങളിൽ മാറ്റൂ.",
      "A more professional feel": "കൂടുതൽ പ്രൊഫഷണൽ അനുഭവം",
      "Look organised and modern without leaving WhatsApp.": "വാട്ട്സ്ആപ്പ് വിടാതെ ചിട്ടയും പുതുമയും കാണിക്കൂ.",
      "Marketplace vs WhatsOrder": "മാർക്കറ്റ്പ്ലേസ് vs WhatsOrder",
      "Same orders. You keep the margin — and the customer.": "അതേ ഓർഡറുകൾ. മാർജിനും കസ്റ്റമറും നിങ്ങൾക്കു സ്വന്തം.",
      "Aggregators rent you demand and keep the relationship. WhatsOrder turns the WhatsApp you already have into an ordering system you own.": "അഗ്രിഗേറ്ററുകൾ ഡിമാൻഡ് വാടകയ്ക്കു തരുന്നു, ബന്ധം സ്വന്തമാക്കുന്നു. നിങ്ങളുടെ കയ്യിലുള്ള വാട്ട്സ്ആപ്പിനെ നിങ്ങൾ സ്വന്തമാക്കുന്ന ഓർഡറിംഗ് സിസ്റ്റമാക്കുന്നു WhatsOrder.",
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
      "AI insight on your own sales": "സ്വന്തം വിൽപ്പനയിൽ AI ഉൾക്കാഴ്ച",
      "Nothing": "ഒന്നുമില്ല",
      "A growth move daily": "ദിവസവും ഒരു വളർച്ചാ നീക്കം",
      "Shifts, cash & vendor payouts": "ഷിഫ്റ്റ്, ക്യാഷ്, വെണ്ടർ പേയ്മെന്റുകൾ",
      "Not included": "ഉൾപ്പെടുന്നില്ല",
      "What it costs you": "നിങ്ങൾക്കുള്ള ചെലവ്",
      "A cut of all sales": "എല്ലാ വിൽപ്പനയുടെയും വിഹിതം",
      "≈ AED 60 flat / month": "മാസം ≈ AED 60 ഫ്ലാറ്റ്",
      "Launch pricing": "ലോഞ്ച് പ്രൈസിംഗ്",
      "Starts at AED 2 a day. No commission, ever.": "ദിവസം AED 2 മുതൽ. കമ്മീഷൻ ഒരിക്കലുമില്ല.",
      "Early pricing for pilot restaurants who want structured WhatsApp ordering without a marketplace taking a cut.": "മാർക്കറ്റ്പ്ലേസ് വിഹിതം എടുക്കാതെ ചിട്ടയായ വാട്ട്സ്ആപ്പ് ഓർഡറിംഗ് വേണ്ട പൈലറ്റ് റെസ്റ്ററന്റുകൾക്ക് ആദ്യകാല വില.",
      "Starter · founding offer": "സ്റ്റാർട്ടർ · ഫൗണ്ടിംഗ് ഓഫർ",
      "/ day": "/ ദിവസം",
      "≈ AED 60 / month — about the price of one karak a day. Free setup included.": "മാസം ≈ AED 60 — ദിവസം ഒരു കരക് ചായയുടെ വില മാത്രം. സെറ്റപ്പ് സൗജന്യം.",
      "Request a demo on WhatsApp": "വാട്ട്സ്ആപ്പിൽ ഡെമോ ചോദിക്കൂ",
      "Every plan includes": "എല്ലാ പ്ലാനിലും ഉള്ളത്",
      "Digital menu & QR code": "ഡിജിറ്റൽ മെനുവും QR കോഡും",
      "Structured WhatsApp ordering": "ചിട്ടയായ വാട്ട്സ്ആപ്പ് ഓർഡറിംഗ്",
      "Order dashboard": "ഓർഡർ ഡാഷ്ബോർഡ്",
      "Customer database": "കസ്റ്റമർ ഡാറ്റാബേസ്",
      "Menu setup support": "മെനു സെറ്റപ്പ് സഹായം",
      "The questions owners ask first.": "ഉടമകൾ ആദ്യം ചോദിക്കുന്ന ചോദ്യങ്ങൾ.",
      "Straight answers for restaurants already taking orders through WhatsApp.": "വാട്ട്സ്ആപ്പിൽ ഇപ്പോൾ തന്നെ ഓർഡർ എടുക്കുന്ന റെസ്റ്ററന്റുകൾക്കു നേരായ ഉത്തരങ്ങൾ.",
      "Is WhatsOrder just for taking orders?": "WhatsOrder ഓർഡർ എടുക്കാൻ മാത്രമുള്ളതാണോ?",
      "No — ordering is the front door. Behind it sits an AI-enabled lightweight POS: an AI daily recap that prescribes a growth move each morning, customer segments and loyalty, post-order feedback, a live order board, shift and cash reconciliation, vendor cash tracking, sales insights, and an AI menu builder with generated food photos. WhatsApp campaigns to whole segments are coming next.": "അല്ല — ഓർഡറിംഗ് മുൻവാതിൽ മാത്രം. പിന്നിൽ AI ശക്തിയുള്ള ലൈറ്റ്‌വെയ്റ്റ് POS ഉണ്ട്: എല്ലാ രാവിലെയും വളർച്ചാ നീക്കം നിർദ്ദേശിക്കുന്ന AI ഡെയ്‌ലി റീക്യാപ്, കസ്റ്റമർ സെഗ്മെന്റുകളും ലോയൽറ്റിയും, ഓർഡറിനു ശേഷമുള്ള ഫീഡ്ബാക്ക്, ലൈവ് ഓർഡർ ബോർഡ്, ഷിഫ്റ്റ്-ക്യാഷ് കണക്കുതീർപ്പ്, വെണ്ടർ ക്യാഷ് ട്രാക്കിംഗ്, സെയിൽസ് ഉൾക്കാഴ്ചകൾ, ജനറേറ്റഡ് ഫുഡ് ഫോട്ടോകളോടെ AI മെനു ബിൽഡർ. സെഗ്മെന്റുകൾക്കു മുഴുവനുള്ള വാട്ട്സ്ആപ്പ് ക്യാമ്പെയ്‌നുകൾ ഉടൻ വരുന്നു.",
      "Is WhatsOrder a POS? Do I need new hardware?": "WhatsOrder ഒരു POS ആണോ? പുതിയ ഹാർഡ്‌വെയർ വേണോ?",
      "It's a lightweight POS that runs on the phone or tablet you already have — orders, staff entry, kitchen printing, shifts and cash, all in an installable web app. No terminals, no contracts, no new hardware.": "നിങ്ങളുടെ കയ്യിലുള്ള ഫോണിലോ ടാബ്‌ലെറ്റിലോ ഓടുന്ന ലൈറ്റ്‌വെയ്റ്റ് POS ആണിത് — ഓർഡറുകൾ, സ്റ്റാഫ് എൻട്രി, കിച്ചൻ പ്രിന്റിംഗ്, ഷിഫ്റ്റും ക്യാഷും, എല്ലാം ഇൻസ്റ്റാൾ ചെയ്യാവുന്ന വെബ് ആപ്പിൽ. ടെർമിനലുകളില്ല, കരാറുകളില്ല, പുതിയ ഹാർഡ്‌വെയറില്ല.",
      "Does WhatsOrder replace WhatsApp?": "WhatsOrder വാട്ട്സ്ആപ്പിനു പകരമാണോ?",
      "No. It works alongside WhatsApp and simply makes the orders that arrive there clean and structured. Your customers keep messaging you exactly where they already do.": "അല്ല. വാട്ട്സ്ആപ്പിനൊപ്പം പ്രവർത്തിച്ച്, അവിടെ എത്തുന്ന ഓർഡറുകൾ വൃത്തിയും ചിട്ടയുമുള്ളതാക്കുന്നു. കസ്റ്റമർമാർ പതിവുപോലെ അവിടെത്തന്നെ മെസേജ് ചെയ്യുന്നു.",
      "Do customers need to install an app?": "കസ്റ്റമർമാർ ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യണോ?",
      "No. They open a menu link or scan a QR code in their browser — no download, no account, no friction.": "വേണ്ട. ബ്രൗസറിൽ മെനു ലിങ്ക് തുറക്കുകയോ QR സ്കാൻ ചെയ്യുകയോ ചെയ്യുന്നു — ഡൗൺലോഡില്ല, അക്കൗണ്ടില്ല, തടസ്സമില്ല.",
      "Can I manage my own menu?": "എന്റെ മെനു ഞാൻ തന്നെ മാനേജ് ചെയ്യാമോ?",
      "Yes. Add items, edit prices, mark things unavailable and upload photos yourself, any time.": "തീർച്ചയായും. ഐറ്റങ്ങൾ ചേർക്കൂ, വില മാറ്റൂ, ലഭ്യമല്ലെന്ന് അടയാളപ്പെടുത്തൂ, ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യൂ — എപ്പോൾ വേണമെങ്കിലും.",
      "Can returning customers reorder faster?": "മടങ്ങിവരുന്നവർക്കു വേഗം വീണ്ടും ഓർഡർ ചെയ്യാമോ?",
      "Yes. Customer details can be saved so regulars don't have to re-enter everything each time.": "അതെ. വിവരങ്ങൾ സേവ് ചെയ്യാം; സ്ഥിരക്കാർ ഓരോ തവണയും എല്ലാം വീണ്ടും ടൈപ്പ് ചെയ്യേണ്ട.",
      "Is there any commission?": "കമ്മീഷൻ ഉണ്ടോ?",
      "None. WhatsOrder is a flat monthly fee. We never take a percentage of your sales.": "ഇല്ല. WhatsOrder ഫ്ലാറ്റ് മാസവരിയാണ്. വിൽപ്പനയുടെ ശതമാനം ഞങ്ങൾ ഒരിക്കലും എടുക്കില്ല.",
      "Try it with your workflow": "നിങ്ങളുടെ വർക്ക്ഫ്ലോയിൽ പരീക്ഷിക്കൂ",
      "Want to see WhatsOrder run your restaurant?": "WhatsOrder നിങ്ങളുടെ റെസ്റ്ററന്റ് നടത്തുന്നതു കാണണോ?",
      "If you already take orders on WhatsApp, we'd love to understand your workflow and walk you through a live demo.": "വാട്ട്സ്ആപ്പിൽ ഇപ്പോൾ തന്നെ ഓർഡർ എടുക്കുന്നുണ്ടെങ്കിൽ, നിങ്ങളുടെ രീതി മനസ്സിലാക്കി ലൈവ് ഡെമോ കാണിക്കാൻ ഞങ്ങൾക്കു സന്തോഷമേയുള്ളൂ.",
      "Message us on WhatsApp": "വാട്ട്സ്ആപ്പിൽ മെസേജ് ചെയ്യൂ",
      "Email whatsorder.ae@gmail.com": "ഇമെയിൽ: whatsorder.ae@gmail.com",
      "Structured WhatsApp ordering for small UAE restaurants. Built in Ajman.": "യുഎഇയിലെ ചെറുകിട റെസ്റ്ററന്റുകൾക്കുള്ള ചിട്ടയായ വാട്ട്സ്ആപ്പ് ഓർഡറിംഗ്. അജ്മാനിൽ നിർമിച്ചത്.",
      "Live demo": "ലൈവ് ഡെമോ",
      "Contact": "ബന്ധപ്പെടൂ"
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
