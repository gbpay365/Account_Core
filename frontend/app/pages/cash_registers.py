"""
CEMAC Mobile Money Cash Registers & Daily Cashier Close (Arrêté de Caisse Journalier).
Integrates MTN Mobile Money (MoMo) and Orange Money payments with statutory SYSCOHADA
cash accounting (Accounts 5711, 5712, 5713, 5851, 6312, 6581, 7581).
"""

from __future__ import annotations

import datetime
from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {
        'en': 'Cash & Mobile Money Counters (MTN MoMo, Orange Money & Cash)',
        'fr': 'Caisse & Guichets Mobile Money (MTN MoMo, Orange Money & Espèces)',
    },
    'subtitle': {
        'en': 'Multi-channel payment collections, automated telecom commission fee accounting, and daily cash drawer reconciliation',
        'fr': 'Gestion des encaissements multi-canaux, comptabilisation automatique des commissions télécom et arrêté de caisse journalier',
    },
    'btn_momo': {'en': 'Mobile Money Payment', 'fr': 'Encaissement Mobile Money'},
    'btn_close': {'en': 'Daily Cash Drawer Close', 'fr': 'Arrêté de Caisse Journalier'},
    'no_register': {'en': 'No cash register configured.', 'fr': 'Aucune caisse configurée.'},
    'label_counter': {'en': 'Cash Desk / Counter', 'fr': 'Guichet / Caisse'},
    'label_date': {'en': 'Operating Date', 'fr': 'Date de vacation'},
    'kpi_momo': {'en': 'MTN Mobile Money (Net)', 'fr': 'MTN Mobile Money (Net)'},
    'kpi_momo_acc': {'en': 'Account 5712 (MoMo Cash)', 'fr': 'Compte 5712 (Caisse MoMo)'},
    'kpi_orange': {'en': 'Orange Money (Net)', 'fr': 'Orange Money (Net)'},
    'kpi_orange_acc': {'en': 'Account 5713 (OM Cash)', 'fr': 'Compte 5713 (Caisse OM)'},
    'kpi_fees': {'en': 'Telecom Commissions', 'fr': 'Commissions Télécom'},
    'kpi_fees_acc': {'en': 'Account 6312 (Telecom fees)', 'fr': 'Compte 6312 (Frais télécom)'},
    'kpi_total': {'en': 'Total Counter Collections', 'fr': 'Total Recettes Guichet'},
    'kpi_breakdown': {'en': 'Cash: {cash} + MoMo: {momo}', 'fr': 'Espèces : {cash} + MoMo : {momo}'},
    'tab_tx': {'en': 'Mobile Money Transactions Journal', 'fr': 'Journal des Encaissements Mobile Money'},
    'tab_pv': {'en': 'Daily Cash Close Audit Minute (PV)', 'fr': 'Procès-Verbal d’Arrêté de Caisse'},
    'panel_tx_title': {'en': 'Daily Electronic Collections', 'fr': 'Encaissements Électroniques de la Journée'},
    'panel_tx_sub': {'en': 'MTN MoMo and Orange Money transaction flows interfaced with SYSCOHADA journal entries', 'fr': 'Relevé des flux MTN Mobile Money et Orange Money interfacés avec les écritures SYSCOHADA'},
    'no_tx': {'en': 'No mobile money transaction recorded for this date.', 'fr': 'Aucune transaction mobile money enregistrée à cette date.'},
    'col_time': {'en': 'Time', 'fr': 'Heure'},
    'col_provider': {'en': 'Operator', 'fr': 'Opérateur'},
    'col_ref': {'en': 'Telecom Ref', 'fr': 'Réf. Télécom'},
    'col_phone': {'en': 'Customer Phone', 'fr': 'Téléphone Client'},
    'col_patient': {'en': 'Patient / File', 'fr': 'Patient / Dossier'},
    'col_gross': {'en': 'Gross Amount', 'fr': 'Montant Brut'},
    'col_fee': {'en': 'Telecom Fee', 'fr': 'Frais Télécom'},
    'col_net': {'en': 'Net Received', 'fr': 'Net Reçu Caisse'},
    'col_entry': {'en': 'Cash Voucher', 'fr': 'Écriture Caisse'},
    'pv_title': {'en': 'DAILY CASH CLOSE AUDIT MINUTE (PV)', 'fr': 'PROCÈS-VERBAL D’ARRÊTÉ DE CAISSE JOURNALIER'},
    'pv_sub': {'en': 'Physical Cash Counting & Electronic Flow Reconciliation (OHADA)', 'fr': 'Rapprochement Physique des Espèces & Clôture des Flux Mobile Money (OHADA)'},
    'pv_counter': {'en': 'Cash Desk: {code} — {name}', 'fr': 'Guichet : {code} — {name}'},
    'pv_date': {'en': 'Closing Date: {date}', 'fr': 'Date d’arrêté : {date}'},
    'pv_closed': {'en': 'Closed & Posted to General Ledger', 'fr': 'Arrêté Clôturé & Comptabilisé'},
    'pv_draft': {'en': 'Not Closed (Draft)', 'fr': 'Arrêté Non Réalisé (Brouillon)'},
    'pv_sec1': {'en': '1. PHYSICAL CASH COUNTING (NOTES & COINS)', 'fr': '1. COMPTAGE PHYSIQUE DES ESPÈCES (BILLETS & PIÈCES)'},
    'pv_sec2': {'en': '2. CERTIFIED MTN MOBILE MONEY COLLECTIONS', 'fr': '2. ENCAISSEMENTS CERTIFIÉS MTN MOBILE MONEY'},
    'pv_sec3': {'en': '3. CERTIFIED ORANGE MONEY COLLECTIONS', 'fr': '3. ENCAISSEMENTS CERTIFIÉS ORANGE MONEY'},
    'pv_total': {'en': 'GRAND TOTAL DAILY COLLECTIONS (1 + 2 + 3)', 'fr': 'TOTAL GÉNÉRAL DES RECETTES DU JOUR (1 + 2 + 3)'},
    'pv_var_title': {'en': 'Cash Variance Control', 'fr': 'Contrôle des Écarts de Caisse'},
    'pv_exp_cash': {'en': 'Expected Book Cash: {val}', 'fr': 'Espèces théoriques attendues : {val}'},
    'pv_act_cash': {'en': 'Actual Counted Cash: {val}', 'fr': 'Espèces physiques constatées : {val}'},
    'pv_var_val': {'en': 'Cash Variance: {val}', 'fr': 'Écart de caisse : {val}'},
    'pv_compliant': {'en': 'Compliant / Zero variance', 'fr': 'Conforme / Aucun écart'},
    'pv_deficit': {'en': 'Deficit charged to Account 6581', 'fr': 'Déficit imputé au compte 6581'},
    'pv_surplus': {'en': 'Surplus credited to Account 7581', 'fr': 'Excédent crédité au compte 7581'},
    'pv_bank_title': {'en': 'Bank Cash Deposit Slip', 'fr': 'Versement des Espèces en Banque'},
    'pv_bank_amt': {'en': 'Amount Deposited: {val}', 'fr': 'Montant versé sous bordereau : {val}'},
    'pv_bank_ref': {'en': 'Slip Ref: {ref}', 'fr': 'Réf. bordereau : {ref}'},
    'pv_bank_entry': {'en': 'Internal transit entry generated (5851 -> 5211)', 'fr': 'Écriture de virement interne générée (5851 -> 5211)'},
    'sig_cashier': {'en': 'Head Cashier', 'fr': 'Le Caissier Titulaire'},
    'sig_cashier_sub': {'en': '(Physical counting & fund handover)', 'fr': '(Arrêté physique et remise des fonds)'},
    'sig_chief': {'en': 'Chief Accountant / Treasurer', 'fr': 'Le Chef Comptable / Caissier Principal'},
    'sig_chief_sub': {'en': '(Verification & validation)', 'fr': '(Vérification et validation)'},
    'sig_cfo': {'en': 'Finance & Administrative Director', 'fr': 'Le Directeur Administratif & Financier'},
    'sig_cfo_sub': {'en': '(General compliance visa)', 'fr': '(Visa de conformité générale)'},
    'modal_momo_title': {'en': 'Record Mobile Money Payment', 'fr': 'Enregistrer un Paiement Mobile Money'},
    'modal_momo_prov': {'en': 'Mobile Operator', 'fr': 'Opérateur Mobile'},
    'modal_momo_ref': {'en': 'Telecom Reference (e.g., MP261016.9942)', 'fr': 'ID / Référence Télécom (ex: MP261016.9942)'},
    'modal_momo_phone': {'en': 'Payer Phone Number', 'fr': 'Numéro de téléphone payeur'},
    'modal_momo_name': {'en': 'Patient / Customer Name', 'fr': 'Nom du patient / client'},
    'modal_momo_file': {'en': 'Patient File No.', 'fr': 'N° Dossier patient'},
    'modal_momo_gross': {'en': 'Amount Paid (XAF)', 'fr': 'Montant Payé (XAF)'},
    'modal_momo_fee': {'en': 'Telecom Commission (XAF)', 'fr': 'Commission Télécom (XAF)'},
    'modal_momo_btn': {'en': 'Validate and Post Entry', 'fr': 'Valider et Comptabiliser'},
    'modal_momo_saved': {'en': 'Mobile Money payment posted to Cash Journal!', 'fr': 'Paiement Mobile Money enregistré et comptabilisé au Journal Caisse !'},
    'modal_close_title': {'en': 'Perform Daily Cash Drawer Close', 'fr': 'Effectuer l’Arrêté de Caisse Journalier'},
    'modal_close_date': {'en': 'Closing Date', 'fr': 'Date de clôture'},
    'modal_close_phys': {'en': 'Physical Cash Counted (XAF)', 'fr': 'Espèces physiques comptées (XAF)'},
    'modal_close_exp': {'en': 'Expected Book Cash (XAF)', 'fr': 'Espèces théoriques attendues (XAF)'},
    'modal_close_dep': {'en': 'Bank Deposit Amount (XAF)', 'fr': 'Montant versé en banque (XAF)'},
    'modal_close_dep_ref': {'en': 'Deposit Slip Reference', 'fr': 'Réf Bordereau Versement'},
    'modal_close_notes': {'en': 'Observations (damaged notes, etc.)', 'fr': 'Observations éventuelles (billets abîmés, etc.)'},
    'modal_close_btn': {'en': 'Close Day & Generate Audit Minute (PV)', 'fr': 'Clôturer la Journée & Générer le PV'},
    'modal_close_saved': {'en': 'Daily cash close validated successfully!', 'fr': 'Arrêté de caisse journalier validé avec succès !'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        val = entry.get(cur, entry.get('en', ''))
    else:
        val = t(key)
    return val.format(**kwargs) if kwargs else val


@page('/cash-registers', title='Caisse & Mobile Money', permissions=('journal.view', 'journal.post'))
async def cash_registers_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    # Fetch cash registers
    registers_res = await api.safe(api.get('/cash-registers'), notify=False) or {'rows': []}
    registers = registers_res.get('rows', [])
    default_reg_id = registers[0]['id'] if registers else None

    state = {
        'register_id': default_reg_id,
        'date': datetime.date.today().isoformat(),
    }

    content = ui.column().classes('w-full gap-4')

    def actions() -> None:
        ui.button(
            _loc('btn_momo'),
            icon='phone_android',
            on_click=lambda: _momo_modal(state['register_id'], reload_all)
        ).props('unelevated size=sm color=primary')

        ui.button(
            _loc('btn_close'),
            icon='lock_clock',
            on_click=lambda: _close_modal(state['register_id'], state['date'], reload_all)
        ).props('outline size=sm')

    w.page_header(
        _loc('title'),
        _loc('subtitle'),
        actions=actions,
        emoji='📱'
    )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_reg_id = state['register_id']
        if not curr_reg_id:
            ui.label(_loc('no_register')).classes('text-slate-500 italic p-6')
            return

        curr_date = state['date']
        data = await api.safe(api.get(f'/cash-registers/{curr_reg_id}?date={curr_date}'), notify=False) or {}
        register = data.get('register', {})
        txs = data.get('transactions', [])
        summary = data.get('summary', {})
        daily_close = data.get('daily_close')

        # 1. Top Controls Bar: Register & Date Selectors
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm'):
            with ui.row().classes('items-center gap-4'):
                reg_opts = {r['id']: f"{r.get('code')} — {r.get('name')}" for r in registers}
                def on_reg_change(e):
                    state['register_id'] = e.value
                    reload_all()

                ui.select(reg_opts, value=curr_reg_id, on_change=on_reg_change, label=_loc('label_counter')).props('outlined dense options-dense').classes('w-80')

                def on_date_change(e):
                    state['date'] = e.value
                    reload_all()

                ui.input(value=curr_date, on_change=on_date_change, label=_loc('label_date')).props('outlined dense type=date').classes('w-44')

            with ui.row().classes('items-center gap-2'):
                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Key Metrics Strip
        tot_momo = summary.get('mtn_momo_net', 0)
        tot_orange = summary.get('orange_money_net', 0)
        tot_elect = summary.get('total_electronic_net', 0)
        tot_fees = summary.get('total_fees', 0)
        cash_counted = daily_close.get('physical_cash_counted', 0) if daily_close else 0
        tot_all = tot_elect + cash_counted

        with ui.grid(columns=4).classes('w-full gap-4'):
            with ui.card().classes('p-4 border-l-4 border-yellow-500 bg-amber-50/20 shadow-sm'):
                ui.label(_loc('kpi_momo')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_momo, currency)} {currency}").classes('text-xl font-bold text-amber-900 font-mono')
                ui.label(_loc('kpi_momo_acc')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-orange-500 bg-orange-50/20 shadow-sm'):
                ui.label(_loc('kpi_orange')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_orange, currency)} {currency}").classes('text-xl font-bold text-orange-900 font-mono')
                ui.label(_loc('kpi_orange_acc')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-indigo-500 shadow-sm'):
                ui.label(_loc('kpi_fees')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_fees, currency)} {currency}").classes('text-xl font-bold text-indigo-800 font-mono')
                ui.label(_loc('kpi_fees_acc')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-emerald-500 shadow-sm'):
                ui.label(_loc('kpi_total')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_all, currency)} {currency}").classes('text-xl font-bold text-emerald-800 font-mono')
                ui.label(_loc('kpi_breakdown', cash=w.money(cash_counted, currency), momo=w.money(tot_elect, currency))).classes('text-xs text-slate-400')

        # 3. Tab Navigation
        with ui.tabs().classes('w-full border-b border-slate-200 mt-2') as tabs:
            tab_tx = ui.tab('tab_tx', label=_loc('tab_tx'), icon='receipt')
            tab_pv = ui.tab('tab_pv', label=_loc('tab_pv'), icon='verified_user')

        with ui.tab_panels(tabs, value=tab_tx).classes('w-full bg-transparent p-0 pt-3'):
            # --- TAB 1: Transactions ---
            with ui.tab_panel(tab_tx).classes('p-0 gap-4'):
                _render_transactions_table(txs, currency)

            # --- TAB 2: Procès-Verbal ---
            with ui.tab_panel(tab_pv).classes('p-0 gap-4'):
                _render_pv_panel(register, daily_close, summary, curr_date, currency)

    await render_view()


