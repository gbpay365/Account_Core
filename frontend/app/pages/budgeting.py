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
from typing import Any
from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import widgets as w
from ..ui.shell import page

_T: dict[str, dict[str, str]] = {
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

    'hint_budget_all': {'en': 'All Sections (Opex + Capex)', 'fr': 'Toutes sections (Fonct. + Invest.)'},
    'hint_committed': {'en': 'Statutory expenditure obligations', 'fr': 'Engagements juridiques validés'},
    'hint_actual': {'en': 'Class 6 & 2 GL postings', 'fr': 'Écritures comptables classes 6 & 2'},
    'hint_available': {'en': 'Net available appropriations', 'fr': 'Crédits disponibles nets'},

    'tab_exec': {'en': 'Execution Dashboard', 'fr': 'Tableau de Bord d’Exécution'},
    'tab_plans': {'en': 'Budget Plans & Lines', 'fr': 'Plans & Dotations Budgétaires'},
    'tab_comm': {'en': 'Commitments (Engagements)', 'fr': 'Engagements de Dépenses'},
    'tab_trans': {'en': 'Credit Transfers (Virements)', 'fr': 'Virements & Modifications'},
    'tab_carry': {'en': 'Carryforwards (Reports)', 'fr': 'Reports de Crédits Non Consommés'},

    'lbl_comm_section_title': {
        'en': 'Budget Commitments & Credit Reservations',
        'fr': 'Engagements Budgétaires & Réservations de Crédits',
    },
    'lbl_transfer_section_title': {
        'en': 'Credit Transfers & Budget Amendments',
        'fr': 'Virements de Crédits & Décisions Modificatives',
    },

    'btn_new_budget': {'en': 'New Budget Plan', 'fr': 'Nouveau Plan Budgétaire'},
    'btn_new_line': {'en': 'Add Budget Line', 'fr': 'Ajouter une Ligne'},
    'btn_new_comm': {'en': 'New Commitment', 'fr': 'Nouvel Engagement'},
    'btn_new_transfer': {'en': 'New Credit Transfer', 'fr': 'Nouveau Virement'},
    'btn_carryforward': {'en': 'Carryforward Unconsumed Budget', 'fr': 'Reporter les Crédits Non Consommés'},
    'dialog_carryforward_title': {'en': 'Carryforward Unconsumed Budget to Next Fiscal Year', 'fr': 'Report des Crédits Budgétaires Non Consommés vers N+1'},
    'carryforward_desc': {'en': 'Select the destination fiscal year and unconsumed budgetary allocations to carry forward. Funds are rolled over into the target fiscal year budget as statutory carried-forward appropriations.', 'fr': 'Sélectionnez l’exercice budgétaire de destination et les lignes budgétaires non consommées à reporter. Les disponibilités sont transférées vers le budget de l’exercice cible en crédits reportés.'},
    'lbl_target_fy': {'en': 'Target Fiscal Year (N+1)', 'fr': 'Exercice Budgétaire Cible (N+1)'},
    'lbl_target_budget': {'en': 'Target Budget Plan', 'fr': 'Plan Budgétaire de Destination'},
    'col_carried': {'en': 'Carried Forward (N-1)', 'fr': 'Report N-1'},
    'col_unconsumed': {'en': 'Unconsumed Available', 'fr': 'Disponible Non Consommé'},
    'col_carry_amt': {'en': 'Carryforward Amount', 'fr': 'Montant à Reporter'},
    'btn_execute_carryforward': {'en': 'Execute Carryforward', 'fr': 'Valider le Report Budgétaire'},
    'msg_carryforward_success': {'en': 'Successfully carried forward {count} line(s) totaling {total} to target budget.', 'fr': 'Report budgétaire validé : {count} ligne(s) pour un total de {total} transférées.'},
    'lbl_carryforward_history': {'en': 'Statutory Carryforward Ledger & Roll-over Audits', 'fr': 'Registre Historique des Reports de Crédits Budgétaires'},
    'no_unconsumed_msg': {'en': 'No budget lines with unconsumed available balance found in this budget plan.', 'fr': 'Aucune ligne budgétaire avec un solde disponible non consommé dans ce budget.'},
    'source_fy_label': {'en': 'Source Budget', 'fr': 'Budget Source'},
    'target_fy_label': {'en': 'Target Budget', 'fr': 'Budget Cible'},
    'carried_by_label': {'en': 'Executed by', 'fr': 'Exécuté par'},
    'btn_approve': {'en': 'Approve', 'fr': 'Approuver'},
    'btn_liquidate': {'en': 'Liquidate (Voucher)', 'fr': 'Liquider'},
    'btn_check': {'en': 'Check Availability', 'fr': 'Vérifier Disponibilité'},

    'filter_fy': {'en': 'Fiscal Year', 'fr': 'Exercice Budgétaire'},
    'filter_type': {'en': 'Budget Section', 'fr': 'Section Budgétaire'},
    'filter_all_types': {'en': 'All Sections (Opex + Capex)', 'fr': 'Toutes les sections (Opex + Capex)'},
    'type_opex': {'en': 'Operating (Opex)', 'fr': 'Fonctionnement (Charges)'},
    'type_capex': {'en': 'Capital Investment (Capex)', 'fr': 'Investissement (Immobilisations)'},
    'type_maint': {'en': 'Maintenance (Repairs)', 'fr': 'Maintenance & Travaux'},
    'type_rev': {'en': 'Revenue (Income)', 'fr': 'Recettes / Produits'},

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
    'col_control_mode': {'en': 'Control Policy', 'fr': 'Mode de Contrôle'},
    'col_notes': {'en': 'Notes & Justification', 'fr': 'Notes / Justification'},

    'status_draft': {'en': 'Draft', 'fr': 'Brouillon'},
    'status_approved': {'en': 'Approved', 'fr': 'Approuvé'},
    'status_liquidated': {'en': 'Liquidated', 'fr': 'Liquidé'},
    'status_pending': {'en': 'Pending Approval', 'fr': 'En attente'},
    'status_cancelled': {'en': 'Cancelled', 'fr': 'Annulé'},

    'badge_strict': {'en': 'STRICT BLOCK', 'fr': 'BLOCAGE STRICT'},
    'badge_warning': {'en': 'WARNING', 'fr': 'ALERTE'},

    'default_dept': {'en': 'General Management', 'fr': 'Direction Générale'},
    'default_dept_opt': {'en': '— General Management (Global) —', 'fr': '— Direction Générale (Global) —'},
    'default_program': {'en': 'Own Funds & Revenue', 'fr': 'Fonds Propres & Recettes'},
    'default_program_opt': {'en': '— Own Funds & Revenue —', 'fr': '— Fonds Propres & Recettes —'},
    'no_asset_opt': {'en': '— None (Operating expense) —', 'fr': '— Aucun (Dépense de fonctionnement) —'},
    'no_vendor_opt': {'en': '— No vendor assigned —', 'fr': '— Aucun fournisseur assigné —'},

    'btn_cancel': {'en': 'Cancel', 'fr': 'Annuler'},
    'btn_save_line': {'en': 'Save Line', 'fr': 'Enregistrer la ligne'},
    'btn_create_plan': {'en': 'Create Plan', 'fr': 'Créer le plan'},
    'btn_confirm_commit': {'en': 'Confirm & Commit', 'fr': 'Confirmer l’engagement'},
    'btn_authorize_transfer': {'en': 'Authorize Transfer', 'fr': 'Valider le virement'},
    'btn_approve_comm': {'en': 'Approve', 'fr': 'Approuver'},
    'btn_liquidate_comm': {'en': 'Liquidate', 'fr': 'Liquider'},
    'btn_approve_transfer': {'en': 'Approve Transfer', 'fr': 'Valider Virement'},

    'search_placeholder': {'en': 'Search account or department...', 'fr': 'Rechercher un compte ou service...'},
    'no_plan_notice': {'en': 'No budget plan for this fiscal year.', 'fr': 'Aucun plan budgétaire pour cet exercice.'},
    'visa_label': {'en': 'Approved by:', 'fr': 'Visa :'},
    'default_budget_name': {'en': 'Revised Budget 2026', 'fr': 'Budget Rectificatif 2026'},
    'comm_desc_placeholder': {'en': 'e.g. Purchase of laboratory reagents & consumables', 'fr': 'Ex: Achat consommables laboratoire'},
    'transfer_reason_placeholder': {'en': 'e.g. Maintenance budget reinforcement following technical audit', 'fr': 'Ex: Renforcement maintenance suite à panne majeure'},
    'overrun_warning': {'en': '⚠️ Budget ceiling exceeded! Available: {avail} {curr} (Deficit: {deficit} {curr})', 'fr': '⚠️ Dépassement budgétaire ! Disponible : {avail} {curr} (Déficit : {deficit} {curr})'},
    'credit_ok': {'en': '✅ Sufficient credit. Remaining balance after commitment: {rem} {curr}', 'fr': '✅ Crédit suffisant. Solde restant après engagement : {rem} {curr}'},
    'consumed_label': {'en': 'consumed', 'fr': 'consommé'},
    'notes_label': {'en': 'Notes / Resolution', 'fr': 'Notes / Délibération'},
    'source_line_avail': {'en': 'Avail:', 'fr': 'Dispo :'},

    'note_comm_intro': {
        'en': 'Commitment accounting records statutory expenditure obligations before actual invoicing, reserving credit envelopes to guarantee budgetary discipline.',
        'fr': 'L’engagement est l’acte par lequel l’organisation réserve ses crédits budgétaires avant la passation de commande ou l’acquisition d’une immobilisation.',
    },
    'note_transfer_intro': {
        'en': 'Credit transfers reallocate uncommitted envelopes from surplus budget lines to deficit lines within the same approved fiscal budget.',
        'fr': 'Les virements de crédits permettent de transférer des disponibilités d’une ligne excédentaire vers une ligne déficitaire au sein du même exercice budgétaire.',
    },

    'dialog_comm_title': {'en': 'Register Budget Commitment (Engagement)', 'fr': 'Enregistrer un Engagement Budgétaire'},
    'dialog_transfer_title': {'en': 'Authorise Budget Transfer (Credit Virement)', 'fr': 'Effectuer un Virement de Crédits'},
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

_DATA_I18N = {
    'en': {
        'Budget Prévisionnel 2026 — Exploitation & Investissements': 'Operating & Capital Expenditure Budget 2026',
        'Budget Prévisionnel 2026': 'Initial Budget 2026',
        'Budget Initial 2026': 'Initial Budget 2026',
        'Budget Rectificatif 2026': 'Revised Budget 2026',
        'Acquisition moniteur multiparamétrique haute résolution': 'High-resolution multiparametric monitor acquisition',
        'Contrat de maintenance préventive semestrielle groupe électrogène': 'Semi-annual generator preventive maintenance contract',
        'Commande trimestrielle de consommables généraux': 'Quarterly general consumables & supplies order',
        'Acquisition Scanner IRM 1.5T (Siemens)': '1.5T MRI Scanner Acquisition (Siemens)',
        'Renforcement de la ligne maintenance préventive suite à audit technique': 'Preventive maintenance line reinforcement following technical audit',
        'Renforcement maintenance biomédicale préventive suite à audit': 'Preventive maintenance reinforcement following audit',
        'Achats consommables & réactifs': 'Consumables & laboratory reagents purchases',
        'Fournitures de maintenance & pièces détachées': 'Maintenance supplies & spare parts',
        'Contrats d entretien & prestations techniques': 'Maintenance contracts & technical services',
        'Masse salariale & charges sociales': 'Salaries & statutory social charges',
        'Acquisition matériel technique & biomédical': 'Technical & capital equipment acquisition',
        'Rénovation parc informatique & serveurs': 'IT infrastructure & server renewal',
        'Recettes d exploitation & facturations': 'Operating revenues & billings',
        'Direction Générale': 'General Management',
        'Direction Générale (Global)': 'General Management (Global)',
        'Fonds Propres': 'Own Funds & Equity',
        'Fonds Propres & Recettes': 'Own Funds & Operating Revenue',
    },
    'fr': {
        'Operating & Capital Expenditure Budget 2026': 'Budget Prévisionnel 2026 — Exploitation & Investissements',
        'Initial Budget 2026': 'Budget Prévisionnel 2026',
        'Revised Budget 2026': 'Budget Rectificatif 2026',
        'General Management': 'Direction Générale',
        'General Management (Global)': 'Direction Générale (Global)',
        'Own Funds & Equity': 'Fonds Propres',
        'Own Funds & Operating Revenue': 'Fonds Propres & Recettes',
    }
}


def _loc(key: str, **kwargs: Any) -> str:
    user_lang = lang()
    text = _T.get(key, {}).get(user_lang, _T.get(key, {}).get('en', key))
    return text.format(**kwargs) if kwargs else text


def _tr_val(val: Any) -> str:
    if not val:
        return ''
    s = str(val).strip()
    user_lang = lang()
    pack = _DATA_I18N.get(user_lang, {})
    return pack.get(s, s)


def _tr_status(raw: Any) -> str:
    s = str(raw or '').lower()
    mapping = {
        'approved': {'en': 'APPROVED', 'fr': 'APPROUVÉ'},
        'draft': {'en': 'DRAFT', 'fr': 'BROUILLON'},
        'liquidated': {'en': 'LIQUIDATED', 'fr': 'LIQUIDÉ'},
        'pending': {'en': 'PENDING', 'fr': 'EN ATTENTE'},
        'cancelled': {'en': 'CANCELLED', 'fr': 'ANNULÉ'},
    }
    return mapping.get(s, {}).get(lang(), s.upper())


def _tr_type(raw: Any) -> str:
    t_key = str(raw or '').lower()
    mapping = {
        'opex': {'en': 'OPERATING (OPEX)', 'fr': 'FONCTIONNEMENT (CHARGES)'},
        'capex': {'en': 'CAPITAL (CAPEX)', 'fr': 'INVESTISSEMENT (IMMOBILISATIONS)'},
        'maintenance': {'en': 'MAINTENANCE', 'fr': 'MAINTENANCE & TRAVAUX'},
        'revenue': {'en': 'REVENUE', 'fr': 'RECETTES / PRODUITS'},
    }
    return mapping.get(t_key, {}).get(lang(), t_key.upper())


def _tr_ctrl(mode: Any) -> str:
    m = str(mode or '').lower()
    if m == 'strict_block':
        return _loc('badge_strict')
    return _loc('badge_warning')


def _tr_account(code: Any, name: Any, name_en: Any = None) -> str:
    c = str(code or '')
    if lang() == 'en' and name_en:
        return f"{c} — {name_en}"
    return f"{c} — {_tr_val(name)}"


def _tr_dept(name: Any, name_en: Any = None) -> str:
    if lang() == 'en' and name_en:
        return str(name_en)
    if name:
        return _tr_val(name)
    return _loc('default_dept')


def _tr_prog(code: Any, name_en: Any = None) -> str:
    if lang() == 'en' and name_en:
        return str(name_en)
    if code:
        return _tr_val(code)
    return _loc('default_program')


def _tr_asset(asset_tag: Any, asset_name: Any, asset_name_en: Any = None) -> str:
    if not asset_tag:
        return '—'
    nm = asset_name_en if (lang() == 'en' and asset_name_en) else asset_name
    return f"🏷️ {asset_tag} ({_tr_val(nm)})"


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
        'carryforwards': [],
    }

    refreshers: dict[str, Any] = {}

    def _refresh_all() -> None:
        for fn in list(refreshers.values()):
            try:
                fn()
            except Exception:
                pass

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

        cf_resp = await api.safe(api.get('/budget-carryforwards', fiscalYearId=state['fy_id']), default={'rows': []})
        state['carryforwards'] = cf_resp.get('rows', [])

    await reload_data()

    # --- UI RENDER -----------------------------------------------------------
    async def _change_fy(new_id: int) -> None:
        state['fy_id'] = new_id
        await reload_data()
        _refresh_all()

    # --- MODALS & ACTION HANDLERS --------------------------------------------

    async def _handle_approve_budget() -> None:
        if not state['active_budget']:
            return
        b_id = state['active_budget']['id']
        await api.safe(api.post(f'/budgets/{b_id}/approve', {}))
        ui.notify(_loc('msg_budget_approved'), type='positive')
        await reload_data()
        _refresh_all()

    async def _handle_approve_comm(comm_id: int) -> None:
        await api.safe(api.post(f'/budget-commitments/{comm_id}/approve', {}))
        ui.notify(_loc('msg_comm_approved', ref=f"#{comm_id}"), type='positive')
        await reload_data()
        _refresh_all()

    async def _handle_liquidate_comm(comm_id: int) -> None:
        await api.safe(api.post(f'/budget-commitments/{comm_id}/liquidate', {}))
        ui.notify(_loc('msg_comm_liquidated', ref=f"#{comm_id}"), type='positive')
        await reload_data()
        _refresh_all()

    async def _handle_approve_transfer(tr_id: int) -> None:
        res = await api.safe(api.post(f'/budget-transfers/{tr_id}/approve', {}))
        if res and res.get('ok'):
            ui.notify(_loc('msg_transfer_approved', ref=f"#{tr_id}"), type='positive')
        await reload_data()
        _refresh_all()

    # --- Modal: New Budget Commitment
    def _open_new_comm_modal() -> None:
        b = state['active_budget']
        if not b or not b.get('lines'):
            ui.notify('No active budget lines available.', type='warning')
            return

        line_options = {}
        line_lookup = {}
        avail_label = _loc('source_line_avail')
        for l in b.get('lines', []):
            b_type = _tr_type(l.get('budget_type') or 'opex')
            avail = l.get('available_balance') if l.get('available_balance') is not None else l.get('amount', 0)
            acct_display = _tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))
            label = f"{acct_display} ({b_type}) - {avail_label} {w.money(avail, currency)} {currency}"
            line_options[l['id']] = label
            line_lookup[l['id']] = l

        first_line_id = list(line_options.keys())[0]

        asset_options = {0: _loc('no_asset_opt')}
        for a in assets_list:
            a_name = a.get('name_en') if (lang() == 'en' and a.get('name_en')) else a.get('name')
            asset_options[a['id']] = f"🏷️ {a.get('tag')} - {_tr_val(a_name)}"

        vendor_options = {0: _loc('no_vendor_opt')}
        for v in vendors:
            vendor_options[v['id']] = v.get('legal_name') or v.get('trade_name')

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_comm_title')).classes('text-lg font-bold text-slate-800')

            sel_line = ui.select(line_options, value=first_line_id, label=_loc('lbl_select_line')).props('outlined dense options-dense').classes('w-full')
            desc_in = ui.input(label=_loc('col_desc'), placeholder=_loc('comm_desc_placeholder')).props('outlined dense').classes('w-full')
            vend_sel = ui.select(vendor_options, value=0, label=_loc('lbl_vendor')).props('outlined dense options-dense').classes('w-full')
            asset_sel = ui.select(asset_options, value=0, label=_loc('lbl_asset')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=1000000, format='%.0f').props('outlined dense').classes('w-full')

            # Real-time availability indicator
            status_label = ui.label('').classes('text-xs font-semibold')

            def update_status() -> None:
                cur_line = line_lookup.get(sel_line.value)
                if not cur_line:
                    return
                avail_val = float(str(cur_line.get('available_balance', '0')).replace(',', ''))
                req_val = float(amt_in.value or 0)
                if req_val > avail_val:
                    status_label.text = _loc('overrun_warning', avail=w.money(avail_val, currency), curr=currency, deficit=w.money(req_val - avail_val, currency))
                    status_label.classes('text-rose-600', remove='text-emerald-600')
                else:
                    status_label.text = _loc('credit_ok', rem=w.money(avail_val - req_val, currency), curr=currency)
                    status_label.classes('text-emerald-600', remove='text-rose-600')

            sel_line.on_value_change(update_status)
            amt_in.on_value_change(update_status)
            update_status()

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=slate-600')

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
                        _refresh_all()

                ui.button(_loc('btn_confirm_commit'), icon='check', on_click=submit_comm).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Credit Transfer (Virement)
    def _open_new_transfer_modal() -> None:
        b = state['active_budget']
        if not b or not b.get('lines') or len(b.get('lines', [])) < 2:
            ui.notify('At least two budget lines are required to execute a credit transfer.', type='warning')
            return

        lines = b.get('lines', [])
        avail_label = _loc('source_line_avail')
        src_opts = {l['id']: f"{_tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))} - {avail_label} {w.money(l.get('available_balance', l.get('amount', 0)), currency)} {currency}" for l in lines}
        tgt_opts = {l['id']: f"{_tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))} ({_tr_type(l.get('budget_type') or 'opex')})" for l in lines}

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_transfer_title')).classes('text-lg font-bold text-slate-800')

            src_sel = ui.select(src_opts, value=lines[0]['id'], label=_loc('lbl_src_line')).props('outlined dense options-dense').classes('w-full')
            tgt_sel = ui.select(tgt_opts, value=lines[1]['id'], label=_loc('lbl_tgt_line')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=500000, format='%.0f').props('outlined dense').classes('w-full')
            reason_in = ui.input(label=_loc('lbl_reason'), placeholder=_loc('transfer_reason_placeholder')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=slate-600')

                async def submit_tr() -> None:
                    if src_sel.value == tgt_sel.value:
                        ui.notify('Source and target lines must be distinct.', type='warning')
                        return
                    if not reason_in.value or not amt_in.value:
                        ui.notify('Please fill amount and reason.', type='warning')
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
                        _refresh_all()

                ui.button(_loc('btn_authorize_transfer'), icon='swap_horiz', on_click=submit_tr).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Add Budget Line
    def _open_add_line_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify('Please create or select a budget plan first.', type='warning')
            return

        acct_opts = {a['id']: _tr_account(a.get('code'), a.get('name'), a.get('name_en')) for a in budgetable_accounts}
        cc_opts = {0: _loc('default_dept_opt')}
        for c in cost_centers:
            cc_name = c.get('name_en') if (lang() == 'en' and c.get('name_en')) else c.get('name')
            cc_opts[c['id']] = f"{c['code']} - {_tr_val(cc_name)}"

        prog_opts = {0: _loc('default_program_opt')}
        for p in funding_programs:
            p_name = p.get('name_en') if (lang() == 'en' and p.get('name_en')) else p.get('name')
            prog_opts[p['id']] = f"{p['code']} - {_tr_val(p_name)}"

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_line_title')).classes('text-lg font-bold text-slate-800')

            acct_sel = ui.select(acct_opts, value=list(acct_opts.keys())[0] if acct_opts else None, label=_loc('col_account')).props('outlined dense options-dense').classes('w-full')
            type_sel = ui.select({'opex': _loc('type_opex'), 'capex': _loc('type_capex'), 'maintenance': _loc('type_maint'), 'revenue': _loc('type_rev')}, value='opex', label=_loc('col_type')).props('outlined dense').classes('w-full')
            cc_sel = ui.select(cc_opts, value=0, label=_loc('col_dept')).props('outlined dense options-dense').classes('w-full')
            prog_sel = ui.select(prog_opts, value=0, label=_loc('col_program')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=5000000, format='%.0f').props('outlined dense').classes('w-full')
            ctrl_sel = ui.select({'strict_block': _loc('ctrl_strict'), 'warning': _loc('ctrl_warning')}, value='strict_block', label=_loc('lbl_ctrl_mode')).props('outlined dense').classes('w-full')
            notes_in = ui.input(label=_loc('col_notes')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=slate-600')

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
                        _refresh_all()

                ui.button(_loc('btn_save_line'), icon='save', on_click=submit_line).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Budget Master Plan
    def _open_new_budget_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            ui.label(_loc('dialog_budget_title')).classes('text-lg font-bold text-slate-800')

            code_in = ui.input(label=_loc('lbl_code'), value='BUD-2026-REV').props('outlined dense').classes('w-full')
            name_in = ui.input(label=_loc('lbl_name'), value=_loc('default_budget_name')).props('outlined dense').classes('w-full')
            notes_in = ui.input(label=_loc('notes_label')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=slate-600')

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
                        _refresh_all()

                ui.button(_loc('btn_create_plan'), icon='add', on_click=submit_budget).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Carryforward Unconsumed Budget
    async def _open_carryforward_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify('No active budget to carry forward from.', type='warning')
            return

        unconsumed_resp = await api.safe(api.get(f"/budgets/{b['id']}/unconsumed-lines"), default={'lines': []})
        unconsumed_lines = unconsumed_resp.get('lines', [])

        if not unconsumed_lines:
            ui.notify(_loc('no_unconsumed_msg'), type='info', position='top')
            return

        target_fy_options = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years if fy['id'] != state['fy_id']}
        if not target_fy_options:
            target_fy_options = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years}

        default_target_fy = list(target_fy_options.keys())[0] if target_fy_options else state['fy_id']

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-4xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between no-wrap border-b border-slate-200 pb-3'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_carryforward_title')).classes('text-lg font-bold text-slate-800')
                    ui.label(_loc('carryforward_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            with ui.row().classes('w-full gap-4 items-center bg-slate-50 p-3 rounded-lg border border-slate-200'):
                ui.label(f"{_loc('source_fy_label')}: {b.get('code')} ({b.get('fiscal_year_code')})").classes('text-xs font-bold text-slate-700')
                target_fy_sel = ui.select(
                    target_fy_options,
                    value=default_target_fy,
                    label=_loc('lbl_target_fy')
                ).props('outlined dense bg-white options-dense').classes('w-72')

                reason_in = ui.input(
                    label=_loc('lbl_reason'),
                    value=f"Report des crédits non consommés {b.get('fiscal_year_code', '')}"
                ).props('outlined dense bg-white').classes('flex-1')

            ui.label(_loc('lbl_select_line')).classes('text-xs font-bold uppercase tracking-wider text-slate-600 mt-1')

            line_controls = []
            with ui.column().classes('w-full gap-2 max-h-[360px] overflow-y-auto pr-1'):
                for l in unconsumed_lines:
                    avail_amt = float(l.get('unconsumedAvailable', 0))
                    with ui.row().classes('w-full items-center justify-between p-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50/80 gap-3 no-wrap'):
                        cb = ui.checkbox(value=True).props('dense')
                        with ui.column().classes('gap-0 min-w-[240px] flex-1'):
                            acct_str = _tr_account(l.get('accountCode'), l.get('accountName'), l.get('accountNameEn'))
                            ui.label(acct_str).classes('text-xs font-semibold text-slate-800 truncate')
                            dept_str = _tr_dept(l.get('costCenterName'), l.get('costCenterNameEn'))
                            ui.label(f"{_tr_type(l.get('budgetType'))} · {dept_str}").classes('text-[11px] text-slate-500')

                        with ui.column().classes('gap-0 text-right min-w-[120px]'):
                            ui.label(f"{_loc('col_unconsumed')}:").classes('text-[10px] text-slate-400')
                            ui.label(w.money(avail_amt, currency)).classes('text-xs font-mono font-bold text-emerald-700')

                        amt_input = ui.number(
                            value=avail_amt,
                            min=0,
                            max=avail_amt,
                            format='%.0f',
                            label=_loc('col_carry_amt')
                        ).props('outlined dense bg-white').classes('w-36')

                        line_controls.append({
                            'lineId': l['id'],
                            'checkbox': cb,
                            'input': amt_input,
                            'avail': avail_amt,
                        })

            total_lbl = ui.label('').classes('text-sm font-bold text-slate-800')

            def _update_total() -> None:
                tot = sum(float(c['input'].value or 0) for c in line_controls if c['checkbox'].value)
                total_lbl.set_text(f"Total Carryforward: {w.money(tot, currency)}")

            for c in line_controls:
                c['checkbox'].on_value_change(lambda _: _update_total())
                c['input'].on_value_change(lambda _: _update_total())
            _update_total()

            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-2'):
                total_lbl
                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=slate-600')

                    async def _submit_carryforward() -> None:
                        selected = [
                            {'lineId': c['lineId'], 'amount': float(c['input'].value)}
                            for c in line_controls
                            if c['checkbox'].value and float(c['input'].value or 0) > 0
                        ]
                        if not selected:
                            ui.notify('Please select at least one line with amount > 0.', type='warning')
                            return

                        payload = {
                            'targetFiscalYearId': target_fy_sel.value,
                            'lines': selected,
                            'reason': reason_in.value or 'Report de crédits non consommés',
                        }
                        res = await api.safe(api.post(f"/budgets/{b['id']}/carryforward", payload))
                        if res and res.get('success'):
                            tot_amt = res.get('totalCarriedAmount', 0)
                            count = res.get('linesCarried', len(selected))
                            msg = _loc('msg_carryforward_success').format(count=count, total=w.money(tot_amt, currency))
                            ui.notify(msg, type='positive', position='top')
                            dlg.close()
                            await reload_data()
                            _refresh_all()

                    ui.button(_loc('btn_execute_carryforward'), icon='move_up', on_click=_submit_carryforward).props('unelevated color=primary')

        dlg.open()

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

        def _render_kpi_card(
            title: str,
            amount: float | int,
            curr: str,
            *,
            hint: str,
            icon_name: str,
            tone: str,
        ) -> None:
            tints = {
                'sky': ('bg-sky-50 text-sky-700 border-sky-200/80', 'bg-sky-50 text-sky-700 border-sky-300/80'),
                'amber': ('bg-amber-50 text-amber-700 border-amber-200/80', 'bg-amber-50 text-amber-800 border-amber-300/80'),
                'indigo': ('bg-indigo-50 text-indigo-700 border-indigo-200/80', 'bg-indigo-50 text-indigo-700 border-indigo-300/80'),
                'emerald': ('bg-emerald-50 text-emerald-700 border-emerald-200/80', 'bg-emerald-50 text-emerald-800 border-emerald-300/80'),
                'rose': ('bg-rose-50 text-rose-700 border-rose-200/80', 'bg-rose-50 text-rose-800 border-rose-300/80'),
                'teal': ('bg-teal-50 text-teal-700 border-teal-200/80', 'bg-teal-50 text-teal-800 border-teal-300/80'),
            }
            icon_theme, badge_theme = tints.get(tone, tints['sky'])
            formatted_amt = w.money(amount, curr)

            card_el = ui.element('div').classes('lc-card p-4 flex-1 min-w-[200px] flex flex-col justify-between hover:border-slate-300 transition-colors')
            with card_el:
                # Row 1: Title on left, Adjusted Icon on top-right
                with ui.row().classes('items-center justify-between w-full no-wrap gap-2 mb-2'):
                    ui.label(title).classes('text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-snug truncate')
                    with ui.element('div').classes(f'{icon_theme} w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs'):
                        ui.icon(icon_name).classes('text-[16px]')

                # Row 2: Formatted Value + Distinct, high-visibility XAF badge
                with ui.row().classes('items-baseline gap-1.5 w-full no-wrap my-0.5').tooltip(f"{formatted_amt} {curr}"):
                    ui.label(formatted_amt).classes('text-[18px] xl:text-[20px] font-bold font-mono text-slate-900 tracking-tight truncate')
                    ui.label(curr).classes(f'text-[11px] font-extrabold uppercase shrink-0 px-2 py-0.5 rounded tracking-wide font-mono border {badge_theme}')

                # Row 3: Subtitle / hint
                ui.label(hint).classes('text-[11px] text-slate-400 truncate mt-1')

        with ui.row().classes('w-full gap-3.5 items-stretch'):
            _render_kpi_card(
                _loc('kpi_total_budget'),
                tot_b,
                currency,
                hint=_loc('hint_budget_all'),
                icon_name='account_balance',
                tone='sky',
            )

            _render_kpi_card(
                _loc('kpi_committed'),
                tot_comm,
                currency,
                hint=_loc('hint_committed'),
                icon_name='assignment_turned_in',
                tone='amber',
            )

            _render_kpi_card(
                _loc('kpi_actual'),
                tot_spent,
                currency,
                hint=_loc('hint_actual'),
                icon_name='receipt_long',
                tone='indigo',
            )

            avail_tone = 'emerald' if tot_avail >= 0 else 'rose'
            avail_icon = 'savings' if tot_avail >= 0 else 'warning'
            _render_kpi_card(
                _loc('kpi_available'),
                tot_avail,
                currency,
                hint=_loc('hint_available'),
                icon_name=avail_icon,
                tone=avail_tone,
            )

            # Card 5: Overall Execution Rate
            with ui.element('div').classes('lc-card p-4 flex-1 min-w-[200px] flex flex-col justify-between hover:border-slate-300 transition-colors'):
                with ui.row().classes('items-center justify-between w-full no-wrap gap-2 mb-2'):
                    ui.label(_loc('kpi_rate')).classes('text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-snug truncate')
                    with ui.element('div').classes('bg-teal-50 text-teal-700 border border-teal-200/80 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs'):
                        ui.icon('speed').classes('text-[16px]')

                with ui.row().classes('items-baseline gap-2 w-full no-wrap my-0.5'):
                    rate_color = 'text-rose-600' if pct > 90 else 'text-emerald-700'
                    ui.label(f"{pct}%").classes(f'text-[20px] font-bold font-mono {rate_color}')
                    ui.label(_loc('consumed_label')).classes('text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0')

                with ui.row().classes('w-full items-center mt-1'):
                    ui.linear_progress(value=min(1.0, pct / 100.0), size='7px').props('rounded ' + ('color=negative' if pct > 90 else 'color=primary')).classes('w-full')

    refreshers['kpis'] = _render_kpis.refresh
    _render_kpis()

    # Navigation Tabs
    with ui.tabs().classes('w-full border-b border-slate-200 mt-4') as tabs:
        t_exec = ui.tab('exec', label=_loc('tab_exec'), icon='query_stats')
        t_plans = ui.tab('plans', label=_loc('tab_plans'), icon='table_chart')
        t_comm = ui.tab('comm', label=_loc('tab_comm'), icon='shopping_cart_checkout')
        t_trans = ui.tab('trans', label=_loc('tab_trans'), icon='sync_alt')
        t_carry = ui.tab('carry', label=_loc('tab_carry'), icon='move_up')

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
                            search_inp = ui.input(placeholder=_loc('search_placeholder')).props('outlined dense clearable')
                            search_inp.classes('w-64')

                    table_rows = []
                    for r in rows:
                        b_type_str = _tr_type(r.get('budget_type') or ('capex' if r.get('account_class') == 2 else 'opex'))
                        acct_str = _tr_account(r.get('account_code'), r.get('account_name'), r.get('account_name_en'))
                        dept_str = _tr_dept(r.get('cost_center_name'), r.get('cost_center_name_en'))
                        prog_str = _tr_prog(r.get('program_code'), r.get('program_name_en'))

                        table_rows.append({
                            'account': acct_str,
                            'type': b_type_str,
                            'dept': dept_str,
                            'program': prog_str,
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

                    exec_table.add_slot('body-cell-type', '''
                        <q-td :props="props">
                            <q-badge color="grey-3" text-color="grey-9" class="text-weight-bold">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    exec_table.add_slot('body-cell-avail', '''
                        <q-td :props="props" :class="props.row._avail_num < 0 ? 'text-negative text-weight-bold' : 'text-positive'">
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
                _refresh_all()

            refreshers['exec'] = _render_exec_tab.refresh
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
                                plan_name = _tr_val(b.get('name'))
                                ui.label(f"{b.get('code')} — {plan_name}").classes('text-lg font-bold text-slate-800')
                                status_color = 'green' if b.get('status') == 'approved' else 'orange'
                                ui.badge(_tr_status(b.get('status')), color=status_color).props('outline')
                                if b.get('approver_name'):
                                    ui.label(f"{_loc('visa_label')} {b.get('approver_name')}").classes('text-xs text-slate-500 italic')
                        else:
                            ui.label(_loc('no_plan_notice')).classes('text-slate-500 italic')

                        with ui.row().classes('items-center gap-2'):
                            if b and b.get('status') != 'approved':
                                ui.button(_loc('btn_approve'), icon='check_circle', on_click=_handle_approve_budget).props('color=positive outline')
                            ui.button(_loc('btn_new_line'), icon='add', on_click=_open_add_line_modal).props('unelevated color=primary')
                            ui.button(_loc('btn_carryforward'), icon='move_up', on_click=_open_carryforward_modal).props('outline color=amber-9')
                            ui.button(_loc('btn_new_budget'), icon='create_new_folder', on_click=_open_new_budget_modal).props('outline color=slate-700')

                    line_rows = []
                    for l in lines:
                        acct_str = _tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))
                        dept_str = _tr_dept(l.get('cost_center_name'), l.get('cost_center_name_en'))
                        prog_str = _tr_prog(l.get('program_code'), l.get('program_name_en'))
                        type_str = _tr_type(l.get('budget_type'))
                        ctrl_str = _tr_ctrl(l.get('control_mode'))
                        notes_str = _tr_val(l.get('notes') or '')

                        line_rows.append({
                            'id': l.get('id'),
                            'account': acct_str,
                            'type': type_str,
                            'dept': dept_str,
                            'program': prog_str,
                            'initial': w.money(l.get('initial_amount', 0), currency),
                            'carried': w.money(l.get('carried_forward_amount', 0), currency),
                            'transfers': w.money(l.get('net_transfers', 0), currency),
                            'amount': w.money(l.get('revised_amount', 0), currency),
                            'control': ctrl_str,
                            'notes': notes_str,
                        })

                    line_cols = [
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                        {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                        {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                        {'name': 'program', 'label': _loc('col_program'), 'field': 'program', 'align': 'left'},
                        {'name': 'initial', 'label': _loc('col_initial'), 'field': 'initial', 'align': 'right'},
                        {'name': 'carried', 'label': _loc('col_carried'), 'field': 'carried', 'align': 'right'},
                        {'name': 'transfers', 'label': _loc('col_transfers'), 'field': 'transfers', 'align': 'right'},
                        {'name': 'amount', 'label': _loc('col_budget'), 'field': 'amount', 'align': 'right'},
                        {'name': 'control', 'label': _loc('col_control_mode'), 'field': 'control', 'align': 'center'},
                        {'name': 'notes', 'label': _loc('col_notes'), 'field': 'notes', 'align': 'left'},
                    ]

                    ui.table(columns=line_cols, rows=line_rows, pagination=15).classes('w-full lc-table')

            refreshers['plans'] = _render_plans_tab.refresh
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
                            ui.label(_loc('lbl_comm_section_title')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('note_comm_intro')).classes('text-xs text-slate-500 max-w-2xl')

                        ui.button(_loc('btn_new_comm'), icon='add_shopping_cart', on_click=_open_new_comm_modal).props('unelevated color=primary')

                    comm_rows = []
                    btn_approve_txt = _loc('btn_approve_comm')
                    btn_liquidate_txt = _loc('btn_liquidate_comm')

                    for c in comms:
                        asset_str = _tr_asset(c.get('asset_tag'), c.get('asset_name'), c.get('asset_name_en'))
                        desc_str = _tr_val(c.get('description'))
                        type_str = _tr_type(c.get('budget_type'))
                        acct_code = c.get('account_code') or ''

                        comm_rows.append({
                            'id': c.get('id'),
                            'ref': c.get('commitment_number'),
                            'date': str(c.get('committed_date') or '')[:10],
                            'desc': desc_str,
                            'account': f"{acct_code} ({type_str})",
                            'vendor': c.get('vendor_name') or '—',
                            'asset': asset_str,
                            'amount': w.money(c.get('amount', 0), currency),
                            'status': _tr_status(c.get('status')),
                            '_status_raw': c.get('status'),
                            '_btn_approve': btn_approve_txt,
                            '_btn_liquidate': btn_liquidate_txt,
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
                            <q-badge :color="props.row._status_raw === 'approved' ? 'positive' : (props.row._status_raw === 'liquidated' ? 'indigo' : 'grey-7')">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <q-btn v-if="props.row._status_raw === 'draft'" size="xs" color="positive" dense :label="props.row._btn_approve"
                                   @click="$parent.$emit('approve-comm', props.row.id)" class="q-mr-xs" />
                            <q-btn v-if="props.row._status_raw === 'approved'" size="xs" color="indigo" dense :label="props.row._btn_liquidate"
                                   @click="$parent.$emit('liquidate-comm', props.row.id)" />
                        </q-td>
                    ''')

                    tbl.on('approve-comm', lambda e: _handle_approve_comm(e.args))
                    tbl.on('liquidate-comm', lambda e: _handle_liquidate_comm(e.args))

            refreshers['comm'] = _render_comm_tab.refresh
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
                            ui.label(_loc('lbl_transfer_section_title')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('note_transfer_intro')).classes('text-xs text-slate-500 max-w-2xl')

                        ui.button(_loc('btn_new_transfer'), icon='swap_horiz', on_click=_open_new_transfer_modal).props('unelevated color=primary')

                    tr_rows = []
                    btn_approve_tr_txt = _loc('btn_approve_transfer')

                    for t_item in trans:
                        src_str = _tr_account(t_item.get('source_account_code'), t_item.get('source_account_name'), t_item.get('source_account_name_en'))
                        tgt_str = _tr_account(t_item.get('target_account_code'), t_item.get('target_account_name'), t_item.get('target_account_name_en'))
                        reason_str = _tr_val(t_item.get('reason'))

                        tr_rows.append({
                            'id': t_item.get('id'),
                            'ref': t_item.get('transfer_number'),
                            'src': src_str,
                            'tgt': tgt_str,
                            'amount': w.money(t_item.get('amount', 0), currency),
                            'reason': reason_str,
                            'status': _tr_status(t_item.get('status')),
                            '_status_raw': t_item.get('status'),
                            '_btn_label': btn_approve_tr_txt,
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
                            <q-badge :color="props.row._status_raw === 'approved' ? 'positive' : 'warning'">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    tr_table.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <q-btn v-if="props.row._status_raw === 'pending'" size="xs" color="positive" dense :label="props.row._btn_label"
                                   @click="$parent.$emit('approve-transfer', props.row.id)" />
                        </q-td>
                    ''')

                    tr_table.on('approve-transfer', lambda e: _handle_approve_transfer(e.args))

            refreshers['trans'] = _render_trans_tab.refresh
            _render_trans_tab()

        # ---------------------------------------------------------------------
        # TAB 5: CARRYFORWARDS & ROLL-OVERS
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_carry).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_carry_tab() -> None:
                cfs = state['carryforwards']

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.column().classes('gap-0'):
                            ui.label(_loc('lbl_carryforward_history')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('carryforward_desc')).classes('text-xs text-slate-500 max-w-2xl')

                        ui.button(_loc('btn_carryforward'), icon='move_up', on_click=_open_carryforward_modal).props('unelevated color=primary')

                    cf_rows = []
                    for cf in cfs:
                        cf_rows.append({
                            'id': cf.get('id'),
                            'date': str(cf.get('carried_at', ''))[:16],
                            'source': f"{cf.get('source_budget_code')} ({cf.get('source_fy_code')})",
                            'target': f"{cf.get('target_budget_code')} ({cf.get('target_fy_code')})",
                            'account': _tr_account(cf.get('account_code'), cf.get('account_name'), cf.get('account_name_en')),
                            'dept': _tr_dept(cf.get('cost_center_name')),
                            'amount': w.money(cf.get('amount', 0), currency),
                            'reason': _tr_val(cf.get('reason') or ''),
                            'user': cf.get('carried_by_name') or '—',
                        })

                    columns = [
                        {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'left'},
                        {'name': 'source', 'label': _loc('source_fy_label'), 'field': 'source', 'align': 'left'},
                        {'name': 'target', 'label': _loc('target_fy_label'), 'field': 'target', 'align': 'left'},
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                        {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                        {'name': 'amount', 'label': _loc('col_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                        {'name': 'reason', 'label': _loc('lbl_reason'), 'field': 'reason', 'align': 'left'},
                        {'name': 'user', 'label': _loc('carried_by_label'), 'field': 'user', 'align': 'center'},
                    ]

                    cf_table = ui.table(columns=columns, rows=cf_rows, pagination=15).classes('w-full lc-table')
                    cf_table.add_slot('body-cell-amount', '''
                        <q-td :props="props" class="font-mono font-bold text-amber-800">
                            {{ props.value }}
                        </q-td>
                    ''')

            refreshers['carry'] = _render_carry_tab.refresh
            _render_carry_tab()
