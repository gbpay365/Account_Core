"""
Automated Bank Reconciliation (Rapprochement Bancaire) & Statutory OHADA Statement.
Compliant with CEMAC banking regulations, SYSCOHADA AUDCIF, and regional banks
(Afriland First Bank, SG Cameroun, BICEC, BGFI, UBA, Ecobank, MoMo, Caisse).
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import framework, lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'balance_lbl': {'fr': 'Solde', 'en': 'Balance'},
    'progress_lbl': {'fr': 'Progression du lettrage', 'en': 'Matching Progress'},
    'diff_to_explain': {'fr': 'Écart à justifier', 'en': 'Variance to explain'},
    'btn_match_two': {'fr': 'Lettrer les 2 lignes sélectionnées', 'en': 'Match the 2 selected lines'},
    'pending_chip': {'fr': '{n} en suspens', 'en': '{n} pending'},
    'no_lines': {'fr': 'Aucune ligne dans ce relevé.', 'en': 'No transactions in this statement.'},
    'tip_unmatch': {'fr': 'Dépointer cette ligne', 'en': 'Unmatch this transaction'},
    'btn_match': {'fr': 'Pointer', 'en': 'Match'},
    'btn_selected': {'fr': 'Sélectionné', 'en': 'Selected'},
    'unmatched_chip': {'fr': '{n} non lettrées', 'en': '{n} unmatched'},
    'all_matched': {'fr': 'Toutes les écritures du Grand-Livre sont rapprochées !', 'en': 'All general ledger entries are reconciled!'},
    'ref_prefix': {'fr': 'Réf: ', 'en': 'Ref: '},
    'col_date': {'fr': 'Date', 'en': 'Date'},
    'col_ref': {'fr': 'N° Pièce / Réf', 'en': 'Ref / Entry No'},
    'col_desc': {'fr': 'Libellé de l’opération', 'en': 'Description'},
    'col_amount': {'fr': 'Montant ({c})', 'en': 'Amount ({c})'},
    'report_title': {'fr': 'ÉTAT DE RAPPROCHEMENT BANCAIRE', 'en': 'BANK RECONCILIATION STATEMENT'},
    'report_sub': {'fr': 'Conforme aux Normes OHADA / SYSCOHADA Révisé - Article 17 de l’AUDCIF', 'en': 'Compliant with OHADA / Revised SYSCOHADA - Article 17 AUDCIF'},
    'report_sub_ifrs': {'fr': 'Conforme aux Normes Internationales IFRS / IAS 7 Gestion de Trésorerie', 'en': 'Compliant with International Standards IFRS / IAS 7 Cash Management'},
    'report_bank_hdr': {'fr': 'Banque : {b} ({n}) — N° Compte : {acct}', 'en': 'Bank: {b} ({n}) — Account No: {acct}'},
    'report_period_close': {'fr': 'Période close au : {d}', 'en': 'Period closed as of: {d}'},
    'report_stmt_no': {'fr': 'Relevé N° : {no}', 'en': 'Statement No: {no}'},
    'report_gl_code': {'fr': 'Compte Grand-Livre : {gl}', 'en': 'GL Account: {gl}'},
    'sec1_title': {'fr': '1. POSITION DU RELEVÉ BANCAIRE (EXTRAIT DE COMPTE)', 'en': '1. BANK STATEMENT POSITION'},
    'sec1_stmt_close': {'fr': 'Solde du relevé bancaire à la clôture', 'en': 'Bank statement closing balance'},
    'sec1_deposits': {'fr': '(+) Dépôts et remises en attente (enregistrés en compta, non encore au relevé)', 'en': '(+) Outstanding deposits (recorded in book, pending on statement)'},
    'sec1_cheques': {'fr': '(-) Chèques et virements émis non encore débités par la banque', 'en': '(-) Outstanding cheques and payments not yet debited'},
    'sec1_adj_bank': {'fr': '(=) SOLDE THÉORIQUE BANCAIRE AJUSTÉ', 'en': '(=) ADJUSTED BANK BALANCE'},
    'sec2_title': {'fr': '2. POSITION DU GRAND-LIVRE DE L’ENTREPRISE (COMPTE 521)', 'en': '2. GENERAL LEDGER BOOK POSITION (ACCOUNT 521)'},
    'sec2_title_ifrs': {'fr': '2. POSITION DU GRAND-LIVRE (COMPTE 1900 / TRÉSORERIE)', 'en': '2. GENERAL LEDGER BOOK POSITION (ACCOUNT 1900 / CASH)'},
    'sec2_book_close': {'fr': 'Solde débiteur du compte banque en comptabilité à la même date', 'en': 'Book balance of bank account as of same date'},
    'sec2_credits': {'fr': '(+) Virements et encaissements figurant au relevé non encore comptabilisés', 'en': '(+) Unrecorded statement receipts and direct credits'},
    'sec2_charges': {'fr': '(-) Frais, commissions et agios débités par la banque non encore enregistrés', 'en': '(-) Unrecorded bank fees, commissions, and charges'},
    'sec2_adj_book': {'fr': '(=) SOLDE COMPTABLE RECTIFIÉ DE L’ENTREPRISE', 'en': '(=) ADJUSTED BOOK BALANCE'},
    'sec3_verdict': {'fr': 'RÉSULTAT DU CONTRÔLE DE RAPPROCHEMENT', 'en': 'RECONCILIATION AUDIT VERDICT'},
    'sec3_balanced': {'fr': 'Concordance parfaite des soldes rectifiés', 'en': 'Perfect reconciliation match'},
    'sec3_discrepancy': {'fr': 'Écart de rapprochement subsistant — Investigation requise', 'en': 'Reconciliation discrepancy remaining — Investigation required'},
    'sec3_variance': {'fr': 'ÉCART : {amt}', 'en': 'VARIANCE: {amt}'},
    'sig_treasury': {'fr': 'Le Responsable de Trésorerie', 'en': 'Treasury / Cash Officer'},
    'sig_treasury_sub': {'fr': '(Date et signature)', 'en': '(Date and signature)'},
    'sig_accountant': {'fr': 'Le Chef Comptable', 'en': 'Chief Accountant'},
    'sig_accountant_sub': {'fr': '(Date et visa)', 'en': '(Date and visa)'},
    'sig_cfo': {'fr': 'Le Directeur Financier', 'en': 'Chief Financial Officer'},
    'sig_cfo_sub': {'fr': '(Approbation finale)', 'en': '(Final approval)'},
    'post_charge_no_lines': {'fr': 'Aucune ligne de frais non rapprochée trouvée dans ce relevé.', 'en': 'No uncredited fee transactions found in this statement.'},
    'post_charge_btn_close': {'fr': 'Fermer', 'en': 'Close'},
    'post_charge_lbl_select': {'fr': 'Sélectionner l’opération du relevé', 'en': 'Select statement line'},
    'post_charge_btn_submit': {'fr': 'Comptabiliser & Pointer', 'en': 'Post & Reconcile'},
    'import_lbl_stmt_no': {'fr': 'N° du relevé', 'en': 'Statement number'},
    'import_lbl_start': {'fr': 'Date début', 'en': 'Start date'},
    'import_lbl_end': {'fr': 'Date fin', 'en': 'End date'},
    'import_lbl_open': {'fr': 'Solde initial (XAF)', 'en': 'Opening balance (XAF)'},
    'import_lbl_close': {'fr': 'Solde final (XAF)', 'en': 'Closing balance (XAF)'},
    'import_lbl_raw': {'fr': 'Lignes d’opérations à importer (Simulation CSV / Saisie rapide) :', 'en': 'Transaction lines to import (CSV simulation / Quick entry):'},
    'import_lbl_format': {'fr': 'Format : AAAA-MM-JJ ; Libellé ; Réf/Chèque ; Montant (+ crédit / - débit) ; Tiers', 'en': 'Format : YYYY-MM-DD ; Description ; Ref/Cheque ; Amount (+ credit / - debit) ; Partner'},
    'import_btn_submit': {'fr': 'Importer le relevé', 'en': 'Import Statement'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        text = entry.get(cur, entry.get('en', ''))
    else:
        text = t(key)
    return text.format(**kwargs) if kwargs else text


@page('/bank-reconciliation', title='Bank reconciliation', permissions=('journal.view',))
async def bank_reconciliation_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')
    accounts_res = await api.safe(api.get('/bank/accounts'), notify=False) or {'rows': []}
    bank_accounts = accounts_res.get('rows', [])

    selected_account_id = bank_accounts[0]['id'] if bank_accounts else None

    state = {
        'account_id': selected_account_id,
        'statement_id': None,
        'selected_stmt_line': None,
        'selected_ledger_line': None,
    }

    statements = []
    if selected_account_id:
        stmts_res = await api.safe(api.get(f'/bank/accounts/{selected_account_id}/statements'), notify=False) or {'rows': []}
        statements = stmts_res.get('rows', [])
        if statements:
            state['statement_id'] = statements[0]['id']

    def actions() -> None:
        ui.button(t('bank_rec.import_btn'), icon='upload_file', on_click=lambda: _import_modal(state['account_id'], reload_all)).props('unelevated size=sm')

    with ui.element('div').classes('w-full lc-no-print'):
        w.page_header(
            t('bank_rec.title'),
            t('bank_rec.subtitle'),
            actions=actions,
            emoji=chrome.PAGE.get('bank_rec.title', '🏦')
        )

    content = ui.column().classes('w-full gap-4')

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_acct_id = state['account_id']
        if not curr_acct_id:
            ui.label(t('bank_rec.no_stmt')).classes('text-slate-500 italic p-6')
            return

        acct_data = await api.safe(api.get(f'/bank/accounts/{curr_acct_id}'), notify=False) or {}
        stmts_res = await api.safe(api.get(f'/bank/accounts/{curr_acct_id}/statements'), notify=False) or {'rows': []}
        curr_statements = stmts_res.get('rows', [])

        if curr_statements and (state['statement_id'] is None or not any(s['id'] == state['statement_id'] for s in curr_statements)):
            state['statement_id'] = curr_statements[0]['id']

        curr_stmt_id = state['statement_id']

        stmt_data = None
        report_data = None
        ledger_lines = []

        if curr_stmt_id:
            stmt_data = await api.safe(api.get(f'/bank/statements/{curr_stmt_id}/lines'), notify=False) or {'lines': []}
            report_data = await api.safe(api.get(f'/bank/accounts/{curr_acct_id}/statements/{curr_stmt_id}/reconciliation-report'), notify=False) or {}
            ledger_res = await api.safe(api.get(f'/bank/accounts/{curr_acct_id}/unreconciled-ledger'), notify=False) or {'rows': []}
            ledger_lines = ledger_res.get('rows', [])

        # 1. Top Controls Bar: Bank Account Selector & Statement Selector
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm lc-no-print'):
            with ui.row().classes('items-center gap-4 flex-wrap'):
                acct_options = {ba['id']: f"{ba['code']} - {ba['name']} ({ba.get('gl_account_code', '')})" for ba in bank_accounts}
                async def on_acct_change(e):
                    state['account_id'] = e.value
                    state['statement_id'] = None
                    state['selected_stmt_line'] = None
                    state['selected_ledger_line'] = None
                    await reload_all()

                ui.select(
                    acct_options,
                    value=curr_acct_id,
                    on_change=on_acct_change,
                    label=t('bank_rec.accounts')
                ).props('outlined dense options-dense').classes('w-80')

                if curr_statements:
                    stmt_options = {s['id']: f"{s['statement_number']} ({s['statement_date']}) - {_loc('balance_lbl')}: {w.money(s['closing_balance'], currency)}" for s in curr_statements}
                    async def on_stmt_change(e):
                        state['statement_id'] = e.value
                        state['selected_stmt_line'] = None
                        state['selected_ledger_line'] = None
                        await reload_all()

                    ui.select(
                        stmt_options,
                        value=curr_stmt_id,
                        on_change=on_stmt_change,
                        label=t('bank_rec.statement')
                    ).props('outlined dense options-dense').classes('w-96')

            with ui.row().classes('items-center gap-2'):
                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Key Metrics Strip
        if report_data and curr_stmt_id:
            stmt_bal = report_data.get('statement_closing_balance', 0)
            ledger_bal = report_data.get('ledger_closing_balance', 0)
            discrepancy = report_data.get('discrepancy', 0)
            is_balanced = report_data.get('is_balanced', False)

            lines_list = stmt_data.get('lines', []) if stmt_data else []
            reconciled_cnt = sum(1 for l in lines_list if l.get('reconciled'))
            total_cnt = len(lines_list)
            pct = int((reconciled_cnt / total_cnt) * 100) if total_cnt > 0 else 0

            with ui.grid(columns=4).classes('w-full gap-4 lc-no-print'):
                with ui.card().classes('p-4 border-l-4 border-indigo-500 shadow-sm'):
                    ui.label(t('bank_rec.stmt_closing')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                    ui.label(f"{w.money(stmt_bal, currency)} {currency}").classes('text-xl font-bold text-slate-800')
                    ui.label(f"Date: {stmt_data.get('statement', {}).get('statement_date', '')}").classes('text-xs text-slate-400')

                with ui.card().classes('p-4 border-l-4 border-blue-500 shadow-sm'):
                    ui.label(t('bank_rec.ledger_closing')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                    ui.label(f"{w.money(ledger_bal, currency)} {currency}").classes('text-xl font-bold text-slate-800')
                    gl_prefix = 'Compte OHADA' if framework() == 'ohada' else 'GL Account'
                    ui.label(f"{gl_prefix}: {acct_data.get('gl_account_code', '5211')}").classes('text-xs text-slate-400')

                tone = 'border-emerald-500 text-emerald-700 bg-emerald-50/30' if is_balanced else 'border-rose-500 text-rose-700 bg-rose-50/30'
                with ui.card().classes(f'p-4 border-l-4 {tone} shadow-sm'):
                    ui.label(t('bank_rec.discrepancy')).classes('text-xs uppercase tracking-wider font-semibold')
                    ui.label(f"{w.money(discrepancy, currency)} {currency}").classes('text-xl font-bold')
                    with ui.row().classes('items-center gap-1'):
                        ui.icon('verified' if is_balanced else 'warning', size='16px')
                        ui.label(t('bank_rec.balanced') if is_balanced else _loc('diff_to_explain')).classes('text-xs font-medium')

                with ui.card().classes('p-4 border-l-4 border-teal-500 shadow-sm'):
                    ui.label(_loc('progress_lbl')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                    ui.label(f"{pct}% ({reconciled_cnt} / {total_cnt})").classes('text-xl font-bold text-slate-800')
                    ui.linear_progress(value=pct / 100, show_value=False).props('color=teal stripe rounded').classes('h-2 mt-1')

        # 3. Action Toolbar (Auto-match, Post charges, Manual matching banner)
        if curr_stmt_id:
            stmt_lines_all = stmt_data.get('lines', []) if stmt_data else []
            sel_stmt = next((l for l in stmt_lines_all if l['id'] == state['selected_stmt_line']), None) if state['selected_stmt_line'] else None
            sel_ledger = next((jl for jl in ledger_lines if jl['journal_line_id'] == state['selected_ledger_line']), None) if state['selected_ledger_line'] else None

            with ui.column().classes('w-full gap-2 lc-no-print'):
                with ui.row().classes('w-full items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200'):
                    with ui.row().classes('items-center gap-3'):
                        async def do_auto_reconcile():
                            res = await api.safe(api.post(f'/bank/statements/{curr_stmt_id}/auto-reconcile', {}))
                            if res:
                                cnt = res.get('matchedCount', 0)
                                amt = w.money(res.get('matchedAmount', 0), currency)
                                ui.notify(t('bank_rec.auto_success', count=cnt, amount=amt), type='positive', position='top')
                                await reload_all()

                        ui.button(
                            t('bank_rec.auto_match_btn'),
                            icon='auto_fix_high',
                            on_click=do_auto_reconcile
                        ).props('unelevated color=primary size=sm').tooltip(t('bank_rec.auto_match_tip'))

                        ui.button(
                            t('bank_rec.post_charge_btn'),
                            icon='account_balance_wallet',
                            on_click=lambda: _post_charge_modal(curr_acct_id, stmt_data.get('lines', []), reload_all)
                        ).props('outline color=slate size=sm')

                    with ui.row().classes('items-center gap-2'):
                        ui.label(t('bank_rec.rule_summary')).classes('text-xs text-slate-500 italic hidden md:block')

                # Matching Selection Bar (shows when either line is selected)
                if sel_stmt or sel_ledger:
                    stmt_amt = float(sel_stmt['amount']) if sel_stmt else 0
                    deb = float(sel_ledger.get('debit') or 0) if sel_ledger else 0
                    cred = float(sel_ledger.get('credit') or 0) if sel_ledger else 0
                    ledger_amt = deb if deb > 0 else -cred
                    diff = abs(stmt_amt - ledger_amt) if (sel_stmt and sel_ledger) else None
                    is_exact_match = diff is not None and diff < 0.01

                    bar_bg = 'bg-emerald-50 border-emerald-300' if is_exact_match else ('bg-amber-50 border-amber-300' if (sel_stmt and sel_ledger) else 'bg-slate-50 border-slate-300')
                    with ui.row().classes(f'w-full items-center justify-between p-3 rounded-lg border {bar_bg} text-xs'):
                        with ui.row().classes('items-center gap-4 flex-wrap'):
                            ui.icon('compare_arrows', size='20px', color='teal')
                            if sel_stmt:
                                ui.label(f"Relevé : {w.money(stmt_amt, currency)} {currency} ({sel_stmt.get('description', '')[:25]})").classes('font-bold font-mono text-slate-800')
                            else:
                                ui.label('Sélectionner 1 ligne du relevé...').classes('italic text-slate-400')

                            ui.label('⇄').classes('font-bold text-slate-400')

                            if sel_ledger:
                                ui.label(f"Grand-Livre : {w.money(ledger_amt, currency)} {currency} ({sel_ledger.get('description', '')[:25]})").classes('font-bold font-mono text-slate-800')
                            else:
                                ui.label('Sélectionner 1 ligne du Grand-Livre...').classes('italic text-slate-400')

                            if diff is not None:
                                diff_txt = 'Concordance parfaite (0 XAF)' if is_exact_match else f"Écart : {w.money(diff, currency)} {currency}"
                                ui.chip(diff_txt, color='emerald-1' if is_exact_match else 'rose-1', text_color='emerald-9' if is_exact_match else 'rose-9').props('dense size=xs font-mono')

                        with ui.row().classes('items-center gap-2'):
                            async def clear_selection():
                                state['selected_stmt_line'] = None
                                state['selected_ledger_line'] = None
                                await reload_all()

                            ui.button(t('common.cancel'), on_click=clear_selection).props('flat size=xs')

                            if sel_stmt and sel_ledger:
                                ui.button(
                                    _loc('btn_match_two'),
                                    icon='link',
                                    on_click=_manual_match
                                ).props('unelevated color=teal size=sm')

        # 4. Tab Navigation
        with ui.tabs().classes('w-full border-b border-slate-200 mt-2 lc-no-print') as tabs:
            tab_matching = ui.tab(t('bank_rec.matching_tab'), icon='compare_arrows')
            tab_report = ui.tab(t('bank_rec.report_tab'), icon='description')

        with ui.tab_panels(tabs, value=tab_matching).classes('w-full bg-transparent p-0 pt-3'):
            # --- Panel 1: Matching Workbench ---
            with ui.tab_panel(tab_matching).classes('p-0 gap-4'):
                if not curr_stmt_id or not stmt_data:
                    ui.label(t('bank_rec.no_stmt')).classes('text-slate-500 p-8 italic')
                else:
                    lines = stmt_data.get('lines', [])

                    with ui.grid(columns=2).classes('w-full gap-4'):
                        # LEFT COLUMN: Bank Statement Lines
                        with ui.card().classes('p-4 border border-slate-200 shadow-sm'):
                            with ui.row().classes('w-full justify-between items-center mb-2'):
                                with ui.row().classes('items-center gap-2'):
                                    ui.icon('account_balance', color='primary')
                                    ui.label(f"{t('bank_rec.stmt_lines')} ({len(lines)})").classes('font-bold text-slate-800')
                                ui.chip(_loc('pending_chip', n=len([l for l in lines if not l.get('reconciled')])), color='amber-1', text_color='amber-9').props('dense size=sm')

                            if not lines:
                                ui.label(_loc('no_lines')).classes('text-slate-400 italic text-sm p-4')
                            else:
                                with ui.scroll_area().classes('h-[520px] w-full pr-2'):
                                    for l in lines:
                                        is_rec = bool(l.get('reconciled'))
                                        amt = float(l.get('amount') or 0)
                                        amt_color = 'text-emerald-700' if amt > 0 else 'text-slate-800 font-semibold'
                                        is_selected = state['selected_stmt_line'] == l['id']

                                        bg_cls = 'bg-teal-50 border-teal-300' if is_selected else ('bg-emerald-50/40 border-emerald-200' if is_rec else 'bg-white border-slate-200 hover:border-slate-300')

                                        with ui.row().classes(f'w-full p-2.5 mb-2 rounded-lg border {bg_cls} items-center justify-between text-xs transition-all'):
                                            with ui.column().classes('gap-0.5 flex-1'):
                                                with ui.row().classes('items-center gap-2'):
                                                    ui.label(str(l.get('line_date'))).classes('font-mono font-medium text-slate-500')
                                                    if l.get('cheque_no'):
                                                        ui.chip(f"Chq: {l['cheque_no']}", color='indigo-1', text_color='indigo-8').props('dense size=xs')
                                                    if is_rec:
                                                        ui.chip(t('bank_rec.matched'), icon='check_circle', color='emerald-1', text_color='emerald-8').props('dense size=xs')

                                                ui.label(l.get('description', '')).classes('font-medium text-slate-700 text-sm truncate max-w-[280px]')
                                                if l.get('partner_name'):
                                                    ui.label(f"Tiers: {l['partner_name']}").classes('text-slate-400')

                                            with ui.column().classes('items-end gap-1'):
                                                ui.label(f"{w.money(amt, currency)} {currency}").classes(f'font-mono font-bold text-sm {amt_color}')

                                                with ui.row().classes('items-center gap-1'):
                                                    if is_rec:
                                                        async def do_unrec(lid=l['id']):
                                                            await api.safe(api.post(f'/bank/statement-lines/{lid}/unreconcile', {}))
                                                            ui.notify(t('bank_rec.unrec_success'), type='info')
                                                            await reload_all()

                                                        ui.button(icon='link_off', on_click=lambda lid=l['id']: do_unrec(lid)).props('flat round size=xs text-color=rose').tooltip(_loc('tip_unmatch'))
                                                    else:
                                                        async def select_stmt_line(lid=l['id']):
                                                            state['selected_stmt_line'] = None if state['selected_stmt_line'] == lid else lid
                                                            await reload_all()

                                                        ui.button(
                                                            _loc('btn_match') if not is_selected else _loc('btn_selected'),
                                                            icon='radio_button_checked' if is_selected else 'radio_button_unchecked',
                                                            on_click=lambda lid=l['id']: select_stmt_line(lid)
                                                        ).props(f"{'unelevated color=teal' if is_selected else 'flat color=primary'} size=xs")

                        # RIGHT COLUMN: General Ledger Lines
                        with ui.card().classes('p-4 border border-slate-200 shadow-sm'):
                            with ui.row().classes('w-full justify-between items-center mb-2'):
                                with ui.row().classes('items-center gap-2'):
                                    ui.icon('menu_book', color='teal')
                                    ui.label(f"{t('bank_rec.ledger_lines')} ({len(ledger_lines)})").classes('font-bold text-slate-800')
                                ui.chip(_loc('unmatched_chip', n=len(ledger_lines)), color='blue-1', text_color='blue-9').props('dense size=sm')

                            if not ledger_lines:
                                ui.label(_loc('all_matched')).classes('text-emerald-700 italic text-sm p-4')
                            else:
                                with ui.scroll_area().classes('h-[520px] w-full pr-2'):
                                    for jl in ledger_lines:
                                        deb = float(jl.get('debit') or 0)
                                        cred = float(jl.get('credit') or 0)
                                        net = deb if deb > 0 else -cred
                                        net_color = 'text-emerald-700' if net > 0 else 'text-slate-800 font-semibold'
                                        is_selected = state['selected_ledger_line'] == jl['journal_line_id']

                                        bg_cls = 'bg-teal-50 border-teal-300' if is_selected else 'bg-white border-slate-200 hover:border-slate-300'

                                        with ui.row().classes(f'w-full p-2.5 mb-2 rounded-lg border {bg_cls} items-center justify-between text-xs transition-all'):
                                            with ui.column().classes('gap-0.5 flex-1'):
                                                with ui.row().classes('items-center gap-2'):
                                                    ui.label(str(jl.get('entry_date'))).classes('font-mono font-medium text-slate-500')
                                                    ui.chip(jl.get('entry_no', ''), color='slate-2', text_color='slate-8').props('dense size=xs font-mono')
                                                    if jl.get('reference'):
                                                        ui.label(f"{_loc('ref_prefix')}{jl['reference']}").classes('text-slate-400')

                                                ui.label(jl.get('description', '')).classes('font-medium text-slate-700 text-sm truncate max-w-[280px]')

                                            with ui.column().classes('items-end gap-1'):
                                                ui.label(f"{w.money(net, currency)} {currency}").classes(f'font-mono font-bold text-sm {net_color}')

                                                async def select_ledger_line(ljid=jl['journal_line_id']):
                                                    state['selected_ledger_line'] = None if state['selected_ledger_line'] == ljid else ljid
                                                    await reload_all()

                                                ui.button(
                                                    _loc('btn_match') if not is_selected else _loc('btn_selected'),
                                                    icon='radio_button_checked' if is_selected else 'radio_button_unchecked',
                                                    on_click=lambda ljid=jl['journal_line_id']: select_ledger_line(ljid)
                                                ).props(f"{'unelevated color=teal' if is_selected else 'flat color=primary'} size=xs")

            # --- Panel 2: Statutory OHADA Reconciliation Statement ---
            with ui.tab_panel(tab_report).classes('p-0'):
                if report_data:
                    _render_statutory_report(report_data, currency)

    def _check_match_button(btn) -> None:
        can_match = bool(state['selected_stmt_line'] and state['selected_ledger_line'])
        btn.set_visibility(can_match)

    async def _manual_match() -> None:
        if not state['selected_stmt_line'] or not state['selected_ledger_line']:
            return
        payload = {
            'statement_line_id': state['selected_stmt_line'],
            'journal_line_id': state['selected_ledger_line'],
        }
        res = await api.safe(api.post('/bank/reconcile-manual', payload))
        if res:
            ui.notify(t('bank_rec.manual_success'), type='positive')
            state['selected_stmt_line'] = None
            state['selected_ledger_line'] = None
            await reload_all()

    # Initial render
    await render_view()


def _render_statutory_report(report: dict, currency: str) -> None:
    ba = report.get('bank_account', {})
    stmt = report.get('statement', {})
    stmt_bal = report.get('statement_closing_balance', 0)
    ledger_bal = report.get('ledger_closing_balance', 0)
    cheques = report.get('outstanding_cheques', [])
    cheques_tot = report.get('outstanding_cheques_total', 0)
    deposits = report.get('outstanding_deposits', [])
    deposits_tot = report.get('outstanding_deposits_total', 0)
    charges = report.get('unrecorded_charges', [])
    charges_tot = report.get('unrecorded_charges_total', 0)
    credits = report.get('unrecorded_credits', [])
    credits_tot = report.get('unrecorded_credits_total', 0)
    adj_bank = report.get('adjusted_bank_balance', 0)
    adj_book = report.get('adjusted_book_balance', 0)
    discrepancy = report.get('discrepancy', 0)
    is_balanced = report.get('is_balanced', False)

    def _render_line_table(items: list, amt_key: str, curr: str) -> None:
        if not items:
            return
        with ui.column().classes('w-full py-1 gap-0 text-xs'):
            with ui.row().classes('w-full items-center py-1 px-2 border-b-2 border-slate-300 font-bold text-slate-600 uppercase tracking-wider text-[11px] no-wrap bg-slate-50 print-avoid-break'):
                ui.label(_loc('col_date')).classes('w-24 shrink-0 font-sans')
                ui.label(_loc('col_ref')).classes('w-32 shrink-0 font-sans')
                ui.label(_loc('col_desc')).classes('flex-1 min-w-0 font-sans')
                ui.label(_loc('col_amount', c=curr)).classes('w-36 shrink-0 text-right font-sans')

            for it in items:
                date_val = str(it.get('line_date') or it.get('entry_date') or '')
                ref_val = str(it.get('entry_no') or it.get('cheque_no') or it.get('reference') or '—')
                desc_val = str(it.get('description') or '')
                amt_val = float(it.get(amt_key) or 0)

                with ui.row().classes('w-full items-center py-1 px-2 border-b border-slate-200 no-wrap hover:bg-slate-50/80 print-avoid-break'):
                    ui.label(date_val).classes('w-24 shrink-0 font-mono text-slate-600')
                    ui.label(ref_val).classes('w-32 shrink-0 font-mono font-medium text-slate-800 truncate')
                    ui.label(desc_val).classes('flex-1 min-w-0 text-slate-800 truncate font-sans text-xs')
                    ui.label(w.money(amt_val, curr)).classes('w-36 shrink-0 text-right font-mono font-bold text-slate-900')

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-md rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        # Official Header
        with ui.row().classes('w-full justify-between items-start no-wrap border-b-2 border-slate-900 pb-3 mb-4 gap-4 print-avoid-break'):
            with ui.column().classes('gap-1 flex-1 min-w-0'):
                ui.label(_loc('report_title')).classes('text-2xl font-black text-slate-900 tracking-tight')
                sub_key = 'report_sub_ifrs' if framework() == 'ifrs' else 'report_sub'
                ui.label(_loc(sub_key)).classes('text-xs text-slate-500 uppercase tracking-widest font-semibold')
                ui.label(_loc('report_bank_hdr', b=ba.get('bank_name', ''), n=ba.get('name', ''), acct=ba.get('account_number', ''))).classes('text-sm font-semibold text-slate-700 mt-1')

            with ui.column().classes('items-end shrink-0 gap-0.5 text-right'):
                ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print mb-1')
                ui.label(_loc('report_period_close', d=stmt.get('end_date', ''))).classes('text-sm font-bold text-slate-800')
                ui.label(_loc('report_stmt_no', no=stmt.get('statement_number', ''))).classes('text-xs font-mono text-slate-600')
                gl_code = '1900 (Cash)' if framework() == 'ifrs' else ba.get('gl_code', '5211')
                ui.label(_loc('report_gl_code', gl=gl_code)).classes('text-xs font-mono text-slate-600')

        # Section 1: Statement to Book
        with ui.column().classes('w-full mb-6 gap-2'):
            with ui.column().classes('w-full gap-2 print-avoid-break'):
                ui.label(_loc('sec1_title')).classes('text-sm font-bold text-slate-900 uppercase tracking-wider bg-slate-100 px-3 py-2 rounded border border-slate-200')

                with ui.row().classes('w-full justify-between items-center px-2 py-1.5 text-sm border-b border-slate-200 no-wrap'):
                    ui.label(_loc('sec1_stmt_close')).classes('font-semibold text-slate-800')
                    ui.label(f"{w.money(stmt_bal, currency)} {currency}").classes('font-mono font-bold text-slate-900 w-36 text-right shrink-0')

            # Deposits in transit (+)
            with ui.row().classes('w-full justify-between items-center px-2 py-1 text-sm bg-emerald-50/70 border border-emerald-200 rounded no-wrap mt-1 print-avoid-break'):
                ui.label(_loc('sec1_deposits')).classes('text-emerald-900 font-semibold')
                ui.label(f"+ {w.money(deposits_tot, currency)} {currency}").classes('font-mono font-bold text-emerald-800 w-36 text-right shrink-0')

            _render_line_table(deposits, 'amount', currency)

            # Outstanding cheques (-)
            with ui.row().classes('w-full justify-between items-center px-2 py-1 text-sm bg-rose-50/70 border border-rose-200 rounded no-wrap mt-2 print-avoid-break'):
                ui.label(_loc('sec1_cheques')).classes('text-rose-900 font-semibold')
                ui.label(f"- {w.money(cheques_tot, currency)} {currency}").classes('font-mono font-bold text-rose-800 w-36 text-right shrink-0')

            _render_line_table(cheques, 'amount', currency)

            with ui.row().classes('w-full justify-between items-center px-3 py-2 text-base font-bold bg-slate-800 text-white rounded mt-2 no-wrap print-avoid-break'):
                ui.label(_loc('sec1_adj_bank')).classes('tracking-wide text-sm font-black')
                ui.label(f"{w.money(adj_bank, currency)} {currency}").classes('font-mono text-base font-black w-36 text-right shrink-0')

        # Section 2: Book to Statement
        with ui.column().classes('w-full mb-6 gap-2'):
            with ui.column().classes('w-full gap-2 print-avoid-break'):
                sec2_key = 'sec2_title_ifrs' if framework() == 'ifrs' else 'sec2_title'
                ui.label(_loc(sec2_key)).classes('text-sm font-bold text-slate-900 uppercase tracking-wider bg-slate-100 px-3 py-2 rounded border border-slate-200')

                with ui.row().classes('w-full justify-between items-center px-2 py-1.5 text-sm border-b border-slate-200 no-wrap'):
                    ui.label(_loc('sec2_book_close')).classes('font-semibold text-slate-800')
                    ui.label(f"{w.money(ledger_bal, currency)} {currency}").classes('font-mono font-bold text-slate-900 w-36 text-right shrink-0')

            # Unrecorded credits (+)
            with ui.row().classes('w-full justify-between items-center px-2 py-1 text-sm bg-emerald-50/70 border border-emerald-200 rounded no-wrap mt-1 print-avoid-break'):
                ui.label(_loc('sec2_credits')).classes('text-emerald-900 font-semibold')
                ui.label(f"+ {w.money(credits_tot, currency)} {currency}").classes('font-mono font-bold text-emerald-800 w-36 text-right shrink-0')

            _render_line_table(credits, 'amount', currency)

            # Unrecorded charges (-)
            with ui.row().classes('w-full justify-between items-center px-2 py-1 text-sm bg-rose-50/70 border border-rose-200 rounded no-wrap mt-2 print-avoid-break'):
                ui.label(_loc('sec2_charges')).classes('text-rose-900 font-semibold')
                ui.label(f"- {w.money(charges_tot, currency)} {currency}").classes('font-mono font-bold text-rose-800 w-36 text-right shrink-0')

            _render_line_table(charges, 'amount', currency)

            with ui.row().classes('w-full justify-between items-center px-3 py-2 text-base font-bold bg-slate-800 text-white rounded mt-2 no-wrap print-avoid-break'):
                ui.label(_loc('sec2_adj_book')).classes('tracking-wide text-sm font-black')
                ui.label(f"{w.money(adj_book, currency)} {currency}").classes('font-mono text-base font-black w-36 text-right shrink-0')

        # Section 3: Reconciliation Discrepancy
        with ui.row().classes('w-full justify-between items-center p-4 rounded-xl border-2 no-wrap print-avoid-break ' + ('border-emerald-600 bg-emerald-50' if is_balanced else 'border-rose-600 bg-rose-50')):
            with ui.row().classes('items-center gap-3 no-wrap'):
                ui.icon('verified' if is_balanced else 'warning', size='28px', color='emerald' if is_balanced else 'rose')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('sec3_verdict')).classes('font-black text-sm text-slate-900 uppercase')
                    ui.label(_loc('sec3_balanced') if is_balanced else _loc('sec3_discrepancy')).classes('text-xs text-slate-600')

            with ui.column().classes('items-end gap-0 shrink-0 text-right'):
                ui.label(_loc('sec3_variance', amt=f"{w.money(discrepancy, currency)} {currency}")).classes('font-mono text-lg font-black ' + ('text-emerald-800' if is_balanced else 'text-rose-800'))

        # Signatures
        with ui.grid(columns=3).classes('w-full gap-8 mt-12 pt-8 border-t border-slate-300 text-center text-xs print-avoid-break'):
            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_treasury')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_treasury_sub')).classes('text-slate-400 italic')

            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_accountant')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_accountant_sub')).classes('text-slate-400 italic')

            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_cfo')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_cfo_sub')).classes('text-slate-400 italic')



def _post_charge_modal(bank_account_id: int, lines: list, on_success: callable) -> None:
    charge_candidates = [l for l in lines if not l.get('reconciled') and float(l.get('amount') or 0) < 0]

    with ui.dialog() as dlg, ui.card().classes('w-[520px] p-6 gap-4'):
        w.modal_header(t('bank_rec.post_charge_title'), emoji='💸')

        if not charge_candidates:
            ui.label(_loc('post_charge_no_lines')).classes('text-slate-500 italic')
            ui.button(_loc('post_charge_btn_close'), on_click=dlg.close).props('flat')
            dlg.open()
            return

        stmt_line_options = {
            l['id']: f"{l['line_date']} | {abs(float(l['amount'])):,.0f} XAF | {l['description'][:40]}"
            for l in charge_candidates
        }

        selected_line_id = charge_candidates[0]['id']

        stmt_select = ui.select(stmt_line_options, value=selected_line_id, label=_loc('post_charge_lbl_select')).props('outlined dense').classes('w-full')
        amount_input = ui.number(label=t('bank_rec.charge_amount'), value=abs(float(charge_candidates[0]['amount'])), format='%.0f').props('outlined dense').classes('w-full')
        desc_input = ui.input(label=t('bank_rec.charge_desc'), value=charge_candidates[0]['description']).props('outlined dense').classes('w-full')
        tva_check = ui.checkbox(t('bank_rec.charge_has_tva'), value=False)

        def on_line_picked(e):
            picked = next((l for l in charge_candidates if l['id'] == e.value), None)
            if picked:
                amount_input.value = abs(float(picked['amount']))
                desc_input.value = picked['description']

        stmt_select.on_value_change(on_line_picked)

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_post():
                payload = {
                    'statementLineId': stmt_select.value,
                    'amount': amount_input.value,
                    'description': desc_input.value,
                    'hasTva': tva_check.value,
                }
                res = await api.safe(api.post(f'/bank/accounts/{bank_account_id}/post-charge', payload))
                if res:
                    ui.notify(t('bank_rec.post_success'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('post_charge_btn_submit'), icon='check', on_click=do_post).props('unelevated color=primary')

    dlg.open()


def _import_modal(bank_account_id: int, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[600px] p-6 gap-4'):
        w.modal_header(t('bank_rec.import_btn'), emoji='📥')

        stmt_no = ui.input(label=_loc('import_lbl_stmt_no'), value='STMT-AFB-2026-11').props('outlined dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            d_start = ui.input(label=_loc('import_lbl_start'), value='2026-11-01').props('outlined dense')
            d_end = ui.input(label=_loc('import_lbl_end'), value='2026-11-30').props('outlined dense')

        with ui.grid(columns=2).classes('w-full gap-3'):
            bal_open = ui.number(label=_loc('import_lbl_open'), value=1516665735, format='%.0f').props('outlined dense')
            bal_close = ui.number(label=_loc('import_lbl_close'), value=1542165735, format='%.0f').props('outlined dense')

        ui.label(_loc('import_lbl_raw')).classes('text-xs font-semibold text-slate-700 mt-2')

        sample_lines_raw = (
            "2026-11-02;Règlement facture fournitures médicales;CHQ-55101;-12500000;Siemens Healthineers\n"
            "2026-11-08;Encaissement virement subvention Minfi;VIR-MINFI-11;38000000;Trésor Public\n"
            "2026-11-15;Frais de tenue de compte Afriland;AGIOS-11;-250000;Afriland First Bank"
        )
        lines_input = ui.textarea(value=sample_lines_raw).props('outlined rows=5').classes('w-full font-mono text-xs')
        ui.label(_loc('import_lbl_format')).classes('text-xs text-slate-400')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_import():
                parsed_lines = []
                for line in lines_input.value.strip().split('\n'):
                    parts = [p.strip() for p in line.split(';')]
                    if len(parts) >= 4:
                        parsed_lines.append({
                            'line_date': parts[0],
                            'description': parts[1],
                            'cheque_no': parts[2] or None,
                            'amount': float(parts[3]),
                            'partner_name': parts[4] if len(parts) > 4 else None,
                        })

                payload = {
                    'statement_number': stmt_no.value,
                    'statement_date': d_end.value,
                    'start_date': d_start.value,
                    'end_date': d_end.value,
                    'opening_balance': bal_open.value,
                    'closing_balance': bal_close.value,
                    'lines': parsed_lines,
                }

                res = await api.safe(api.post(f'/bank/accounts/{bank_account_id}/statements', payload))
                if res:
                    ui.notify(t('bank_rec.import_success', stmt=stmt_no.value, lines=len(parsed_lines)), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('import_btn_submit'), icon='upload', on_click=do_import).props('unelevated color=primary')

    dlg.open()
