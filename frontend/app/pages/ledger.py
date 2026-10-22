"""
General ledger: Trial balance (6 or 8-column statutory OHADA format),
General account ledger, Auxiliary third-party subledgers, and interactive Lettrage.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, framework, lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page


@page('/ledger', title='General ledger', permissions=('journal.view',))
async def ledger_page(account: str = '', subledger: str = '', view_mode: str = '') -> None:
    currency = api.user().get('functional_currency', 'XAF')
    view = framework()
    years = await api.safe(api.get('/fiscal-years'), notify=False) or {'rows': []}
    default = next((y for y in years['rows'] if y.get('status') != 'closed'),
                   years['rows'][0] if years['rows'] else {})

    # Accounts options for General Ledger (load full chart so any selected or linked account can be inspected)
    if view == 'ifrs':
        accounts = await api.safe(api.get('/accounts', framework='ifrs'), notify=False) or {'rows': []}
        account_options = {None: t('gl.select_account'),
                           **{a['code']: f"{a['code']} — {account_label(a)}" for a in accounts['rows']}}
        id_by_code = {a['code']: a['code'] for a in accounts['rows']}
    else:
        accounts = await api.safe(api.get('/accounts', framework='ohada'),
                                  notify=False) or {'rows': []}
        account_options = {None: t('gl.select_account'),
                           **{a['id']: f"{a['code']} — {account_label(a)}" for a in accounts['rows']}}
        id_by_code = {a['code']: a['id'] for a in accounts['rows']}

    # Subledger accounts for Auxiliary Ledger
    subledgers = await api.safe(api.get('/subledger/accounts'), notify=False) or {'rows': []}
    subledger_options = {None: t('gl.select_subledger'),
                         **{s['id']: f"{s['code']} — {s['name']}" for s in subledgers['rows']}}

    # Safe resolution for account query param (supports numeric ID or account code; avoids ValueError in QSelect)
    selected_acct = None
    if account:
        if view == 'ifrs':
            if account in account_options:
                selected_acct = account
            elif str(account) in id_by_code and id_by_code[str(account)] in account_options:
                selected_acct = id_by_code[str(account)]
        else:
            if str(account).isdigit() and int(account) in account_options:
                selected_acct = int(account)
            elif str(account) in id_by_code and id_by_code[str(account)] in account_options:
                selected_acct = id_by_code[str(account)]
            elif account in account_options:
                selected_acct = account

    # Safe resolution for subledger query param (avoids ValueError in QSelect)
    selected_sub = None
    if subledger:
        if str(subledger).isdigit() and int(subledger) in subledger_options:
            selected_sub = int(subledger)
        elif subledger in subledger_options:
            selected_sub = subledger

    # Available modes: 'trial' (Trial balance), 'general' (GL by account),
    # 'sub_bal' (Auxiliary trial balance), 'sub_led' (Auxiliary ledger by third party)
    initial_mode = view_mode or ('sub_led' if selected_sub else ('general' if selected_acct else 'trial'))

    state = {
        'mode': initial_mode,
        'from': str(default.get('start_date', ''))[:10],
        'to': str(default.get('end_date', ''))[:10],
        'framework': view,
        'includeZero': False,
        'is8Column': True,
        'account': selected_acct,
        'subledger': selected_sub,
        'matchFilter': 'all',
    }

    def actions() -> None:
        if api.can('journal.post'):
            ui.button(t('gl.lettrage_btn'), icon='done_all',
                      on_click=lambda: _lettrage_modal(currency, reload)).props('unelevated size=sm')

    w.page_header(t('gl.title'), t('gl.sub_ifrs') if view == 'ifrs' else t('gl.sub_ohada'),
                  actions=actions, emoji=chrome.PAGE['gl.title'])

    def drill_account(code: str) -> None:
        account_id = id_by_code.get(code)
        if not account_id:
            ui.notify(t('gl.heading_acct_tip'), position='top')
            return
        state['mode'] = 'general'
        state['account'] = account_id
        mode_tabs.value = 'general'
        account_picker.value = account_id

    def drill_subledger(sub_id: int) -> None:
        state['mode'] = 'sub_led'
        state['subledger'] = sub_id
        mode_tabs.value = 'sub_led'
        sub_picker.value = sub_id

    async def reload() -> None:
        container.clear()
        with container:
            if state['mode'] == 'trial':
                await _trial_balance(state, currency, drill_account)
            elif state['mode'] == 'general':
                if state['account']:
                    await _account_view(state, currency)
                else:
                    w.empty_state(t('gl.select_acct_prompt'), icon='menu_book')
            elif state['mode'] == 'sub_bal':
                await _subledger_balance(state, currency, drill_subledger)
            elif state['mode'] == 'sub_led':
                if state['subledger']:
                    await _subledger_view(state, currency)
                else:
                    w.empty_state(t('gl.select_sub_prompt'), icon='people')

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with ui.column().classes('w-full gap-3'):
            with ui.row().classes('items-center justify-between w-full border-b border-slate-100 pb-2'):
                with ui.tabs().props('dense no-caps active-color=primary indicator-color=primary') as mode_tabs:
                    mode_tabs.bind_value(state, 'mode')
                    ui.tab('trial', label=t('gl.tab_trial'), icon='calculate')
                    ui.tab('general', label=t('gl.tab_general'), icon='menu_book')
                    ui.tab('sub_bal', label=t('gl.tab_sub_bal'), icon='table_chart')
                    ui.tab('sub_led', label=t('gl.tab_sub_led'), icon='person_search')
                mode_tabs.on_value_change(reload)

            with w.toolbar():
                # Conditional Pickers depending on tab
                with ui.row().classes('items-center gap-2'):
                    account_picker = ui.select(account_options, value=state['account'], label=t('gl.general_account'),
                                               with_input=True) \
                        .props('outlined dense options-dense use-input hide-selected input-debounce=200') \
                        .classes('w-full sm:w-80')
                    account_picker.bind_value(state, 'account')
                    account_picker.bind_visibility_from(state, 'mode', lambda m: m == 'general')
                    account_picker.on_value_change(reload)

                    sub_picker = ui.select(subledger_options, value=state['subledger'], label=t('gl.third_party_account'),
                                           with_input=True) \
                        .props('outlined dense options-dense use-input hide-selected input-debounce=200') \
                        .classes('w-full sm:w-80')
                    sub_picker.bind_value(state, 'subledger')
                    sub_picker.bind_visibility_from(state, 'mode', lambda m: m == 'sub_led')
                    sub_picker.on_value_change(reload)

                date_from = ui.input(t('common.from'), value=state['from']).props('outlined dense type=date').classes('w-40')
                date_from.bind_value(state, 'from')
                date_from.on_value_change(reload)

                date_to = ui.input(t('common.to'), value=state['to']).props('outlined dense type=date').classes('w-40')
                date_to.bind_value(state, 'to')
                date_to.on_value_change(reload)

                # Lettrage filter for ledger views
                with ui.row().classes('items-center'):
                    match_filter = ui.select({
                        'all': t('gl.all_entries'),
                        'unmatched': t('gl.unmatched_open'),
                        'matched': t('gl.matched_only'),
                    }, value=state['matchFilter'], label=t('gl.matching')) \
                        .props('outlined dense options-dense').classes('w-52')
                    match_filter.bind_value(state, 'matchFilter')
                    match_filter.bind_visibility_from(state, 'mode', lambda m: m in ('general', 'sub_led'))
                    match_filter.on_value_change(reload)

                # 8-column toggle for Trial Balance
                with ui.row().classes('items-center'):
                    col8 = ui.switch(t('gl.col8_syscohada')).props('dense')
                    col8.bind_value(state, 'is8Column')
                    col8.bind_visibility_from(state, 'mode', lambda m: m == 'trial')
                    col8.on_value_change(reload)

                zeros = ui.switch(t('gl.zero_balances')).props('dense')
                zeros.bind_value(state, 'includeZero')
                zeros.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


# --- 1. TRIAL BALANCE (6 or 8 COLUMNS) ---------------------------------------

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
    is_8col = state.get('is8Column', True)

    with w.kpi_row():
        w.kpi(t('gl.mvt_debit'), w.money(totals.get('period_debit'), currency),
              hint=t('gl.accounts_with_mvt', n=w.number(len(rows))),
              icon='south_west', tone='sky')
        w.kpi(t('gl.mvt_credit'), w.money(totals.get('period_credit'), currency),
              hint=t('gl.selected_period'), icon='north_east', tone='violet')
        if is_8col:
            w.kpi(t('gl.ytd_debit'), w.money(totals.get('ytd_debit'), currency),
                  hint=t('gl.opening_plus_mvt'), icon='trending_up', tone='slate')
            w.kpi(t('gl.ytd_credit'), w.money(totals.get('ytd_credit'), currency),
                  hint=t('gl.opening_plus_mvt'), icon='trending_down', tone='slate')
        else:
            w.kpi(t('gl.closing_debit'), w.money(totals.get('closing_debit'), currency),
                  hint=w.as_date(state['to']), icon='account_balance', tone='slate')
            w.kpi(t('gl.closing_credit'), w.money(totals.get('closing_credit'), currency),
                  hint=w.as_date(state['to']), icon='account_balance', tone='slate')
        w.kpi(t('gl.balanced'), t('gl.yes') if balanced else t('gl.no'),
              hint=t('gl.balanced_hint') if balanced else t('gl.unbalanced_hint'),
              icon='verified' if balanced else 'report_problem',
              tone='teal' if balanced else 'rose')

    w.check_banner([
        {'label': t('gl.diff_mvt'), 'balanced': abs(period_diff) < 0.005, 'difference': period_diff},
        {'label': t('gl.diff_closing'), 'balanced': abs(closing_diff) < 0.005, 'difference': closing_diff},
    ], currency, subject=t('gl.tb_subject'))

    title = t('gl.title_8col') if is_8col else t('gl.title_6col')
    to_sep = ' to ' if lang() == 'en' else ' au '
    body = w.section(f"{title} · {w.as_date(state['from'])}{to_sep}{w.as_date(state['to'])}",
                     f"{state['framework'].upper()} · {t('gl.sub_8col')}",
                     actions=lambda: ui.button(t('gl.print'), icon='print',
                                               on_click=lambda: ui.run_javascript('window.print()')
                                               ).props('flat dense size=sm'))
    with body:
        if not rows:
            w.empty_state(t('gl.no_data_period'), icon='calculate')
            return

        display_rows = [{**r, 'display_name': account_label(r)} for r in rows]

        if is_8col:
            columns = [
                w.column('code', t('gl.col_code'), classes='lc-num font-semibold'),
                w.column('display_name', t('gl.col_title')),
                w.money_column('opening_debit', t('gl.col_op_debit'), currency=currency),
                w.money_column('opening_credit', t('gl.col_op_credit'), currency=currency),
                w.money_column('period_debit', t('gl.col_mvt_debit'), currency=currency),
                w.money_column('period_credit', t('gl.col_mvt_credit'), currency=currency),
                w.money_column('ytd_debit', t('gl.col_ytd_debit'), currency=currency),
                w.money_column('ytd_credit', t('gl.col_ytd_credit'), currency=currency),
                w.money_column('closing_debit', t('gl.col_cl_debit'), currency=currency),
                w.money_column('closing_credit', t('gl.col_cl_credit'), currency=currency),
            ]
            bottom_tr = f'''
              <q-tr class="bg-slate-100 font-semibold text-xs">
                <q-td colspan="2">{t('gl.grand_totals')}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('opening_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('opening_credit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('period_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('period_credit'), currency)}</q-td>
                <q-td class="text-right lc-num text-teal-700">{w.money(totals.get('ytd_debit'), currency)}</q-td>
                <q-td class="text-right lc-num text-teal-700">{w.money(totals.get('ytd_credit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('closing_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('closing_credit'), currency)}</q-td>
              </q-tr>
            '''
        else:
            columns = [
                w.column('code', t('gl.col_code'), classes='lc-num font-semibold'),
                w.column('display_name', t('gl.col_title')),
                w.money_column('opening_debit', t('gl.col_op_debit'), currency=currency),
                w.money_column('opening_credit', t('gl.col_op_credit'), currency=currency),
                w.money_column('period_debit', t('gl.col_mvt_debit'), currency=currency),
                w.money_column('period_credit', t('gl.col_mvt_credit'), currency=currency),
                w.money_column('closing_debit', t('gl.col_cl_debit'), currency=currency),
                w.money_column('closing_credit', t('gl.col_cl_credit'), currency=currency),
            ]
            bottom_tr = f'''
              <q-tr class="bg-slate-100 font-semibold text-xs">
                <q-td colspan="2">{t('gl.totals')}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('opening_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('opening_credit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('period_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('period_credit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('closing_debit'), currency)}</q-td>
                <q-td class="text-right lc-num">{w.money(totals.get('closing_credit'), currency)}</q-td>
              </q-tr>
            '''

        table = w.table(columns, display_rows, row_key='code', pagination=0, height='62vh',
                        on_row_click=lambda row: open_account(row.get('code')))
        table.add_slot('bottom-row', bottom_tr)


# --- 2. GENERAL LEDGER ACCOUNT DETAIL ----------------------------------------

async def _account_view(state: dict, currency: str) -> None:
    path = (f"/ledger/ifrs-line/{state['account']}" if state['framework'] == 'ifrs'
            else f"/ledger/account/{state['account']}")
    data = await api.safe(api.get(path, **{
        'from': state['from'], 'to': state['to'], 'framework': state['framework'],
        'matchFilter': state.get('matchFilter', 'all'),
    }))
    if not data:
        return
    account = data['account']
    rows = data.get('rows') or []

    with w.kpi_row():
        w.kpi(t('gl.opening_balance'), w.money(data.get('opening_balance'), currency),
              hint=w.as_date(state['from']), icon='flag', tone='slate')
        w.kpi(t('gl.total_period_debit'), w.money(data.get('total_debit'), currency),
              hint=t('gl.entries_count', n=w.number(len(rows))), icon='south_west', tone='sky')
        w.kpi(t('gl.total_period_credit'), w.money(data.get('total_credit'), currency),
              hint=t('gl.period_movements'), icon='north_east', tone='violet')
        w.kpi(t('gl.cumulative_closing'), w.money(data.get('closing_balance'), currency),
              hint=w.as_date(state['to']), icon='account_balance', tone='teal')

    subtitle = (f"{account.get('statement', '').upper()} · {w.humanise(account.get('section'))} · IFRS"
                if state['framework'] == 'ifrs'
                else t('gl.normal_side', side=account.get('normal_side'), cls=account.get('account_class'),
                       fw=state['framework'].upper()))
    body = w.section(f"{account['code']} — {account_label(account)}", subtitle)
    with body:
        if not rows:
            w.empty_state(t('gl.no_mvt_filter'), icon='menu_book')
            return
        columns = [
            w.date_column('entry_date', t('gl.col_date')),
            w.column('entry_no', t('gl.col_entry_no'), classes='lc-num'),
            w.column('journal_code', t('gl.col_jnl')),
            w.column('match_code', t('gl.col_let'), classes='font-bold text-teal-800'),
            w.column('subledger_code', t('gl.col_partner')),
            w.column('description', t('gl.col_desc')),
            w.column('reference', t('gl.col_ref')),
            w.column('cost_center_code', t('gl.col_service')),
            w.column('asset_tag', t('gl.col_asset')),
            w.money_column('debit', t('gl.col_debit'), currency=currency),
            w.money_column('credit', t('gl.col_credit'), currency=currency),
            w.money_column('balance', t('gl.col_running_balance'), currency=currency),
        ]
        table = w.table(columns, [{**row, 'id': f"{row.get('line_id', row.get('entry_id'))}-{row['line_no']}"} for row in rows],
                        pagination=0, height='60vh')
        table.add_slot('body-cell-match_code', '''
          <q-td :props="props">
            <span v-if="props.value" class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 text-xs font-bold border border-teal-300">
              {{ props.value }}
            </span>
            <span v-else class="text-slate-300 text-xs">—</span>
          </q-td>
        ''')


# --- 3. AUXILIARY TRIAL BALANCE (BALANCE AUXILIAIRE DES TIERS) ---------------

async def _subledger_balance(state: dict, currency: str, open_subledger) -> None:
    data = await api.safe(api.get('/subledger/balance', **{
        'from': state['from'], 'to': state['to'],
        'includeZero': state['includeZero'],
    }))
    if not data:
        return

    totals = data.get('totals') or {}
    rows = data.get('rows') or []

    with w.kpi_row():
        w.kpi(t('gl.active_partners'), w.number(len(rows)),
              hint=t('gl.partners_hint'), icon='people', tone='sky')
        w.kpi(t('gl.partner_mvt_debit'), w.money(totals.get('period_debit'), currency),
              hint=t('gl.selected_period'), icon='south_west', tone='violet')
        w.kpi(t('gl.partner_mvt_credit'), w.money(totals.get('period_credit'), currency),
              hint=t('gl.selected_period'), icon='north_east', tone='violet')
        w.kpi(t('gl.partner_closing_balance'), w.money(float(totals.get('closing_debit', 0)) - float(totals.get('closing_credit', 0)), currency),
              hint=w.as_date(state['to']), icon='account_balance', tone='teal')

    body = w.section(t('gl.sub_balance_title', start=w.as_date(state['from']), end=w.as_date(state['to'])),
                     t('gl.sub_balance_desc'),
                     actions=lambda: ui.button(t('gl.print'), icon='print',
                                               on_click=lambda: ui.run_javascript('window.print()')
                                               ).props('flat dense size=sm'))
    with body:
        if not rows:
            w.empty_state(t('gl.no_sub_balance'), icon='group')
            return

        columns = [
            w.column('code', t('gl.col_partner_code'), classes='lc-num font-semibold'),
            w.column('name', t('gl.col_partner_name')),
            w.column('collective_code', t('gl.col_collective')),
            w.column('partner_type', t('gl.col_type')),
            w.money_column('opening_balance', t('gl.col_op_bal'), currency=currency),
            w.money_column('period_debit', t('gl.col_mvt_debit'), currency=currency),
            w.money_column('period_credit', t('gl.col_mvt_credit'), currency=currency),
            w.money_column('closing_balance', t('gl.col_cl_bal'), currency=currency),
            w.column('unmatched_count', t('gl.col_unmatched'), classes='text-center font-bold text-amber-700'),
        ]
        table = w.table(columns, rows, row_key='code', pagination=0, height='60vh',
                        on_row_click=lambda row: open_subledger(row.get('id')))
        supp_label = t('gl.partner_type_supplier')
        cust_label = t('gl.partner_type_customer')
        table.add_slot('body-cell-partner_type', f'''
          <q-td :props="props">
            <span v-if="props.value === 'supplier'" class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">{supp_label}</span>
            <span v-else-if="props.value === 'customer'" class="px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-800">{cust_label}</span>
            <span v-else class="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800">{{{{ props.value }}}}</span>
          </q-td>
        ''')


# --- 4. AUXILIARY LEDGER BY THIRD PARTY (GRAND LIVRE AUXILIAIRE) -------------

async def _subledger_view(state: dict, currency: str) -> None:
    data = await api.safe(api.get(f"/subledger/ledger/{state['subledger']}", **{
        'from': state['from'], 'to': state['to'],
        'matchFilter': state.get('matchFilter', 'all'),
    }))
    if not data:
        return
    sub = data['subledger']
    rows = data.get('rows') or []

    with w.kpi_row():
        w.kpi(t('gl.initial_partner_bal'), w.money(data.get('opening_balance'), currency),
              hint=w.as_date(state['from']), icon='flag', tone='slate')
        w.kpi(t('gl.period_debits'), w.money(data.get('total_debit'), currency),
              hint=t('gl.entries_count', n=w.number(len(rows))), icon='south_west', tone='sky')
        w.kpi(t('gl.period_credits'), w.money(data.get('total_credit'), currency),
              hint=t('gl.invoices_settlements'), icon='north_east', tone='violet')
        w.kpi(t('gl.final_due_bal'), w.money(data.get('closing_balance'), currency),
              hint=w.as_date(state['to']), icon='account_balance',
              tone='rose' if (float(data.get('closing_balance', 0)) < 0 and sub.get('partner_type') == 'supplier') else 'teal')

    body = w.section(f"{sub['code']} — {sub['name']}",
                     t('gl.collective_subtitle', code=sub['collective_code'],
                       name=sub['collective_name'], type=sub['partner_type'].upper()))
    with body:
        if not rows:
            w.empty_state(t('gl.no_sub_entries'), icon='receipt_long')
            return
        columns = [
            w.date_column('entry_date', t('gl.col_date')),
            w.column('entry_no', t('gl.col_entry_no'), classes='lc-num'),
            w.column('journal_code', t('gl.col_jnl')),
            w.column('match_code', t('gl.col_let'), classes='font-bold text-teal-800'),
            w.column('description', t('gl.col_doc_desc')),
            w.column('reference', t('gl.col_doc_ref')),
            w.money_column('debit', t('gl.debit_payments'), currency=currency),
            w.money_column('credit', t('gl.credit_invoices'), currency=currency),
            w.money_column('balance', t('gl.col_running_balance'), currency=currency),
        ]
        table = w.table(columns, [{**row, 'id': row['line_id']} for row in rows],
                        pagination=0, height='60vh')
        table.add_slot('body-cell-match_code', '''
          <q-td :props="props">
            <span v-if="props.value" class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 text-xs font-bold border border-teal-300">
              {{ props.value }}
            </span>
            <span v-else class="text-slate-300 text-xs">—</span>
          </q-td>
        ''')


# --- 5. INTERACTIVE LETTRAGE / MATCHING MODAL --------------------------------

def _lettrage_modal(currency: str, on_success) -> None:
    sel_account = {'subledger_id': None, 'custom_code': ''}
    checked_lines = set()

    with ui.dialog() as dlg, ui.element('div').classes('lc-card p-0 w-[1150px] max-w-[95vw]'):
        with ui.row().classes('items-center justify-between w-full px-6 py-4 border-b border-slate-200 bg-slate-50'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('done_all').classes('text-2xl text-teal-600')
                ui.label(t('let.modal_title')).classes('text-lg font-bold text-slate-800')
            ui.button(icon='close', on_click=dlg.close).props('flat dense round')

        modal_body = ui.column().classes('p-6 gap-5 w-full lc-scroll').style('max-height: 80vh')

        async def refresh_matching() -> None:
            modal_body.clear()
            items = await api.safe(api.get('/subledger/open-items',
                                           subledgerId=sel_account['subledger_id'] or None)) or {'rows': []}
            rows = items.get('rows', [])
            checked_lines.clear()

            with modal_body:
                with ui.row().classes('items-center justify-between w-full gap-4 flex-wrap'):
                    sub_list = await api.safe(api.get('/subledger/accounts'), notify=False) or {'rows': []}
                    s_opts = {None: t('let.all_partners_open'),
                              **{s['id']: f"{s['code']} — {s['name']}" for s in sub_list['rows']}}
                    picker = ui.select(s_opts, value=sel_account['subledger_id'], label=t('let.filter_partner'),
                                       with_input=True).props('outlined dense options-dense use-input').classes('w-96')
                    picker.bind_value(sel_account, 'subledger_id')
                    picker.on_value_change(refresh_matching)

                    custom_in = ui.input(t('let.custom_code'), placeholder=t('let.custom_code_ph')) \
                        .props('outlined dense').classes('w-64')
                    custom_in.bind_value(sel_account, 'custom_code')

                # KPI status bar for selection
                kpi_bar = ui.row().classes('w-full items-center justify-between p-4 rounded-lg bg-slate-100 border border-slate-200')

                def update_kpi_bar() -> None:
                    kpi_bar.clear()
                    selected = [r for r in rows if r['id'] in checked_lines]
                    total_dr = sum(float(r['debit'] or 0) for r in selected)
                    total_cr = sum(float(r['credit'] or 0) for r in selected)
                    diff = round(abs(total_dr - total_cr), 2)
                    is_balanced = (len(selected) >= 2) and (diff < 0.01)

                    with kpi_bar:
                        with ui.row().classes('items-center gap-6'):
                            ui.label(t('let.lines_selected', n=len(selected))).classes('font-semibold text-slate-700')
                            ui.label(t('let.debit', val=w.money(total_dr, currency), curr=currency)).classes('text-sm text-sky-800 font-semibold')
                            ui.label(t('let.credit', val=w.money(total_cr, currency), curr=currency)).classes('text-sm text-violet-800 font-semibold')
                            ui.label(t('let.diff', val=w.money(diff, currency), curr=currency)).classes(
                                f"text-sm font-bold {'text-teal-700' if diff == 0 and len(selected) >= 2 else 'text-rose-600'}"
                            )

                        async def do_match() -> None:
                            res = await api.safe(api.post('/subledger/match', {
                                'lineIds': list(checked_lines),
                                'customMatchCode': sel_account['custom_code'] or None,
                            }))
                            if res:
                                ui.notify(t('let.success', code=res.get('match_code')),
                                          type='positive', position='top')
                                await refresh_matching()
                                await on_success()

                        match_btn = ui.button(t('let.validate'), icon='verified', on_click=do_match) \
                            .props('unelevated color=teal').classes('font-bold')
                        match_btn.set_enabled(is_balanced)

                update_kpi_bar()

                if not rows:
                    w.empty_state(t('let.empty'), icon='task_alt')
                    return

                # Table with checkboxes
                ui.label(t('let.ready_count', n=len(rows))).classes('text-xs text-slate-500 font-semibold uppercase')

                with ui.element('div').classes('w-full border border-slate-200 rounded-lg overflow-hidden'):
                    with ui.element('table').classes('w-full text-sm text-left border-collapse'):
                        with ui.element('thead').classes('bg-slate-100 text-slate-700 uppercase text-xs font-bold'):
                            with ui.element('tr'):
                                ui.element('th').classes('p-3 w-12 text-center')
                                for col_title in (t('gl.col_date'), t('gl.col_entry_no'), t('let.col_account_partner'), t('gl.col_desc'), t('gl.col_ref')):
                                    with ui.element('th').classes('p-3'):
                                        ui.label(col_title)
                                for col_title in (t('gl.col_debit'), t('gl.col_credit')):
                                    with ui.element('th').classes('p-3 text-right'):
                                        ui.label(col_title)

                        with ui.element('tbody'):
                            for r in rows:
                                with ui.element('tr').classes('border-t border-slate-100 hover:bg-slate-50'):
                                    with ui.element('td').classes('p-3 text-center'):
                                        cb = ui.checkbox(value=(r['id'] in checked_lines))
                                        def toggle(val, line_id=r['id']):
                                            if val:
                                                checked_lines.add(line_id)
                                            else:
                                                checked_lines.discard(line_id)
                                            update_kpi_bar()
                                        cb.on_value_change(lambda e, line_id=r['id']: toggle(e.value, line_id))

                                    with ui.element('td').classes('p-3'):
                                        ui.label(w.as_date(r['entry_date']))
                                    with ui.element('td').classes('p-3 font-semibold lc-num text-slate-700'):
                                        ui.label(r['entry_no'])
                                    with ui.element('td').classes('p-3'):
                                        ui.label(f"{r['subledger_code'] or r['account_code']} — {r['subledger_name'] or r['account_name']}")
                                    with ui.element('td').classes('p-3 text-slate-600'):
                                        ui.label(r['description'] or '')
                                    with ui.element('td').classes('p-3 font-mono text-xs'):
                                        ui.label(r['reference'] or '—')
                                    with ui.element('td').classes('p-3 text-right lc-num font-semibold text-sky-800'):
                                        ui.label(w.money(r['debit'], currency) if r['debit'] else '—')
                                    with ui.element('td').classes('p-3 text-right lc-num font-semibold text-violet-800'):
                                        ui.label(w.money(r['credit'], currency) if r['credit'] else '—')

        ui.timer(0.05, refresh_matching, once=True)
    dlg.open()


