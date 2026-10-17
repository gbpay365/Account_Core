"""
The design system: colour, type, elevation and the handful of CSS rules that
make a data-dense accounting screen readable rather than merely dense.

Everything visual is decided here so pages compose tokens instead of inventing
their own spacing and colours.
"""

from __future__ import annotations

from nicegui import ui

# Deep slate navigation against a near-white canvas, with a single teal accent
# for actions and a restrained semantic palette for status.
PRIMARY = '#0f766e'
PRIMARY_DARK = '#115e59'
ACCENT = '#0d9488'
NAVY = '#0f172a'
NAVY_SOFT = '#1e293b'
INK = '#0f172a'
MUTED = '#64748b'
CANVAS = '#f6f7f9'
SURFACE = '#ffffff'
BORDER = '#e2e8f0'

POSITIVE = '#059669'
WARNING = '#d97706'
NEGATIVE = '#dc2626'
INFO = '#0284c7'

#: Status vocabulary shared by every badge in the application.
STATUS_TONES: dict[str, str] = {
    # ledger
    'draft': 'slate', 'posted': 'emerald', 'reversed': 'rose',
    # periods
    'open': 'emerald', 'closed': 'amber', 'locked': 'slate',
    # assets
    'in_stock': 'sky', 'installing': 'sky', 'in_service': 'emerald',
    'under_maintenance': 'amber', 'awaiting_parts': 'amber',
    'calibration_overdue': 'rose', 'quarantined': 'rose',
    'out_of_service': 'rose', 'pending_disposal': 'violet', 'disposed': 'slate',
    # work orders
    'requested': 'slate', 'approved': 'sky', 'assigned': 'sky',
    'in_progress': 'teal', 'on_hold': 'amber', 'completed': 'emerald',
    'verified': 'emerald', 'cancelled': 'slate', 'rejected': 'rose',
    # compliance
    'pass': 'emerald', 'pass_with_adjustment': 'teal', 'conditional': 'amber',
    'fail': 'rose', 'indeterminate': 'amber',
    # priority
    'low': 'slate', 'normal': 'sky', 'high': 'amber', 'emergency': 'rose',
    'urgent': 'rose',
    'shopping': 'violet', 'received': 'emerald', 'needed': 'amber',
    'bought': 'emerald', 'unavailable': 'slate',
    'medium': 'sky', 'critical': 'rose',
    # runs / contracts / disposals
    'simulated': 'sky', 'active': 'emerald', 'expiring': 'amber', 'expired': 'rose',
    'pending_approval': 'amber', 'terminated': 'slate', 'renewed': 'emerald',
}

TONE_CLASSES: dict[str, str] = {
    'slate': 'bg-slate-100 text-slate-700 ring-slate-200',
    'sky': 'bg-sky-50 text-sky-700 ring-sky-200',
    'teal': 'bg-teal-50 text-teal-700 ring-teal-200',
    'emerald': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'amber': 'bg-amber-50 text-amber-700 ring-amber-200',
    'rose': 'bg-rose-50 text-rose-700 ring-rose-200',
    'violet': 'bg-violet-50 text-violet-700 ring-violet-200',
}


