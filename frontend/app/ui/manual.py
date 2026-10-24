"""
Premium in-app manual renderer.

Turns a Markdown manual into a styled, animated document: hero-friendly typography,
callouts, formula cards, zebra tables, dark diagram blocks, scroll-reveal motion,
a table of contents and a reading-progress bar.
"""

from __future__ import annotations

import html as _html
import re
from typing import Any

import markdown2
from nicegui import ui

MANUAL_CSS = r"""
@keyframes lcm-rise   { from { opacity:0; transform:translateY(22px) } to { opacity:1; transform:none } }
@keyframes lcm-float  { 0%,100% { transform:translateY(0) rotate(-4deg) } 50% { transform:translateY(-10px) rotate(4deg) } }
@keyframes lcm-blob   { 0%,100% { transform:translate(0,0) scale(1) } 50% { transform:translate(30px,-20px) scale(1.15) } }
@keyframes lcm-shine  { from { background-position:0% 50% } to { background-position:200% 50% } }
@keyframes lcm-pulse  { 0%,100% { box-shadow:0 0 0 0 rgba(20,184,166,.45) } 70% { box-shadow:0 0 0 12px rgba(20,184,166,0) } }

#lcm-progress { position:fixed; top:0; left:0; height:3px; width:0; z-index:9999;
  background:linear-gradient(90deg,#14b8a6,#6366f1,#f59e0b); transition:width .12s linear; }

/* ---------- hero ---------- */
.lcm-hero { position:relative; overflow:hidden; border-radius:24px; padding:44px 48px; color:#fff;
  background:linear-gradient(125deg,#0f172a 0%,#134e4a 55%,#312e81 100%);
  box-shadow:0 24px 50px -22px rgba(15,23,42,.65); animation:lcm-rise .7s both; }
.lcm-hero::before,.lcm-hero::after { content:""; position:absolute; border-radius:50%; filter:blur(50px); opacity:.55;
  animation:lcm-blob 9s ease-in-out infinite; }
.lcm-hero::before { width:300px; height:300px; right:-60px; top:-90px; background:#14b8a6; }
.lcm-hero::after  { width:260px; height:260px; left:35%; bottom:-140px; background:#6366f1; animation-delay:-4s; }
.lcm-hero-inner { position:relative; z-index:1; display:flex; align-items:center; gap:30px; flex-wrap:wrap; }
.lcm-hero-icon { font-size:64px; width:112px; height:112px; display:flex; align-items:center; justify-content:center;
  border-radius:28px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.25);
  backdrop-filter:blur(8px); animation:lcm-float 5s ease-in-out infinite; }
.lcm-hero-eyebrow { font-size:11px; letter-spacing:.22em; text-transform:uppercase; font-weight:700; color:#5eead4; }
.lcm-hero-title { font-size:34px; line-height:1.15; font-weight:800; letter-spacing:-.02em; margin:6px 0 8px;
  background:linear-gradient(90deg,#fff,#99f6e4,#fff); background-size:200% auto; -webkit-background-clip:text;
  background-clip:text; color:transparent; animation:lcm-shine 6s linear infinite; }
.lcm-hero-sub { font-size:14px; color:#cbd5e1; max-width:640px; }
.lcm-chips { display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }
.lcm-chip { font-size:12px; font-weight:600; padding:6px 14px; border-radius:999px; color:#e2e8f0;
  background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); }

/* ---------- document switcher ---------- */
.lcm-switch { display:flex; gap:12px; flex-wrap:wrap; }
.lcm-doc { cursor:pointer; display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:14px;
  background:#fff; border:1px solid #e2e8f0; font-size:13px; font-weight:600; color:#334155;
  transition:all .25s ease; }
.lcm-doc:hover { transform:translateY(-3px); border-color:#14b8a6; box-shadow:0 10px 22px -12px rgba(13,148,136,.55); }
.lcm-doc.active { color:#fff; border-color:transparent; background:linear-gradient(135deg,#0d9488,#4f46e5);
  box-shadow:0 12px 26px -12px rgba(79,70,229,.7); animation:lcm-pulse 2.4s infinite; }

/* ---------- table of contents ---------- */
.lcm-toc { position:sticky; top:84px; background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:18px 14px;
  max-height:calc(100vh - 110px); overflow:auto; box-shadow:0 12px 30px -22px rgba(15,23,42,.5); }
.lcm-toc-title { font-size:11px; letter-spacing:.18em; text-transform:uppercase; font-weight:800; color:#64748b; padding:0 8px 10px; }
.lcm-toc a { display:flex; gap:10px; align-items:flex-start; padding:7px 10px; margin:2px 0; border-radius:10px; cursor:pointer;
  font-size:12.5px; line-height:1.35; color:#475569; text-decoration:none; border-left:3px solid transparent; transition:all .2s; }
.lcm-toc a b { flex:none; width:22px; height:22px; border-radius:7px; background:#f1f5f9; color:#0f766e; font-size:11px;
  display:flex; align-items:center; justify-content:center; transition:all .2s; }
.lcm-toc a:hover { background:#f0fdfa; color:#0f766e; transform:translateX(3px); }
.lcm-toc a.on { background:linear-gradient(90deg,#ccfbf1,#eef2ff); color:#0f172a; font-weight:700; border-left-color:#0d9488; }
.lcm-toc a.on b { background:#0d9488; color:#fff; }

/* ---------- article ---------- */
.lcm { color:#1e293b; font-size:15.5px; line-height:1.75; }
.lcm > * { max-width:100%; }
.lcm h1 { font-size:2.1rem; line-height:1.2; font-weight:800; letter-spacing:-.02em; color:#0f172a; margin:0 0 .6rem; }
.lcm h2 { position:relative; font-size:1.55rem; font-weight:800; letter-spacing:-.015em; color:#0f172a;
  margin:3rem 0 1rem; padding:0 0 .7rem; border-bottom:1px solid #e2e8f0; scroll-margin-top:90px; }
.lcm h2::after { content:""; position:absolute; left:0; bottom:-1px; width:90px; height:3px; border-radius:3px;
  background:linear-gradient(90deg,#0d9488,#6366f1); }
.lcm h3 { font-size:1.2rem; font-weight:700; color:#0f766e; margin:2rem 0 .6rem; scroll-margin-top:90px; }
.lcm h4 { font-size:1.02rem; font-weight:700; color:#312e81; margin:1.4rem 0 .5rem; }
.lcm h5 { font-size:.95rem; font-weight:700; color:#475569; margin:1.1rem 0 .4rem; }
.lcm p { margin:0 0 1rem; }
.lcm a { color:#0d9488; font-weight:600; }
.lcm strong { color:#0f172a; }
.lcm ul,.lcm ol { margin:0 0 1.2rem; padding-left:1.4rem; }
.lcm li { margin:.35rem 0; padding-left:.15rem; }
.lcm li::marker { color:#0d9488; font-weight:700; }
.lcm hr { border:0; height:2px; margin:2.6rem 0; background:linear-gradient(90deg,transparent,#99f6e4,#c7d2fe,transparent); }
.lcm code { font-family:'Fira Code',Consolas,monospace; font-size:.86em; background:#f1f5f9; color:#0f766e;
  padding:.12rem .45rem; border-radius:6px; border:1px solid #e2e8f0; }
.lcm pre { position:relative; margin:1.4rem 0; padding:1.3rem 1.4rem 1.1rem; border-radius:16px; overflow-x:auto;
  background:linear-gradient(160deg,#0b1220,#111c33); color:#e2e8f0; border:1px solid #1e293b;
  box-shadow:0 18px 36px -24px rgba(2,6,23,.9); line-height:1.45; }
.lcm pre::before { content:"●  ●  ●"; display:block; margin-bottom:.8rem; font-size:10px; letter-spacing:4px; color:#475569; }
.lcm pre code { background:transparent; border:0; color:inherit; padding:0; font-size:.8rem; white-space:pre; }
.lcm table { width:100%; border-collapse:separate; border-spacing:0; font-size:.88rem; margin:1.4rem 0; }
.lcm .lcm-table { overflow-x:auto; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 14px 30px -24px rgba(15,23,42,.5); margin:1.4rem 0; }
.lcm .lcm-table table { margin:0; }
.lcm th { background:linear-gradient(180deg,#f8fafc,#eef2f7); color:#0f172a; font-weight:700; text-align:left;
  padding:.8rem 1rem; border-bottom:2px solid #cbd5e1; white-space:nowrap; }
.lcm td { padding:.75rem 1rem; border-bottom:1px solid #eef2f7; vertical-align:top; }
.lcm tbody tr:nth-child(even) td { background:#fafcff; }
.lcm tbody tr { transition:background .2s; }
.lcm tbody tr:hover td { background:#ecfdf5; }
.lcm tbody tr:last-child td { border-bottom:0; }
.lcm blockquote { margin:1.3rem 0; padding:1rem 1.3rem; border-radius:14px; background:#f8fafc; border-left:4px solid #6366f1; color:#334155; }
.lcm blockquote p:last-child { margin-bottom:0; }
.lcm img { max-width:100%; border-radius:14px; }
.lcm figure,.lcm .lcm-fig { margin:1.8rem 0; text-align:center; }
.lcm .lcm-fig img { border:1px solid #e2e8f0; box-shadow:0 22px 44px -26px rgba(15,23,42,.65); transition:transform .4s; }
.lcm .lcm-fig img:hover { transform:scale(1.015); }
.lcm .lcm-cap { display:block; margin-top:.7rem; font-size:.8rem; color:#64748b; font-style:italic; }

.lcm .lcm-call { margin:1.5rem 0; padding:1rem 1.3rem 1rem 1.3rem; border-radius:16px; border:1px solid; border-left-width:5px; }
.lcm .lcm-call-t { font-size:.78rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; margin-bottom:.35rem; }
.lcm .lcm-call p:last-child { margin-bottom:0; }
.lcm .lcm-note      { background:#f0fdfa; border-color:#5eead4; border-left-color:#0d9488; color:#134e4a; }
.lcm .lcm-note .lcm-call-t { color:#0f766e; }
.lcm .lcm-tip       { background:#f0f9ff; border-color:#7dd3fc; border-left-color:#0284c7; color:#0c4a6e; }
.lcm .lcm-tip .lcm-call-t { color:#0369a1; }
.lcm .lcm-important { background:#fffbeb; border-color:#fcd34d; border-left-color:#d97706; color:#78350f; }
.lcm .lcm-important .lcm-call-t { color:#b45309; }
.lcm .lcm-warning   { background:#fff1f2; border-color:#fda4af; border-left-color:#e11d48; color:#881337; }
.lcm .lcm-warning .lcm-call-t { color:#be123c; }

.lcm .lcm-formula { margin:1.5rem 0; padding:1.1rem 1.4rem; border-radius:16px; text-align:center; font-weight:700;
  font-size:1.02rem; color:#312e81; background:linear-gradient(135deg,#eef2ff,#ecfeff); border:1px dashed #818cf8; }
.lcm .lcm-formula::before { content:"ƒ(x)  "; color:#6366f1; font-style:italic; font-weight:800; }

/* scroll reveal (JS adds .lcm-pre first, then .in) */
.lcm .lcm-pre { opacity:0; transform:translateY(22px); }
.lcm .lcm-pre.in { opacity:1; transform:none; transition:opacity .6s ease, transform .6s ease; }

@media (max-width:1000px){ .lcm-hero{padding:30px 24px} .lcm-hero-title{font-size:26px} .lcm-toc{position:static;max-height:none} }
@media print { .lcm-hero,.lcm-switch,.lcm-toc,#lcm-progress{display:none!important} .lcm .lcm-pre{opacity:1!important;transform:none!important} }
"""

