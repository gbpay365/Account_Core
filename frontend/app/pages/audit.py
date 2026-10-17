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

    def actions() -> None:
        ui.button(t('seal.btn_verify'), icon='verified_user',
                  on_click=_verify_chain_dialog).props('outline size=sm')
        ui.button(t('seal.btn_seal'), icon='lock',
                  on_click=lambda: _seal_entries_dialog(reload)).props('unelevated size=sm')

    w.page_header(t('au.title'), t('au.sub'), actions=actions, emoji=chrome.PAGE['au.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/audit-log', entity=state['entity'],
                                      action=state['action'] or None,
                                      **{'from': state['from'], 'to': state['to']},
                                      page=state['page'], pageSize=200))
        seal_status = await api.safe(api.get('/audit/seal-status'))
        if not data:
            return
        with container:
            if seal_status:
                _seal_banner(seal_status, reload)
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


def _seal_banner(status: dict, reload) -> None:
    total_sealed = status.get('totalSealed', 0)
    pending_seal = status.get('pendingSeal', 0)
    last_run = status.get('lastRun') or {}
    final_hash = last_run.get('final_seal_hash') or '—'
    hash_short = f"{final_hash[:16]}...{final_hash[-8:]}" if len(final_hash) > 24 else final_hash

    body = w.section(t('seal.section_title'), t('seal.section_sub'))
    with body:
        with w.kpi_row():
            w.kpi(t('seal.kpi_sealed'), w.number(total_sealed),
                  hint=t('seal.kpi_sealed_hint'), icon='lock', tone='emerald')
            w.kpi(t('seal.kpi_pending'), w.number(pending_seal),
                  hint=t('seal.kpi_pending_hint'),
                  icon='lock_clock', tone='amber' if pending_seal > 0 else 'slate')
            w.kpi(t('seal.kpi_head'), hash_short,
                  hint=t('seal.kpi_head_hint', date=w.as_date(last_run.get('sealed_at'))) if last_run.get('sealed_at') else t('seal.kpi_genesis'),
                  icon='fingerprint', tone='teal')
            w.kpi(t('seal.kpi_integrity'), t('seal.kpi_integrity_ok'),
                  hint=t('seal.kpi_integrity_hint'), icon='verified', tone='emerald')

        if pending_seal > 0:
            with ui.row().classes('w-full items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg'):
                ui.label(t('seal.pending_banner', n=pending_seal)) \
                    .classes('text-xs text-amber-800 font-medium')
                ui.button(t('seal.btn_seal_now'), icon='lock',
                          on_click=lambda: _seal_entries_dialog(reload)).props('unelevated color=amber-9 size=sm')


async def _verify_chain_dialog() -> None:
    res = await api.safe(api.get('/audit/verify-chain'))
    if not res:
        return

    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[650px] max-w-full'):
        with ui.row().classes('items-start justify-between w-full border-b border-slate-200 pb-3'):
            with ui.column().classes('gap-0.5'):
                ui.label(t('seal.dialog_title')).classes('text-base font-semibold')
                ui.label(t('seal.dialog_sub')).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('py-4 gap-4 w-full'):
            if res.get('valid'):
                with ui.element('div').classes('p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3'):
                    ui.icon('verified', size='36px').classes('text-emerald-600')
                    with ui.column().classes('gap-0.5'):
                        ui.label(t('seal.valid_title')).classes('text-sm font-bold text-emerald-900')
                        ui.label(t('seal.valid_sub', n=res.get('totalChecked', 0), first=res.get('firstEntryNo', 'Genesis'), last=res.get('lastEntryNo', 'Head'))) \
                            .classes('text-xs text-emerald-700')

                w.detail_grid([
                    (t('seal.detail_total'), w.number(res.get('totalChecked'))),
                    (t('seal.detail_status'), t('seal.detail_status_ok')),
                    (t('seal.detail_first'), res.get('firstEntryNo')),
                    (t('seal.detail_last'), res.get('lastEntryNo')),
                    (t('seal.detail_head'), f"{res.get('finalSealHash', '')[:24]}..."),
                    (t('seal.detail_timestamp'), w.as_datetime(res.get('verifiedAt'))),
                ], columns=1)
            else:
                with ui.element('div').classes('p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3'):
                    ui.icon('warning', size='36px').classes('text-rose-600')
                    with ui.column().classes('gap-0.5'):
                        ui.label(t('seal.invalid_title')).classes('text-sm font-bold text-rose-900')
                        ui.label(res.get('reason') or 'Chain error detected.').classes('text-xs text-rose-700')

                w.detail_grid([
                    (t('seal.detail_broken'), res.get('brokenEntryNo')),
                    (t('seal.detail_sequence'), f"#{res.get('brokenAtSequence')}"),
                    (t('seal.detail_intact'), w.number(res.get('totalChecked'))),
                ], columns=1)

        with ui.row().classes('w-full justify-end pt-2 border-t border-slate-200'):
            ui.button(t('seal.btn_close'), on_click=dialog.close).props('flat color=grey-8')

    dialog.open()


async def _seal_entries_dialog(reload) -> None:
    res = await api.safe(api.post('/audit/seal', {}))
    if res:
        count = res.get('sealedCount', 0)
        if count > 0:
            ui.notify(
                t('seal.notify_success', n=count, hash=res.get('finalSealHash', '')[:12]),
                type='positive', position='top'
            )
        else:
            ui.notify(t('seal.notify_all_sealed'), type='info', position='top')
        await reload()

