"""
The first screen after signing in. Everything here is permission-aware: the
backend withholds sections a role cannot see, and the page simply does not
draw what it was not given.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import domain_label, framework, t
from ..ui import chrome, widgets as w
from ..ui.shell import page


@page('/dashboard', title='Dashboard', permissions=('coa.view', 'asset.view', 'wo.view', 'errand.view'))
@page('/', title='Dashboard', permissions=('coa.view', 'asset.view', 'wo.view', 'errand.view'))
async def dashboard() -> None:
    view = framework()
    data = await api.safe(api.get('/dashboard', framework=view))
    if not data:
        return

    user = api.user()
    currency = user.get('functional_currency', 'XAF')
    period = data.get('period') or {}
    year = data.get('fiscal_year') or {}

    def actions() -> None:
        if api.can('journal.create'):
            ui.button(t('dash.new_entry'), icon='add',
                      on_click=lambda: ui.navigate.to('/journal?new=1')).props('unelevated size=sm')
        if api.can('wo.request'):
            ui.button(t('dash.raise_wo'), icon='build',
                      on_click=lambda: ui.navigate.to('/maintenance?new=1')).props('outline size=sm')

    first = user.get('full_name', '').split()[0]
    subtitle = (t('dash.fy_open', year=year.get('code', ''), period=period.get('code'))
                if period else t('dash.fy_none', year=year.get('code', '')))
    w.page_header(t('dash.hello', name=first), subtitle, actions=actions,
                  emoji=chrome.PAGE['dash.hello'])

    _headline(data, currency)

    left, right = w.two_column()
    with left:
        if data.get('result'):
            _result_panel(data['result'], data.get('year_to_date') or {}, currency)
        if data.get('maintenance'):
            _maintenance_panel(data['maintenance'])
        if data.get('assets'):
            await _asset_panel(currency)
    with right:
        if data.get('ledger'):
            _ledger_panel(data['ledger'], period)
        await _attention_panel()
        _shortcuts()


def _headline(data: dict, currency: str) -> None:
    assets = data.get('assets') or {}
    maintenance = data.get('maintenance') or {}
    result = data.get('result') or {}

    with w.kpi_row():
        if data.get('assets'):
            w.kpi(t('dash.kpi.nbv'), w.money(assets.get('net_book_value'), currency),
                  hint=t('dash.kpi.nbv_hint', n=w.number(assets.get('total')),
                         cost=w.money(assets.get('gross'), currency)),
                  icon='inventory_2', tone='teal',
                  on_click=lambda: ui.navigate.to('/assets'))
        if data.get('result'):
            funding = (result.get('revenue') or 0) + (result.get('operating_grants') or 0)
            w.kpi(t('dash.kpi.funding'), w.money(funding, currency),
                  hint=t('dash.kpi.funding_hint',
                         earned=w.money(result.get('revenue'), currency),
                         grants=w.money(result.get('operating_grants'), currency)),
                  icon='payments', tone='sky',
                  on_click=lambda: ui.navigate.to('/reports'))
            net = result.get('net_result') or 0
            w.kpi(t('dash.kpi.result'), w.money(net, currency),
                  hint=t('dash.kpi.surplus') if net >= 0 else t('dash.kpi.deficit'),
                  icon='trending_up' if net >= 0 else 'trending_down',
                  tone='teal' if net >= 0 else 'rose',
                  on_click=lambda: ui.navigate.to(
                      '/reports?statement=pl' if framework() == 'ifrs' else '/reports?statement=resultat'))
        if data.get('maintenance'):
            wo = maintenance.get('work_orders') or {}
            open_count = sum(int(wo.get(k) or 0) for k in
                             ('awaiting_approval', 'scheduled', 'in_progress', 'blocked'))
            w.kpi(t('dash.kpi.wo'), w.number(open_count),
                  hint=t('dash.kpi.wo_hint', due=wo.get('past_due', 0),
                         verify=wo.get('awaiting_verification', 0)),
                  icon='build', tone='amber' if int(wo.get('past_due') or 0) else 'violet',
                  on_click=lambda: ui.navigate.to('/maintenance'))
            restricted = int(maintenance.get('restricted') or 0)
            w.kpi(t('dash.kpi.restricted'), w.number(restricted),
                  hint=t('dash.kpi.restricted_yes') if restricted else t('dash.kpi.restricted_no'),
                  icon='gpp_maybe' if restricted else 'verified_user',
                  tone='rose' if restricted else 'teal',
                  on_click=lambda: ui.navigate.to('/compliance'))


def _result_panel(result: dict, period: dict, currency: str) -> None:
    body = w.section(
        t('dash.result'),
        t('dash.result_sub', start=w.as_date(period.get('from')), end=w.as_date(period.get('to')),
          fw=t('fw.ifrs') if framework() == 'ifrs' else t('fw.ohada')),
        emoji='📊',
        actions=lambda: ui.button(t('dash.open_stmt'), icon='open_in_new',
                                  on_click=lambda: ui.navigate.to('/reports')).props('flat dense size=sm'),
    )
    with body:
        w.statement_table(
            ['', currency],
            [
                {'code': 'XB', 'label': t('dash.turnover'), 'values': [result.get('revenue')]},
                {'code': 'TG', 'label': t('dash.grants'), 'values': [result.get('operating_grants')]},
                {'code': 'XE', 'label': t('dash.operating'), 'kind': 'subtotal',
                 'values': [result.get('operating_result')]},
                {'code': 'XI', 'label': t('dash.net'), 'kind': 'total',
                 'values': [result.get('net_result')]},
            ],
            currency,
        )
        w.note(t('dash.bridge_note_ifrs') if framework() == 'ifrs' else t('dash.bridge_note'),
               icon='balance')


def _maintenance_panel(maintenance: dict) -> None:
    wo = maintenance.get('work_orders') or {}
    body = w.section(
        t('dash.pipeline'),
        t('dash.pipeline_sub'),
        emoji='🔧',
        actions=lambda: ui.button(t('dash.all_wo'), icon='open_in_new',
                                  on_click=lambda: ui.navigate.to('/maintenance')).props('flat dense size=sm'),
    )
    stages = [
        (t('dash.awaiting_approval'), wo.get('awaiting_approval'), 'pending_actions', 'amber'),
        (t('dash.scheduled'), wo.get('scheduled'), 'event', 'sky'),
        (t('dash.in_progress'), wo.get('in_progress'), 'engineering', 'violet'),
        (t('dash.blocked'), wo.get('blocked'), 'pause_circle', 'rose'),
        (t('dash.awaiting_verification'), wo.get('awaiting_verification'), 'fact_check', 'teal'),
        (t('dash.past_due'), wo.get('past_due'), 'schedule', 'rose'),
    ]
    with body:
        with ui.element('div').classes('grid grid-cols-2 md:grid-cols-3 gap-3 w-full'):
            for label, value, icon, tone in stages:
                count = int(value or 0)
                tint = {'amber': 'text-amber-600', 'sky': 'text-sky-600', 'violet': 'text-violet-600',
                        'rose': 'text-rose-600', 'teal': 'text-teal-600'}[tone]
                with ui.element('div').classes('lc-card-flat p-3'):
                    with ui.row().classes('items-center gap-2 no-wrap'):
                        ui.icon(icon).classes(f'{tint} text-lg shrink-0')
                        ui.label(w.number(count)).classes('lc-num text-xl font-semibold text-slate-900')
                    ui.label(label).classes('text-[11px] text-slate-500 mt-0.5')

        with ui.row().classes('w-full gap-6 pt-3 mt-1 border-t border-slate-100'):
            for label, value in [
                (t('dash.overdue_assets'), maintenance.get('overdue_assets')),
                (t('dash.due_soon'), maintenance.get('due_soon')),
                (t('dash.contracts'), maintenance.get('expiring_contracts')),
            ]:
                with ui.column().classes('gap-0'):
                    ui.label(w.number(value or 0)).classes('lc-num text-base font-semibold text-slate-800')
                    ui.label(label).classes('text-[11px] text-slate-500')


async def _asset_panel(currency: str) -> None:
    if not api.can('report.asset'):
        return
    register = await api.safe(api.get('/reports/asset-register', groupBy='domain',
                                      basis=framework()), notify=False)
    if not register:
        return
    body = w.section(t('dash.register_domain'),
                     t('dash.register_sub'),
                     emoji='🏥',
                     actions=lambda: ui.button(t('dash.open_register'), icon='open_in_new',
                                               on_click=lambda: ui.navigate.to('/assets')
                                               ).props('flat dense size=sm'))
    groups = register.get('rows') or []
    totals = register.get('totals') or {}
    with body:
        if not groups:
            w.empty_state(t('dash.no_assets'))
            return
        w.statement_table(
            [t('common.domain'), t('common.count'), t('common.cost'),
             t('common.depreciation'), t('common.nbv')],
            [{'label': domain_label(g.get('group_name') or g.get('group_code')),
              'values': [g.get('asset_count'), g.get('gross'),
                         -abs(float(g.get('accumulated_depreciation') or 0)), g.get('net')]}
             for g in groups]
            + [{'label': t('common.total'), 'kind': 'total',
                'values': [totals.get('asset_count'), totals.get('gross'),
                           -abs(float(totals.get('accumulated_depreciation') or 0)),
                           totals.get('net')]}],
            currency,
        )


def _ledger_panel(ledger: dict, period: dict) -> None:
    body = w.section(t('dash.ledger'), t('dash.ledger_sub'), emoji='📖')
    with body:
        with ui.column().classes('w-full gap-2'):
            for label, value, icon in [
                (t('dash.entries_recorded'), ledger.get('posted_entries'), 'receipt_long'),
                (t('dash.still_draft'), ledger.get('draft_entries'), 'edit_note'),
            ]:
                with ui.row().classes('w-full items-center justify-between no-wrap'):
                    with ui.row().classes('items-center gap-2 no-wrap'):
                        ui.icon(icon).classes('text-slate-400 text-base')
                        ui.label(label).classes('text-xs text-slate-600')
                    ui.label(w.number(value or 0)).classes('lc-num text-sm font-semibold')
            if int(ledger.get('draft_entries') or 0):
                w.note(t('dash.draft_note'), icon='edit_note', tone='amber')
            if period:
                with ui.row().classes('w-full items-center justify-between pt-2 mt-1 '
                                      'border-t border-slate-100 no-wrap'):
                    ui.label(t('dash.current_period')).classes('text-xs text-slate-600')
                    w.badge(period.get('status'), label=period.get('code'))


async def _attention_panel() -> None:
    if not api.can('report.asset'):
        return
    compliance = await api.safe(api.get('/reports/compliance'), notify=False)
    if not compliance:
        return
    items = (compliance.get('overdue') or [])[:6]
    for item in items:
        item['issue'] = _what_is_due(item)
    body = w.section(t('dash.attention'),
                     t('dash.attention_sub'),
                     emoji='🚨',
                     actions=lambda: ui.button(t('common.all'), icon='open_in_new',
                                               on_click=lambda: ui.navigate.to('/compliance')
                                               ).props('flat dense size=sm'))
    with body:
        if not items:
            with ui.column().classes('w-full items-center py-6 gap-1'):
                ui.icon('verified').classes('text-4xl text-emerald-400')
                ui.label(t('dash.nothing_overdue')).classes('text-sm font-medium text-slate-600')
                ui.label(t('dash.certs_current')).classes('text-xs text-slate-400')
            return
        for item in items:
            row = ui.row().classes('w-full items-center justify-between gap-2 py-2 no-wrap '
                                   'border-b border-slate-100 last:border-0 cursor-pointer '
                                   'hover:bg-slate-50 rounded px-1')
            row.on('click', lambda a=item: ui.navigate.to(f"/assets/{a['id']}"))
            with row:
                with ui.column().classes('gap-0 min-w-0'):
                    ui.label(item.get('name', '')).classes('text-xs font-medium text-slate-800 truncate')
                    ui.label(f"{item.get('asset_tag', '')} · {w.humanise(item.get('issue'))}"
                             ).classes('text-[11px] text-slate-500 truncate')
                w.badge('overdue' if item.get('use_restricted') else 'due_soon',
                        tone='rose' if item.get('use_restricted') else 'amber',
                        label=t('dash.restricted') if item.get('use_restricted') else t('dash.overdue'))


def _what_is_due(asset: dict) -> str:
    """Names the lapsed date rather than making the reader compare three columns."""
    today = w.today_iso()
    overdue = [label for label, field in (
        ('calibration', 'next_calibration_date'),
        ('safety test', 'next_safety_test_date'),
        ('preventive service', 'next_pm_date'),
    ) if asset.get(field) and str(asset[field])[:10] < today]
    return (' and '.join(overdue) + ' overdue') if overdue else 'due for attention'


def _shortcuts() -> None:
    links = [
        ('/reports', t('nav.statements'), 'assessment', ('report.financial',)),
        ('/depreciation', t('dash.run_depr'), 'trending_down', ('depr.run',)),
        ('/periods', t('dash.close'), 'event_available', ('close.view',)),
        ('/worklist', t('nav.worklist'), 'assignment_ind', ('wo.execute',)),
        ('/errands', t('nav.errands'), 'directions_run', ('errand.view',)),
        ('/shopping', t('nav.shopping'), 'shopping_cart', ('shop.view',)),
        ('/audit', t('nav.audit'), 'history', ('admin.audit',)),
    ]
    visible = [link for link in links if api.can(*link[3])]
    if not visible:
        return
    body = w.section(t('dash.goto'), emoji='🚀')
    with body:
        with ui.column().classes('w-full gap-1'):
            for route, label, icon, _ in visible:
                row = ui.row().classes('w-full items-center gap-2.5 py-2 px-2 rounded-lg no-wrap '
                                       'cursor-pointer hover:bg-slate-50')
                row.on('click', lambda r=route: ui.navigate.to(r))
                with row:
                    ui.label(chrome.NAV_ITEM.get(route, '')).classes('text-base leading-none')
                    ui.icon(icon).classes('text-slate-400 text-base')
                    ui.label(label).classes('text-xs font-medium text-slate-700 flex-1')
                    ui.icon('chevron_right').classes('text-slate-300 text-base')
