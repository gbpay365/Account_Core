"""
CEMAC Multi-Donor Project & Grant Accounting (Tompro / Succès Parity).
Manages international donor conventions (Global Fund, World Bank, AFD, USAID),
eligible expense categories, Demandes de Retrait de Fonds (DRF), and Statement of Expenditures (SOE).
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {
        'en': 'Donor Projects & Grants Accounting (Tompro / Succès Parity)',
        'fr': 'Comptabilité des Projets Bailleurs & Subventions (Tompro / Succès)',
    },
    'subtitle': {
        'en': 'Multi-donor conventions, budget tracking by agreement, Withdrawal Applications (DRF), and Statement of Expenditures (SOE)',
        'fr': 'Gestion multi-bailleurs, suivi budgétaire par convention, Demandes de Retrait de Fonds (DRF) et SOE',
    },
    'new_agreement_btn': {'en': 'New Donor Convention', 'fr': 'Nouvelle Convention Bailleur'},
    'new_cat_btn': {'en': 'New Category', 'fr': 'Nouvelle Catégorie'},
    'create_drf_btn': {'en': 'Create DRF', 'fr': 'Créer une DRF'},
    'active_project_label': {'en': 'Active Project / Convention', 'fr': 'Projet / Convention Active'},
    'no_project': {'en': 'No donor project registered. Please create one.', 'fr': 'Aucun projet bailleur enregistré. Veuillez en créer un.'},
    'kpi_budget': {'en': 'Total Convention Budget', 'fr': 'Budget Global Convention'},
    'kpi_spent': {'en': 'Justified / Disbursed Expenses', 'fr': 'Dépenses Justifiées / Décaissées'},
    'kpi_avail': {'en': 'Available Budget Balance', 'fr': 'Solde Budgétaire Disponible'},
    'kpi_exec': {'en': 'Financial Execution Rate', 'fr': 'Taux d’Exécution Financière'},
    'currency_rate': {'en': 'Currency: {cur} (Rate: {rate}%)', 'fr': 'Devise : {cur} (Taux : {rate}%)'},
    'cats_count': {'en': '{count} expense categories', 'fr': '{count} catégories de dépenses'},
    'uncommitted': {'en': 'Uncommitted funds', 'fr': 'Fonds non engagés'},
    'tab_drf': {'en': 'Disbursement Requests (DRF / SOE)', 'fr': 'Demandes de Retrait de Fonds (DRF / SOE)'},
    'tab_cats': {'en': 'Budget Categories & Eligibility', 'fr': 'Catégories Budgétaires & Éligibilité'},
    'tab_all': {'en': 'Donor Conventions Directory', 'fr': 'Répertoire des Conventions Bailleurs'},
    'drf_empty_title': {'en': 'No Withdrawal Application (DRF) created for this project.', 'fr': 'Aucune Demande de Retrait de Fonds (DRF) créée pour ce projet.'},
    'drf_empty_hint': {'en': 'Create a first DRF to justify expenditures to the donor and request replenishment.', 'fr': 'Créez une première DRF pour justifier vos dépenses auprès du bailleur et solliciter le réapprovisionnement.'},
    'drf_sheet_title': {'en': 'WITHDRAWAL APPLICATION (DRF) & STATEMENT OF EXPENDITURES (SOE)', 'fr': 'DEMANDE DE RETRAIT DE FONDS (DRF) & RELEVÉ DES DÉPENSES (SOE)'},
    'donor_agreement': {'en': 'Donor: {donor} — Agreement: {ref}', 'fr': 'Bailleur : {donor} — Convention : {ref}'},
    'project_line': {'en': 'Project: {code} — {name}', 'fr': 'Projet : {code} — {name}'},
    'drf_no': {'en': 'DRF No.: {no}', 'fr': 'DRF N° : {no}'},
    'request_date': {'en': 'Request Date: {date}', 'fr': 'Date de demande : {date}'},
    'status': {'en': 'Status: {status}', 'fr': 'Statut : {status}'},
    'initial_advance': {'en': 'INITIAL ADVANCE / REVOLVING FUND:', 'fr': 'AVANCE INITIALE / FONDS :'},
    'justified_exp': {'en': 'JUSTIFIED EXPENDITURES (SOE):', 'fr': 'DÉPENSES JUSTIFIÉES (SOE) :'},
    'claimed_amount': {'en': 'CLAIMED AMOUNT (REPLENISHMENT):', 'fr': 'MONTANT RÉCLAMÉ (RECONSTITUTION) :'},
    'account_balance': {'en': 'DESIGNATED ACCOUNT BALANCE:', 'fr': 'SOLDE DU COMPTE DÉSIGNÉ :'},
    'sec1_title': {'en': '1. DETAILED STATEMENT OF EXPENDITURES (SOE)', 'fr': '1. RELEVÉ DÉTAILLÉ DES DÉPENSES (STATEMENT OF EXPENDITURES - SOE)'},
    'sec2_title': {'en': '2. SUMMARY OF EXPENDITURES BY ELIGIBLE CATEGORY', 'fr': '2. SYNTHÈSE DES DÉPENSES PAR CATÉGORIE ÉLIGIBLE'},
    'col_cat': {'en': 'Category', 'fr': 'Catégorie'},
    'col_ref': {'en': 'Voucher / Invoice No.', 'fr': 'N° Pièce / Facture'},
    'col_date': {'en': 'Expense Date', 'fr': 'Date Dépense'},
    'col_ben': {'en': 'Beneficiary / Supplier', 'fr': 'Bénéficiaire / Fournisseur'},
    'col_desc': {'en': 'Description of goods / services', 'fr': 'Description de la prestation / Fourniture'},
    'col_tot': {'en': 'Total Amount', 'fr': 'Montant Total'},
    'col_rate': {'en': '% Eligible', 'fr': '% Éligible'},
    'col_elig': {'en': 'Claimed Amount', 'fr': 'Montant Réclamé'},
    'sig_fin': {'en': 'Finance & Administrative Officer', 'fr': 'Le Responsable Administratif & Financier'},
    'sig_fin_sub': {'en': '(Name, visa and stamp)', 'fr': '(Nom, visa et cachet)'},
    'sig_audit': {'en': 'Internal Auditor / Controller', 'fr': 'L’Auditeur / Contrôleur Interne'},
    'sig_audit_sub': {'en': '(Eligibility certification)', 'fr': '(Certification d’éligibilité)'},
    'sig_dir': {'en': 'Project Coordinator / Director', 'fr': 'Le Coordonnateur du Projet / Directeur'},
    'sig_dir_sub': {'en': '(Approval and payment order)', 'fr': '(Approbation et mandatement)'},
    'sig_cert_note': {
        'fr': 'Certifié sincère et conforme aux pièces justificatives originales archivées à l’Unité de Gestion du Projet (UGP) et aux stipulations de l’Accord de Financement.',
        'en': 'Certified true and verified against original supporting vouchers archived at the Project Implementation Unit (PIU) in accordance with the Financing Agreement.',
    },
    'sig_date_loc': {'fr': 'Fait à ........................................, le ..... / ..... / 20....', 'en': 'Done at ........................................, on ..... / ..... / 20....'},
    'sig_signature': {'fr': 'Signature & Cachet :', 'en': 'Signature & Stamp:'},
    'cat_panel_title': {'en': 'Budget Plan & Eligible Categories', 'fr': 'Plan Budgétaire & Catégories Éligibles'},
    'cat_panel_sub': {'en': 'Contractual ceilings breakdown and commitment tracking by donor category', 'fr': 'Ventilation des plafonds contractuels et suivi des engagements par catégorie bailleur'},
    'cat_empty': {'en': 'No category defined for this project.', 'fr': 'Aucune catégorie définie pour ce projet.'},
    'col_cat_code': {'en': 'Category Code', 'fr': 'Code Catégorie'},
    'col_cat_name': {'en': 'Category Description', 'fr': 'Intitulé de la catégorie de dépense'},
    'col_cat_rate': {'en': 'Eligibility Rate', 'fr': 'Taux d’éligibilité'},
    'col_cat_budget': {'en': 'Allocated Budget', 'fr': 'Budget Alloué'},
    'col_cat_spent': {'en': 'Actual Expenditures', 'fr': 'Dépenses Réalisées'},
    'col_cat_rem': {'en': 'Available Balance', 'fr': 'Solde Disponible'},
    'col_cat_exec': {'en': 'Execution (%)', 'fr': 'Exécution (%)'},
    'proj_panel_title': {'en': 'General Directory of Conventions & Grants', 'fr': 'Répertoire Général des Conventions & Subventions'},
    'proj_panel_sub': {'en': 'Consolidated overview of international financing agreements', 'fr': 'Vue consolidée des accords de financement internationaux'},
    'col_proj_code': {'en': 'Project Code', 'fr': 'Code Projet'},
    'col_proj_donor': {'en': 'Funding Donor', 'fr': 'Bailleur de Fonds'},
    'col_proj_name': {'en': 'Convention Title', 'fr': 'Intitulé de la Convention'},
    'col_proj_ref': {'en': 'Agreement Ref', 'fr': 'Réf. Accord'},
    'col_proj_cur': {'en': 'Currency', 'fr': 'Devise'},
    'col_proj_budget': {'en': 'Total Budget', 'fr': 'Budget Total'},
    'col_proj_spent': {'en': 'Disbursed / Justified', 'fr': 'Décaissé / Justifié'},
    'col_proj_rem': {'en': 'Available Balance', 'fr': 'Solde Disponible'},
    'col_proj_exec': {'en': 'Execution', 'fr': 'Exécution'},
    'modal_create_proj': {'en': 'Create Donor Project Convention', 'fr': 'Créer une Convention de Projet Bailleur'},
    'modal_donor_name': {'en': 'Donor Name (e.g., Global Fund, World Bank, AFD, USAID)', 'fr': 'Nom du Bailleur (ex: Fonds Mondial, Banque Mondiale, AFD, USAID)'},
    'modal_proj_code': {'en': 'Project / Grant Code', 'fr': 'Code Projet / Subvention'},
    'modal_proj_name': {'en': 'Full Project Title', 'fr': 'Intitulé Complet du Projet'},
    'modal_ref': {'en': 'Grant / Agreement Reference (e.g., GF-CMR-2027-01)', 'fr': 'Référence Accord / Accord de Don (ex: GF-CMR-2027-01)'},
    'modal_cur': {'en': 'Convention Currency', 'fr': 'Devise Convention'},
    'modal_rate': {'en': 'Financing Rate (%)', 'fr': 'Taux Financement (%)'},
    'modal_budget': {'en': 'Total Allocated Budget (XAF)', 'fr': 'Budget Global Alloué (XAF)'},
    'modal_bank': {'en': 'Designated / Dedicated Bank Account', 'fr': 'Compte Bancaire Dédié / Désigné'},
    'modal_start': {'en': 'Start Date', 'fr': 'Date Début'},
    'modal_end': {'en': 'End Date', 'fr': 'Date Fin'},
    'modal_save_proj': {'en': 'Save Project', 'fr': 'Enregistrer le projet'},
    'modal_proj_saved': {'en': 'Donor project created successfully!', 'fr': 'Projet bailleur créé avec succès !'},
    'modal_add_cat': {'en': 'Add Eligible Category', 'fr': 'Ajouter une Catégorie Éligible'},
    'modal_cat_code': {'en': 'Category Code (e.g., CAT-01, CAT-02)', 'fr': 'Code Catégorie (ex: CAT-01, CAT-02)'},
    'modal_cat_name': {'en': 'Category Name', 'fr': 'Libellé de la catégorie'},
    'modal_cat_budget': {'en': 'Budget Ceiling (XAF)', 'fr': 'Plafond Budgétaire (XAF)'},
    'modal_cat_rate': {'en': 'Eligibility Rate (%)', 'fr': 'Taux d’éligibilité (%)'},
    'modal_add_btn': {'en': 'Add Category', 'fr': 'Ajouter'},
    'modal_cat_saved': {'en': 'Category added successfully!', 'fr': 'Catégorie ajoutée avec succès !'},
    'modal_create_drf': {'en': 'Create Withdrawal Application (DRF / SOE)', 'fr': 'Créer une Demande de Retrait de Fonds (DRF / SOE)'},
    'modal_drf_no': {'en': 'DRF Number (e.g., DRF-FM-2026-02)', 'fr': 'Numéro de la DRF (ex: DRF-FM-2026-02)'},
    'modal_drf_date': {'en': 'Request Date', 'fr': 'Date Demande'},
    'modal_period_from': {'en': 'Period From', 'fr': 'Période Du'},
    'modal_period_to': {'en': 'Period To', 'fr': 'Période Au'},
    'modal_init_adv': {'en': 'Initial Advance (XAF)', 'fr': 'Avance Initiale (XAF)'},
    'modal_desig_bal': {'en': 'Dedicated Account Balance (XAF)', 'fr': 'Solde Compte Dédié (XAF)'},
    'modal_first_cat': {'en': 'Category of first expenditure', 'fr': 'Catégorie de la première dépense'},
    'modal_v_ref': {'en': 'Voucher / Invoice Ref (e.g., FAC-2026-001)', 'fr': 'Réf Facture / Pièce (ex: FAC-2026-001)'},
    'modal_v_ben': {'en': 'Beneficiary / Supplier', 'fr': 'Bénéficiaire / Fournisseur'},
    'modal_v_desc': {'en': 'Purpose of Expenditure', 'fr': 'Objet de la dépense'},
    'modal_v_amt': {'en': 'Expenditure Amount (XAF)', 'fr': 'Montant de la dépense (XAF)'},
    'modal_drf_btn': {'en': 'Create DRF', 'fr': 'Créer la DRF'},
    'modal_drf_saved': {'en': 'DRF and SOE statement created successfully!', 'fr': 'DRF et relevé SOE créés avec succès !'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        val = entry.get(cur, entry.get('en', ''))
    else:
        val = t(key)
    return val.format(**kwargs) if kwargs else val


@page('/donor-projects', title='Projets Bailleurs & Subventions', permissions=('journal.view', 'budget.view'))
async def donor_projects_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    # Fetch projects
    projects_res = await api.safe(api.get('/donor-projects'), notify=False) or {'rows': []}
    projects = projects_res.get('rows', [])
    default_proj_id = projects[0]['id'] if projects else None

    # Fetch bank accounts for designated accounts
    banks_res = await api.safe(api.get('/bank/accounts'), notify=False) or {'rows': []}
    bank_accounts = banks_res.get('rows', [])

    state = {
        'project_id': default_proj_id,
        'drf_id': None,
    }

    content = ui.column().classes('w-full gap-4')

    def actions() -> None:
        ui.button(
            _loc('new_agreement_btn'),
            icon='add',
            on_click=lambda: _new_project_modal(bank_accounts, reload_all)
        ).props('unelevated size=sm')

    with ui.element('div').classes('w-full lc-no-print'):
        w.page_header(
            _loc('title'),
            _loc('subtitle'),
            actions=actions,
            emoji='🌍'
        )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_proj_id = state['project_id']
        if not curr_proj_id:
            ui.label(_loc('no_project')).classes('text-slate-500 italic p-6')
            return

        # Fetch detailed project info
        proj_data = await api.safe(api.get(f'/donor-projects/{curr_proj_id}'), notify=False) or {}
        project = proj_data.get('project', {})
        categories = proj_data.get('categories', [])
        drfs = proj_data.get('drfs', [])

        if drfs and not state['drf_id']:
            state['drf_id'] = drfs[0]['id']

        # 1. Top Controls Bar: Project Selector
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm lc-no-print'):
            with ui.row().classes('items-center gap-4'):
                proj_opts = {p['id']: f"{p.get('project_code')} — {p.get('donor_name')}" for p in projects}
                async def on_proj_change(e):
                    state['project_id'] = e.value
                    state['drf_id'] = None
                    await reload_all()

                ui.select(proj_opts, value=curr_proj_id, on_change=on_proj_change, label=_loc('active_project_label')).props('outlined dense options-dense').classes('w-96')

            with ui.row().classes('items-center gap-2'):
                ui.button(_loc('new_cat_btn'), icon='category', on_click=lambda: _new_category_modal(curr_proj_id, reload_all)).props('outline size=sm')
                ui.button(_loc('create_drf_btn'), icon='receipt_long', on_click=lambda: _new_drf_modal(curr_proj_id, categories, reload_all)).props('outline size=sm')
                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Key Metrics Strip
        tot_budget = project.get('total_budget', 0)
        tot_spent = sum(c.get('total_spent', 0) for c in categories)
        remaining = tot_budget - tot_spent
        exec_rate = int((tot_spent / tot_budget) * 100) if tot_budget > 0 else 0

        with ui.grid(columns=4).classes('w-full gap-4 lc-no-print'):
            with ui.card().classes('p-4 border-l-4 border-indigo-500 shadow-sm'):
                ui.label(_loc('kpi_budget')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_budget, currency)} {currency}").classes('text-xl font-bold text-indigo-900 font-mono')
                ui.label(_loc('currency_rate', cur=project.get('currency', 'XAF'), rate=project.get('financing_rate', 100))).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-emerald-500 shadow-sm'):
                ui.label(_loc('kpi_spent')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_spent, currency)} {currency}").classes('text-xl font-bold text-emerald-800 font-mono')
                ui.label(_loc('cats_count', count=len(categories))).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-blue-500 shadow-sm'):
                ui.label(_loc('kpi_avail')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(remaining, currency)} {currency}").classes('text-xl font-bold text-blue-800 font-mono')
                ui.label(_loc('uncommitted')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-amber-500 shadow-sm'):
                ui.label(_loc('kpi_exec')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{exec_rate}%").classes('text-2xl font-black text-amber-800 font-mono')
                ui.linear_progress(value=exec_rate / 100, color='amber').props('size=6px rounded').classes('mt-2')

        # 3. Tab Navigation
        with ui.tabs().classes('w-full border-b border-slate-200 mt-2 lc-no-print') as tabs:
            tab_drf = ui.tab('tab_drf', label=_loc('tab_drf'), icon='receipt_long')
            tab_cats = ui.tab('tab_cats', label=_loc('tab_cats'), icon='pie_chart')
            tab_all = ui.tab('tab_all', label=_loc('tab_all'), icon='handshake')

        async def on_drf_select(drf_id: int):
            state['drf_id'] = drf_id
            await reload_all()

        with ui.tab_panels(tabs, value=tab_drf).classes('w-full bg-transparent p-0 pt-3'):
            # --- TAB 1: DRF & SOE ---
            with ui.tab_panel(tab_drf).classes('p-0 gap-4'):
                await _render_drf_panel(curr_proj_id, state['drf_id'], drfs, currency, on_drf_select=on_drf_select)

            # --- TAB 2: Categories ---
            with ui.tab_panel(tab_cats).classes('p-0 gap-4'):
                _render_categories_panel(categories, currency)

            # --- TAB 3: Projects List ---
            with ui.tab_panel(tab_all).classes('p-0 gap-4'):
                _render_projects_list(projects, currency)

    await render_view()


async def _render_drf_panel(project_id: int, selected_drf_id: int | None, drfs: list, currency: str, on_drf_select: callable = None) -> None:
    if not drfs:
        with ui.card().classes('w-full p-8 text-center bg-white border border-slate-200 rounded-xl'):
            ui.icon('receipt_long', size='48px', color='slate-4')
            ui.label(_loc('drf_empty_title')).classes('text-slate-500 font-bold mt-2')
            ui.label(_loc('drf_empty_hint')).classes('text-xs text-slate-400 mt-1')
        return

    # DRF Selector Bar
    drf_id = selected_drf_id or drfs[0]['id']
    drf_details = await api.safe(api.get(f'/donor-projects/drfs/{drf_id}'), notify=False) or {}
    drf = drf_details.get('drf', {})
    items = drf_details.get('items', [])
    summary = drf_details.get('summary', [])

    # DRF Switcher Toolbar (lc-no-print)
    with ui.row().classes('w-full max-w-5xl mx-auto items-center justify-between gap-4 p-3 bg-white border border-slate-200 rounded-lg shadow-sm lc-no-print mb-2'):
        with ui.row().classes('items-center gap-2'):
            ui.label('DRF :').classes('text-xs font-bold text-slate-700')
            drf_opts = {d['id']: f"{d.get('drf_number', d['id'])} — {w.money(d.get('replenishment_requested', 0), currency)} {currency} ({d.get('request_date', '')})" for d in drfs}
            async def _on_drf_chg(e):
                if on_drf_select:
                    await on_drf_select(e.value)
            ui.select(drf_opts, value=drf_id, on_change=_on_drf_chg).props('outlined dense options-dense').classes('w-96')

        with ui.row().classes('items-center gap-2'):
            ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm')

    with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-md rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
        # Header block
        with ui.row().classes('w-full justify-between items-start border-b-2 border-slate-900 pb-4 mb-6'):
            with ui.column().classes('gap-1'):
                ui.label(_loc('drf_sheet_title')).classes('text-xl font-black text-slate-900 uppercase tracking-tight')
                ui.label(_loc('donor_agreement', donor=drf.get('donor_name', '—'), ref=drf.get('agreement_ref') or 'N/A')).classes('text-xs text-slate-600 font-bold uppercase')
                ui.label(_loc('project_line', code=drf.get('project_code', '—'), name=drf.get('project_name', '—'))).classes('text-sm font-semibold text-slate-800')

            with ui.column().classes('items-end gap-1'):
                ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print mb-1')
                ui.label(_loc('drf_no', no=drf.get('drf_number', '—'))).classes('text-base font-black text-primary font-mono')
                ui.label(_loc('request_date', date=drf.get('request_date', '—'))).classes('text-xs text-slate-500')
                ui.chip(_loc('status', status=str(drf.get('status', 'draft')).upper()), color='emerald-1', text_color='emerald-9').props('dense font-bold')

        # Financial Summary of the DRF
        with ui.grid(columns=4).classes('w-full gap-4 p-4 bg-slate-100 rounded-lg mb-6 border border-slate-200 text-xs font-mono print-avoid-break'):
            with ui.column().classes('gap-1'):
                ui.label(_loc('initial_advance')).classes('font-bold text-slate-700 font-sans')
                ui.label(f"{w.money(drf.get('initial_advance', 0), currency)} {currency}").classes('font-bold text-sm text-slate-900')

            with ui.column().classes('gap-1'):
                ui.label(_loc('justified_exp')).classes('font-bold text-slate-700 font-sans')
                ui.label(f"{w.money(drf.get('total_expenditures_claimed', 0), currency)} {currency}").classes('font-bold text-sm text-indigo-900')

            with ui.column().classes('gap-1'):
                ui.label(_loc('claimed_amount')).classes('font-bold text-slate-700 font-sans')
                ui.label(f"{w.money(drf.get('replenishment_requested', 0), currency)} {currency}").classes('font-bold text-sm text-emerald-800')

            with ui.column().classes('gap-1'):
                ui.label(_loc('account_balance')).classes('font-bold text-slate-700 font-sans')
                ui.label(f"{w.money(drf.get('designated_account_balance', 0), currency)} {currency}").classes('font-bold text-sm text-blue-900')

        # Section 1: Statement of Expenditures Table
        ui.label(_loc('sec1_title')).classes('text-sm font-black text-slate-900 uppercase mb-2')

        formatted_items = [
            {
                **it,
                'total_formatted': w.money(it.get('total_amount', 0), currency),
                'eligible_formatted': w.money(it.get('eligible_amount', 0), currency),
                'rate_formatted': f"{it.get('eligible_rate', 100)}%",
            }
            for it in items
        ]

        columns = [
            {'name': 'cat', 'label': _loc('col_cat'), 'field': 'category_code', 'align': 'center'},
            {'name': 'ref', 'label': _loc('col_ref'), 'field': 'voucher_ref', 'align': 'left'},
            {'name': 'date', 'label': _loc('col_date'), 'field': 'voucher_date', 'align': 'center'},
            {'name': 'ben', 'label': _loc('col_ben'), 'field': 'beneficiary_name', 'align': 'left'},
            {'name': 'desc', 'label': _loc('col_desc'), 'field': 'description', 'align': 'left'},
            {'name': 'tot', 'label': _loc('col_tot'), 'field': 'total_formatted', 'align': 'right'},
            {'name': 'rate', 'label': _loc('col_rate'), 'field': 'rate_formatted', 'align': 'center'},
            {'name': 'elig', 'label': _loc('col_elig'), 'field': 'eligible_formatted', 'align': 'right'},
        ]

        table = ui.table(columns=columns, rows=formatted_items, row_key='id').props('flat dense bordered').classes('w-full mb-6 print-avoid-break')
        table.add_slot('body-cell-cat', '''<q-td :props="props"><q-chip dense size="xs" color="indigo-1" text-color="indigo-9" class="font-mono font-bold">{{ props.value }}</q-chip></q-td>''')
        table.add_slot('body-cell-elig', '''<q-td :props="props"><span class="font-mono font-bold text-emerald-800">{{ props.value }}</span></q-td>''')

        # Section 2: Synthesis by Category
        ui.label(_loc('sec2_title')).classes('text-sm font-black text-slate-900 uppercase mb-2')
        with ui.grid(columns=4).classes('w-full gap-3 mb-8 print-avoid-break'):
            for s in summary:
                with ui.card().classes('p-3 bg-slate-50 border border-slate-200 rounded-lg'):
                    ui.label(f"[{s['code']}] {s['name']}").classes('text-xs font-bold text-slate-800 truncate')
                    ui.label(f"{w.money(s['eligible_amount'], currency)} {currency}").classes('text-sm font-black text-indigo-900 font-mono mt-1')
                    ui.label(f"{s['count']} {t('withholding.invoice_ref')}").classes('text-xs text-slate-400')

        # Signatures Block
        with ui.column().classes('w-full mt-6 pt-6 border-t border-slate-300 print-avoid-break'):
            ui.label(_loc('sig_cert_note')).classes('text-xs text-slate-500 italic text-center w-full mb-4')
            with ui.row().classes('w-full justify-between items-center text-xs text-slate-600 mb-6'):
                ui.label(_loc('sig_date_loc')).classes('font-medium')
                ui.label('UGP / International Donor Accounting').classes('font-mono font-bold text-slate-400')

            with ui.grid(columns=3).classes('w-full gap-8 text-center text-xs'):
                with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                    ui.label(_loc('sig_fin')).classes('font-bold text-slate-800 uppercase')
                    ui.label(_loc('sig_fin_sub')).classes('text-slate-400 text-[10px]')
                    ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                    ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')

                with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                    ui.label(_loc('sig_audit')).classes('font-bold text-slate-800 uppercase')
                    ui.label(_loc('sig_audit_sub')).classes('text-slate-400 text-[10px]')
                    ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                    ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')

                with ui.column().classes('items-center gap-2 p-3 bg-slate-50/50 border border-slate-200 rounded-lg'):
                    ui.label(_loc('sig_dir')).classes('font-bold text-slate-800 uppercase')
                    ui.label(_loc('sig_dir_sub')).classes('text-slate-400 text-[10px]')
                    ui.element('div').classes('w-full border border-dashed border-slate-300 rounded mt-2 flex items-center justify-center text-slate-300 text-[10px]').style('height: 60px;')
                    ui.label(_loc('sig_signature')).classes('text-[10px] text-slate-400')


def _render_categories_panel(categories: list, currency: str) -> None:
    with ui.card().classes('w-full p-6 bg-white border border-slate-200 rounded-xl shadow-sm'):
        with ui.row().classes('w-full justify-between items-center mb-4'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('cat_panel_title')).classes('text-base font-bold text-slate-900')
                ui.label(_loc('cat_panel_sub')).classes('text-xs text-slate-500')

        if not categories:
            ui.label(_loc('cat_empty')).classes('text-slate-400 italic p-6')
            return

        formatted_cats = [
            {
                **c,
                'budget_formatted': w.money(c.get('budget_allocated', 0), currency),
                'spent_formatted': w.money(c.get('total_spent', 0), currency),
                'rem_formatted': w.money(c.get('remaining_budget', 0), currency),
                'rate_formatted': f"{c.get('eligible_rate', 100)}%",
                'exec_formatted': f"{c.get('execution_rate', 0)}%",
            }
            for c in categories
        ]

        columns = [
            {'name': 'code', 'label': _loc('col_cat_code'), 'field': 'category_code', 'align': 'left', 'sortable': True},
            {'name': 'name', 'label': _loc('col_cat_name'), 'field': 'name', 'align': 'left'},
            {'name': 'rate', 'label': _loc('col_cat_rate'), 'field': 'rate_formatted', 'align': 'center'},
            {'name': 'budget', 'label': _loc('col_cat_budget'), 'field': 'budget_formatted', 'align': 'right'},
            {'name': 'spent', 'label': _loc('col_cat_spent'), 'field': 'spent_formatted', 'align': 'right'},
            {'name': 'rem', 'label': _loc('col_cat_rem'), 'field': 'rem_formatted', 'align': 'right'},
            {'name': 'exec', 'label': _loc('col_cat_exec'), 'field': 'exec_formatted', 'align': 'center'},
        ]

        table = ui.table(columns=columns, rows=formatted_cats, row_key='id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-code', '''<q-td :props="props"><span class="font-mono font-bold text-primary">{{ props.value }}</span></q-td>''')
        table.add_slot('body-cell-rem', '''<q-td :props="props"><span class="font-mono font-bold text-emerald-800">{{ props.value }}</span></q-td>''')


def _render_projects_list(projects: list, currency: str) -> None:
    with ui.card().classes('w-full p-6 bg-white border border-slate-200 rounded-xl shadow-sm'):
        with ui.row().classes('w-full justify-between items-center mb-4'):
            with ui.column().classes('gap-0'):
                ui.label(_loc('proj_panel_title')).classes('text-base font-bold text-slate-900')
                ui.label(_loc('proj_panel_sub')).classes('text-xs text-slate-500')

        formatted_projs = [
            {
                **p,
                'budget_formatted': w.money(p.get('total_budget', 0), currency),
                'spent_formatted': w.money(p.get('total_disbursed_or_claimed', 0), currency),
                'rem_formatted': w.money(p.get('remaining_budget', 0), currency),
                'exec_formatted': f"{p.get('execution_rate', 0)}%",
            }
            for p in projects
        ]

        columns = [
            {'name': 'code', 'label': _loc('col_proj_code'), 'field': 'project_code', 'align': 'left', 'sortable': True},
            {'name': 'donor', 'label': _loc('col_proj_donor'), 'field': 'donor_name', 'align': 'left'},
            {'name': 'name', 'label': _loc('col_proj_name'), 'field': 'project_name', 'align': 'left'},
            {'name': 'ref', 'label': _loc('col_proj_ref'), 'field': 'agreement_ref', 'align': 'left'},
            {'name': 'cur', 'label': _loc('col_proj_cur'), 'field': 'currency', 'align': 'center'},
            {'name': 'budget', 'label': _loc('col_proj_budget'), 'field': 'budget_formatted', 'align': 'right'},
            {'name': 'spent', 'label': _loc('col_proj_spent'), 'field': 'spent_formatted', 'align': 'right'},
            {'name': 'rem', 'label': _loc('col_proj_rem'), 'field': 'rem_formatted', 'align': 'right'},
            {'name': 'exec', 'label': _loc('col_proj_exec'), 'field': 'exec_formatted', 'align': 'center'},
        ]

        table = ui.table(columns=columns, rows=formatted_projs, row_key='id').props('flat dense bordered').classes('w-full')
        table.add_slot('body-cell-code', '''<q-td :props="props"><span class="font-mono font-bold text-primary">{{ props.value }}</span></q-td>''')


def _new_project_modal(bank_accounts: list, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[580px] p-6 gap-4'):
        w.modal_header(_loc('modal_create_proj'), emoji='🌍')

        donor_in = ui.input(label=_loc('modal_donor_name'), value='Fonds Mondial').props('outlined dense').classes('w-full')
        code_in = ui.input(label=_loc('modal_proj_code'), value='FM-PALU-2027').props('outlined dense').classes('w-full')
        name_in = ui.input(label=_loc('modal_proj_name'), value='Programme d’Appui à la Santé Maternelle et Infantile').props('outlined dense').classes('w-full')
        ref_in = ui.input(label=_loc('modal_ref')).props('outlined dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            cur_in = ui.select({'XAF': 'XAF (Franc CFA)', 'EUR': 'EUR (Euro)', 'USD': 'USD (Dollar US)'}, value='XAF', label=_loc('modal_cur')).props('outlined dense')
            rate_in = ui.number(label=_loc('modal_rate'), value=100.0, format='%.2f').props('outlined dense')

        budget_in = ui.number(label=_loc('modal_budget'), value=100000000, format='%.0f').props('outlined dense').classes('w-full')

        bank_opts = {b['id']: f"{b.get('name')} — {b.get('bank_name')} ({b.get('account_number')})" for b in bank_accounts}
        bank_sel = ui.select(bank_opts, value=bank_accounts[0]['id'] if bank_accounts else None, label=_loc('modal_bank')).props('outlined dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            d_start = ui.input(label=_loc('modal_start'), value='2027-01-01').props('outlined dense')
            d_end = ui.input(label=_loc('modal_end'), value='2027-12-31').props('outlined dense')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_create():
                payload = {
                    'donor_name': donor_in.value,
                    'project_code': code_in.value,
                    'project_name': name_in.value,
                    'agreement_ref': ref_in.value,
                    'currency': cur_in.value,
                    'financing_rate': rate_in.value,
                    'total_budget': budget_in.value,
                    'designated_bank_account_id': bank_sel.value,
                    'start_date': d_start.value,
                    'end_date': d_end.value,
                }
                res = await api.safe(api.post('/donor-projects', payload))
                if res:
                    ui.notify(_loc('modal_proj_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_save_proj'), icon='check', on_click=do_create).props('unelevated color=primary')

    dlg.open()


def _new_category_modal(project_id: int, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[500px] p-6 gap-4'):
        w.modal_header(_loc('modal_add_cat'), emoji='📑')

        code_in = ui.input(label=_loc('modal_cat_code'), value='CAT-05').props('outlined dense').classes('w-full')
        name_in = ui.input(label=_loc('modal_cat_name'), value='Médicaments & Réactifs').props('outlined dense').classes('w-full')
        budget_in = ui.number(label=_loc('modal_cat_budget'), value=25000000, format='%.0f').props('outlined dense').classes('w-full')
        rate_in = ui.number(label=_loc('modal_cat_rate'), value=100.0, format='%.2f').props('outlined dense').classes('w-full')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_create():
                payload = {
                    'category_code': code_in.value,
                    'name': name_in.value,
                    'budget_allocated': budget_in.value,
                    'eligible_rate': rate_in.value,
                }
                res = await api.safe(api.post(f'/donor-projects/{project_id}/categories', payload))
                if res:
                    ui.notify(_loc('modal_cat_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_add_btn'), icon='check', on_click=do_create).props('unelevated color=primary')

    dlg.open()


def _new_drf_modal(project_id: int, categories: list, on_success: callable) -> None:
    if not categories:
        ui.notify('Veuillez d’abord définir au moins une catégorie budgétaire pour ce projet.', type='warning')
        return

    with ui.dialog() as dlg, ui.card().classes('w-[620px] p-6 gap-4'):
        w.modal_header(_loc('modal_create_drf'), emoji='💰')

        drf_num = ui.input(label=_loc('modal_drf_no'), value='DRF-2026-02').props('outlined dense').classes('w-full')

        with ui.grid(columns=3).classes('w-full gap-3'):
            d_req = ui.input(label=_loc('modal_drf_date'), value='2026-10-16').props('outlined dense')
            d_start = ui.input(label=_loc('modal_period_from'), value='2026-07-01').props('outlined dense')
            d_end = ui.input(label=_loc('modal_period_to'), value='2026-09-30').props('outlined dense')

        with ui.grid(columns=2).classes('w-full gap-3'):
            adv_in = ui.number(label=_loc('modal_init_adv'), value=30000000, format='%.0f').props('outlined dense')
            bal_in = ui.number(label=_loc('modal_desig_bal'), value=5000000, format='%.0f').props('outlined dense')

        cat_opts = {c['id']: f"[{c['category_code']}] {c['name']}" for c in categories}
        cat_sel = ui.select(cat_opts, value=categories[0]['id'], label=_loc('modal_first_cat')).props('outlined dense').classes('w-full')

        v_ref = ui.input(label=_loc('modal_v_ref'), value='FAC-PHARMA-2026-99').props('outlined dense').classes('w-full')
        v_ben = ui.input(label=_loc('modal_v_ben'), value='Centrale Médicale de Distribution').props('outlined dense').classes('w-full')
        v_desc = ui.input(label=_loc('modal_v_desc'), value='Acquisition intrants et réactifs de laboratoire').props('outlined dense').classes('w-full')
        v_amt = ui.number(label=_loc('modal_v_amt'), value=15000000, format='%.0f').props('outlined dense').classes('w-full')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_create():
                payload = {
                    'drf_number': drf_num.value,
                    'request_date': d_req.value,
                    'period_start': d_start.value,
                    'period_end': d_end.value,
                    'initial_advance': adv_in.value,
                    'designated_account_balance': bal_in.value,
                    'items': [
                        {
                            'category_id': cat_sel.value,
                            'voucher_ref': v_ref.value,
                            'voucher_date': d_req.value,
                            'beneficiary_name': v_ben.value,
                            'description': v_desc.value,
                            'total_amount': v_amt.value,
                            'eligible_rate': 100.0,
                        }
                    ],
                }
                res = await api.safe(api.post(f'/donor-projects/{project_id}/drfs', payload))
                if res:
                    ui.notify(_loc('modal_drf_saved'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_drf_btn'), icon='check', on_click=do_create).props('unelevated color=primary')

    dlg.open()