def _render_transactions_table(txs: list, currency: str) -> None:
    with ui.card().classes('w-full p-6 bg-white border border-slate-200 rounded-xl shadow-sm'):
        with ui.row().classes('w-full justify-between items-center mb-4'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('panel_tx_title')).classes('text-base font-bold text-slate-900')
                ui.label(_loc('panel_tx_sub')).classes('text-xs text-slate-500')

        if not txs:
            ui.label(_loc('no_tx')).classes('text-slate-400 italic p-6')
            return

        formatted_txs = [
            {
                **t,
                'time_formatted': str(t.get('transaction_date', ''))[11:16],
                'gross_formatted': w.money(t.get('gross_amount', 0), currency),
                'fee_formatted': w.money(t.get('fee_amount', 0), currency),
                'net_formatted': w.money(t.get('net_amount', 0), currency),
                'provider_name': 'MTN MoMo' if t.get('provider') == 'mtn_momo' else 'Orange Money',
                'entry_formatted': t.get('entry_no') or 'Comptabilisé',
            }
            for t in txs
        ]

        columns = [
            {'name': 'time', 'label': _loc('col_time'), 'field': 'time_formatted', 'align': 'center'},
            {'name': 'provider', 'label': _loc('col_provider'), 'field': 'provider_name', 'align': 'center'},
            {'name': 'ref', 'label': _loc('col_ref'), 'field': 'telecom_ref', 'align': 'left'},
            {'name': 'phone', 'label': _loc('col_phone'), 'field': 'customer_phone', 'align': 'left'},
            {'name': 'patient', 'label': _loc('col_patient'), 'field': 'patient_name', 'align': 'left'},
            {'name': 'gross', 'label': _loc('col_gross'), 'field': 'gross_formatted', 'align': 'right'},
            {'name': 'fee', 'label': _loc('col_fee'), 'field': 'fee_formatted', 'align': 'right'},
            {'name': 'net', 'label': _loc('col_net'), 'field': 'net_formatted', 'align': 'right'},
            {'name': 'entry', 'label': _loc('col_entry'), 'field': 'entry_formatted', 'align': 'center'},
        ]

        table = ui.table(columns=columns, rows=formatted_txs, row_key='id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-provider', '''
            <q-td :props="props">
                <q-chip dense size="xs" :color="props.row.provider === 'mtn_momo' ? 'amber-2' : 'orange-2'" :text-color="props.row.provider === 'mtn_momo' ? 'amber-9' : 'orange-9'" class="font-bold">
                    {{ props.value }}
                </q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-net', '''<q-td :props="props"><span class="font-mono font-bold text-emerald-800">{{ props.value }}</span></q-td>''')


def _render_pv_panel(register: dict, daily_close: dict | None, summary: dict, date_str: str, currency: str) -> None:
    with ui.card().classes('w-full max-w-4xl mx-auto p-8 bg-white border border-slate-300 shadow-md rounded-xl print:shadow-none print:border-none'):
        # Header
        with ui.row().classes('w-full justify-between items-start border-b-2 border-slate-900 pb-4 mb-6'):
            with ui.column().classes('gap-1'):
                ui.label(_loc('pv_title')).classes('text-xl font-black text-slate-900 uppercase tracking-tight')
                ui.label(_loc('pv_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
                ui.label(_loc('pv_counter', code=register.get('code', '—'), name=register.get('name', '—'))).classes('text-sm font-bold text-slate-800')

            with ui.column().classes('items-end gap-1'):
                ui.label(_loc('pv_date', date=date_str)).classes('text-sm font-bold text-slate-900')
                if daily_close:
                    ui.chip(_loc('pv_closed'), color='emerald-1', text_color='emerald-9').props('dense font-bold')
                else:
                    ui.chip(_loc('pv_draft'), color='amber-1', text_color='amber-9').props('dense font-bold')

        # Detailed breakdown
        cash_counted = daily_close.get('physical_cash_counted', 0) if daily_close else 0
        expected_cash = daily_close.get('system_cash_expected', 0) if daily_close else 0
        variance = daily_close.get('cash_variance', 0) if daily_close else 0
        momo_val = summary.get('mtn_momo_net', 0)
        orange_val = summary.get('orange_money_net', 0)
        tot_collections = cash_counted + momo_val + orange_val
        deposit_amt = daily_close.get('bank_deposit_amount', 0) if daily_close else 0

        with ui.column().classes('w-full gap-4 text-xs font-mono'):
            with ui.row().classes('w-full justify-between items-center p-3 bg-slate-100 rounded-lg text-slate-800 font-bold'):
                ui.label(_loc('pv_sec1'))
                ui.label(f"{w.money(cash_counted, currency)} {currency}").classes('text-sm font-black')

            with ui.row().classes('w-full justify-between items-center p-3 bg-slate-100 rounded-lg text-slate-800 font-bold'):
                ui.label(_loc('pv_sec2'))
                ui.label(f"{w.money(momo_val, currency)} {currency}").classes('text-sm font-black text-amber-900')

            with ui.row().classes('w-full justify-between items-center p-3 bg-slate-100 rounded-lg text-slate-800 font-bold'):
                ui.label(_loc('pv_sec3'))
                ui.label(f"{w.money(orange_val, currency)} {currency}").classes('text-sm font-black text-orange-900')

            with ui.row().classes('w-full justify-between items-center p-3 bg-slate-800 text-white rounded-lg text-sm font-bold'):
                ui.label(_loc('pv_total'))
                ui.label(f"{w.money(tot_collections, currency)} {currency}").classes('text-base font-black text-emerald-300')

        # Variance & Bank Deposit Section
        with ui.grid(columns=2).classes('w-full gap-4 mt-6 text-xs'):
            with ui.card().classes('p-4 border border-slate-200 bg-slate-50'):
                ui.label(_loc('pv_var_title')).classes('font-bold text-slate-800 uppercase')
                ui.label(_loc('pv_exp_cash', val=f"{w.money(expected_cash, currency)} {currency}")).classes('mt-1 text-slate-600')
                ui.label(_loc('pv_act_cash', val=f"{w.money(cash_counted, currency)} {currency}")).classes('text-slate-600')

                var_color = 'text-emerald-800' if variance == 0 else ('text-rose-800' if variance < 0 else 'text-blue-800')
                ui.label(_loc('pv_var_val', val=f"{w.money(variance, currency)} {currency}")).classes(f'font-bold mt-2 {var_color} font-mono text-sm')
                ui.label(_loc('pv_compliant') if variance == 0 else (_loc('pv_deficit') if variance < 0 else _loc('pv_surplus'))).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border border-slate-200 bg-slate-50'):
                ui.label(_loc('pv_bank_title')).classes('font-bold text-slate-800 uppercase')
                ui.label(_loc('pv_bank_amt', val=f"{w.money(deposit_amt, currency)} {currency}")).classes('mt-1 font-mono text-sm font-bold text-primary')
                ui.label(_loc('pv_bank_ref', ref=daily_close.get('bank_deposit_ref', 'N/A') if daily_close else 'N/A')).classes('text-slate-600')
                ui.label(_loc('pv_bank_entry')).classes('text-xs text-slate-400 mt-2')

        # Signatures Block
        with ui.grid(columns=3).classes('w-full gap-8 pt-10 mt-8 border-t border-slate-300 text-center text-xs'):
            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_cashier')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_cashier_sub')).classes('text-slate-400 italic')

            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_chief')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_chief_sub')).classes('text-slate-400 italic')

            with ui.column().classes('items-center gap-10'):
                ui.label(_loc('sig_cfo')).classes('font-bold text-slate-700 uppercase')
                ui.label(_loc('sig_cfo_sub')).classes('text-slate-400 italic')


def _momo_modal(register_id: int, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[520px] p-6 gap-4'):
        w.modal_header(_loc('modal_momo_title'), emoji='📲')

        prov_sel = ui.select({'mtn_momo': 'MTN Mobile Money (MoMo)', 'orange_money': 'Orange Money'}, value='mtn_momo', label=_loc('modal_momo_prov')).props('outlined dense').classes('w-full')
        ref_in = ui.input(label=_loc('modal_momo_ref'), value='MOMO-20261016-99').props('outlined dense').classes('w-full')
        phone_in = ui.input(label=_loc('modal_momo_phone'), value='+237677112233').props('outlined dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            name_in = ui.input(label=_loc('modal_momo_name'), value='Mme FOUDA Marie').props('outlined dense')
            file_in = ui.input(label=_loc('modal_momo_file'), value='DOS-2026-1044').props('outlined dense')

        with ui.grid(columns=2).classes('w-full gap-3'):
            gross_in = ui.number(label=_loc('modal_momo_gross'), value=35000, format='%.0f').props('outlined dense')
            fee_in = ui.number(label=_loc('modal_momo_fee'), value=400, format='%.0f').props('outlined dense')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_record():
                payload = {
                    'cash_register_id': register_id,
                    'provider': prov_sel.value,
                    'telecom_ref': ref_in.value,
                    'customer_phone': phone_in.value,
                    'patient_name': name_in.value,
                    'patient_file_no': file_in.value,
                    'gross_amount': gross_in.value,
                    'fee_amount': fee_in.value,
                }
                res = await api.safe(api.post('/cash-registers/momo-transactions', payload))
                if res:
                    ui.notify(_loc('modal_momo_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_momo_btn'), icon='check', on_click=do_record).props('unelevated color=primary')

    dlg.open()


def _close_modal(register_id: int, date_str: str, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[540px] p-6 gap-4'):
        w.modal_header(_loc('modal_close_title'), emoji='🔒')

        d_in = ui.input(label=_loc('modal_close_date'), value=date_str).props('outlined dense type=date').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            phys_in = ui.number(label=_loc('modal_close_phys'), value=500000, format='%.0f').props('outlined dense')
            exp_in = ui.number(label=_loc('modal_close_exp'), value=500000, format='%.0f').props('outlined dense')

        with ui.grid(columns=2).classes('w-full gap-3'):
            dep_in = ui.number(label=_loc('modal_close_dep'), value=450000, format='%.0f').props('outlined dense')
            ref_dep = ui.input(label=_loc('modal_close_dep_ref'), value=f"VERS-AFB-{date_str}").props('outlined dense')

        notes_in = ui.input(label=_loc('modal_close_notes')).props('outlined dense').classes('w-full')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_close():
                payload = {
                    'close_date': d_in.value,
                    'physical_cash_counted': phys_in.value,
                    'system_cash_expected': exp_in.value,
                    'bank_deposit_amount': dep_in.value,
                    'bank_deposit_ref': ref_dep.value,
                    'notes': notes_in.value,
                }
                res = await api.safe(api.post(f'/cash-registers/{register_id}/daily-close', payload))
                if res:
                    ui.notify(_loc('modal_close_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_close_btn'), icon='verified_user', on_click=do_close).props('unelevated color=primary')

    dlg.open()
