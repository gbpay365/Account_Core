"""
Periods and the month-end close: the period calendar, the status transitions
open → closed → locked, and the close checklist with sign-off.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import t
from ..ui import chrome, widgets as w
from ..ui.shell import page

TASK_STATUSES = {
    'pending': 'Not started', 'in_progress': 'In progress', 'done': 'Done',
    'skipped': 'Not applicable', 'blocked': 'Blocked',
}

TASK_TONES = {'pending': 'slate', 'in_progress': 'sky', 'done': 'emerald',
              'skipped': 'slate', 'blocked': 'rose'}


@page('/periods', title='Periods and close', permissions=('period.view', 'close.view'))
async def periods_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')
    state: dict = {'year': None}

    years_data = await api.safe(api.get('/fiscal-years'))
    if not years_data:
        return
    years = years_data.get('rows') or []
    state['year'] = next((y['id'] for y in years if y.get('status') != 'closed'),
                         years[0]['id'] if years else None)

    w.page_header(t('per.title'), t('per.sub'), emoji=chrome.PAGE['per.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/periods', fiscalYearId=state['year']))
        if not data:
            return
        with container:
            _year_summary(years, state['year'], currency)
            _period_grid(data.get('rows') or [], currency, reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            picker = ui.select({y['id']: f"{y['code']} · {w.as_date(y['start_date'])} to "
                                         f"{w.as_date(y['end_date'])}" for y in years},
                               value=state['year'], label='Fiscal year') \
                .props('outlined dense options-dense').classes('w-full sm:w-96')
            picker.bind_value(state, 'year')
            picker.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _year_summary(years: list[dict], year_id, currency: str) -> None:
    year = next((y for y in years if y['id'] == year_id), None)
    if not year:
        return
    with w.kpi_row():
        w.kpi('Fiscal year', year['code'],
              hint=f"{w.as_date(year['start_date'])} to {w.as_date(year['end_date'])}",
              icon='calendar_month', tone='slate')
        w.kpi('Open periods', w.number(year.get('open_periods')),
              hint='Accepting postings', icon='lock_open', tone='teal')
        w.kpi('Closed', w.number(year.get('closed_periods')),
              hint='Reopenable with authority', icon='lock_clock', tone='amber')
        w.kpi('Locked', w.number(year.get('locked_periods')),
              hint='Signed off and sealed', icon='lock', tone='slate')


def _period_grid(periods: list[dict], currency: str, reload) -> None:
    body = w.section('Periods', 'Click a period to work its close checklist')
    with body:
        if not periods:
            w.empty_state('No period is defined for this year.', icon='event_busy')
            return
        with ui.element('div').classes('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full'):
            for period in periods:
                _period_card(period, currency, reload)


def _period_card(period: dict, currency: str, reload) -> None:
    drafts = int(period.get('draft_count') or 0)
    card = ui.element('div').classes('lc-card-flat p-4 cursor-pointer hover:border-teal-300 transition')
    card.on('click', lambda p=period: _checklist_dialog(p, reload))
    with card:
        with ui.row().classes('w-full items-start justify-between no-wrap gap-2'):
            with ui.column().classes('gap-0 min-w-0'):
                with ui.row().classes('items-center gap-2'):
                    ui.label(period['code']).classes('lc-num text-sm font-bold text-slate-900')
                    if period.get('is_adjustment'):
                        w.badge('adjustment', tone='violet', label='Adjustment period')
                ui.label(f"{w.as_date(period['start_date'])} – {w.as_date(period['end_date'])}"
                         ).classes('text-[11px] text-slate-500')
            w.badge(period['status'])

        with ui.row().classes('w-full gap-5 pt-3 mt-2 border-t border-slate-100'):
            with ui.column().classes('gap-0'):
                ui.label(w.number(period.get('entry_count'))).classes(
                    'lc-num text-sm font-semibold text-slate-800')
                ui.label('Entries').classes('text-[10.5px] text-slate-500')
            with ui.column().classes('gap-0'):
                ui.label(w.money(period.get('posted_debit'), currency) or '—').classes(
                    'lc-num text-sm font-semibold text-slate-800')
                ui.label(f'Posted ({currency})').classes('text-[10.5px] text-slate-500')
            if drafts:
                with ui.column().classes('gap-0'):
                    ui.label(w.number(drafts)).classes('lc-num text-sm font-semibold text-amber-600')
                    ui.label('In draft').classes('text-[10.5px] text-slate-500')

        with ui.row().classes('w-full items-center gap-2 pt-2'):
            ui.icon('checklist').classes('text-slate-400 text-sm')
            ui.label(f"Close checklist: {w.humanise(period['checklist_status'])}"
                     if period.get('checklist_status') else 'Close not started'
                     ).classes('text-[11px] text-slate-500')

        with ui.row().classes('w-full gap-2 pt-3 lc-no-print').on('click.stop', lambda: None):
            _transitions(period, reload)


def _transitions(period: dict, reload) -> None:
    status = period.get('status')
    if status == 'open' and api.can('period.close'):
        ui.button('Close', icon='lock_clock',
                  on_click=lambda: _transition(period, 'close', reload)) \
            .props('outline dense size=sm color=grey-8')
    if status == 'closed' and api.can('period.lock'):
        ui.button('Lock', icon='lock', on_click=lambda: _transition(period, 'lock', reload)) \
            .props('outline dense size=sm color=grey-8')
    if status in ('closed', 'locked') and api.can('period.reopen'):
        ui.button('Reopen', icon='lock_open',
                  on_click=lambda: _transition(period, 'reopen', reload, ask_reason=True)) \
            .props('outline dense size=sm color=red')


def _transition(period: dict, action: str, reload, *, ask_reason: bool = False) -> None:
    async def run(reason: str | None = None) -> None:
        result = await api.safe(api.post(f"/periods/{period['id']}/{action}",
                                         {'reason': reason} if reason else {}))
        if result:
            ui.notify(f"Period {period['code']} is now {result['period']['status']}.",
                      type='positive', position='top')
            await reload()

    if not ask_reason:
        ui.timer(0.01, run, once=True)
        return

    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label(f"Reopen {period['code']}").classes('text-base font-semibold')
        ui.label('Reopening makes a signed-off period writable again. The reason is recorded in the '
                 'action history.').classes('text-xs text-slate-500 mb-3')
        reason = ui.textarea('Reason').props('outlined dense rows=3').classes('w-full')

        async def submit() -> None:
            if not (reason.value or '').strip():
                ui.notify('A reason is required to reopen a period.', type='warning', position='top')
                return
            dialog.close()
            await run(reason.value.strip())

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Reopen period', on_click=submit).props('unelevated color=red')
    dialog.open()


def _start_checklist_dialog(period: dict, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full gap-3'):
        ui.label(f"Start the close for {period['code']}").classes('text-base font-semibold')
        ui.label('The standard close tasks — cut-off, accruals, bank and supplier '
                 'reconciliations, foreign currency revaluation, asset capitalisation and '
                 'disposals, the depreciation run, VAT and the statements — will be raised '
                 'against this period. The period stays open until they are signed off.'
                 ).classes('text-sm text-slate-600')
        if not api.can('close.update'):
            ui.label('You do not have permission to start a close.').classes('text-sm text-rose-600')

        async def submit() -> None:
            if await api.safe(api.post(f"/periods/{period['id']}/checklist", {})) is None:
                return
            dialog.close()
            ui.notify(f"Close checklist opened for {period['code']}.", type='positive', position='top')
            await reload()

        with ui.row().classes('w-full justify-end gap-2 pt-1'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            if api.can('close.update'):
                ui.button('Start the close', icon='playlist_add_check',
                          on_click=submit).props('unelevated')
    dialog.open()


async def _checklist_dialog(period: dict, reload) -> None:
    if not api.can('close.view'):
        return
    data = await api.safe(api.get(f"/periods/{period['id']}/checklist"), notify=False)
    if not data:
        _start_checklist_dialog(period, reload)
        return

    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[860px] max-w-full'):
        content = ui.column().classes('w-full gap-0')

    async def draw() -> None:
        fresh = await api.safe(api.get(f"/periods/{period['id']}/checklist"))
        if not fresh:
            return
        checklist, items = fresh['checklist'], fresh['items']
        progress = fresh['progress']
        content.clear()
        with content:
            with ui.row().classes('items-start justify-between w-full px-5 py-3 '
                                  'border-b border-slate-200'):
                with ui.column().classes('gap-1'):
                    with ui.row().classes('items-center gap-2'):
                        ui.label(f"Close checklist · {checklist['period_code']}"
                                 ).classes('text-base font-semibold')
                        w.badge(checklist['status'])
                    ui.label(f"{progress['done']} of {progress['total']} tasks complete"
                             ).classes('text-xs text-slate-500')
                ui.button(icon='close', on_click=dialog.close).props('flat dense round')

            with ui.column().classes('px-5 pt-3 w-full gap-1'):
                ui.linear_progress(value=progress['pct'] / 100, show_value=False, size='8px') \
                    .props('rounded color=teal')

            with ui.column().classes('p-5 gap-2 w-full lc-scroll').style('max-height: 60vh'):
                for item in items:
                    _task_row(item, draw)

            with ui.row().classes('w-full justify-between items-center gap-2 px-5 py-3 '
                                  'border-t border-slate-200'):
                if checklist.get('signed_off_by_name'):
                    ui.label(f"Signed off by {checklist['signed_off_by_name']} on "
                             f"{w.as_datetime(checklist.get('signed_off_at'))}"
                             ).classes('text-xs text-slate-500')
                else:
                    ui.label('Sign-off gates the period lock.').classes('text-xs text-slate-500')
                with ui.row().classes('gap-2'):
                    ui.button('Close', on_click=dialog.close).props('flat color=grey-8')
                    if api.can('close.signoff') and checklist['status'] != 'signed_off':
                        ui.button('Sign off the close', icon='verified',
                                  on_click=lambda: _sign_off(period, dialog, draw, reload)
                                  ).props('unelevated')

    await draw()
    dialog.open()


def _task_row(item: dict, redraw) -> None:
    tone = TASK_TONES.get(item.get('status'), 'slate')
    with ui.element('div').classes('lc-card-flat p-3 w-full'):
        with ui.row().classes('w-full items-start justify-between gap-3 no-wrap'):
            with ui.column().classes('gap-0.5 min-w-0 flex-1'):
                with ui.row().classes('items-center gap-2 flex-wrap'):
                    ui.label(f"{item['seq']}. {item['title']}").classes(
                        'text-sm font-medium text-slate-800')
                    if item.get('blocks_lock'):
                        w.badge('blocks_lock', tone='amber', label='Blocks lock')
                    elif item.get('is_mandatory'):
                        w.badge('mandatory', tone='sky', label='Mandatory')
                if item.get('description'):
                    ui.label(item['description']).classes('text-xs text-slate-500')
                if item.get('completed_by_name'):
                    ui.label(f"Completed by {item['completed_by_name']} on "
                             f"{w.as_datetime(item.get('completed_at'))}"
                             ).classes('text-[11px] text-slate-400')
                if item.get('notes'):
                    ui.label(item['notes']).classes('text-[11px] text-slate-500 italic')
            with ui.column().classes('shrink-0 items-end gap-1'):
                if api.can('close.update'):
                    select = ui.select(TASK_STATUSES, value=item.get('status')) \
                        .props('outlined dense options-dense borderless').classes('w-36')
                    select.on_value_change(lambda e, i=item: _update_task(i, e.value, redraw))
                else:
                    w.badge(item.get('status'), tone=tone,
                            label=TASK_STATUSES.get(item.get('status')))


async def _update_task(item: dict, status: str, redraw) -> None:
    if status == item.get('status'):
        return
    result = await api.safe(api.patch(f"/checklist-items/{item['id']}", {'status': status}))
    if result:
        await redraw()


def _sign_off(period: dict, parent, redraw, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label(f"Sign off the close for {period['code']}").classes('text-base font-semibold')
        ui.label('Every mandatory task must already be done or marked not applicable. Sign-off is '
                 'recorded against your name.').classes('text-xs text-slate-500 mb-3')
        notes = ui.textarea('Notes (optional)').props('outlined dense rows=3').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f"/periods/{period['id']}/checklist/sign-off",
                                             {'notes': notes.value or None}))
            if result:
                ui.notify(result.get('message', 'Close signed off.'), type='positive', position='top')
                dialog.close()
                await redraw()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Sign off', icon='verified', on_click=submit).props('unelevated')
    dialog.open()
