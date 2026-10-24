"""
LedgerCore Health — In-App Comprehensive User Guide & Interactive Documentation.

Premium reader: animated hero, document switcher, sticky table of contents with
scroll-spy, reading progress bar and scroll-reveal content.
"""

from __future__ import annotations

import datetime
from pathlib import Path

from nicegui import app, ui

from ..ui import manual
from ..ui.shell import page

DOCS_DIR = Path(__file__).resolve().parent.parent.parent.parent / 'docs'

# file -> (emoji, tab label, hero eyebrow, hero title, hero subtitle)
DOCS: dict[str, tuple[str, str, str, str, str]] = {
    'USER_GUIDE.md': (
        '📖', 'Master Guide', 'Operational manual',
        'LedgerCore Master User Guide',
        'Every module explained step by step: dual-standard OHADA / IFRS accounting, assets, maintenance and reporting.',
    ),
    'BUDGET_MODULE_USER_GUIDE.md': (
        '📊', 'Budget Module', 'Budget & commitment control',
        'Budget Module & Commitment Control Manual',
        'Planning, commitments, credit transfers, mid-year projects, carryforwards and the 5-stage expenditure chain, with worked examples.',
    ),
    'roles/CFO_AND_CHIEF_ACCOUNTANT_GUIDE.md': (
        '💼', 'CFO & Chief Accountant', 'Role guide',
        'CFO & Chief Accountant Handbook',
        'Approvals, period close, statutory statements and financial governance.',
    ),
    'roles/ACCOUNTING_CLERK_GUIDE.md': (
        '📝', 'Accounting Clerk', 'Role guide',
        'Accounting Clerk Handbook',
        'Journal capture, supporting documents and daily posting routines.',
    ),
    'roles/BIOMEDICAL_AND_ASSET_MANAGER_GUIDE.md': (
        '🔬', 'Biomedical & Assets', 'Role guide',
        'Biomedical & Asset Manager Handbook',
        'Asset lifecycle, calibration, safety compliance and depreciation.',
    ),
    'roles/TECHNICIAN_AND_GENERAL_SERVICES_GUIDE.md': (
        '🛠️', 'Technicians & Logistics', 'Role guide',
        'Field Technicians & General Services Handbook',
        'Work orders, errands, shopping lists and field procedures.',
    ),
    'roles/SYSTEM_ADMINISTRATOR_GUIDE.md': (
        '⚙️', 'System Administrator', 'Role guide',
        'System Administrator Handbook',
        'Users, roles, integrations, configuration and audit trail.',
    ),
}


def _load_doc(filename: str) -> str:
    path = DOCS_DIR / filename
    if path.exists():
        try:
            return path.read_text(encoding='utf-8')
        except Exception as e:  # noqa: BLE001
            return f'Error loading documentation: {e}'
    return f'Documentation file {filename} not found.'


@page('/user-guide', title='User Guide', permissions=())
def user_guide_page() -> None:
    ui.add_css(manual.MANUAL_CSS)

    initial = app.storage.user.get('guide_selected_doc') or 'USER_GUIDE.md'
    state = {'doc': initial if initial in DOCS else 'USER_GUIDE.md'}

    def _select(name: str) -> None:
        state['doc'] = name
        app.storage.user['guide_selected_doc'] = name
        viewer.refresh()
        ui.run_javascript('window.scrollTo({top:0,behavior:"smooth"})')

    @ui.refreshable
    def viewer() -> None:
        name = state['doc']
        emoji, _label, eyebrow, title, subtitle = DOCS[name]
        path = DOCS_DIR / name
        stem = name[:-3]
        has_pdf = (DOCS_DIR / f'{stem}.pdf').exists()
        has_html = (DOCS_DIR / f'{stem}.html').exists()
        rendered = manual.render_manual(_load_doc(name))
        updated = (
            datetime.datetime.fromtimestamp(path.stat().st_mtime).strftime('%d %b %Y')
            if path.exists() else '—'
        )

        # --- hero -----------------------------------------------------------------
        ui.html(
            f'''
            <section class="lcm-hero">
              <div class="lcm-hero-inner">
                <div class="lcm-hero-icon">{emoji}</div>
                <div>
                  <div class="lcm-hero-eyebrow">{eyebrow}</div>
                  <div class="lcm-hero-title">{title}</div>
                  <div class="lcm-hero-sub">{subtitle}</div>
                  <div class="lcm-chips">
                    <span class="lcm-chip">📚 {rendered['sections']} sections</span>
                    <span class="lcm-chip">⏱️ {rendered['minutes']} min read</span>
                    <span class="lcm-chip">🗓️ Updated {updated}</span>
                    <span class="lcm-chip">🌍 SYSCOHADA · IFRS</span>
                  </div>
                </div>
              </div>
            </section>''',
            sanitize=False,
        ).classes('w-full')

        # --- document switcher + actions ------------------------------------------
        with ui.row().classes('w-full items-center justify-between gap-4 no-wrap'):
            with ui.element('div').classes('lcm-switch flex-1'):
                for key, (e, lbl, *_rest) in DOCS.items():
                    card = ui.element('div').classes('lcm-doc' + (' active' if key == name else ''))
                    with card:
                        ui.label(e).classes('text-lg')
                        ui.label(lbl)
                    card.on('click', lambda _e, k=key: _select(k))
            with ui.row().classes('items-center gap-2 no-wrap'):
                pdf_btn = ui.button(
                    'PDF', icon='picture_as_pdf',
                    on_click=lambda: ui.download(f'/docs-static/{stem}.pdf'),
                ).props('unelevated rounded color=teal-8 no-caps size=sm')
                html_btn = ui.button(
                    'HTML', icon='open_in_new',
                    on_click=lambda: ui.navigate.to(f'/docs-static/{stem}.html', new_tab=True),
                ).props('outline rounded color=indigo-7 no-caps size=sm')
                ui.button(
                    'Print', icon='print', on_click=lambda: ui.run_javascript('window.print()'),
                ).props('outline rounded color=blue-grey-7 no-caps size=sm')
                if not has_pdf:
                    pdf_btn.disable()
                if not has_html:
                    html_btn.disable()

        # --- TOC + article --------------------------------------------------------
        with ui.element('div').classes('w-full').style(
            'display:grid;grid-template-columns:minmax(220px,270px) minmax(0,1fr);gap:28px;align-items:start;'
        ):
            ui.html(manual.toc_html(rendered['toc']), sanitize=False)
            with ui.element('div').classes('bg-white rounded-3xl border border-slate-200 shadow-sm').style(
                'padding:40px 48px;min-width:0;'
            ):
                ui.html(rendered['html'], sanitize=False).classes('w-full')

        manual.activate_motion()

    with ui.column().classes('w-full gap-5'):
        viewer()
