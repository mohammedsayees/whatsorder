import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "WhatsOrder — Turn WhatsApp chats into orders you own",
  description:
    "The commission-free operating system for small UAE restaurants: structured WhatsApp orders, post-order feedback, customer insights, shift and cash reconciliation, vendor cash tracking and AI-built menus.",
  applicationName: "WhatsOrder",
};

export const viewport: Viewport = {
  themeColor: "#0B3D2E",
  width: "device-width",
  initialScale: 1,
};

const landingStyles = String.raw`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap");

:root{
    --pine:#0B3D2E;
    --emerald:#12805A;
    --emerald-bright:#16A06F;
    --karak:#D98A3A;
    --karak-deep:#B86E22;
    --paper:#FBF7EF;
    --paper-2:#F4EEE1;
    --ink:#1A2420;
    --ink-soft:#4C5650;
    --line:#E6DECF;
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
  .btn-primary{background:var(--emerald);color:#fff;box-shadow:0 10px 24px -12px rgba(18,128,90,.7)}
  .btn-primary:hover{background:var(--emerald-bright);transform:translateY(-2px)}
  .btn-ghost{background:transparent;color:var(--pine);border-color:var(--line)}
  .btn-ghost:hover{border-color:var(--pine);transform:translateY(-2px);background:#fff}
  .btn-wa{background:var(--wa);color:#073b24}
  .btn-wa:hover{transform:translateY(-2px);filter:brightness(1.04)}

  /* ---------- header ---------- */
  header{position:sticky;top:0;z-index:50;background:rgba(251,247,239,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .nav{display:flex;align-items:center;justify-content:space-between;height:68px}
  .brand{display:flex;align-items:center;gap:.6rem;font-family:"Bricolage Grotesque";font-weight:700;font-size:1.18rem;letter-spacing:-.02em;color:var(--pine)}
  .brand-mark{width:30px;height:30px;flex:0 0 auto}
  .nav-links{display:flex;align-items:center;gap:1.7rem;font-size:.97rem;color:var(--ink-soft);font-weight:500}
  .nav-links a:hover{color:var(--pine)}
  .nav-cta{display:flex;align-items:center;gap:.8rem}
  @media(max-width:860px){.nav-links{display:none}.nav-cta .btn-ghost{display:none}}

  /* ---------- hero ---------- */
  .hero{position:relative;padding:72px 0 30px}
  .hero-grid{display:grid;grid-template-columns:1.02fr .98fr;gap:54px;align-items:center}
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
  .ticket .badge{font-family:"Geist Mono",monospace;font-size:.62rem;color:var(--emerald);background:rgba(18,128,90,.1);padding:.18rem .45rem;border-radius:5px;letter-spacing:.04em}
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
  .anim .bubble{animation:pop .5s ease forwards}
  .anim .bubble:nth-child(1){animation-delay:.2s}
  .anim .bubble:nth-child(2){animation-delay:.7s}
  .anim .bubble:nth-child(3){animation-delay:1.2s}
  .anim .bubble:nth-child(4){animation-delay:1.7s}
  .anim .trow{animation:pop .45s ease forwards}
  .anim .trow:nth-child(1){animation-delay:1.9s}
  .anim .trow:nth-child(2){animation-delay:2.05s}
  .anim .trow:nth-child(3){animation-delay:2.2s}
  .anim .tmeta{animation:pop .45s ease forwards;animation-delay:2.4s}
  .anim .ttotal{animation:pop .45s ease forwards;animation-delay:2.6s}

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
  .step .num{width:40px;height:40px;border-radius:50%;background:var(--emerald);color:#fff;display:grid;place-items:center;font-family:"Bricolage Grotesque";font-weight:700;position:relative;z-index:2;box-shadow:0 8px 18px -10px rgba(18,128,90,.8)}
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
  .price-card::before{content:"";position:absolute;right:-60px;top:-60px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(217,138,58,.35),transparent 70%)}
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
  .fb-left .tagrow .pill{background:rgba(18,128,90,.1);padding:.2rem .5rem;border-radius:5px}
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
  .balanced{display:inline-flex;align-items:center;gap:.4rem;background:rgba(18,128,90,.12);color:var(--emerald);font-weight:600;padding:.3rem .6rem;border-radius:999px;font-size:.8rem}
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
  }`;

const landingMarkup = String.raw`<!-- ===== HEADER ===== -->
<header>
  <div class="wrap nav">
    <a class="brand" href="#top" aria-label="WhatsOrder home">
      <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#12805A"/>
        <path d="M9 22.5 10.4 19A7 7 0 1 1 13 21.6L9 22.5Z" fill="#FBF7EF"/>
        <path d="M13.2 15.6l2 2 3.8-4.2" stroke="#12805A" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      WhatsOrder
    </a>
    <nav class="nav-links" aria-label="Primary">
      <a href="#problem">Why</a>
      <a href="#how">How it works</a>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-cta">
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
      <p class="lede">Structured orders, post-order feedback, customer insights, shift &amp; cash reconciliation, AI-built menus — a commission-free operating system for your restaurant, running on the WhatsApp your customers already use.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#contact">Request a demo</a>
        <a class="btn btn-ghost" href="https://whatsorder-taupe.vercel.app/r/chaixpress" target="_blank" rel="noopener">See it live at Chai Xpress →</a>
      </div>
      <div class="trust">
        <span>Commission-free</span>
        <span>Works with WhatsApp</span>
        <span>Front to back office</span>
        <span>Built in Ajman</span>
      </div>
    </div>

    <!-- signature device -->
    <div class="device">
      <div class="stage" id="stage">
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

      <div class="miniboard" aria-hidden="true">
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
        <label for="vol">Your monthly orders</label>
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
          <div class="fb-right" aria-hidden="true">
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
        <div class="os-card slip span2">
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
          <h3>AI menu builder</h3>
          <p>Photograph a paper menu and AI structures it into categories, items and prices.</p>
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
          <p>See who's a regular, what they reorder, and reward them with built-in loyalty points.</p>
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
          <div style="display:flex;gap:14px;flex-wrap:wrap">
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
        <p>No — ordering is the front door. Behind it you also get post-order feedback, customer insights and loyalty, a live order board, shift and cash reconciliation, vendor cash tracking, sales insights and an AI menu builder. It's the operating system for the whole restaurant, not a single link.</p>
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
      <a class="btn btn-ghost" style="background:transparent;color:#fff;border-color:#2c6a54" href="mailto:hello@whatsorder.ae?subject=WhatsOrder%20demo%20request">Email hello@whatsorder.ae</a>
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
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#12805A"/><path d="M9 22.5 10.4 19A7 7 0 1 1 13 21.6L9 22.5Z" fill="#FBF7EF"/><path d="m13.2 15.6 2 2 3.8-4.2" stroke="#12805A" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
      <span>hello@whatsorder.ae</span>
    </div>
  </div>
</footer>`;

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
      document.getElementById('volOut').innerHTML = 'AED ' + fmt.format(m) + ' <small>/ month</small>';
      document.getElementById('commOut').textContent = '−AED ' + fmt.format(comm);
      document.getElementById('flatOut').textContent = 'AED ' + FLAT;
      document.getElementById('keepOut').textContent = 'AED ' + fmt.format(keep);
      document.getElementById('yrOut').textContent = '≈ AED ' + fmt.format(keep * 12) + ' a year back in your pocket';
    }
    vol.addEventListener('input', render);
    render();
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
