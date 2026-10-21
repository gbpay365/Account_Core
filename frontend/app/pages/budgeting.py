"""
West African Enterprise & Institutional Budgeting Module (Module Budgétaire OHADA / UEMOA / CEMAC).
Provides:
  - Budget Master Planning & Dotation by Department / Account (Opex, Capex, Maintenance, Revenue)
  - Multi-step Commitment Accounting (Engagements de dépenses avec contrôle de disponibilité)
  - Direct Linking to Fixed Assets register (Capex) and Maintenance work orders
  - Budget Amendments & Transfers (Virements de crédits / Décisions modificatives)
  - Real-Time Multi-Axial Execution Reporting & Overrun Blocking
"""

from __future__ import annotations

import datetime
from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import widgets as w
from ..ui.shell import page

_T = {
    'title': {
        'en': 'Budgeting & Commitment Accounting (SYSCOHADA / CEMAC)',
        'fr': 'Gestion Budgétaire & Comptabilité des Engagements (OHADA)',
    },
    'subtitle': {
        'en': 'Operating & capital expenditure plans, multi-axial commitments, credit transfers, and real-time execution controls',
        'fr': 'Budgets de fonctionnement et d’investissement, engagements de dépenses, virements de crédits et contrôle en temps réel',
    },
    'kpi_total_budget': {'en': 'Approved Budget (Adjusted)', 'fr': 'Budget Voté (Rectifié)'},
    'kpi_committed': {'en': 'Committed Credits (Engagé)', 'fr': 'Crédits Engagés (Bons de Cde)'},
    'kpi_actual': {'en': 'Liquidated / Posted (Réalisé)', 'fr': 'Dépenses Réalisées (Ordonnancées)'},
    'kpi_available': {'en': 'Available Balance (Disponible)', 'fr': 'Disponible Budgétaire Net'},
    'kpi_rate': {'en': 'Overall Execution Rate', 'fr': 'Taux d’Exécution Global'},

    'tab_exec': {'en': 'Execution Dashboard', 'fr': 'Tableau de Bord d’Exécution'},
    'tab_plans': {'en': 'Budget Plans & Lines', 'fr': 'Plans & Dotations Budgétaires'},
    'tab_comm': {'en': 'Commitments (Engagements)', 'fr': 'Engagements de Dépenses'},
    'tab_trans': {'en': 'Credit Transfers (Virements)', 'fr': 'Virements & Modifications'},

    'btn_new_budget': {'en': 'New Budget Plan', 'fr': 'Nouveau Plan Budgétaire'},
    'btn_new_line': {'en': 'Add Budget Line', 'fr': 'Ajouter une Ligne'},
    'btn_new_comm': {'en': 'New Commitment', 'fr': 'Nouvel Engagement'},
    'btn_new_transfer': {'en': 'New Credit Transfer', 'fr': 'Nouveau Virement'},
    'btn_approve': {'en': 'Approve', 'fr': 'Approuver'},
    'btn_liquidate': {'en': 'Liquidate (Voucher)', 'fr': 'Liquider'},
    'btn_check': {'en': 'Check Availability', 'fr': 'Vérifier Disponibilité'},

    'filter_fy': {'en': 'Fiscal Year', 'fr': 'Exercice Budgétaire'},
    'filter_type': {'en': 'Budget Section', 'fr': 'Section Budgétaire'},
    'filter_all_types': {'en': 'All Sections (Opex + Capex)', 'fr': 'Toutes les sections (Opex + Capex)'},
    'type_opex': {'en': 'Operating (Fonctionnement)', 'fr': 'Fonctionnement (Charges)'},
    'type_capex': {'en': 'Capital Investment (Investissement)', 'fr': 'Investissement (Immobilisations)'},
    'type_maint': {'en': 'Maintenance (Entretien)', 'fr': 'Maintenance & Travaux'},
    'type_rev': {'en': 'Revenue (Recettes)', 'fr': 'Recettes / Produits'},

    'col_account': {'en': 'Account (SYSCOHADA)', 'fr': 'Compte (SYSCOHADA)'},
    'col_type': {'en': 'Section', 'fr': 'Section'},
    'col_dept': {'en': 'Department / Service', 'fr': 'Département / Service'},
    'col_program': {'en': 'Program / Project', 'fr': 'Programme / Bailleur'},
    'col_initial': {'en': 'Initial Dotation', 'fr': 'Dotation Initiale'},
    'col_transfers': {'en': 'Net Transfers', 'fr': 'Virements Nets'},
    'col_budget': {'en': 'Current Budget', 'fr': 'Budget Rectifié'},
    'col_comm': {'en': 'Committed', 'fr': 'Engagements'},
    'col_spent': {'en': 'Actual Spent', 'fr': 'Réalisations'},
    'col_avail': {'en': 'Available', 'fr': 'Disponible'},
    'col_rate': {'en': 'Exec %', 'fr': 'Taux %'},
    'col_status': {'en': 'Status', 'fr': 'Statut'},
    'col_ref': {'en': 'Reference', 'fr': 'Référence'},
    'col_date': {'en': 'Date', 'fr': 'Date'},
    'col_desc': {'en': 'Object / Description', 'fr': 'Objet de la dépense'},
    'col_vendor': {'en': 'Vendor / Beneficiary', 'fr': 'Fournisseur / Bénéficiaire'},
    'col_asset': {'en': 'Linked Asset (Capex)', 'fr': 'Immobilisation Liée (Capex)'},
    'col_amount': {'en': 'Amount', 'fr': 'Montant'},
    'col_actions': {'en': 'Actions', 'fr': 'Actions'},

    'status_draft': {'en': 'Draft', 'fr': 'Brouillon'},
    'status_approved': {'en': 'Approved', 'fr': 'Approuvé'},
    'status_liquidated': {'en': 'Liquidated', 'fr': 'Liquidé'},
    'status_pending': {'en': 'Pending Approval', 'fr': 'En attente'},

    'note_comm_intro': {
        'en': 'Commitment accounting records statutory expenditure obligations before actual invoicing, reserving credit envelopes to guarantee budgetary discipline.',
        'fr': 'L’engagement est l’acte par lequel l’organisation réserve ses crédits budgétaires avant la passation de commande ou l’acquisition d’une immobilisation.',
    },
    'note_transfer_intro': {
        'en': 'Credit transfers reallocate uncommitted envelopes from surplus budget lines to deficit lines within the same approved fiscal budget.',
        'fr': 'Les virements de crédits permettent de transférer des disponibilités d’une ligne excédentaire vers une ligne déficitaire au sein du même exercice budgétaire.',
    },

    'dialog_comm_title': {'en': 'Register Budget Commitment (Engagement)', 'fr': 'Enregistrer un Engagement Budgétaire'},
    'dialog_transfer_title': {'en': 'Authorise Budget Transfer (Virement de Crédits)', 'fr': 'Effectuer un Virement de Crédits'},
    'dialog_line_title': {'en': 'Add Budget Line Allocation', 'fr': 'Ajouter une Ligne Budgétaire'},
    'dialog_budget_title': {'en': 'Create Budget Plan', 'fr': 'Créer un Plan Budgétaire'},

    'lbl_select_line': {'en': 'Target Budget Line', 'fr': 'Ligne Budgétaire à engager'},
    'lbl_src_line': {'en': 'Source Budget Line (Debited)', 'fr': 'Ligne Source (Débitée)'},
    'lbl_tgt_line': {'en': 'Target Budget Line (Credited)', 'fr': 'Ligne Cible (Créditée)'},
    'lbl_amount': {'en': 'Amount (XAF)', 'fr': 'Montant (XAF)'},
    'lbl_reason': {'en': 'Justification / Reason', 'fr': 'Motif / Justification'},
    'lbl_vendor': {'en': 'Vendor / Supplier', 'fr': 'Fournisseur / Prestataire'},
    'lbl_asset': {'en': 'Target Fixed Asset (for Capex / Maintenance)', 'fr': 'Immobilisation concernée (Capex / Maintenance)'},
    'lbl_code': {'en': 'Budget Plan Code', 'fr': 'Code du Budget'},
    'lbl_name': {'en': 'Budget Plan Name', 'fr': 'Intitulé du Budget'},
    'lbl_ctrl_mode': {'en': 'Budget Control Policy', 'fr': 'Mode de Contrôle Budgétaire'},
    'ctrl_strict': {'en': 'Strict Blocker (Forbid overruns)', 'fr': 'Blocage Strict (Dépassement interdit)'},
    'ctrl_warning': {'en': 'Warning Alert (Allow with note)', 'fr': 'Alerte seule (Autoriser avec visa)'},

    'msg_comm_success': {'en': 'Commitment registered successfully: {ref}', 'fr': 'Engagement enregistré avec succès : {ref}'},
    'msg_comm_approved': {'en': 'Commitment {ref} approved.', 'fr': 'Engagement {ref} approuvé.'},
    'msg_comm_liquidated': {'en': 'Commitment {ref} liquidated and linked to journal entry.', 'fr': 'Engagement {ref} liquidé et rattaché à la comptabilité.'},
    'msg_transfer_success': {'en': 'Credit transfer registered: {ref}', 'fr': 'Virement de crédits enregistré : {ref}'},
    'msg_transfer_approved': {'en': 'Credit transfer {ref} approved. Budget lines updated.', 'fr': 'Virement {ref} approuvé. Lignes budgétaires actualisées.'},
    'msg_line_added': {'en': 'Budget line added successfully.', 'fr': 'Ligne budgétaire ajoutée avec succès.'},
    'msg_budget_approved': {'en': 'Budget plan approved and active.', 'fr': 'Plan budgétaire approuvé et actif.'},
}


