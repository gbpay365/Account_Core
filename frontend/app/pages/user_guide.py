"""
LedgerCore Health — In-App Comprehensive User Guide & Interactive Documentation.
"""

from __future__ import annotations

import os
from pathlib import Path
from nicegui import app, ui

from ..i18n import t, lang
from ..ui.shell import page
from ..ui import widgets as w

DOCS_DIR = Path(__file__).resolve().parent.parent.parent.parent / 'docs'


def _load_doc(filename: str) -> str:
    path = DOCS_DIR / filename
    if path.exists():
        try:
            return path.read_text(encoding='utf-8')
        except Exception as e:
            return f"Error loading documentation: {e}"
    return f"Documentation file {filename} not found."


@page('/user-guide', title='User Guide', permissions=())
def user_guide_page() -> None:
    w.page_header(
        '📚 User Guide & Operational Manual',
        'Official operational manual, statutory OHADA / IFRS accounting rules, and healthcare CMMS procedures',
    )

    doc_options = {
        'USER_GUIDE.md': '📖 Master User Guide (All Modules)',
        'BUDGET_MODULE_USER_GUIDE.md': '📊 Budget Module & Commitment Control Manual',
        'roles/CFO_AND_CHIEF_ACCOUNTANT_GUIDE.md': '💼 Role Guide: CFO & Chief Accountant',
        'roles/ACCOUNTING_CLERK_GUIDE.md': '📝 Role Guide: Accounting Clerk',
        'roles/BIOMEDICAL_AND_ASSET_MANAGER_GUIDE.md': '🔬 Role Guide: Biomedical & Asset Manager',
        'roles/TECHNICIAN_AND_GENERAL_SERVICES_GUIDE.md': '🛠️ Role Guide: Field Technicians & Logistics',
        'roles/SYSTEM_ADMINISTRATOR_GUIDE.md': '⚙️ Role Guide: System Administrator',
    }

    initial_doc = app.storage.user.get('guide_selected_doc') or 'USER_GUIDE.md'
    if initial_doc not in doc_options:
        initial_doc = 'USER_GUIDE.md'
    state = {'selected_doc': initial_doc}

    with ui.row().classes('w-full items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm'):
        with ui.row().classes('items-center gap-3 flex-1'):
            ui.icon('menu_book', size='md').classes('text-teal-600')
            doc_sel = ui.select(doc_options, value=state['selected_doc'], label='Select Handbook / Guide') \
                .props('outlined dense options-dense').classes('w-80 max-w-full')

        with ui.row().classes('items-center gap-2 flex-wrap'):
            ui.button('Download PDF', icon='picture_as_pdf', on_click=lambda: ui.download('/docs-static/USER_GUIDE.pdf')) \
                .props('unelevated color=teal no-caps size=sm')
            ui.button('Open HTML Manual', icon='open_in_new', on_click=lambda: ui.open('/docs-static/USER_GUIDE.html', new_tab=True)) \
                .props('outline color=teal-8 no-caps size=sm')
            ui.button('Print', icon='print', on_click=lambda: ui.run_javascript('window.print()')) \
                .props('outline color=slate-7 no-caps size=sm')

    content_area = ui.column().classes('w-full mt-4 bg-white p-8 rounded-xl border border-slate-200 shadow-sm')

    def render_content():
        content_area.clear()
        with content_area:
            raw_md = _load_doc(state['selected_doc'])
            ui.markdown(raw_md).classes('prose max-w-none w-full text-slate-800')

    doc_sel.on_value_change(lambda e: (state.update({'selected_doc': e.value}), render_content()))
    render_content()