def apply() -> None:
    """Installs fonts, Quasar colours and the global stylesheet."""
    ui.colors(primary=PRIMARY, secondary=NAVY, accent=ACCENT,
              positive=POSITIVE, negative=NEGATIVE, warning=WARNING, info=INFO,
              dark=NAVY)
    ui.add_head_html("""
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    """)
    ui.add_css(f"""
      :root {{
        --lc-primary: {PRIMARY};
        --lc-navy: {NAVY};
        --lc-canvas: {CANVAS};
        --lc-border: {BORDER};
        --lc-muted: {MUTED};
      }}

      html, body {{
        font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        background: var(--lc-canvas);
        color: {INK};
        -webkit-font-smoothing: antialiased;
      }}
      .nicegui-content {{ padding: 0; gap: 0; }}

      /* Numbers line up in columns only if the figures are tabular. */
      .lc-num {{
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }}

      .lc-card {{
        background: {SURFACE};
        border: 1px solid var(--lc-border);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, .04), 0 8px 24px -16px rgba(15, 23, 42, .12);
      }}
      .lc-card-flat {{
        background: {SURFACE};
        border: 1px solid var(--lc-border);
        border-radius: 14px;
      }}

      .lc-nav-item {{
        border-radius: 10px;
        color: #cbd5e1;
        transition: background .15s ease, color .15s ease;
      }}
      .lc-nav-item:hover {{ background: rgba(255,255,255,.07); color: #fff; }}
      .lc-nav-item.lc-active {{
        background: rgba(13,148,136,.18);
        color: #fff;
        box-shadow: inset 2px 0 0 {ACCENT};
      }}
      .lc-nav-section {{
        color: #64748b;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .09em;
        text-transform: uppercase;
      }}

      .lc-badge {{
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 9px; border-radius: 999px;
        font-size: 11.5px; font-weight: 600; line-height: 18px;
        white-space: nowrap;
        --tw-ring-offset-width: 0px;
        box-shadow: inset 0 0 0 1px currentColor;
        opacity: 1;
      }}

      /* Tables: quiet chrome, strong hierarchy, sticky header. */
      .lc-table .q-table thead th {{
        background: #fbfcfd;
        color: {MUTED};
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .05em;
        text-transform: uppercase;
        border-bottom: 1px solid var(--lc-border);
        position: sticky; top: 0; z-index: 2;
      }}
      .lc-table .q-table tbody td {{
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
      }}
      .lc-table .q-table tbody tr:hover {{ background: #f8fafc; }}
      .lc-table .q-table__bottom {{ border-top: 1px solid var(--lc-border); font-size: 12px; }}
      .lc-table .q-table--dense .q-table__top {{ padding: 8px 12px; }}

      /* Statement rendering: the visual grammar of a financial statement. */
      .lc-stmt {{ width: 100%; border-collapse: collapse; }}
      .lc-stmt th {{
        text-align: right; padding: 8px 10px;
        font-size: 11px; font-weight: 700; letter-spacing: .05em;
        text-transform: uppercase; color: {MUTED};
        border-bottom: 1px solid var(--lc-border);
      }}
      .lc-stmt th:first-child, .lc-stmt td:first-child {{ text-align: left; }}
      .lc-stmt td {{ padding: 5px 10px; font-size: 13px; border-bottom: 1px solid #f4f6f8; }}
      .lc-stmt tr.lc-detail td:first-child {{ padding-left: 26px; color: #334155; }}
      .lc-stmt tr.lc-subtotal td {{
        font-weight: 600; background: #f8fafc;
        border-top: 1px solid var(--lc-border);
      }}
      .lc-stmt tr.lc-total td {{
        font-weight: 700; background: #f1f5f9;
        border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;
      }}
      .lc-stmt tr.lc-header td {{
        font-weight: 700; font-size: 11.5px; letter-spacing: .05em;
        text-transform: uppercase; color: {NAVY}; padding-top: 14px;
      }}
      .lc-stmt td.lc-figure {{ text-align: right; white-space: nowrap; }}

      .lc-scroll {{ overflow: auto; }}
      .lc-scroll::-webkit-scrollbar {{ width: 10px; height: 10px; }}
      .lc-scroll::-webkit-scrollbar-thumb {{ background: #cbd5e1; border-radius: 8px; border: 3px solid {CANVAS}; }}

      /*
       * Responsive show/hide. NiceGUI compiles Tailwind in the browser, so
       * `hidden lg:flex` loses to `hidden` depending on which class the
       * generator reached first; owning these two rules removes the race.
       */
      .lc-desktop-only {{ display: none !important; }}
      .lc-mobile-only {{ display: flex; }}

      /* Page gutters, owned here for the same reason as the two rules above. */
      .lc-page {{ padding: 16px; gap: 16px; }}

      /* A page or panel heading. On a phone the actions drop to their own line
         rather than crushing the title into a one-word-per-line column. */
      .lc-head {{ flex-wrap: wrap !important; }}
      .lc-head > .lc-head-actions {{ width: 100%; }}

      /* Side-by-side panels stack below the breakpoint. */
      .lc-split {{ flex-wrap: wrap !important; }}

      /* Stat cards sit two to a row on a phone rather than one per screenful. */
      .lc-kpi {{ min-width: 148px; }}

      /* A hint wraps to a second line instead of truncating, because at half a
         phone's width most of it would otherwise be lost. */
      .lc-clamp-2 {{
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }}

      @media (min-width: 1024px) {{
        .lc-desktop-only {{ display: flex !important; }}
        .lc-mobile-only {{ display: none !important; }}
        .lc-page {{ padding: 24px; gap: 20px; }}
        .lc-head {{ flex-wrap: nowrap !important; }}
        .lc-head > .lc-head-actions {{ width: auto; }}
        .lc-split {{ flex-wrap: nowrap !important; }}
        .lc-kpi {{ min-width: 190px; }}
      }}

      /* Segmented header controls. Quasar's unelevated toggle paints the
         idle option almost white-on-white, which hid FR next to a selected EN. */
      .lc-seg.q-btn-group {{
        background: #e8eef5;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 3px;
        gap: 2px;
      }}
      .lc-seg .q-btn {{
        color: #0f172a !important;
        background: transparent !important;
        opacity: 1 !important;
        font-weight: 700 !important;
        min-width: 56px;
        box-shadow: none !important;
      }}
      .lc-seg .q-btn .q-btn__content {{
        color: inherit !important;
        opacity: 1 !important;
      }}
      .lc-seg .q-btn[aria-pressed="true"],
      .lc-seg .q-btn.bg-primary {{
        background: {PRIMARY} !important;
        color: #ffffff !important;
      }}

      .q-field--outlined .q-field__control {{ border-radius: 10px; }}
      .q-btn {{ border-radius: 10px; font-weight: 600; text-transform: none; letter-spacing: 0; }}
      .q-dialog__inner > .lc-card {{ box-shadow: 0 24px 64px -24px rgba(15,23,42,.35); }}

      @media print {{
        @page {{
          size: A4 portrait;
          margin: 10mm 12mm 12mm 12mm;
        }}
        .lc-no-print, .print\\:hidden {{ display: none !important; }}
        html, body, body.q-body--fullscreen, body.q-body--prevent-scroll, #q-app, .q-layout, .q-page-container, .q-page, .nicegui-content {{
          background: #fff !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 0 !important;
          height: auto !important;
          overflow: visible !important;
          overflow-x: hidden !important;
          overflow-y: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }}
        .q-header, .q-drawer, .q-footer, .q-notifications {{ display: none !important; }}
        .q-dialog__backdrop {{ display: none !important; }}
        .q-dialog__inner {{ padding: 0 !important; display: block !important; }}
        .lc-page {{
          padding: 0 !important;
          margin: 0 !important;
          gap: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
        }}
        .nicegui-content {{
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow: visible !important;
        }}
        .q-tab-panels {{ background: transparent !important; padding: 0 !important; overflow: visible !important; }}
        .q-tab-panel {{ padding: 0 !important; overflow: visible !important; }}
        .lc-card, .q-card {{
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          overflow: visible !important;
        }}
        .print-avoid-break {{
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }}
        /* Completely eliminate all scrollbars in print */
        *, *::before, *::after {{
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }}
        *::-webkit-scrollbar,
        ::-webkit-scrollbar,
        ::-webkit-scrollbar-thumb,
        ::-webkit-scrollbar-track,
        ::-webkit-scrollbar-button,
        ::-webkit-scrollbar-corner {{
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          background: transparent !important;
          border: none !important;
        }}
      }}
    """)