_CALLOUTS = {
    'NOTE': ('lcm-note', 'ℹ️ Note'),
    'TIP': ('lcm-tip', '💡 Tip'),
    'IMPORTANT': ('lcm-important', '⚠️ Important'),
    'WARNING': ('lcm-warning', '🚨 Warning'),
    'CAUTION': ('lcm-warning', '🛑 Caution'),
}


def _clean_math(expr: str) -> str:
    expr = re.sub(r'\\(?:mathbf|text|mathrm)\{([^{}]*)\}', r'\1', expr)
    expr = expr.replace('\\ ', ' ').replace('\\,', ' ').replace('\\times', '×').replace('\\cdot', '·')
    return _html.escape(re.sub(r'\s+', ' ', expr).strip())


def render_manual(md: str, asset_prefix: str = '/docs-static/') -> dict[str, Any]:
    """Return {'html', 'toc': [(id, label)], 'minutes', 'sections'}."""
    formulas: list[str] = []

    def _stash(m: re.Match) -> str:
        formulas.append(_clean_math(m.group(1)))
        return f'\n\nLCMFORMULA{len(formulas) - 1}X\n\n'

    text = re.sub(r'\$\$(.+?)\$\$', _stash, md, flags=re.S)
    text = re.sub(r'\$([^$\n]{1,40})\$', lambda m: _clean_math(m.group(1)), text)

    body = markdown2.markdown(
        text,
        extras=['fenced-code-blocks', 'tables', 'header-ids', 'strike', 'cuddled-lists'],
    )

    for i, f in enumerate(formulas):
        body = re.sub(rf'<p>\s*LCMFORMULA{i}X\s*</p>', f'<div class="lcm-formula">{f}</div>', body)

    # callouts
    def _callout(m: re.Match) -> str:
        cls, title = _CALLOUTS.get(m.group(1).upper(), _CALLOUTS['NOTE'])
        inner = '<p>' + m.group(2).strip()
        return f'<div class="lcm-call {cls}"><div class="lcm-call-t">{title}</div>{inner}</div>'

    body = re.sub(
        r'<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*?)</blockquote>',
        _callout, body, flags=re.S | re.I,
    )

    body = re.sub(r'(<table>.*?</table>)', r'<div class="lcm-table">\1</div>', body, flags=re.S)

    # figures: image + italic caption
    body = re.sub(
        r'<p>\s*(<img [^>]*>)\s*<em>(Figure[^<]*)</em>\s*</p>',
        r'<div class="lcm-fig">\1<span class="lcm-cap">\2</span></div>', body)
    body = re.sub(r'src="(?!https?:|/|data:)([^"]+)"', rf'src="{asset_prefix}\1"', body)

    # reveal targets
    body = re.sub(r'<(h2|h3|pre|blockquote)([ >])', r'<\1 data-r="1"\2', body)
    body = re.sub(r'<div class="(lcm-table|lcm-fig|lcm-call|lcm-formula)', r'<div data-r="1" class="\1', body)

    toc = []
    for m in re.finditer(r'<h2 [^>]*id="([^"]+)"[^>]*>(.*?)</h2>', body, flags=re.S):
        label = _html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if re.search(r'table of contents|sommaire', label, re.I):
            continue
        toc.append((m.group(1), label))

    words = len(re.findall(r'\w+', md))
    return {
        'html': f'<article class="lcm">{body}</article>',
        'toc': toc,
        'minutes': max(1, round(words / 210)),
        'sections': len(toc),
    }


