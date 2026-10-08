"""
Depreciation on both bases, plus IAS 36 impairment and IAS 16 revaluation.

The workflow is deliberately three steps: simulate (writes nothing), prepare a
run (reviewable, discardable), then post (irreversible, creates the journal
entries). The statutory charge posts to both frameworks; only the divergence
posts as an IFRS-only entry.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import t
from ..ui import chrome, widgets as w
from ..ui.shell import page

INDICATORS = {
    'obsolescence': 'Obsolescence', 'physical_damage': 'Physical damage',
    'market_decline': 'Decline in market value', 'technology_change': 'Change in technology',
    'idle_asset': 'Asset is idle', 'regulatory': 'Regulatory change',
    'restructuring': 'Restructuring', 'other': 'Other indicator',
}

VALUATION_METHODS = {
    'market': 'Market comparison', 'income': 'Income approach',
    'depreciated_replacement_cost': 'Depreciated replacement cost', 'other': 'Other',
}


@page('/depreciation', title='Depreciation', permissions=('depr.view',))
async def depreciation_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    periods = await api.safe(api.get('/periods'), notify=False) or {'rows': []}
    open_periods = [p for p in periods['rows'] if p.get('status') == 'open']

    def actions() -> None:
        if api.can('depr.run') and open_periods:
            ui.button('Simulate', icon='calculate',
                      on_click=lambda: _simulate_dialog(open_periods, currency)
                      ).props('outline size=sm').tooltip('A dry run — nothing is written')
            ui.button('Prepare a run', icon='play_arrow',
                      on_click=lambda: _create_run_dialog(open_periods, reload)
                      ).props('unelevated size=sm')

    w.page_header(t('dp.title'), t('dp.sub'), actions=actions, emoji=chrome.PAGE['dp.title'])

    async def reload() -> None:
        container.clear()
        runs = await api.safe(api.get('/depreciation-runs', pageSize=100))
        if runs is None:
            return
        with container:
            with ui.tabs().classes('w-full lc-no-print').props('align=left dense') as tabs:
                ui.tab('Runs')
                ui.tab('Impairment')
                ui.tab('Revaluation')
            with ui.tab_panels(tabs, value='Runs').classes('w-full bg-transparent'):
                with ui.tab_panel('Runs').classes('p-0'):
                    _runs(runs, currency, reload)
                with ui.tab_panel('Impairment').classes('p-0'):
                    await _impairments(currency, reload)
                with ui.tab_panel('Revaluation').classes('p-0'):
                    await _revaluations(currency, reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _runs(data: dict, currency: str, reload) -> None:
    rows = data.get('rows') or []
    posted = [r for r in rows if r.get('status') == 'posted']
    prepared = [r for r in rows if r.get('status') == 'simulated']

    with w.kpi_row():
        w.kpi('Posted runs', w.number(len(posted)),
              hint='Charged to the ledger', icon='task_alt', tone='teal')
        w.kpi('Prepared, not posted', w.number(len(prepared)),
              hint='Review and post, or discard', icon='pending', tone='amber' if prepared else 'slate')
        w.kpi('OHADA charged to date', w.money(sum(float(r.get('total_ohada') or 0) for r in posted),
                                               currency),
              hint='Across every posted run', icon='trending_down', tone='sky')
        w.kpi('IFRS charged to date', w.money(sum(float(r.get('total_ifrs') or 0) for r in posted),
                                              currency),
              hint='After component and residual differences', icon='balance', tone='violet')

    if prepared:
        w.note(f"Run #{prepared[0]['id']} for {prepared[0].get('period_code')} is prepared but not "
               'posted. Nothing is in the ledger until it is.', icon='pending_actions', tone='amber')

    body = w.section(f'{w.number(len(rows))} depreciation runs', 'Click a run to review it line by line')
    with body:
        if not rows:
            w.empty_state('No depreciation has been run yet.', icon='trending_down',
                          hint='Simulate first to see what the charge would be, then prepare a run.')
            return
        for row in rows:
            row['delta'] = float(row.get('total_ifrs') or 0) - float(row.get('total_ohada') or 0)
        table = w.table([
            w.column('id', 'Run', classes='lc-num'),
            w.column('period_code', 'Period'),
            w.date_column('run_date', 'Run on'),
            w.int_column('asset_count', 'Assets'),
            w.money_column('total_ohada', f'OHADA ({currency})', currency=currency),
            w.money_column('total_ifrs', f'IFRS ({currency})', currency=currency),
            w.money_column('delta', f'Difference ({currency})', currency=currency),
            w.column('status', 'Status'),
            w.column('run_by_name', 'Prepared by'),
        ], rows, pagination=15, on_row_click=lambda row: _run_dialog(row['id'], currency, reload))
        w.add_badge_slot(table, 'status')


async def _run_dialog(run_id: int, currency: str, reload) -> None:
    dialog = ui.dialog().props('maximized')
    with dialog, ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        content = ui.column().classes('w-full h-full flex flex-col gap-0')

    async def draw() -> None:
        data = await api.safe(api.get(f'/depreciation-runs/{run_id}'))
        if not data:
            return
        run = data['run']
        content.clear()
        with content:
            with ui.row().classes('items-start justify-between w-full px-6 py-3 '
                                  'border-b border-slate-200 shrink-0'):
                with ui.column().classes('gap-1'):
                    with ui.row().classes('items-center gap-2'):
                        ui.label(f"Depreciation run #{run['id']} · {run['period_code']}"
                                 ).classes('text-base font-semibold')
                        w.badge(run['status'])
                    ui.label(f"{w.as_date(run['start_date'])} to {w.as_date(run['end_date'])} · "
                             f"{w.number(run.get('asset_count'))} assets · prepared by "
                             f"{run.get('run_by_name')}").classes('text-xs text-slate-500')
                ui.button(icon='close', on_click=dialog.close).props('flat dense round')

            with ui.column().classes('flex-1 overflow-auto px-6 py-4 gap-5 w-full '
                                     'max-w-[1400px] mx-auto'):
                with w.kpi_row():
                    w.kpi('OHADA charge', w.money(run.get('total_ohada'), currency),
                          hint='Statutory basis, posted to both frameworks',
                          icon='trending_down', tone='sky')
                    w.kpi('IFRS charge', w.money(run.get('total_ifrs'), currency),
                          hint='Full IFRS charge for the period', icon='balance', tone='violet')
                    w.kpi('IFRS-only difference', w.money(run.get('delta'), currency),
                          hint='Posted as a separate IFRS-only entry', icon='call_split',
                          tone='amber' if float(run.get('delta') or 0) else 'slate')
                    w.kpi('Assets charged', w.number(run.get('asset_count')),
                          hint='In service during the period', icon='inventory_2', tone='slate')

                if run.get('ohada_entry_no'):
                    w.note(f"Posted as {run['ohada_entry_no']}"
                           + (f" with the IFRS difference on {run['ifrs_entry_no']}"
                              if run.get('ifrs_entry_no') else '')
                           + f" by {run.get('posted_by_name')}.",
                           icon='task_alt', tone='emerald')
                elif run['status'] == 'simulated':
                    w.note('Nothing has reached the ledger. Posting creates the journal entries '
                           'and updates every asset’s accumulated depreciation.',
                           icon='pending_actions', tone='amber')

                _run_lines(data.get('lines') or [], currency)
                # Both summaries carry four money columns, so they need the full
                # width rather than a side rail to stay readable.
                with ui.element('div').classes('grid grid-cols-1 lg:grid-cols-2 gap-5 w-full'):
                    _run_group(data.get('by_domain') or [], 'domain', 'By domain', currency)
                    _run_group(data.get('by_cost_center') or [], 'cost_center_name',
                               'By cost centre', currency)

            with ui.row().classes('w-full justify-end gap-2 px-6 py-3 border-t border-slate-200 '
                                  'shrink-0'):
                ui.button('Close', on_click=dialog.close).props('flat color=grey-8')
                if run['status'] == 'simulated' and api.can('depr.run'):
                    ui.button('Discard this run', icon='delete',
                              on_click=lambda: _discard(run, dialog, reload)).props('outline color=red')
                if run['status'] == 'simulated' and api.can('depr.post'):
                    ui.button('Post the depreciation', icon='task_alt',
                              on_click=lambda: _post_run(run, dialog, reload)).props('unelevated')

    await draw()
    dialog.open()


def _run_lines(lines: list[dict], currency: str) -> None:
    rows = []
    for line in lines:
        ohada = line.get('ohada') or {}
        ifrs = line.get('ifrs') or {}
        rows.append({
            'id': line['asset_id'],
            'asset': f"{line['asset_tag']} — {line['asset_name']}",
            'domain': w.humanise(line.get('domain')),
            'cost_center_name': line.get('cost_center_name'),
            'ohada_opening': ohada.get('opening_nbv'),
            'ohada_amount': ohada.get('amount'),
            'ohada_method': w.humanise(ohada.get('method')),
            'ifrs_amount': ifrs.get('amount'),
            'ifrs_method': w.humanise(ifrs.get('method')),
            'delta': line.get('delta'),
            'expense_account': line.get('expense_account'),
        })
    body = w.section('Charge by asset', 'Both bases side by side, with the difference')
    with body:
        if not rows:
            w.empty_state('This run charged nothing.', icon='trending_down')
            return
        w.table([
            w.column('asset', 'Asset'),
            w.column('cost_center_name', 'Cost centre'),
            w.column('expense_account', 'Expense a/c', classes='lc-num'),
            w.money_column('ohada_opening', 'Opening NBV', currency=currency),
            w.money_column('ohada_amount', 'OHADA', currency=currency),
            w.column('ohada_method', 'Method'),
            w.money_column('ifrs_amount', 'IFRS', currency=currency),
            w.money_column('delta', 'Difference', currency=currency),
        ], rows, height='52vh', pagination=0)


def _run_group(rows: list[dict], key: str, title: str, currency: str) -> None:
    body = w.section(title)
    with body:
        if not rows:
            ui.label('Nothing to show.').classes('text-xs text-slate-500')
            return
        w.statement_table(
            ['', 'OHADA', 'IFRS', 'Diff.'],
            [{'label': w.humanise(row.get(key)) or 'Unallocated',
              'values': [row.get('ohada'), row.get('ifrs'), row.get('delta')]}
             for row in rows]
            + [{'label': 'Total', 'kind': 'total',
                'values': [sum(float(r.get('ohada') or 0) for r in rows),
                           sum(float(r.get('ifrs') or 0) for r in rows),
                           sum(float(r.get('delta') or 0) for r in rows)]}],
            currency,
        )


async def _discard(run: dict, dialog, reload) -> None:
    result = await api.safe(api.delete(f"/depreciation-runs/{run['id']}"))
    if result:
        ui.notify(f"Run #{run['id']} discarded.", type='positive', position='top')
        dialog.close()
        await reload()


def _post_run(run: dict, parent, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label(f"Post depreciation for {run['period_code']}").classes('text-base font-semibold')
        ui.label('This creates the journal entries and updates every asset’s accumulated '
                 'depreciation. It cannot be undone except by reversing the entries.'
                 ).classes('text-xs text-slate-500 mb-3')
        basis = ui.select({'ohada': 'OHADA is the basis of record (statutory books)',
                           'ifrs': 'IFRS is the basis of record'},
                          value='ohada', label='Basis of record') \
            .props('outlined dense').classes('w-full')
        w.note('The basis of record posts to both frameworks. The other basis posts only its '
               'difference, tagged IFRS-only, so neither presentation double-counts.',
               icon='call_split', tone='sky')

        async def submit() -> None:
            result = await api.safe(api.post(f"/depreciation-runs/{run['id']}/post",
                                             {'basisOfRecord': basis.value}))
            if result:
                entry = (result.get('recordEntry') or {}).get('entry_no', '')
                delta = (result.get('deltaEntry') or {}).get('entry_no')
                ui.notify(f"Posted as {entry}" + (f" with IFRS difference on {delta}." if delta
                                                  else '.'),
                          type='positive', position='top')
                dialog.close()
                parent.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Post the depreciation', on_click=submit).props('unelevated')
    dialog.open()


def _simulate_dialog(periods: list[dict], currency: str) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label('Simulate the depreciation charge').classes('text-base font-semibold')
        ui.label('A dry run: nothing is written and it can be repeated as often as you like.'
                 ).classes('text-xs text-slate-500 mb-3')
        period = ui.select({p['id']: f"{p['code']} · {w.as_date(p['start_date'])} to "
                                     f"{w.as_date(p['end_date'])}" for p in periods},
                           value=periods[0]['id'], label='Period') \
            .props('outlined dense').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f'/periods/{period.value}/depreciation/simulate', {}))
            if result:
                dialog.close()
                _simulation_result(result, currency)

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Simulate', icon='calculate', on_click=submit).props('unelevated')
    dialog.open()


def _simulation_result(result: dict, currency: str) -> None:
    totals = result.get('totals') or {}
    with ui.dialog().props('maximized') as dialog, \
            ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        with ui.row().classes('items-center justify-between w-full px-6 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-0'):
                ui.label(f"Simulated charge · {(result.get('period') or {}).get('code', '')}"
                         ).classes('text-base font-semibold')
                ui.label('Nothing has been written. Prepare a run to make this reviewable and '
                         'postable.').classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')
        with ui.column().classes('flex-1 overflow-auto px-6 py-4 gap-5 w-full max-w-[1300px] mx-auto'):
            with w.kpi_row():
                w.kpi('OHADA charge', w.money(totals.get('ohada'), currency),
                      hint='Statutory basis', icon='trending_down', tone='sky')
                w.kpi('IFRS charge', w.money(totals.get('ifrs'), currency),
                      hint='IFRS basis', icon='balance', tone='violet')
                w.kpi('Difference',
                      w.money(float(totals.get('ifrs') or 0) - float(totals.get('ohada') or 0),
                              currency),
                      hint='Would post as an IFRS-only entry', icon='call_split', tone='amber')
                w.kpi('Assets', w.number(totals.get('assetCount')),
                      hint='In service during the period', icon='inventory_2', tone='slate')

            rows = [{
                'id': line['asset_id'],
                'asset': f"{line['asset_tag']} — {line['asset_name']}",
                'domain': w.humanise(line.get('domain')),
                'cost_center_name': line.get('cost_center_name'),
                'opening': (line.get('ohada') or {}).get('openingNbv')
                           or (line.get('ohada') or {}).get('opening_nbv'),
                'ohada': (line.get('ohada') or {}).get('amount'),
                'ifrs': (line.get('ifrs') or {}).get('amount'),
                'delta': line.get('delta'),
            } for line in result.get('lines') or []]

            body = w.section('Charge by asset')
            with body:
                if not rows:
                    w.empty_state('Nothing would be charged for this period.', icon='trending_down')
                else:
                    w.table([w.column('asset', 'Asset'),
                             w.column('domain', 'Domain'),
                             w.column('cost_center_name', 'Cost centre'),
                             w.money_column('opening', 'Opening NBV', currency=currency),
                             w.money_column('ohada', 'OHADA', currency=currency),
                             w.money_column('ifrs', 'IFRS', currency=currency),
                             w.money_column('delta', 'Difference', currency=currency)],
                            rows, height='58vh', pagination=0)
    dialog.open()


def _create_run_dialog(periods: list[dict], reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label('Prepare a depreciation run').classes('text-base font-semibold')
        ui.label('The run is written and reviewable, but nothing reaches the ledger until it is '
                 'posted. Only one run may be open per period.').classes('text-xs text-slate-500 mb-3')
        period = ui.select({p['id']: f"{p['code']} · {w.as_date(p['start_date'])} to "
                                     f"{w.as_date(p['end_date'])}" for p in periods},
                           value=periods[0]['id'], label='Period') \
            .props('outlined dense').classes('w-full')
        date = ui.input('Run date', value=w.today_iso()).props('outlined dense type=date') \
            .classes('w-full')
        notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f'/periods/{period.value}/depreciation/runs',
                                             {'runDate': date.value, 'notes': notes.value or None}))
            if result:
                totals = result.get('totals') or {}
                ui.notify(f"Run #{result['run_id']} prepared: {totals.get('assetCount', 0)} assets.",
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Prepare the run', icon='play_arrow', on_click=submit).props('unelevated')
    dialog.open()


# --- IAS 36 impairment ------------------------------------------------------


async def _impairments(currency: str, reload) -> None:
    data = await api.safe(api.get('/impairments', pageSize=100), notify=False)
    rows = (data or {}).get('rows') or []

    body = w.section(
        'Impairment tests (IAS 36)',
        'The recoverable amount is the higher of value in use and fair value less costs to sell; '
        'a reversal can never take the carrying amount above what depreciated cost would have been.',
        actions=lambda: (api.can('valuation.manage')
                         and ui.button('Record an impairment test', icon='add',
                                       on_click=lambda: _impairment_dialog(reload)
                                       ).props('flat dense size=sm')))
    with body:
        if not rows:
            w.empty_state('No impairment test has been recorded.', icon='south',
                          hint='Test when there is an indicator: damage, obsolescence, an idle '
                               'asset or a change in technology.')
            return
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
            row['indicator_label'] = INDICATORS.get(row.get('indicator'), row.get('indicator'))
            row['outcome'] = ('Impairment loss' if float(row.get('impairment_loss') or 0) > 0
                              else 'Reversal' if float(row.get('reversal_amount') or 0) > 0
                              else 'No adjustment')
        table = w.table([
            w.date_column('test_date', 'Tested'),
            w.column('asset', 'Asset'),
            w.column('indicator_label', 'Indicator'),
            w.money_column('carrying_amount', 'Carrying amount', currency=currency),
            w.money_column('value_in_use', 'Value in use', currency=currency),
            w.money_column('fair_value_less_costs', 'Fair value less costs', currency=currency),
            w.money_column('recoverable_amount', 'Recoverable', currency=currency),
            w.money_column('impairment_loss', 'Loss', currency=currency),
            w.money_column('reversal_amount', 'Reversal', currency=currency),
            w.column('outcome', 'Outcome'),
        ], rows, pagination=15)
        w.add_badge_slot(table, 'outcome', tones={'impairment loss': 'rose', 'reversal': 'emerald',
                                                  'no adjustment': 'slate'})


def _impairment_dialog(reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[560px] max-w-full lc-scroll') \
            .style('max-height: 88vh'):
        ui.label('Record an impairment test').classes('text-base font-semibold')
        ui.label('Give at least one of value in use or fair value less costs to sell. The higher '
                 'of the two is the recoverable amount.').classes('text-xs text-slate-500 mb-3')
        asset = ui.select({}, label='Asset', with_input=True) \
            .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
        date = ui.input('Test date', value=w.today_iso()).props('outlined dense type=date') \
            .classes('w-full')
        indicator = ui.select(INDICATORS, value='obsolescence', label='Indicator') \
            .props('outlined dense').classes('w-full')
        with ui.row().classes('w-full gap-3 no-wrap'):
            viu = ui.number('Value in use', min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1') \
                .tooltip('Present value of the cash flows the asset is expected to generate')
            fvlcd = ui.number('Fair value less costs to sell', min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1')
        rate = ui.number('Discount rate (%)', min=0, max=100, format='%.2f') \
            .props('outlined dense').classes('w-full') \
            .tooltip('Pre-tax rate used to discount the cash flows behind value in use')
        basis = ui.textarea('Assumptions behind the estimate') \
            .props('outlined dense rows=2').classes('w-full')

        async def submit() -> None:
            if not asset.value:
                ui.notify('Choose the asset.', type='warning', position='top')
                return
            if viu.value is None and fvlcd.value is None:
                ui.notify('Give value in use or fair value less costs to sell.',
                          type='warning', position='top')
                return
            result = await api.safe(api.post(f'/assets/{asset.value}/impairments', {
                'testDate': date.value, 'indicator': indicator.value,
                'valueInUse': viu.value, 'fairValueLessCosts': fvlcd.value,
                'discountRate': rate.value, 'assumptions': basis.value or None,
            }))
            if result:
                ui.notify('Impairment test recorded.', type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Record the test', on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/assets', pageSize=500), notify=False)
        if data:
            asset.set_options({a['id']: f"{a['asset_tag']} — {a['name']}" for a in data['rows']})

    dialog.open()
    ui.timer(0.01, load, once=True)


# --- IAS 16 revaluation -----------------------------------------------------


async def _revaluations(currency: str, reload) -> None:
    data = await api.safe(api.get('/revaluations', pageSize=100), notify=False)
    rows = (data or {}).get('rows') or []

    body = w.section(
        'Revaluations (IAS 16)',
        'An increase goes to other comprehensive income; a decrease first reverses any surplus '
        'held for that asset and only then hits profit or loss.',
        actions=lambda: (api.can('valuation.manage')
                         and ui.button('Record a revaluation', icon='add',
                                       on_click=lambda: _revaluation_dialog(reload)
                                       ).props('flat dense size=sm')))
    with body:
        if not rows:
            w.empty_state('No revaluation has been recorded.', icon='north',
                          hint='Only relevant where the revaluation model is applied to a class '
                               'of assets — land and buildings, typically.')
            return
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
            row['method_label'] = VALUATION_METHODS.get(row.get('valuation_method'),
                                                        row.get('valuation_method'))
        w.table([
            w.date_column('revaluation_date', 'Date'),
            w.column('asset', 'Asset'),
            w.money_column('previous_carrying', 'Carrying before', currency=currency),
            w.money_column('fair_value', 'Fair value', currency=currency),
            w.money_column('revaluation_amount', 'Movement', currency=currency),
            w.money_column('to_oci_surplus', 'To OCI', currency=currency),
            w.money_column('to_profit_or_loss', 'To profit or loss', currency=currency),
            w.column('valuer_name', 'Valuer'),
            w.column('method_label', 'Method'),
        ], rows, pagination=15)


def _revaluation_dialog(reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label('Record a revaluation').classes('text-base font-semibold')
        ui.label('The asset is restated to fair value at the date of the valuation.'
                 ).classes('text-xs text-slate-500 mb-3')
        asset = ui.select({}, label='Asset', with_input=True) \
            .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
        date = ui.input('Valuation date', value=w.today_iso()).props('outlined dense type=date') \
            .classes('w-full')
        fair_value = ui.number('Fair value', min=0, format='%.2f').props('outlined dense') \
            .classes('w-full')
        valuer = ui.input('Valuer').props('outlined dense').classes('w-full')
        method = ui.select(VALUATION_METHODS, value='market', label='Valuation method') \
            .props('outlined dense').classes('w-full')
        notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

        async def submit() -> None:
            if not asset.value or fair_value.value is None:
                ui.notify('Choose the asset and give a fair value.', type='warning', position='top')
                return
            result = await api.safe(api.post(f'/assets/{asset.value}/revaluations', {
                'revaluationDate': date.value, 'fairValue': fair_value.value,
                'valuerName': valuer.value or None, 'valuationMethod': method.value,
                'notes': notes.value or None,
            }))
            if result:
                ui.notify('Revaluation recorded.', type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Record the revaluation', on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/assets', pageSize=500), notify=False)
        if data:
            asset.set_options({a['id']: f"{a['asset_tag']} — {a['name']}" for a in data['rows']})

    dialog.open()
    ui.timer(0.01, load, once=True)
