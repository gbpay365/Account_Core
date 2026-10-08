"""
General ledger: the trial balance, and the account detail with a running
balance that an auditor works from.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, framework, t
from ..ui import chrome, widgets as w
from ..ui.shell import page


@page('/ledger', title='General ledger', permissions=('journal.view',))
async def ledger_page(account: str = '') -> None:
    currency = api.user().get('functional_currency', 'XAF')
    view = framework()
    years = await api.safe(api.get('/fiscal-years'), notify=False) or {'rows': []}
    default = next((y for y in years['rows'] if y.get('status') != 'closed'),
                   years['rows'][0] if years['rows'] else {})

    selected = None
    if account:
        selected = account if view == 'ifrs' else (int(account) if str(account).isdigit() else account)

    state = {'from': str(default.get('start_date', ''))[:10],
             'to': str(default.get('end_date', ''))[:10],
             'framework': view, 'includeZero': False, 'account': selected}

    w.page_header(t('gl.title'), t('gl.sub_ifrs') if view == 'ifrs' else t('gl.sub_ohada'),
                  emoji=chrome.PAGE['gl.title'])

    if view == 'ifrs':
        accounts = await api.safe(api.get('/accounts', framework='ifrs'), notify=False) or {'rows': []}
        account_options = {None: t('gl.trial_all'),
                           **{a['code']: f"{a['code']} — {account_label(a)}" for a in accounts['rows']}}
        id_by_code = {a['code']: a['code'] for a in accounts['rows']}
    else:
        accounts = await api.safe(api.get('/accounts', framework='ohada', postableOnly=True),
                                  notify=False) or {'rows': []}
        account_options = {None: t('gl.trial_all'),
                           **{a['id']: f"{a['code']} — {account_label(a)}" for a in accounts['rows']}}
        id_by_code = {a['code']: a['id'] for a in accounts['rows']}

    def drill(code: str) -> None:
        account_id = id_by_code.get(code)
        if not account_id:
            ui.notify('That is a heading account — it carries no postings of its own.',
                      position='top')
            return
        picker.value = account_id

    async def reload() -> None:
        container.clear()
        with container:
            if state['account']:
                await _account_view(state, currency)
            else:
                await _trial_balance(state, currency, drill)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            picker = ui.select(account_options, value=state['account'], label='View',
                               with_input=True) \
                .props('outlined dense options-dense use-input hide-selected input-debounce=200') \
                .classes('w-full sm:w-96')
            picker.bind_value(state, 'account')
            date_from = ui.input(t('common.from'), value=state['from']).props('outlined dense type=date').classes('w-40')
            date_from.bind_value(state, 'from')
            date_to = ui.input(t('common.to'), value=state['to']).props('outlined dense type=date').classes('w-40')
            date_to.bind_value(state, 'to')
            zeros = ui.switch('Show nil balances').props('dense')
            zeros.bind_value(state, 'includeZero')
            for element in (picker, date_from, date_to, zeros):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


async def _trial_balance(state: dict, currency: str, open_account) -> None:
    data = await api.safe(api.get('/ledger/trial-balance', **{
        'from': state['from'], 'to': state['to'],
        'framework': state['framework'], 'includeZero': state['includeZero'],
    }))
    if not data:
        return

    totals = data.get('totals') or {}
    rows = data.get('rows') or []
    period_diff = float(totals.get('period_debit', 0)) - float(totals.get('period_credit', 0))
    closing_diff = float(totals.get('closing_debit', 0)) - float(totals.get('closing_credit', 0))
    balanced = bool(totals.get('balanced'))

    with w.kpi_row():
        w.kpi('Movement — debits', w.money(totals.get('period_debit'), currency),
              hint=f"{w.number(len(rows))} accounts with a balance or movement",
              icon='south_west', tone='sky')
        w.kpi('Movement — credits', w.money(totals.get('period_credit'), currency),
              hint='Same period', icon='north_east', tone='violet')
        w.kpi('Closing — debits', w.money(totals.get('closing_debit'), currency),
              hint=w.as_date(state['to']), icon='account_balance', tone='slate')
        w.kpi('Closing — credits', w.money(totals.get('closing_credit'), currency),
              hint=w.as_date(state['to']), icon='account_balance', tone='slate')
        w.kpi('Balanced', 'Yes' if balanced else 'No',
              hint='Debits equal credits on both columns' if balanced
                   else 'Investigate before reporting',
              icon='verified' if balanced else 'report_problem',
              tone='teal' if balanced else 'rose')

    w.check_banner([
        {'label': 'Period debits less period credits', 'balanced': abs(period_diff) < 0.005,
         'difference': period_diff},
        {'label': 'Closing debits less closing credits', 'balanced': abs(closing_diff) < 0.005,
         'difference': closing_diff},
    ], currency, subject='trial balance')

    body = w.section(f"Trial balance · {w.as_date(state['from'])} to {w.as_date(state['to'])}",
                     f"{state['framework'].upper()} · opening, movement and closing by account",
                     actions=lambda: ui.button('Print', icon='print',
                                               on_click=lambda: ui.run_javascript('window.print()')
                                               ).props('flat dense size=sm'))
    with body:
        if not rows:
            w.empty_state('No account carries a balance or movement in this range.', icon='calculate')
            return
        columns = [
            w.column('code', 'Code', classes='lc-num font-semibold'),
            w.column('name', 'Account'),
            w.money_column('opening_debit', 'Opening Dr', currency=currency),
            w.money_column('opening_credit', 'Opening Cr', currency=currency),
            w.money_column('period_debit', 'Movement Dr', currency=currency),
            w.money_column('period_credit', 'Movement Cr', currency=currency),
            w.money_column('closing_debit', 'Closing Dr', currency=currency),
            w.money_column('closing_credit', 'Closing Cr', currency=currency),
        ]
        table = w.table(columns, rows, row_key='code', pagination=0, height='62vh',
                        on_row_click=lambda row: open_account(row.get('code')))
        table.add_slot('bottom-row', f'''
          <q-tr class="bg-slate-50 font-semibold">
            <q-td colspan="2">Totals</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('opening_debit'), currency)}</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('opening_credit'), currency)}</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('period_debit'), currency)}</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('period_credit'), currency)}</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('closing_debit'), currency)}</q-td>
            <q-td class="text-right lc-num">{w.money(totals.get('closing_credit'), currency)}</q-td>
          </q-tr>
        ''')


async def _account_view(state: dict, currency: str) -> None:
    path = (f"/ledger/ifrs-line/{state['account']}" if state['framework'] == 'ifrs'
            else f"/ledger/account/{state['account']}")
    data = await api.safe(api.get(path, **{
        'from': state['from'], 'to': state['to'], 'framework': state['framework'],
    }))
    if not data:
        return
    account = data['account']

    with w.kpi_row():
        w.kpi('Opening balance', w.money(data.get('opening_balance'), currency),
              hint=w.as_date(state['from']), icon='flag', tone='slate')
        w.kpi('Debits in period', w.money(data.get('total_debit'), currency),
              hint=f"{w.number(len(data.get('rows') or []))} movements", icon='south_west', tone='sky')
        w.kpi('Credits in period', w.money(data.get('total_credit'), currency),
              hint='Period movement', icon='north_east', tone='violet')
        w.kpi('Closing balance', w.money(data.get('closing_balance'), currency),
              hint=w.as_date(state['to']), icon='account_balance', tone='teal')

    subtitle = (f"{account.get('statement', '').upper()} · {w.humanise(account.get('section'))} · IFRS"
                if state['framework'] == 'ifrs'
                else f"Normal side {account.get('normal_side')} · class {account.get('account_class')} · "
                     f"{state['framework'].upper()}")
    body = w.section(f"{account['code']} — {account_label(account)}", subtitle)
    rows = data.get('rows') or []
    with body:
        if not rows:
            w.empty_state('No movement on this account in the range.', icon='menu_book')
            return
        columns = [
            w.date_column('entry_date', 'Date'),
            w.column('entry_no', 'Entry no.', classes='lc-num'),
            w.column('journal_code', 'Jnl'),
            *([w.column('account_code', 'SYSCOHADA')] if state['framework'] == 'ifrs' else []),
            w.column('description', 'Narrative'),
            w.column('reference', 'Ref'),
            w.column('cost_center_code', 'Cost centre'),
            w.column('asset_tag', 'Asset'),
            w.money_column('debit', 'Debit', currency=currency),
            w.money_column('credit', 'Credit', currency=currency),
            w.money_column('balance', 'Running balance', currency=currency),
        ]
        w.table(columns, [{**row, 'id': f"{row['entry_id']}-{row['line_no']}"} for row in rows],
                pagination=0, height='60vh')