def _loc(key: str, **kwargs) -> str:
    user_lang = lang()
    text = _T.get(key, {}).get(user_lang, _T.get(key, {}).get('en', key))
    return text.format(**kwargs) if kwargs else text


@page('/budgeting', title='Budgeting & Commitments', permissions=('budget.view', 'coa.view'))
async def budgeting_page() -> None:
    user = api.user()
    currency = user.get('functional_currency', 'XAF')

    # Load initial reference data
    fy_resp = await api.safe(api.get('/fiscal-years'), default=[])
    fiscal_years = fy_resp.get('rows', []) if isinstance(fy_resp, dict) else (fy_resp or [])

    cc_resp = await api.safe(api.get('/cost-centers'), default=[])
    cost_centers = cc_resp.get('rows', []) if isinstance(cc_resp, dict) else (cc_resp or [])

    prog_resp = await api.safe(api.get('/analytical/programs'), default=[])
    funding_programs = prog_resp.get('rows', []) if isinstance(prog_resp, dict) else (prog_resp or [])

    vendors_resp = await api.safe(api.get('/partners', type='supplier'), default={'rows': []})
    vendors = vendors_resp.get('rows', []) if isinstance(vendors_resp, dict) else (vendors_resp or [])

    assets_list = await api.safe(api.get('/assets'), default=[])
    if isinstance(assets_list, dict):
        assets_list = assets_list.get('rows', [])

    accounts_list = await api.safe(api.get('/accounts'), default=[])
    if isinstance(accounts_list, dict):
        accounts_list = accounts_list.get('rows', [])

    # Filter accounts to Class 6 (Charges), Class 2 (Immobilisations), Class 7 (Produits)
    budgetable_accounts = [
        a for a in accounts_list
        if str(a.get('code', '')).startswith(('6', '2', '7'))
    ]

    active_fy_id = fiscal_years[0]['id'] if fiscal_years else None
    for fy in fiscal_years:
        if '2026' in str(fy.get('code', '')):
            active_fy_id = fy['id']
            break

    state = {
        'fy_id': active_fy_id,
        'budget_type': None,
        'active_budget': None,
        'report': None,
        'budgets': [],
        'commitments': [],
        'transfers': [],
    }

    async def reload_data() -> None:
        budgets_resp = await api.safe(api.get('/budgets', fiscalYearId=state['fy_id']), default={'rows': []})
        state['budgets'] = budgets_resp.get('rows', [])

        if state['budgets']:
            b_id = state['budgets'][0]['id']
            state['active_budget'] = await api.safe(api.get(f'/budgets/{b_id}'), default=None)
        else:
            state['active_budget'] = None

        state['report'] = await api.safe(
            api.get('/budgets/execution/report', fiscalYearId=state['fy_id'], budgetType=state['budget_type']),
            default={'totalBudget': 0, 'totalCommitted': 0, 'totalSpent': 0, 'totalConsumed': 0, 'remainingBudget': 0, 'overallPctConsumed': 0, 'rows': []}
        )

        b_id_param = state['active_budget']['id'] if state['active_budget'] else None
        comm_resp = await api.safe(api.get('/budget-commitments', budgetId=b_id_param), default={'rows': []})
        state['commitments'] = comm_resp.get('rows', [])

        tr_resp = await api.safe(api.get('/budget-transfers', budgetId=b_id_param), default={'rows': []})
        state['transfers'] = tr_resp.get('rows', [])

    await reload_data()

    # --- UI RENDER -----------------------------------------------------------
    async def _change_fy(new_id: int) -> None:
        state['fy_id'] = new_id
        await reload_data()
        _render_kpis.refresh()
        _render_exec_tab.refresh()
        _render_plans_tab.refresh()
        _render_comm_tab.refresh()
        _render_trans_tab.refresh()

    def _header_actions() -> None:
        with ui.row().classes('items-center gap-3'):
            fy_opts = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years}
            ui.select(
                fy_opts,
                value=state['fy_id'],
                label=_loc('filter_fy'),
                on_change=lambda e: _change_fy(e.value),
            ).props('outlined dense options-dense bg-white').classes('w-64')

    w.page_header(
        _loc('title'),
        _loc('subtitle'),
        icon='account_balance_wallet',
        actions=_header_actions,
    )

    # Top KPI Ribbon
    @ui.refreshable
    def _render_kpis() -> None:
        rep = state['report'] or {}
        tot_b = rep.get('totalBudget', 0)
        tot_comm = rep.get('totalCommitted', 0)
        tot_spent = rep.get('totalSpent', 0)
        tot_avail = rep.get('remainingBudget', 0)
        pct = rep.get('overallPctConsumed', 0)

        with ui.row().classes('w-full gap-4'):
            w.kpi(
                _loc('kpi_total_budget'),
                f"{w.money(tot_b, currency)} {currency}",
                hint=_loc('filter_all_types'),
                tone='slate',
                icon='account_balance_wallet',
            ).classes('flex-1')

            w.kpi(
                _loc('kpi_committed'),
                f"{w.money(tot_comm, currency)} {currency}",
                hint=_loc('note_comm_intro'),
                tone='amber',
                icon='pending_actions',
            ).classes('flex-1')

            w.kpi(
                _loc('kpi_actual'),
                f"{w.money(tot_spent, currency)} {currency}",
                hint='Class 6 & 2 postings',
                tone='indigo',
                icon='receipt_long',
            ).classes('flex-1')

            w.kpi(
                _loc('kpi_available'),
                f"{w.money(tot_avail, currency)} {currency}",
                hint='Net available appropriations',
                tone='emerald' if tot_avail >= 0 else 'rose',
                icon='verified_user' if tot_avail >= 0 else 'warning',
            ).classes('flex-1')

            with ui.card().classes('flex-1 p-4 justify-between'):
                ui.label(_loc('kpi_rate')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                with ui.row().classes('items-baseline gap-2'):
                    ui.label(f"{pct}%").classes('text-2xl font-bold font-mono ' + ('text-rose-600' if pct > 90 else 'text-emerald-700'))
                    ui.label('consumed').classes('text-xs text-slate-400')
                ui.linear_progress(value=min(1.0, pct / 100.0), size='8px').props('rounded ' + ('color=negative' if pct > 90 else 'color=primary'))

    _render_kpis()

    # Navigation Tabs
    with ui.tabs().classes('w-full border-b border-slate-200 mt-4') as tabs:
        t_exec = ui.tab('exec', label=_loc('tab_exec'), icon='query_stats')
        t_plans = ui.tab('plans', label=_loc('tab_plans'), icon='table_chart')
        t_comm = ui.tab('comm', label=_loc('tab_comm'), icon='shopping_cart_checkout')
        t_trans = ui.tab('trans', label=_loc('tab_trans'), icon='sync_alt')

    with ui.tab_panels(tabs, value=t_exec).classes('w-full p-0 bg-transparent'):
        # ---------------------------------------------------------------------
        # TAB 1: EXECUTION DASHBOARD
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_exec).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_exec_tab() -> None:
                rep = state['report'] or {}
                rows = rep.get('rows', [])

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.row().classes('items-center gap-3'):
                            type_opts = {
                                '': _loc('filter_all_types'),
                                'opex': _loc('type_opex'),
                                'capex': _loc('type_capex'),
                                'maintenance': _loc('type_maint'),
                                'revenue': _loc('type_rev'),
                            }
                            ui.select(
                                type_opts,
                                value=state['budget_type'] or '',
                                label=_loc('filter_type'),
                                on_change=lambda e: _change_type(e.value),
                            ).props('outlined dense options-dense bg-white').classes('w-72')

                        with ui.row().classes('items-center gap-2'):
                            search_inp = ui.input(placeholder='Search account or department...').props('outlined dense clearable')
                            search_inp.classes('w-64')

                    table_rows = []
                    for r in rows:
                        b_type = r.get('budget_type') or ('Investissement' if r.get('account_class') == 2 else 'Fonctionnement')
                        table_rows.append({
                            'account': f"{r.get('account_code')} — {r.get('account_name')}",
                            'type': b_type.upper(),
                            'dept': r.get('cost_center_name') or 'Direction Générale',
                            'program': r.get('program_code') or 'Fonds Propres',
                            'budget': w.money(r.get('budget_amount', 0), currency),
                            'committed': w.money(r.get('committed_amount', 0), currency),
                            'spent': w.money(r.get('actual_spent', 0), currency),
                            'avail': w.money(r.get('remaining_budget', 0), currency),
                            'rate': f"{r.get('pct_consumed', 0)}%",
                            '_avail_num': r.get('remaining_budget', 0),
                            '_rate_num': r.get('pct_consumed', 0),
                        })

                    columns = [
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                        {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                        {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                        {'name': 'program', 'label': _loc('col_program'), 'field': 'program', 'align': 'left'},
                        {'name': 'budget', 'label': _loc('col_budget'), 'field': 'budget', 'align': 'right', 'sortable': True},
                        {'name': 'committed', 'label': _loc('col_comm'), 'field': 'committed', 'align': 'right', 'sortable': True},
                        {'name': 'spent', 'label': _loc('col_spent'), 'field': 'spent', 'align': 'right', 'sortable': True},
                        {'name': 'avail', 'label': _loc('col_avail'), 'field': 'avail', 'align': 'right', 'sortable': True},
                        {'name': 'rate', 'label': _loc('col_rate'), 'field': 'rate', 'align': 'right', 'sortable': True},
                    ]

                    exec_table = ui.table(columns=columns, rows=table_rows, pagination=15).classes('w-full lc-table')
                    exec_table.bind_filter_from(search_inp, 'value')

                    # Formatting cells
                    exec_table.add_slot('body-cell-type', '''
                        <q-td :props="props">
                            <q-badge :color="props.value === 'CAPEX' || props.value === 'INVESTISSEMENT' ? 'purple' : (props.value === 'MAINTENANCE' ? 'amber-9' : 'teal')" outline>
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    exec_table.add_slot('body-cell-avail', '''
                        <q-td :props="props" :class="props.row._avail_num < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-semibold font-mono'">
                            {{ props.value }}
                        </q-td>
                    ''')

                    exec_table.add_slot('body-cell-rate', '''
                        <q-td :props="props">
                            <q-chip dense :color="props.row._rate_num > 90 ? 'red-1' : (props.row._rate_num > 70 ? 'amber-1' : 'green-1')"
                                    :text-color="props.row._rate_num > 90 ? 'red-9' : (props.row._rate_num > 70 ? 'amber-9' : 'green-9')">
                                {{ props.value }}
                            </q-chip>
                        </q-td>
                    ''')

            async def _change_type(val: str) -> None:
                state['budget_type'] = val if val else None
                await reload_data()
                _render_kpis.refresh()
                _render_exec_tab.refresh()

            _render_exec_tab()

        # ---------------------------------------------------------------------
        # TAB 2: PLANS & LINES
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_plans).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_plans_tab() -> None:
                b = state['active_budget']
                lines = b.get('lines', []) if b else []

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        if b:
                            with ui.row().classes('items-center gap-3'):
                                ui.label(f"{b.get('code')} — {b.get('name')}").classes('text-lg font-bold text-slate-800')
                                status_color = 'green' if b.get('status') == 'approved' else 'orange'
                                ui.badge(b.get('status', '').upper(), color=status_color).props('outline')
                                if b.get('approver_name'):
                                    ui.label(f"Visa: {b.get('approver_name')}").classes('text-xs text-slate-500 italic')
                        else:
                            ui.label('No budget plan for this fiscal year.').classes('text-slate-500 italic')

                        with ui.row().classes('items-center gap-2'):
                            if b and b.get('status') != 'approved':
                                ui.button(_loc('btn_approve'), icon='check_circle', on_click=_handle_approve_budget).props('color=positive outline')
                            ui.button(_loc('btn_new_line'), icon='add', on_click=_open_add_line_modal).props('unelevated color=primary')
                            ui.button(_loc('btn_new_budget'), icon='create_new_folder', on_click=_open_new_budget_modal).props('outline color=slate-700')

                    line_rows = []
                    for l in lines:
                        line_rows.append({
                            'id': l.get('id'),
                            'account': f"{l.get('account_code')} — {l.get('account_name')}",
                            'type': str(l.get('budget_type', '')).upper(),
                            'dept': l.get('cost_center_name') or 'Direction Générale',
                            'program': l.get('program_code') or 'Fonds Propres',
                            'initial': w.money(l.get('initial_amount', 0), currency),
                            'transfers': w.money(l.get('net_transfers', 0), currency),
                            'amount': w.money(l.get('revised_amount', 0), currency),
                            'control': 'BLOCAGE STRICT' if l.get('control_mode') == 'strict_block' else 'ALERTE',
                            'notes': l.get('notes') or '',
                        })

                    line_cols = [
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                        {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                        {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                        {'name': 'program', 'label': _loc('col_program'), 'field': 'program', 'align': 'left'},
                        {'name': 'initial', 'label': _loc('col_initial'), 'field': 'initial', 'align': 'right'},
                        {'name': 'transfers', 'label': _loc('col_transfers'), 'field': 'transfers', 'align': 'right'},
                        {'name': 'amount', 'label': _loc('col_budget'), 'field': 'amount', 'align': 'right'},
                        {'name': 'control', 'label': 'Mode Contrôle', 'field': 'control', 'align': 'center'},
                        {'name': 'notes', 'label': 'Notes / Justification', 'field': 'notes', 'align': 'left'},
                    ]

                    ui.table(columns=line_cols, rows=line_rows, pagination=15).classes('w-full lc-table')

            _render_plans_tab()

        # ---------------------------------------------------------------------
        # TAB 3: COMMITMENTS (ENGAGEMENTS)
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_comm).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_comm_tab() -> None:
                comms = state['commitments']

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.column().classes('gap-0'):
                            ui.label('Engagements Budgétaires & Réservations de Crédits').classes('text-base font-bold text-slate-800')
                            ui.label(_loc('note_comm_intro')).classes('text-xs text-slate-500 max-w-2xl')

                        ui.button(_loc('btn_new_comm'), icon='add_shopping_cart', on_click=_open_new_comm_modal).props('unelevated color=primary')

                    comm_rows = []
                    for c in comms:
                        asset_str = f"🏷️ {c.get('asset_tag')} ({c.get('asset_name')})" if c.get('asset_tag') else '—'
                        comm_rows.append({
                            'id': c.get('id'),
                            'ref': c.get('commitment_number'),
                            'date': str(c.get('committed_date') or '')[:10],
                            'desc': c.get('description'),
                            'account': f"{c.get('account_code')} ({c.get('budget_type', '').upper()})",
                            'vendor': c.get('vendor_name') or '—',
                            'asset': asset_str,
                            'amount': w.money(c.get('amount', 0), currency),
                            'status': str(c.get('status', '')).upper(),
                            '_status_raw': c.get('status'),
                        })

                    comm_cols = [
                        {'name': 'ref', 'label': _loc('col_ref'), 'field': 'ref', 'align': 'left', 'sortable': True},
                        {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center', 'sortable': True},
                        {'name': 'desc', 'label': _loc('col_desc'), 'field': 'desc', 'align': 'left'},
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                        {'name': 'vendor', 'label': _loc('col_vendor'), 'field': 'vendor', 'align': 'left'},
                        {'name': 'asset', 'label': _loc('col_asset'), 'field': 'asset', 'align': 'left'},
                        {'name': 'amount', 'label': _loc('col_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                        {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                    ]

                    tbl = ui.table(columns=comm_cols, rows=comm_rows, pagination=15).classes('w-full lc-table')

                    tbl.add_slot('body-cell-status', '''
                        <q-td :props="props">
                            <q-badge :color="props.value === 'APPROVED' ? 'positive' : (props.value === 'LIQUIDATED' ? 'indigo' : 'grey-7')">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <q-btn v-if="props.row._status_raw === 'draft'" size="xs" color="positive" dense label="Approuver"
                                   @click="$parent.$emit('approve-comm', props.row.id)" class="q-mr-xs" />
                            <q-btn v-if="props.row._status_raw === 'approved'" size="xs" color="indigo" dense label="Liquider"
                                   @click="$parent.$emit('liquidate-comm', props.row.id)" />
                        </q-td>
                    ''')

                    tbl.on('approve-comm', lambda e: _handle_approve_comm(e.args))
                    tbl.on('liquidate-comm', lambda e: _handle_liquidate_comm(e.args))

            _render_comm_tab()

        # ---------------------------------------------------------------------
        # TAB 4: CREDIT TRANSFERS (VIREMENTS DE CRÉDITS)
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_trans).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_trans_tab() -> None:
                trans = state['transfers']

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.column().classes('gap-0'):
                            ui.label('Virements de Crédits & Décisions Modificatives').classes('text-base font-bold text-slate-800')
                            ui.label(_loc('note_transfer_intro')).classes('text-xs text-slate-500 max-w-2xl')

                        ui.button(_loc('btn_new_transfer'), icon='swap_horiz', on_click=_open_new_transfer_modal).props('unelevated color=primary')

                    tr_rows = []
                    for t_item in trans:
                        tr_rows.append({
                            'id': t_item.get('id'),
                            'ref': t_item.get('transfer_number'),
                            'src': f"{t_item.get('source_account_code')} — {t_item.get('source_account_name')}",
                            'tgt': f"{t_item.get('target_account_code')} — {t_item.get('target_account_name')}",
                            'amount': w.money(t_item.get('amount', 0), currency),
                            'reason': t_item.get('reason'),
                            'status': str(t_item.get('status', '')).upper(),
                            '_status_raw': t_item.get('status'),
                        })

                    tr_cols = [
                        {'name': 'ref', 'label': _loc('col_ref'), 'field': 'ref', 'align': 'left'},
                        {'name': 'src', 'label': _loc('lbl_src_line'), 'field': 'src', 'align': 'left'},
                        {'name': 'tgt', 'label': _loc('lbl_tgt_line'), 'field': 'tgt', 'align': 'left'},
                        {'name': 'amount', 'label': _loc('col_amount'), 'field': 'amount', 'align': 'right'},
                        {'name': 'reason', 'label': _loc('lbl_reason'), 'field': 'reason', 'align': 'left'},
                        {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                    ]

                    tr_table = ui.table(columns=tr_cols, rows=tr_rows, pagination=15).classes('w-full lc-table')

                    tr_table.add_slot('body-cell-status', '''
                        <q-td :props="props">
                            <q-badge :color="props.value === 'APPROVED' ? 'positive' : 'warning'">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    tr_table.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <q-btn v-if="props.row._status_raw === 'pending'" size="xs" color="positive" dense label="Valider Virement"
                                   @click="$parent.$emit('approve-transfer', props.row.id)" />
                        </q-td>
                    ''')

                    tr_table.on('approve-transfer', lambda e: _handle_approve_transfer(e.args))

            _render_trans_tab()

    # --- MODALS & ACTION HANDLERS --------------------------------------------

    async def _handle_approve_budget() -> None:
        if not state['active_budget']:
            return
        b_id = state['active_budget']['id']
        await api.safe(api.post(f'/budgets/{b_id}/approve', {}))
        ui.notify(_loc('msg_budget_approved'), type='positive')
        await reload_data()
        _render_plans_tab.refresh()

    async def _handle_approve_comm(comm_id: int) -> None:
        await api.safe(api.post(f'/budget-commitments/{comm_id}/approve', {}))
        ui.notify(_loc('msg_comm_approved', ref=f"#{comm_id}"), type='positive')
        await reload_data()
        _render_kpis.refresh()
        _render_comm_tab.refresh()
        _render_exec_tab.refresh()

    async def _handle_liquidate_comm(comm_id: int) -> None:
        await api.safe(api.post(f'/budget-commitments/{comm_id}/liquidate', {}))
        ui.notify(_loc('msg_comm_liquidated', ref=f"#{comm_id}"), type='positive')
        await reload_data()
        _render_kpis.refresh()
        _render_comm_tab.refresh()
        _render_exec_tab.refresh()

    async def _handle_approve_transfer(tr_id: int) -> None:
        res = await api.safe(api.post(f'/budget-transfers/{tr_id}/approve', {}))
        if res and res.get('ok'):
            ui.notify(_loc('msg_transfer_approved', ref=f"#{tr_id}"), type='positive')
        await reload_data()
        _render_kpis.refresh()
        _render_trans_tab.refresh()
        _render_plans_tab.refresh()
        _render_exec_tab.refresh()

    # --- Modal: New Budget Commitment
    def _open_new_comm_modal() -> None:
        b = state['active_budget']
        if not b or not b.get('lines'):
            ui.notify('No active budget lines available.', type='warning')
            return

        line_options = {}
        line_lookup = {}
        for l in b.get('lines', []):
            b_type = (l.get('budget_type') or 'opex').upper()
            avail = l.get('available_balance') if l.get('available_balance') is not None else l.get('amount', 0)
            label = f"{l.get('account_code')} ({b_type}) - Avail: {avail} {currency}"
            line_options[l['id']] = label
            line_lookup[l['id']] = l

        first_line_id = list(line_options.keys())[0]

        asset_options = {0: '— Aucun (Dépense de fonctionnement) —'}
        for a in assets_list:
            asset_options[a['id']] = f"🏷️ {a.get('tag')} - {a.get('name')}"

        vendor_options = {0: '— Aucun fournisseur assigné —'}
        for v in vendors:
            vendor_options[v['id']] = v.get('legal_name') or v.get('trade_name')

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_comm_title')).classes('text-lg font-bold text-slate-800')

            sel_line = ui.select(line_options, value=first_line_id, label=_loc('lbl_select_line')).props('outlined dense options-dense').classes('w-full')
            desc_in = ui.input(label=_loc('col_desc'), placeholder='Ex: Achat consommables laboratoire').props('outlined dense').classes('w-full')
            vend_sel = ui.select(vendor_options, value=0, label=_loc('lbl_vendor')).props('outlined dense options-dense').classes('w-full')
            asset_sel = ui.select(asset_options, value=0, label=_loc('lbl_asset')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=1000000, format='%.0f').props('outlined dense').classes('w-full')

            # Real-time availability indicator
            status_label = ui.label('').classes('text-xs font-semibold')

            def update_status() -> None:
                cur_line = line_lookup.get(sel_line.value)
                if not cur_line:
                    return
                # extract raw avail
                avail_val = float(str(cur_line.get('available_balance', '0')).replace(',', ''))
                req_val = float(amt_in.value or 0)
                if req_val > avail_val:
                    status_label.text = f"⚠️ Dépassement budgétaire ! Disponible : {w.money(avail_val, currency)} {currency} (Déficit : {w.money(req_val - avail_val, currency)})"
                    status_label.classes('text-rose-600', remove='text-emerald-600')
                else:
                    status_label.text = f"✅ Crédit suffisant. Solde restant après engagement : {w.money(avail_val - req_val, currency)} {currency}"
                    status_label.classes('text-emerald-600', remove='text-rose-600')

            sel_line.on_value_change(update_status)
            amt_in.on_value_change(update_status)
            update_status()

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button('Cancel', on_click=dlg.close).props('flat color=slate-600')

                async def submit_comm() -> None:
                    if not desc_in.value or not amt_in.value:
                        ui.notify('Please fill required fields.', type='warning')
                        return
                    payload = {
                        'budgetLineId': sel_line.value,
                        'description': desc_in.value.strip(),
                        'vendorId': vend_sel.value if vend_sel.value else None,
                        'assetId': asset_sel.value if asset_sel.value else None,
                        'amount': float(amt_in.value),
                        'committedDate': datetime.date.today().isoformat(),
                    }
                    res = await api.safe(api.post('/budget-commitments', payload))
                    if res and res.get('commitmentNumber'):
                        ui.notify(_loc('msg_comm_success', ref=res['commitmentNumber']), type='positive')
                        dlg.close()
                        await reload_data()
                        _render_kpis.refresh()
                        _render_comm_tab.refresh()
                        _render_exec_tab.refresh()

                ui.button('Confirm & Commit', icon='check', on_click=submit_comm).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Credit Transfer (Virement)
    def _open_new_transfer_modal() -> None:
        b = state['active_budget']
        if not b or not b.get('lines') or len(b.get('lines', [])) < 2:
            ui.notify('At least two budget lines are required to execute a credit transfer.', type='warning')
            return

        lines = b.get('lines', [])
        src_opts = {l['id']: f"{l.get('account_code')} - Avail: {l.get('available_balance', l.get('amount', 0))} {currency}" for l in lines}
        tgt_opts = {l['id']: f"{l.get('account_code')} ({(l.get('budget_type') or 'opex').upper()}) - {l.get('account_name', '')}" for l in lines}

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_transfer_title')).classes('text-lg font-bold text-slate-800')

            src_sel = ui.select(src_opts, value=lines[0]['id'], label=_loc('lbl_src_line')).props('outlined dense options-dense').classes('w-full')
            tgt_sel = ui.select(tgt_opts, value=lines[1]['id'], label=_loc('lbl_tgt_line')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=500000, format='%.0f').props('outlined dense').classes('w-full')
            reason_in = ui.input(label=_loc('lbl_reason'), placeholder='Ex: Renforcement maintenance suite à panne majeure').props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button('Cancel', on_click=dlg.close).props('flat color=slate-600')

                async def submit_tr() -> None:
                    if src_sel.value == tgt_sel.value:
                        ui.notify('Source and target lines must be distinct.', type='warning')
                        return
                    if not reason_in.value or not amt_in.value:
                        ui.notify('Please fill required fields.', type='warning')
                        return
                    payload = {
                        'budgetId': b['id'],
                        'sourceLineId': src_sel.value,
                        'targetLineId': tgt_sel.value,
                        'amount': float(amt_in.value),
                        'reason': reason_in.value.strip(),
                    }
                    res = await api.safe(api.post('/budget-transfers', payload))
                    if res and res.get('transferNumber'):
                        ui.notify(_loc('msg_transfer_success', ref=res['transferNumber']), type='positive')
                        dlg.close()
                        await reload_data()
                        _render_trans_tab.refresh()

                ui.button('Authorize Transfer', icon='swap_horiz', on_click=submit_tr).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Add Budget Line
    def _open_add_line_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify('Please create or select a budget plan first.', type='warning')
            return

        acct_opts = {a['id']: f"{a['code']} - {a['name']}" for a in budgetable_accounts}
        cc_opts = {0: '— Direction Générale (Global) —'}
        for c in cost_centers:
            cc_opts[c['id']] = f"{c['code']} - {c['name']}"

        prog_opts = {0: '— Fonds Propres & Recettes —'}
        for p in funding_programs:
            prog_opts[p['id']] = f"{p['code']} - {p['name']}"

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_line_title')).classes('text-lg font-bold text-slate-800')

            acct_sel = ui.select(acct_opts, value=list(acct_opts.keys())[0] if acct_opts else None, label=_loc('col_account')).props('outlined dense options-dense').classes('w-full')
            type_sel = ui.select({'opex': _loc('type_opex'), 'capex': _loc('type_capex'), 'maintenance': _loc('type_maint'), 'revenue': _loc('type_rev')}, value='opex', label=_loc('col_type')).props('outlined dense').classes('w-full')
            cc_sel = ui.select(cc_opts, value=0, label=_loc('col_dept')).props('outlined dense options-dense').classes('w-full')
            prog_sel = ui.select(prog_opts, value=0, label=_loc('col_program')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=5000000, format='%.0f').props('outlined dense').classes('w-full')
            ctrl_sel = ui.select({'strict_block': _loc('ctrl_strict'), 'warning': _loc('ctrl_warning')}, value='strict_block', label=_loc('lbl_ctrl_mode')).props('outlined dense').classes('w-full')
            notes_in = ui.input(label='Notes / Justification').props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button('Cancel', on_click=dlg.close).props('flat color=slate-600')

                async def submit_line() -> None:
                    if not acct_sel.value or not amt_in.value:
                        ui.notify('Please select account and amount.', type='warning')
                        return
                    payload = {
                        'accountId': acct_sel.value,
                        'budgetType': type_sel.value,
                        'costCenterId': cc_sel.value if cc_sel.value else None,
                        'programId': prog_sel.value if prog_sel.value else None,
                        'amount': float(amt_in.value),
                        'controlMode': ctrl_sel.value,
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.post(f"/budgets/{b['id']}/lines", payload))
                    if res and res.get('id'):
                        ui.notify(_loc('msg_line_added'), type='positive')
                        dlg.close()
                        await reload_data()
                        _render_kpis.refresh()
                        _render_plans_tab.refresh()
                        _render_exec_tab.refresh()

                ui.button('Save Line', icon='save', on_click=submit_line).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Budget Master Plan
    def _open_new_budget_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            ui.label(_loc('dialog_budget_title')).classes('text-lg font-bold text-slate-800')

            code_in = ui.input(label=_loc('lbl_code'), value='BUD-2026-REV').props('outlined dense').classes('w-full')
            name_in = ui.input(label=_loc('lbl_name'), value='Budget Rectificatif 2026').props('outlined dense').classes('w-full')
            notes_in = ui.input(label='Notes / Délibération').props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button('Cancel', on_click=dlg.close).props('flat color=slate-600')

                async def submit_budget() -> None:
                    if not code_in.value or not name_in.value:
                        ui.notify('Please fill code and name.', type='warning')
                        return
                    payload = {
                        'fiscalYearId': state['fy_id'],
                        'code': code_in.value.strip(),
                        'name': name_in.value.strip(),
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.post('/budgets', payload))
                    if res and res.get('id'):
                        ui.notify('Budget plan created.', type='positive')
                        dlg.close()
                        await reload_data()
                        _render_plans_tab.refresh()

                ui.button('Create Plan', icon='add', on_click=submit_budget).props('unelevated color=primary')

        dlg.open()
