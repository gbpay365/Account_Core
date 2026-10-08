"""
The action history — who did what, when, and from where.

The SRS treats this as a baseline control rather than a module of its own, so
it is a single searchable view over the audit log the backend writes on every
state change.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import t
from ..ui import chrome, widgets as w
from ..ui.shell import page

ENTITIES = {
    None: 'Everything', 'journal_entry': 'Journal entries', 'account': 'Accounts',
    'accounting_period': 'Periods', 'close_checklist': 'Close sign-off',
    'close_checklist_item': 'Close tasks', 'asset': 'Assets',
    'asset_disposal': 'Disposals', 'work_order': 'Work orders',
    'maintenance_plan': 'Maintenance plans', 'depreciation_run': 'Depreciation runs',
    'user': 'Users', 'session': 'Sign-in',
}

#: Actions that change the ledger or a control are worth calling out visually.
ACTION_TONES = {
    'post': 'emerald', 'create': 'sky', 'update': 'slate', 'delete': 'rose',
    'reverse': 'rose', 'capitalize': 'teal', 'commission': 'teal', 'move': 'slate',
    'disposal_request': 'amber', 'disposal_approved': 'emerald', 'disposal_rejected': 'rose',
    'disposal_complete': 'violet', 'period_close': 'amber', 'period_lock': 'slate',
    'period_reopen': 'rose', 'close_signoff': 'emerald', 'close_task': 'slate',
    'calibration': 'violet', 'safety_test': 'violet', 'schedule': 'sky',
    'login': 'slate', 'login_failed': 'rose', 'logout': 'slate',
    'wo_post_cost': 'emerald',
}


@page('/audit', title='Action history', permissions=('admin.audit',))
async def audit_page() -> None:
    state = {'entity': None, 'action': '', 'from': None, 'to': None, 'page': 1}

    w.page_header(t('au.title'), t('au.sub'), emoji=chrome.PAGE['au.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/audit-log', entity=state['entity'],
                                      action=state['action'] or None,
                                      **{'from': state['from'], 'to': state['to']},
                                      page=state['page'], pageSize=200))
        if not data:
            return
        with container:
            _log(data, state, reload)

    async def refilter() -> None:
        state['page'] = 1
        await reload()

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            entity = ui.select(ENTITIES, value=None, label='What changed') \
                .props('outlined dense options-dense').classes('w-56')
            entity.bind_value(state, 'entity')
            action = ui.input('Action', placeholder='e.g. post, reverse, period_close') \
                .props('outlined dense clearable debounce=350').classes('w-56')
            action.bind_value(state, 'action')
            date_from = ui.input(t('common.from')).props('outlined dense type=date clearable').classes('w-40')
            date_from.bind_value(state, 'from')
            date_to = ui.input(t('common.to')).props('outlined dense type=date clearable').classes('w-40')
            date_to.bind_value(state, 'to')
            for element in (entity, action, date_from, date_to):
                element.on_value_change(refilter)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _log(data: dict, state: dict, reload) -> None:
    rows = data.get('rows') or []
    total = data.get('total', len(rows))
    page_size = data.get('pageSize', 200)
    pages = max(1, -(-total // page_size))

    for row in rows:
        row['when'] = w.as_datetime(row.get('created_at'))
        row['who'] = row.get('user_name') or row.get('user_email') or 'system'
        row['entity_label'] = ENTITIES.get(row.get('entity_type'), w.humanise(row.get('entity_type')))
        row['action_label'] = w.humanise(row.get('action'))

    body = w.section(f'{w.number(total)} recorded actions',
                     f"Showing page {state['page']} of {w.number(pages)}",
                     actions=lambda: _pager(state, pages, reload))
    with body:
        if not rows:
            w.empty_state('No action matches those filters.', icon='history')
            return
        table = w.table([
            w.column('when', 'When'),
            w.column('who', 'Who'),
            w.column('role_name', 'Role'),
            w.column('action_label', 'Action'),
            w.column('entity_label', 'What'),
            w.column('summary', 'Summary'),
            w.column('ip_address', 'From'),
        ], rows, pagination=0, height='64vh')
        w.add_badge_slot(table, 'action_label', tones={
            w.humanise(key).lower(): tone for key, tone in ACTION_TONES.items()
        })


def _pager(state: dict, pages: int, reload) -> None:
    def go(delta: int) -> None:
        state['page'] = max(1, min(pages, state['page'] + delta))
        ui.timer(0.01, reload, once=True)

    ui.button(icon='chevron_left', on_click=lambda: go(-1)) \
        .props('flat dense round').set_enabled(state['page'] > 1)
    ui.label(f"{state['page']} / {pages}").classes('lc-num text-xs text-slate-600')
    ui.button(icon='chevron_right', on_click=lambda: go(1)) \
        .props('flat dense round').set_enabled(state['page'] < pages)
