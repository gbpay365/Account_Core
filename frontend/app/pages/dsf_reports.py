"""
CEMAC / OHADA DSF (Déclaration Statistique et Fiscale) Statutory Reports.
Compliant with CEMAC Directives and Cameroon General Tax Code (CGI).
Generates Tableau 1 (Actif Immobilisé), Tableau 2 (Amortissements),
Tableau 3 (Cessions / Plus-values), and Tableau 28/29 (Résultat Fiscal & IS/IMF).
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {'fr': 'Liasse Fiscale DSF (OHADA / CEMAC)', 'en': 'DSF Tax Return (OHADA / CEMAC)'},
    'subtitle': {
        'fr': 'Tableaux 1, 2, 3 et 28/29 de la Déclaration Statistique et Fiscale certifiée DGI',
        'en': 'Tables 1, 2, 3 and 28/29 of the DGI certified Statistical and Tax Declaration',
    },
    'btn_add_adj': {'fr': 'Ajouter un ajustement fiscal', 'en': 'Add Tax Adjustment'},
    'btn_print': {'fr': 'Imprimer / Exporter DGI', 'en': 'Print / Export DGI'},
    'lbl_fy': {'fr': 'Exercice Fiscal', 'en': 'Fiscal Year'},
    'no_fy': {'fr': 'Aucun exercice fiscal trouvé.', 'en': 'No fiscal year found.'},
    'tab1': {'fr': 'Tableau 1 : Actif Immobilisé', 'en': 'Table 1: Fixed Assets'},
    'tab2': {'fr': 'Tableau 2 : Amortissements', 'en': 'Table 2: Depreciation'},
    'tab3': {'fr': 'Tableau 3 : Cessions & Plus-values', 'en': 'Table 3: Disposals & Capital Gains'},
    'tab28': {'fr': 'Tableau 28/29 : Résultat Fiscal & IS', 'en': 'Table 28/29: Taxable Profit & CIT'},
    't1_title': {'fr': 'TABLEAU 1 : ACTIF IMMOBILISÉ', 'en': 'TABLE 1: FIXED ASSETS'},
    't1_sub': {'fr': 'Mouvements des valeurs brutes au cours de l’exercice (OHADA / CEMAC)', 'en': 'Gross asset value movements during the fiscal year (OHADA / CEMAC)'},
    't2_title': {'fr': 'TABLEAU 2 : AMORTISSEMENTS', 'en': 'TABLE 2: DEPRECIATION'},
    't2_sub': {'fr': 'Mouvements des amortissements cumulés de l’exercice (OHADA / CEMAC)', 'en': 'Cumulative depreciation movements for the fiscal year (OHADA / CEMAC)'},
    't3_title': {'fr': 'TABLEAU 3 : PLUS-VALUES ET MOINS-VALUES DE CESSION D’IMMOBILISATIONS', 'en': 'TABLE 3: CAPITAL GAINS AND LOSSES ON ASSET DISPOSALS'},
    't3_sub': {'fr': 'Détail des sorties d’actifs et qualification fiscale (Art. 9 CGI CEMAC)', 'en': 'Asset disposal details and tax classification (Art. 9 CGI CEMAC)'},
    't3_empty': {'fr': 'Aucune cession d’immobilisation enregistrée sur cet exercice.', 'en': 'No asset disposals recorded for this fiscal year.'},
    't28_title': {'fr': 'TABLEAUX 28 & 29 : DÉTERMINATION DU RÉSULTAT FISCAL & IMPÔT SUR LES SOCIÉTÉS', 'en': 'TABLES 28 & 29: TAXABLE PROFIT & CORPORATE INCOME TAX'},
    't28_sub': {'fr': 'Calcul comparatif IS (30%) vs Impôt Minimum Forfaitaire IMF (2.2% CA) — Code Général des Impôts CEMAC', 'en': 'Comparative CIT (30%) vs Minimum Flat Tax IMF (2.2% Turnover) — CEMAC Tax Code'},
    'acct_profit': {'fr': 'RÉSULTAT COMPTABLE AVANT IMPÔT', 'en': 'ACCOUNTING PROFIT BEFORE TAX'},
    'reint_title': {'fr': '(+) RÉINTÉGRATIONS FISCALES (Charges non déductibles selon le CGI)', 'en': '(+) TAX REINTEGRATIONS (Non-deductible expenses per Tax Code)'},
    'no_reint': {'fr': 'Aucune réintégration enregistrée.', 'en': 'No reintegrations recorded.'},
    'ded_title': {'fr': '(-) DÉDUCTIONS FISCALES (Produits non imposables & abattements)', 'en': '(-) TAX DEDUCTIONS (Non-taxable income & allowances)'},
    'no_ded': {'fr': 'Aucune déduction enregistrée.', 'en': 'No deductions recorded.'},
    'taxable_profit': {'fr': '(=) RÉSULTAT FISCAL NET IMPOSABLE', 'en': '(=) NET TAXABLE PROFIT'},
    'turnover_title': {'fr': 'Chiffre d’Affaires HT (Assiette IMF)', 'en': 'Turnover excl. VAT (IMF Base)'},
    'turnover_sub': {'fr': 'Classe 70 du Grand-Livre', 'en': 'General Ledger Class 70'},
    'imf_title': {'fr': 'Impôt Minimum Forfaitaire (IMF 2.2%)', 'en': 'Minimum Flat Tax (IMF 2.2%)'},
    'imf_sub': {'fr': '2.2% × Chiffre d’Affaires HT', 'en': '2.2% × Turnover excl. VAT'},
    'is_title': {'fr': 'Impôt sur les Sociétés (IS 30%)', 'en': 'Corporate Income Tax (CIT 30%)'},
    'is_sub': {'fr': '30% × Résultat Fiscal', 'en': '30% × Taxable Profit'},
    'tax_due_title': {'fr': 'IMPÔT DÛ AU TITRE DE L’EXERCICE (À REVERSER À LA DGI)', 'en': 'TAX DUE FOR THE FISCAL YEAR (PAYABLE TO TAX AUTHORITY)'},
    'tax_rule_applied': {'fr': 'Règle d’exigibilité légale appliquée :', 'en': 'Statutory tax rule applied:'},
    'modal_title': {'fr': 'Ajouter un ajustement fiscal (Tableau 28/29)', 'en': 'Add Tax Adjustment (Table 28/29)'},
    'modal_type': {'fr': 'Type d’ajustement', 'en': 'Adjustment Type'},
    'modal_reint': {'fr': 'Réintégration (Charge non déductible)', 'en': 'Reintegration (Non-deductible expense)'},
    'modal_ded': {'fr': 'Déduction (Produit exonéré / abattement)', 'en': 'Deduction (Exempt income / allowance)'},
    'modal_line': {'fr': 'Code ligne DSF (ex: WD, WE, WF, WI)', 'en': 'DSF line code (e.g. WD, WE, WF, WI)'},
    'modal_desc': {'fr': 'Libellé / Référence légale CGI', 'en': 'Description / Tax Code legal reference'},
    'modal_amt': {'fr': 'Montant (XAF)', 'en': 'Amount (XAF)'},
    'modal_notes': {'fr': 'Notes explicatives pour l’Inspecteur des Impôts', 'en': 'Explanatory notes for Tax Inspector'},
    'modal_save': {'fr': 'Enregistrer', 'en': 'Save Adjustment'},
    'modal_saved': {'fr': 'Ajustement fiscal ajouté avec succès !', 'en': 'Tax adjustment added successfully!'},
    'col_account': {'fr': 'Compte', 'en': 'Account'},
    'col_cat': {'fr': 'Désignation de la catégorie', 'en': 'Category Description'},
    'col_open': {'fr': 'Brut Début', 'en': 'Gross Opening'},
    'col_acq': {'fr': 'Acquisitions (+)', 'en': 'Acquisitions (+)'},
    'col_disp': {'fr': 'Cessions/Sorties (-)', 'en': 'Disposals/Reductions (-)'},
    'col_close': {'fr': 'Brut Clôture', 'en': 'Gross Closing'},
    'col_accum_open': {'fr': 'Cumul Début', 'en': 'Accumulated Opening'},
    'col_add': {'fr': 'Dotations Exercice (+)', 'en': 'Additions for the Year (+)'},
    'col_disp_depr': {'fr': 'Amort. Sorties (-)', 'en': 'Disposals Depr. (-)'},
    'col_accum_close': {'fr': 'Cumul Clôture', 'en': 'Accumulated Closing'},
    'tot_t1': {'fr': 'TOTAL GÉNÉRAL ACTIF IMMOBILISÉ', 'en': 'TOTAL FIXED ASSETS'},
    'tot_t2': {'fr': 'TOTAL GÉNÉRAL AMORTISSEMENTS', 'en': 'TOTAL ACCUMULATED DEPRECIATION'},
    'col_date': {'fr': 'Date Cession', 'en': 'Disposal Date'},
    'col_tag': {'fr': 'Code Immo', 'en': 'Asset Tag'},
    'col_name': {'fr': 'Désignation du bien', 'en': 'Asset Name'},
    'col_gross': {'fr': 'Valeur Brute', 'en': 'Gross Value'},
    'col_depr': {'fr': 'Amort. Pratiqués', 'en': 'Accum. Depr.'},
    'col_nbv': {'fr': 'VCN (Valeur Nette)', 'en': 'NBV (Net Book Value)'},
    'col_proceeds': {'fr': 'Prix de Vente', 'en': 'Selling Proceeds'},
    'col_gain': {'fr': 'Plus-Value (+)', 'en': 'Capital Gain (+)'},
    'col_loss': {'fr': 'Moins-Value (-)', 'en': 'Capital Loss (-)'},
    'sig_accountant': {'fr': 'Le Chef Comptable / DAF', 'en': 'Chief Financial Officer / Chief Accountant'},
    'sig_accountant_sub': {'fr': 'Visa & N° d’agrément professionnel', 'en': 'Visa & Professional Registration No.'},
    'sig_auditor': {'fr': 'Le Commissaire aux Comptes', 'en': 'Statutory Auditor / CPA'},
    'sig_auditor_sub': {'fr': 'Rapport de certification sans réserve', 'en': 'Unqualified audit certification report'},
    'sig_management': {'fr': 'La Direction Générale', 'en': 'General Management / CEO'},
    'sig_management_sub': {'fr': 'Signature sociale & cachet', 'en': 'Corporate signature & official seal'},
    'sig_cert_note': {
        'fr': 'Déclaration souscrite en application du Code Général des Impôts (CGI CEMAC) et des normes du Système Comptable OHADA révisé. Certifié sincère et conforme aux écritures du Grand-Livre.',
        'en': 'Declaration filed pursuant to the CEMAC General Tax Code and revised OHADA accounting standards. Certified true and conforming to General Ledger records.',
    },
    'sig_date_loc': {'fr': 'Fait à ........................................, le ..... / ..... / 20....', 'en': 'Done at ........................................, on ..... / ..... / 20....'},
    'sig_signature': {'fr': 'Signature & Cachet :', 'en': 'Signature & Stamp:'},
}


def _loc(key: str) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        return entry.get(cur, entry.get('en', ''))
    return t(key)


def _render_dsf_signatures() -> None:
    with ui.column().classes('w-full mt-8 pt-6 border-t border-slate-300 print-avoid-break'):
        ui.label(_loc('sig_cert_note')).classes('text-xs text-slate-500 italic text-center w-full mb-4')
        with ui.row().classes('w-full justify-between items-center text-xs text-slate-600 mb-6'):
            ui.label(_loc('sig_date_loc')).classes('font-medium')
            ui.label('DGI CEMAC / Télédéclaration Fiscale').classes('font-mono font-bold text-slate-400')

        with ui.grid(columns=3).classes('w-full gap-8 text-center text-xs'):
            # Accountant
            with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                ui.label(_loc('sig_accountant')).classes('font-bold text-slate-800 uppercase')
                ui.label(_loc('sig_accountant_sub')).classes('text-slate-400 text-[10px]')
                ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')

            # Auditor
            with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                ui.label(_loc('sig_auditor')).classes('font-bold text-slate-800 uppercase')
                ui.label(_loc('sig_auditor_sub')).classes('text-slate-400 text-[10px]')
                ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')

            # Management
            with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                ui.label(_loc('sig_management')).classes('font-bold text-slate-800 uppercase')
                ui.label(_loc('sig_management_sub')).classes('text-slate-400 text-[10px]')
                ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')


@page('/dsf-reports', title='DSF OHADA (Liasse fiscale)', permissions=('journal.view',))
@page('/dsf', title='DSF OHADA (Liasse fiscale)', permissions=('journal.view',))
async def dsf_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    years_res = await api.safe(api.get('/fiscal-years'), notify=False) or {'rows': []}
    fiscal_years = years_res.get('rows', [])
    default_fy_id = fiscal_years[0]['id'] if fiscal_years else None

    state = {
        'fiscal_year_id': default_fy_id,
        'tab': 'tab1',
    }

    content = ui.column().classes('w-full gap-4')

    def actions() -> None:
        ui.button(
            _loc('btn_add_adj'),
            icon='add',
            on_click=lambda: _adjustment_modal(state['fiscal_year_id'], reload_all)
        ).props('unelevated size=sm')

    with ui.element('div').classes('w-full lc-no-print'):
        w.page_header(
            _loc('title'),
            _loc('subtitle'),
            actions=actions,
            emoji='📑'
        )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_fy_id = state['fiscal_year_id']
        if not curr_fy_id:
            ui.label(_loc('no_fy')).classes('text-slate-500 italic p-6')
            return

        # Fetch Data for all tables
        t1_data = await api.safe(api.get(f'/dsf/{curr_fy_id}/tableau-1'), notify=False) or {}
        t2_data = await api.safe(api.get(f'/dsf/{curr_fy_id}/tableau-2'), notify=False) or {}
        t3_data = await api.safe(api.get(f'/dsf/{curr_fy_id}/tableau-3'), notify=False) or {}
        t28_data = await api.safe(api.get(f'/dsf/{curr_fy_id}/tableau-28'), notify=False) or {}

        # 1. Top Controls Bar: Fiscal Year Selector & Export
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm lc-no-print'):
            with ui.row().classes('items-center gap-4'):
                prefix = 'Exercice' if lang() == 'fr' else 'Fiscal Year'
                fy_opts = {fy['id']: f"{prefix} {fy.get('code', fy['id'])} ({fy.get('start_date', '')[:4]})" for fy in fiscal_years}
                async def on_fy_change(e):
                    state['fiscal_year_id'] = e.value
                    await reload_all()

                ui.select(fy_opts, value=curr_fy_id, on_change=on_fy_change, label=_loc('lbl_fy')).props('outlined dense options-dense').classes('w-64')

            with ui.row().classes('items-center gap-2'):
                ui.button(_loc('btn_print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('outline size=sm')
                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Tab Navigation
        with ui.tabs().classes('w-full border-b border-slate-200 mt-2 lc-no-print') as tabs:
            tab1 = ui.tab(_loc('tab1'), icon='inventory_2')
            tab2 = ui.tab(_loc('tab2'), icon='trending_down')
            tab3 = ui.tab(_loc('tab3'), icon='sell')
            tab28 = ui.tab(_loc('tab28'), icon='account_balance')

        with ui.tab_panels(tabs, value=tab1).classes('w-full bg-transparent p-0 pt-3'):
            # --- TAB 1: Actif Immobilisé ---
            with ui.tab_panel(tab1).classes('p-0 gap-4'):
                _render_tableau_1(t1_data, currency)

            # --- TAB 2: Amortissements ---
            with ui.tab_panel(tab2).classes('p-0 gap-4'):
                _render_tableau_2(t2_data, currency)

            # --- TAB 3: Cessions ---
            with ui.tab_panel(tab3).classes('p-0 gap-4'):
                _render_tableau_3(t3_data, currency)

            # --- TAB 28/29: Résultat Fiscal ---
            with ui.tab_panel(tab28).classes('p-0 gap-4'):
                _render_tableau_28(t28_data, currency)

    await render_view()


def _render_tableau_1(data: dict, currency: str) -> None:
    rows = data.get('rows', [])
    totals = data.get('totals', {})

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-sm rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4 border-b border-slate-200 pb-3'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('t1_title')).classes('text-lg font-black text-slate-900')
                ui.label(_loc('t1_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
            ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print')

        formatted_rows = [
            {
                **r,
                'open_formatted': w.money(r.get('gross_opening', 0), currency),
                'acq_formatted': w.money(r.get('acquisitions', 0), currency),
                'disp_formatted': w.money(r.get('disposals', 0), currency),
                'close_formatted': w.money(r.get('gross_closing', 0), currency),
            }
            for r in rows
        ]

        columns = [
            {'name': 'account', 'label': _loc('col_account'), 'field': 'account_code', 'align': 'left'},
            {'name': 'category', 'label': _loc('col_cat'), 'field': 'category_name', 'align': 'left'},
            {'name': 'open', 'label': _loc('col_open'), 'field': 'open_formatted', 'align': 'right'},
            {'name': 'acq', 'label': _loc('col_acq'), 'field': 'acq_formatted', 'align': 'right'},
            {'name': 'disp', 'label': _loc('col_disp'), 'field': 'disp_formatted', 'align': 'right'},
            {'name': 'close', 'label': _loc('col_close'), 'field': 'close_formatted', 'align': 'right'},
        ]

        table = ui.table(columns=columns, rows=formatted_rows, row_key='category_id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-account', '''<q-td :props="props"><span class="font-mono font-bold">{{ props.value }}</span></q-td>''')
        table.add_slot('body-cell-close', '''<q-td :props="props"><span class="font-mono font-bold text-primary">{{ props.value }}</span></q-td>''')

        # Totals footer
        with ui.row().classes('w-full bg-slate-100 p-3 rounded-lg justify-between items-center font-bold text-sm text-slate-800 mt-3 print-avoid-break'):
            ui.label(_loc('tot_t1'))
            with ui.row().classes('gap-8 font-mono'):
                start_lbl = 'Début' if lang() == 'fr' else 'Opening'
                acq_lbl = 'Acquisitions' if lang() == 'fr' else 'Acquisitions'
                disp_lbl = 'Sorties' if lang() == 'fr' else 'Disposals'
                close_lbl = 'Clôture' if lang() == 'fr' else 'Closing'
                ui.label(f"{start_lbl} : {w.money(totals.get('gross_opening', 0), currency)}")
                ui.label(f"{acq_lbl} : +{w.money(totals.get('acquisitions', 0), currency)}")
                ui.label(f"{disp_lbl} : -{w.money(totals.get('disposals', 0), currency)}")
                ui.label(f"{close_lbl} : {w.money(totals.get('gross_closing', 0), currency)} {currency}").classes('text-primary font-black')

        _render_dsf_signatures()


def _render_tableau_2(data: dict, currency: str) -> None:
    rows = data.get('rows', [])
    totals = data.get('totals', {})

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-sm rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4 border-b border-slate-200 pb-3'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('t2_title')).classes('text-lg font-black text-slate-900')
                ui.label(_loc('t2_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
            ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print')

        formatted_rows = [
            {
                **r,
                'open_formatted': w.money(r.get('accum_opening', 0), currency),
                'add_formatted': w.money(r.get('additions_year', 0), currency),
                'disp_formatted': w.money(r.get('reductions_disposals', 0), currency),
                'close_formatted': w.money(r.get('accum_closing', 0), currency),
            }
            for r in rows
        ]

        columns = [
            {'name': 'account', 'label': _loc('col_account'), 'field': 'accum_account_code', 'align': 'left'},
            {'name': 'category', 'label': _loc('col_cat'), 'field': 'category_name', 'align': 'left'},
            {'name': 'open', 'label': _loc('col_accum_open'), 'field': 'open_formatted', 'align': 'right'},
            {'name': 'add', 'label': _loc('col_add'), 'field': 'add_formatted', 'align': 'right'},
            {'name': 'disp', 'label': _loc('col_disp_depr'), 'field': 'disp_formatted', 'align': 'right'},
            {'name': 'close', 'label': _loc('col_accum_close'), 'field': 'close_formatted', 'align': 'right'},
        ]

        table = ui.table(columns=columns, rows=formatted_rows, row_key='category_id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-account', '''<q-td :props="props"><span class="font-mono font-bold">{{ props.value }}</span></q-td>''')
        table.add_slot('body-cell-close', '''<q-td :props="props"><span class="font-mono font-bold text-teal-800">{{ props.value }}</span></q-td>''')

        with ui.row().classes('w-full bg-slate-100 p-3 rounded-lg justify-between items-center font-bold text-sm text-slate-800 mt-3 print-avoid-break'):
            ui.label(_loc('tot_t2'))
            with ui.row().classes('gap-8 font-mono'):
                start_lbl = 'Début' if lang() == 'fr' else 'Opening'
                add_lbl = 'Dotations' if lang() == 'fr' else 'Additions'
                disp_lbl = 'Sorties' if lang() == 'fr' else 'Disposals'
                close_lbl = 'Clôture' if lang() == 'fr' else 'Closing'
                ui.label(f"{start_lbl} : {w.money(totals.get('accum_opening', 0), currency)}")
                ui.label(f"{add_lbl} : +{w.money(totals.get('additions_year', 0), currency)}")
                ui.label(f"{disp_lbl} : -{w.money(totals.get('reductions_disposals', 0), currency)}")
                ui.label(f"{close_lbl} : {w.money(totals.get('accum_closing', 0), currency)} {currency}").classes('text-teal-800 font-black')

        _render_dsf_signatures()


def _render_tableau_3(data: dict, currency: str) -> None:
    rows = data.get('rows', [])

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-sm rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4 border-b border-slate-200 pb-3'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('t3_title')).classes('text-lg font-black text-slate-900')
                ui.label(_loc('t3_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
            ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print')

        if not rows:
            ui.label(_loc('t3_empty')).classes('text-slate-400 italic p-6')
            _render_dsf_signatures()
            return

        formatted_rows = [
            {
                **r,
                'gross_formatted': w.money(r.get('gross_value', 0), currency),
                'depr_formatted': w.money(r.get('accum_depreciation', 0), currency),
                'nbv_formatted': w.money(r.get('net_book_value', 0), currency),
                'proceeds_formatted': w.money(r.get('proceeds_amount', 0), currency),
                'gain_formatted': w.money(r.get('capital_gain', 0), currency),
                'loss_formatted': w.money(r.get('capital_loss', 0), currency),
            }
            for r in rows
        ]

        columns = [
            {'name': 'date', 'label': _loc('col_date'), 'field': 'disposal_date', 'align': 'left'},
            {'name': 'tag', 'label': _loc('col_tag'), 'field': 'asset_tag', 'align': 'left'},
            {'name': 'name', 'label': _loc('col_name'), 'field': 'asset_name', 'align': 'left'},
            {'name': 'gross', 'label': _loc('col_gross'), 'field': 'gross_formatted', 'align': 'right'},
            {'name': 'depr', 'label': _loc('col_depr'), 'field': 'depr_formatted', 'align': 'right'},
            {'name': 'nbv', 'label': _loc('col_nbv'), 'field': 'nbv_formatted', 'align': 'right'},
            {'name': 'proceeds', 'label': _loc('col_proceeds'), 'field': 'proceeds_formatted', 'align': 'right'},
            {'name': 'gain', 'label': _loc('col_gain'), 'field': 'gain_formatted', 'align': 'right'},
            {'name': 'loss', 'label': _loc('col_loss'), 'field': 'loss_formatted', 'align': 'right'},
        ]

        table = ui.table(columns=columns, rows=formatted_rows, row_key='disposal_id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-gain', '''<q-td :props="props"><span class="font-mono font-bold text-emerald-700">{{ props.value }}</span></q-td>''')
        table.add_slot('body-cell-loss', '''<q-td :props="props"><span class="font-mono font-bold text-rose-700">{{ props.value }}</span></q-td>''')

        _render_dsf_signatures()


def _render_tableau_28(data: dict, currency: str) -> None:
    reints = data.get('reintegrations', [])
    deds = data.get('deductions', [])
    turnover = data.get('turnover_ht', 0)
    acct_profit = data.get('accounting_profit', 0)
    tot_reint = data.get('total_reintegrations', 0)
    tot_ded = data.get('total_deductions', 0)
    tax_profit = data.get('taxable_profit', 0)
    is_amt = data.get('is_amount', 0)
    imf_amt = data.get('imf_amount', 0)
    tax_due = data.get('tax_due', 0)
    tax_regime = data.get('tax_regime_applied', '')

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-sm rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4 border-b border-slate-200 pb-3'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('t28_title')).classes('text-lg font-black text-slate-900')
                ui.label(_loc('t28_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
            ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print')

        # 1. P&L Accounting Profit
        with ui.row().classes('w-full justify-between items-center p-3 bg-slate-100 rounded-lg text-sm font-bold text-slate-800 mb-3 print-avoid-break'):
            ui.label(_loc('acct_profit'))
            ui.label(f"{w.money(acct_profit, currency)} {currency}").classes('font-mono text-base text-primary')

        # 2. Réintégrations Fiscales
        with ui.column().classes('w-full mb-3 gap-1 border border-slate-200 rounded-lg p-3 bg-rose-50/20 print-avoid-break'):
            with ui.row().classes('w-full justify-between items-center border-b border-slate-200 pb-1 text-sm font-bold text-rose-900'):
                ui.label(_loc('reint_title'))
                ui.label(f"+ {w.money(tot_reint, currency)} {currency}").classes('font-mono')

            if not reints:
                ui.label(_loc('no_reint')).classes('text-xs text-slate-400 italic py-1')
            else:
                for r in reints:
                    with ui.row().classes('w-full justify-between items-center text-xs text-slate-700 py-1 font-mono'):
                        ui.label(f"• [{r.get('line_code')}] {r.get('description')}")
                        ui.label(w.money(r.get('amount'), currency))

        # 3. Déductions Fiscales
        with ui.column().classes('w-full mb-3 gap-1 border border-slate-200 rounded-lg p-3 bg-emerald-50/20 print-avoid-break'):
            with ui.row().classes('w-full justify-between items-center border-b border-slate-200 pb-1 text-sm font-bold text-emerald-900'):
                ui.label(_loc('ded_title'))
                ui.label(f"- {w.money(tot_ded, currency)} {currency}").classes('font-mono')

            if not deds:
                ui.label(_loc('no_ded')).classes('text-xs text-slate-400 italic py-1')
            else:
                for d in deds:
                    with ui.row().classes('w-full justify-between items-center text-xs text-slate-700 py-1 font-mono'):
                        ui.label(f"• [{d.get('line_code')}] {d.get('description')}")
                        ui.label(w.money(d.get('amount'), currency))

        # 4. Taxable Profit Result
        with ui.row().classes('w-full justify-between items-center p-3 bg-slate-800 text-white rounded-lg text-sm font-bold mb-4 print-avoid-break'):
            ui.label(_loc('taxable_profit'))
            ui.label(f"{w.money(tax_profit, currency)} {currency}").classes('font-mono text-base text-emerald-300')

        # 5. Comparative Tax Assessment Block (IS vs IMF)
        with ui.grid(columns=3).classes('w-full gap-4 print-avoid-break'):
            with ui.card().classes('p-4 border-l-4 border-blue-500 bg-slate-50'):
                ui.label(_loc('turnover_title')).classes('text-xs uppercase font-semibold text-slate-500')
                ui.label(f"{w.money(turnover, currency)} {currency}").classes('text-base font-bold text-slate-800 font-mono')
                ui.label(_loc('turnover_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-amber-500 bg-slate-50'):
                ui.label(_loc('imf_title')).classes('text-xs uppercase font-semibold text-slate-500')
                ui.label(f"{w.money(imf_amt, currency)} {currency}").classes('text-base font-bold text-amber-800 font-mono')
                ui.label(_loc('imf_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-indigo-500 bg-slate-50'):
                ui.label(_loc('is_title')).classes('text-xs uppercase font-semibold text-slate-500')
                ui.label(f"{w.money(is_amt, currency)} {currency}").classes('text-base font-bold text-indigo-800 font-mono')
                ui.label(_loc('is_sub')).classes('text-xs text-slate-400')

        # 6. Final Tax Due
        with ui.row().classes('w-full justify-between items-center p-4 rounded-xl border-2 border-emerald-600 bg-emerald-50 mt-4 print-avoid-break'):
            with ui.row().classes('items-center gap-3'):
                ui.icon('verified', size='28px', color='emerald')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('tax_due_title')).classes('font-black text-sm text-slate-900')
                    ui.label(f"{_loc('tax_rule_applied')} {tax_regime}").classes('text-xs text-slate-600')

            ui.label(f"{w.money(tax_due, currency)} {currency}").classes('font-mono text-2xl font-black text-emerald-800')

        _render_dsf_signatures()


def _adjustment_modal(fiscal_year_id: int, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[540px] p-6 gap-4'):
        w.modal_header(_loc('modal_title'), emoji='📝')

        adj_type = ui.select(
            {'reintegration': _loc('modal_reint'), 'deduction': _loc('modal_ded')},
            value='reintegration',
            label=_loc('modal_type')
        ).props('outlined dense').classes('w-full')
        line_code = ui.input(label=_loc('modal_line'), value='WF').props('outlined dense').classes('w-full')
        desc = ui.input(label=_loc('modal_desc'), value='Amortissements excédentaires non déductibles' if lang() == 'fr' else 'Excess non-deductible depreciation').props('outlined dense').classes('w-full')
        amt = ui.number(label=_loc('modal_amt'), value=1000000, format='%.0f').props('outlined dense').classes('w-full')
        notes = ui.input(label=_loc('modal_notes')).props('outlined dense').classes('w-full')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_save():
                payload = {
                    'fiscal_year_id': fiscal_year_id,
                    'adjustment_type': adj_type.value,
                    'line_code': line_code.value,
                    'description': desc.value,
                    'amount': amt.value,
                    'notes': notes.value,
                }
                res = await api.safe(api.post('/dsf/adjustments', payload))
                if res:
                    ui.notify(_loc('modal_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_save'), icon='check', on_click=do_save).props('unelevated color=primary')

    dlg.open()