def toc_html(toc: list[tuple[str, str]], title: str = 'On this page') -> str:
    rows = ''.join(
        f'<a data-t="{_html.escape(i)}" onclick="document.getElementById(\'{_html.escape(i)}\')'
        f'.scrollIntoView({{behavior:\'smooth\',block:\'start\'}})"><b>{n}</b><span>{_html.escape(label)}</span></a>'
        for n, (i, label) in enumerate(toc, 1)
    )
    return f'<nav class="lcm-toc"><div class="lcm-toc-title">{_html.escape(title)}</div>{rows}</nav>'


_JS = r"""
setTimeout(() => {
  let bar = document.getElementById('lcm-progress');
  if (!bar) { bar = document.createElement('div'); bar.id = 'lcm-progress'; document.body.appendChild(bar); }
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, window.scrollY / h * 100) : 0) + '%';
    const links = document.querySelectorAll('.lcm-toc a[data-t]');
    let cur = null;
    document.querySelectorAll('.lcm h2[id]').forEach(el => { if (el.getBoundingClientRect().top < 140) cur = el.id; });
    links.forEach(a => a.classList.toggle('on', a.dataset.t === cur));
  };
  window.removeEventListener('scroll', window.__lcmScroll || (() => {}));
  window.__lcmScroll = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const els = document.querySelectorAll('.lcm [data-r]');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => { el.classList.add('lcm-pre'); io.observe(el); });
}, 180);
"""


def activate_motion() -> None:
    """Start reading progress, TOC scroll-spy and scroll-reveal for the rendered manual."""
    ui.run_javascript(_JS)
