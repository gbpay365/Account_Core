"""
CEMAC / OHADA Statutory Payroll & DIPE Engine (Gestion de la Paie & Déclarations Fiscales/Sociales).
Provides automated payroll runs, SYSCOHADA journal entries (661/664/422/431/447/442),
individual printable OHADA payslips, and statutory DIPE magnetic file generation for DGI and CNPS.
"""

from __future__ import annotations
from typing import Any

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {'fr': 'Gestion de la Paie & Déclarations DIPE (CEMAC)', 'en': 'CEMAC Statutory Payroll & DIPE Engine'},
    'subtitle': {
        'fr': 'Calcul des salaires, retenues fiscales et sociales (IRPP, CAC, CNPS, TDL), écritures de paie et export DIPE DGI / CNPS.',
        'en': 'Payroll computation, tax and social withholdings (IRPP, CAC, CNPS, TDL), salary journal entries, and statutory DIPE file export.',
    },
    'kpi_gross': {'fr': 'Masse Salariale Brute', 'en': 'Gross Payroll'},
    'kpi_net': {'fr': 'Net Global à Payer', 'en': 'Net Payable to Staff'},
    'kpi_cnps': {'fr': 'Cotisations CNPS (Sal.+Pat.)', 'en': 'CNPS Social Security'},
    'kpi_fiscal': {'fr': 'Retenues Fiscales (IRPP+CAC+TDL)', 'en': 'Fiscal Withholdings'},
    'kpi_cost': {'fr': 'Coût Total Employeur', 'en': 'Total Employer Cost'},
    'btn_calc': {'fr': 'Calculer la Paie', 'en': 'Calculate Payroll'},
    'btn_add_emp': {'fr': 'Ajouter un Employé', 'en': 'Add Employee'},
    'btn_dipe': {'fr': 'Fichier DIPE DGI/CNPS', 'en': 'DIPE Magnetic File'},
    'btn_post': {'fr': 'Comptabiliser au Grand Livre', 'en': 'Post to General Ledger'},
    'tab_payslips': {'fr': 'Synthèse & Bulletins de Paie', 'en': 'Payroll Summary & Payslips'},
    'tab_runs': {'fr': 'Historique des Périodes', 'en': 'Payroll Runs History'},
    'tab_staff': {'fr': 'Registre du Personnel', 'en': 'Staff Directory'},
    'payslip_title': {'fr': 'Bulletin de Paie Individuel — OHADA / CEMAC', 'en': 'Individual Payslip — OHADA / CEMAC'},
}


def _loc(key: str) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'fr'
    entry = _T.get(key)
    if isinstance(entry, dict):
        return entry.get(cur, entry.get('fr', ''))
    return t(key)


@page('/payroll', title='Paie & DIPE', permissions=('journal.view',))
async def payroll_page() -> None:
    # State
    runs_res = await api.safe(api.get('/payroll/runs'), notify=False) or {}
    runs = runs_res.get('rows', []) if isinstance(runs_res, dict) else (runs_res if isinstance(runs_res, list) else [])
    selected_run_id = runs[0]['id'] if runs else None

    state: dict[str, Any] = {
        'run_id': selected_run_id,
        'run_details': None,
        'employees': [],
    }

    async def _fetch_details():
        if state['run_id']:
            det = await api.safe(api.get(f'/payroll/runs/{state["run_id"]}'), notify=False)
            state['run_details'] = det
        else:
            state['run_details'] = None

    async def _fetch_employees():
        emp_res = await api.safe(api.get('/payroll/employees'), notify=False) or {}
        state['employees'] = emp_res.get('rows', []) if isinstance(emp_res, dict) else (emp_res if isinstance(emp_res, list) else [])

    await _fetch_details()
    await _fetch_employees()

    # Containers
    content_area = ui.column().classes('w-full gap-5')

    async def reload_all():
        nonlocal runs
        runs_res_new = await api.safe(api.get('/payroll/runs'), notify=False) or {}
        runs = runs_res_new.get('rows', []) if isinstance(runs_res_new, dict) else []
        if runs and not state['run_id']:
            state['run_id'] = runs[0]['id']
        await _fetch_details()
        await _fetch_employees()
        await render_content()

    async def render_content():
        content_area.clear()
        with content_area:
            run_data = state['run_details'].get('run') if state['run_details'] else None
            payslips = state['run_details'].get('payslips', []) if state['run_details'] else []

            # 1. Header with Actions
            def _head_actions():
                ui.button(
                    _loc('btn_calc'),
                    icon='calculate',
                    on_click=lambda: _calc_run_modal(reload_all)
                ).props('unelevated color=primary size=sm').classes('font-medium')

                ui.button(
                    _loc('btn_add_emp'),
                    icon='person_add',
                    on_click=lambda: _add_employee_modal(reload_all)
                ).props('outline color=primary size=sm').classes('font-medium')

                if state['run_id']:
                    ui.button(
                        _loc('btn_dipe'),
                        icon='download',
                        on_click=lambda: _dipe_modal(state['run_id'])
                    ).props('outline color=teal size=sm').classes('font-medium')

            w.page_header(
                _loc('title'),
                _loc('subtitle'),
                emoji='👥',
                actions=_head_actions,
            )

            # 2. KPI Cards
            if run_data:
                total_gross = float(run_data.get('total_gross', 0) or 0)
                total_net = float(run_data.get('total_net_payable', 0) or 0)
                total_cnps = float(run_data.get('total_cnps_employee', 0) or 0) + float(run_data.get('total_cnps_employer', 0) or 0)
                total_fiscal = float(run_data.get('total_irpp', 0) or 0) + float(run_data.get('total_cac', 0) or 0) + float(run_data.get('total_tdl', 0) or 0)
                total_cost = float(run_data.get('total_employer_cost', 0) or 0)

                with ui.row().classes('w-full grid grid-cols-2 md:grid-cols-5 gap-3 mb-2'):
                    w.kpi(_loc('kpi_gross'), f'{w.money(total_gross)} XAF', tone='teal', icon='payments')
                    w.kpi(_loc('kpi_net'), f'{w.money(total_net)} XAF', tone='sky', icon='account_balance_wallet')
                    w.kpi(_loc('kpi_cnps'), f'{w.money(total_cnps)} XAF', tone='violet', icon='health_and_safety')
                    w.kpi(_loc('kpi_fiscal'), f'{w.money(total_fiscal)} XAF', tone='amber', icon='account_balance')
                    w.kpi(_loc('kpi_cost'), f'{w.money(total_cost)} XAF', tone='slate', icon='trending_up')

            # 3. Tabs
            with ui.tabs().classes('w-full border-b border-slate-200 text-slate-600') as tabs:
                t1 = ui.tab('tab_payslips', label=_loc('tab_payslips'), icon='receipt_long')
                t2 = ui.tab('tab_runs', label=_loc('tab_runs'), icon='history')
                t3 = ui.tab('tab_staff', label=_loc('tab_staff'), icon='badge')

            with ui.tab_panels(tabs, value=t1).classes('w-full bg-transparent p-0 pt-4'):
                # PANEL 1: Payslips & Run Summary
                with ui.tab_panel(t1).classes('p-0 gap-4 flex flex-col'):
                    if not run_data:
                        w.empty_state(
                            'Aucune période de paie calculée' if lang() == 'fr' else 'No payroll run computed',
                            hint='Cliquez sur "Calculer la Paie" pour générer la première période mensuelle.' if lang() == 'fr' else 'Click "Calculate Payroll" to generate the first monthly run.',
                            emoji='🧮',
                        )
                    else:
                        # Period selector and status banner
                        with ui.row().classes('w-full items-center justify-between gap-4 p-3 bg-white border border-slate-200 rounded-xl shadow-xs'):
                            with ui.row().classes('items-center gap-3'):
                                ui.label('Période active:' if lang() == 'fr' else 'Active Period:').classes('text-xs font-semibold uppercase text-slate-500')
                                run_options = {r['id']: f"{r['period_code']} — {r['period_name']}" for r in runs}
                                async def _on_run_change(e):
                                    state['run_id'] = e.value
                                    await _fetch_details()
                                    await render_content()

                                ui.select(
                                    options=run_options,
                                    value=state['run_id'],
                                    on_change=_on_run_change
                                ).props('dense outlined options-dense').classes('w-64 text-sm')

                                is_posted = run_data.get('status') == 'posted'
                                w.badge(
                                    'Comptabilisé' if is_posted else 'Calculé (Brouillon)',
                                    tone='emerald' if is_posted else 'amber'
                                )

                                if run_data.get('journal_entry_number'):
                                    ui.label(f"Pièce: {run_data['journal_entry_number']}").classes('text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded')

                            with ui.row().classes('items-center gap-2'):
                                if run_data.get('status') != 'posted':
                                    async def _on_post_click():
                                        await _post_run(run_data['id'], reload_all)

                                    ui.button(
                                        _loc('btn_post'),
                                        icon='send',
                                        on_click=_on_post_click
                                    ).props('unelevated color=emerald size=sm').classes('font-medium')

                        # Payslips Table
                        cols = [
                            {'name': 'reg', 'label': 'Matricule', 'field': 'registration_number', 'align': 'left'},
                            {'name': 'name', 'label': 'Employé' if lang() == 'fr' else 'Employee', 'field': 'full_name', 'align': 'left'},
                            {'name': 'dept', 'label': 'Département' if lang() == 'fr' else 'Department', 'field': 'department', 'align': 'left'},
                            {'name': 'gross', 'label': 'Brut' if lang() == 'fr' else 'Gross', 'field': 'gross_fmt', 'align': 'right'},
                            {'name': 'cnps_sal', 'label': 'CNPS (4.2%)', 'field': 'cnps_fmt', 'align': 'right'},
                            {'name': 'tax', 'label': 'IRPP + CAC', 'field': 'tax_fmt', 'align': 'right'},
                            {'name': 'tdl', 'label': 'TDL', 'field': 'tdl_fmt', 'align': 'right'},
                            {'name': 'net', 'label': 'Net à Payer' if lang() == 'fr' else 'Net Payable', 'field': 'net_fmt', 'align': 'right'},
                            {'name': 'cost', 'label': 'Charges Pat.' if lang() == 'fr' else 'Employer Cost', 'field': 'cost_fmt', 'align': 'right'},
                            {'name': 'actions', 'label': 'Bulletin', 'field': 'actions', 'align': 'center'},
                        ]

                        table_rows = []
                        for ps in payslips:
                            table_rows.append({
                                'id': ps['id'],
                                'registration_number': ps.get('registration_number', '—'),
                                'full_name': f"{ps.get('last_name', '')} {ps.get('first_name', '')}".strip(),
                                'department': ps.get('department', '—'),
                                'gross_fmt': f"{w.money(ps.get('gross_salary', 0))} XAF",
                                'cnps_fmt': f"{w.money(ps.get('cnps_employee', 0))} XAF",
                                'tax_fmt': f"{w.money(float(ps.get('irpp', 0) or 0) + float(ps.get('cac', 0) or 0))} XAF",
                                'tdl_fmt': f"{w.money(ps.get('tdl', 0))} XAF",
                                'net_fmt': f"{w.money(ps.get('net_salary', 0))} XAF",
                                'cost_fmt': f"{w.money(ps.get('total_employer_contributions', 0))} XAF",
                                '_raw': ps,
                            })

                        t_elem = w.table(
                            columns=cols,
                            rows=table_rows,
                            pagination=20,
                            title=f"Livre de Paie — {run_data.get('period_name', '')} ({len(payslips)} salariés)",
                        )

                        t_elem.add_slot('body-cell-net', '''
                            <q-td :props="props" class="font-bold text-teal-700">
                                {{ props.value }}
                            </q-td>
                        ''')

                        t_elem.add_slot('body-cell-actions', '''
                            <q-td :props="props">
                                <q-btn flat round dense size="sm" icon="description" color="primary" @click="$parent.$emit('view_payslip', props.row)" />
                            </q-td>
                        ''')
                        t_elem.on('view_payslip', lambda e: _view_payslip_modal(e.args['_raw'], run_data))

                # PANEL 2: Runs History
                with ui.tab_panel(t2).classes('p-0 gap-4 flex flex-col'):
                    run_cols = [
                        {'name': 'code', 'label': 'Code', 'field': 'period_code', 'align': 'left'},
                        {'name': 'name', 'label': 'Intitulé Période', 'field': 'period_name', 'align': 'left'},
                        {'name': 'date', 'label': 'Date Calcul', 'field': 'run_date', 'align': 'left'},
                        {'name': 'emps', 'label': 'Effectif', 'field': 'employee_count', 'align': 'center'},
                        {'name': 'gross', 'label': 'Masse Brute', 'field': 'gross_fmt', 'align': 'right'},
                        {'name': 'net', 'label': 'Net à Payer', 'field': 'net_fmt', 'align': 'right'},
                        {'name': 'cost', 'label': 'Coût Total', 'field': 'cost_fmt', 'align': 'right'},
                        {'name': 'status', 'label': 'Statut', 'field': 'status_fmt', 'align': 'center'},
                        {'name': 'je', 'label': 'N° Écriture', 'field': 'journal_entry_number', 'align': 'left'},
                    ]
                    run_rows = [
                        {
                            'id': r['id'],
                            'period_code': r['period_code'],
                            'period_name': r['period_name'],
                            'run_date': r['run_date'],
                            'employee_count': r.get('employee_count', 0),
                            'gross_fmt': f"{w.money(r.get('total_gross', 0))} XAF",
                            'net_fmt': f"{w.money(r.get('total_net_payable', 0))} XAF",
                            'cost_fmt': f"{w.money(r.get('total_employer_cost', 0))} XAF",
                            'status_fmt': 'Comptabilisé' if r.get('status') == 'posted' else 'Calculé',
                            'journal_entry_number': r.get('journal_entry_number') or '—',
                        }
                        for r in runs
                    ]
                    w.table(columns=run_cols, rows=run_rows, pagination=15, title='Historique des Périodes de Paie')

                # PANEL 3: Staff Directory
                with ui.tab_panel(t3).classes('p-0 gap-4 flex flex-col'):
                    emp_cols = [
                        {'name': 'reg', 'label': 'Matricule', 'field': 'registration_number', 'align': 'left'},
                        {'name': 'name', 'label': 'Nom & Prénom', 'field': 'full_name', 'align': 'left'},
                        {'name': 'dept', 'label': 'Département', 'field': 'department', 'align': 'left'},
                        {'name': 'title', 'label': 'Poste / Fonction', 'field': 'job_title', 'align': 'left'},
                        {'name': 'contract', 'label': 'Contrat', 'field': 'contract_type', 'align': 'center'},
                        {'name': 'niu', 'label': 'N° NIU', 'field': 'niu', 'align': 'left'},
                        {'name': 'cnps', 'label': 'N° CNPS', 'field': 'cnps_number', 'align': 'left'},
                        {'name': 'salary', 'label': 'Salaire Base', 'field': 'base_fmt', 'align': 'right'},
                        {'name': 'bank', 'label': 'Banque', 'field': 'bank_name', 'align': 'left'},
                    ]
                    emp_rows = [
                        {
                            'id': e['id'],
                            'registration_number': e['registration_number'],
                            'full_name': f"{e.get('last_name', '')} {e.get('first_name', '')}".strip(),
                            'department': e.get('department', '—'),
                            'job_title': e.get('job_title', '—'),
                            'contract_type': e.get('contract_type', 'CDI'),
                            'niu': e.get('niu', '—'),
                            'cnps_number': e.get('cnps_number', '—'),
                            'base_fmt': f"{w.money(e.get('base_salary', 0))} XAF",
                            'bank_name': e.get('bank_name', '—'),
                        }
                        for e in state['employees']
                    ]
                    w.table(columns=emp_cols, rows=emp_rows, pagination=15, title='Registre du Personnel Hospitalier')

    # --- Actions & Modals ----------------------------------------------------

    async def _post_run(run_id: int, on_done):
        try:
            res = await api.post(f'/payroll/runs/{run_id}/post', {})
            ui.notify(
                f"Paie comptabilisée avec succès ! Écriture {res.get('entryNumber', '')}" if lang() == 'fr' else f"Payroll posted successfully! Journal entry {res.get('entryNumber', '')}",
                type='positive'
            )
            await on_done()
        except Exception as err:
            ui.notify(f"Erreur de comptabilisation: {err}" if lang() == 'fr' else f"Posting error: {err}", type='negative')

    def _calc_run_modal(on_done):
        d = ui.dialog().props('persistent')
        with d, ui.card().classes('w-full max-w-md p-6 gap-4'):
            w.modal_header('Calculer la Paie Mensuelle' if lang() == 'fr' else 'Calculate Monthly Payroll', emoji='🧮')
            ui.label(
                'Cette opération calcule les salaires bruts, retenues CNPS et fiscales (IRPP/CAC/TDL) et cotisations patronales pour tous les employés actifs.'
                if lang() == 'fr' else 'Computes gross wages, CNPS and tax deductions (IRPP/CAC/TDL) and employer contributions for all active staff.'
            ).classes('text-xs text-slate-500 leading-relaxed')

            code_in = ui.input('Code Période (ex: 2026-02)' if lang() == 'fr' else 'Period Code (e.g. 2026-02)', value='2026-02').props('outlined dense').classes('w-full')
            name_in = ui.input('Intitulé Période' if lang() == 'fr' else 'Period Name', value='Paie Mensuelle Février 2026').props('outlined dense').classes('w-full')
            date_in = ui.input('Date de Paie (YYYY-MM-DD)' if lang() == 'fr' else 'Pay Date (YYYY-MM-DD)', value='2026-02-28').props('outlined dense').classes('w-full')

            async def _submit():
                if not code_in.value or not date_in.value:
                    ui.notify('Code et date requis' if lang() == 'fr' else 'Code and date required', type='warning')
                    return
                try:
                    res = await api.post('/payroll/runs/generate', {
                        'periodCode': code_in.value.strip(),
                        'periodName': name_in.value.strip(),
                        'runDate': date_in.value.strip(),
                    })
                    ui.notify(
                        f"Paie {code_in.value} calculée pour {res.get('employeeCount', 0)} salariés !" if lang() == 'fr' else f"Payroll {code_in.value} computed for {res.get('employeeCount', 0)} employees!",
                        type='positive'
                    )
                    d.close()
                    await on_done()
                except Exception as err:
                    ui.notify(f"Erreur: {err}", type='negative')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button('Annuler' if lang() == 'fr' else 'Cancel', on_click=d.close).props('flat color=grey')
                ui.button('Lancer le Calcul' if lang() == 'fr' else 'Start Calculation', on_click=_submit).props('unelevated color=primary')
        d.open()

    def _add_employee_modal(on_done):
        d = ui.dialog().props('persistent')
        with d, ui.card().classes('w-full max-w-2xl p-6 gap-3'):
            w.modal_header('Ajouter un Salarié au Registre' if lang() == 'fr' else 'Add Employee to Staff Registry', emoji='👤')

            with ui.row().classes('w-full grid grid-cols-2 gap-3'):
                reg_in = ui.input('Matricule (ex: EMP-SHI-007)' if lang() == 'fr' else 'Employee ID (e.g. EMP-SHI-007)').props('outlined dense')
                dept_in = ui.input('Département / Service' if lang() == 'fr' else 'Department').props('outlined dense')
                first_in = ui.input('Prénom' if lang() == 'fr' else 'First Name').props('outlined dense')
                last_in = ui.input('Nom de Famille' if lang() == 'fr' else 'Last Name').props('outlined dense')
                title_in = ui.input('Poste / Fonction' if lang() == 'fr' else 'Job Title').props('outlined dense')
                contract_in = ui.select(['CDI', 'CDD', 'STAGE', 'TEMPORAIRE'], value='CDI', label='Type Contrat' if lang() == 'fr' else 'Contract Type').props('outlined dense')
                hire_in = ui.input('Date Embauche (YYYY-MM-DD)' if lang() == 'fr' else 'Hire Date (YYYY-MM-DD)', value='2026-01-01').props('outlined dense')
                base_in = ui.number('Salaire de Base (XAF)' if lang() == 'fr' else 'Base Salary (XAF)', value=450000).props('outlined dense')
                niu_in = ui.input('N° Identifiant Unique (NIU)' if lang() == 'fr' else 'Tax ID (NIU)', value='M019200000000T').props('outlined dense')
                cnps_in = ui.input('N° Immatriculation CNPS' if lang() == 'fr' else 'Social Security No. (CNPS)', value='CNPS-123450-Z').props('outlined dense')
                trans_in = ui.number('Indemnité Transport (XAF)' if lang() == 'fr' else 'Transport Allowance (XAF)', value=35000).props('outlined dense')
                house_in = ui.number('Indemnité Logement (XAF)' if lang() == 'fr' else 'Housing Allowance (XAF)', value=0).props('outlined dense')

            async def _submit():
                if not reg_in.value or not last_in.value or not dept_in.value or not base_in.value:
                    ui.notify('Veuillez remplir tous les champs obligatoires' if lang() == 'fr' else 'Please fill in all required fields', type='warning')
                    return
                try:
                    await api.post('/payroll/employees', {
                        'registration_number': reg_in.value.strip(),
                        'first_name': first_in.value.strip() or '',
                        'last_name': last_in.value.strip(),
                        'department': dept_in.value.strip(),
                        'job_title': title_in.value.strip(),
                        'contract_type': contract_in.value,
                        'hire_date': hire_in.value.strip(),
                        'base_salary': float(base_in.value),
                        'transport_allowance': float(trans_in.value or 0),
                        'housing_allowance': float(house_in.value or 0),
                        'niu': niu_in.value.strip(),
                        'cnps_number': cnps_in.value.strip(),
                    })
                    ui.notify('Salarié créé avec succès !' if lang() == 'fr' else 'Employee created successfully!', type='positive')
                    d.close()
                    await on_done()
                except Exception as err:
                    ui.notify(f"Erreur: {err}", type='negative')

            with ui.row().classes('w-full justify-end gap-2 mt-4'):
                ui.button('Annuler' if lang() == 'fr' else 'Cancel', on_click=d.close).props('flat color=grey')
                ui.button('Enregistrer le Salarié' if lang() == 'fr' else 'Save Employee', on_click=_submit).props('unelevated color=primary')
        d.open()

    async def _dipe_modal(run_id: int):
        try:
            dipe = await api.get(f'/payroll/runs/{run_id}/dipe')
            if not isinstance(dipe, dict):
                ui.notify('DIPE non disponible' if lang() == 'fr' else 'DIPE not available', type='warning')
                return
            d = ui.dialog()
            with d, ui.card().classes('w-full max-w-3xl p-6 gap-3'):
                w.modal_header('Fichier DIPE Déclaration DGI & CNPS' if lang() == 'fr' else 'DIPE Tax & Social Security Magnetic File', emoji='📥')
                ui.label(
                    f"Fichier magnétique réglementaire pour la période {dipe.get('periodCode', '')} ({dipe.get('employeeCount', 0)} salariés). Format agréé Direction Générale des Impôts & Caisse Nationale de Prévoyance Sociale."
                    if lang() == 'fr' else f"Official magnetic export for period {dipe.get('periodCode', '')} ({dipe.get('employeeCount', 0)} employees). Certified by DGI & CNPS."
                ).classes('text-xs text-slate-500')

                ui.textarea(value=dipe.get('textContent', '')).props('readonly rows=12').classes('w-full font-mono text-xs bg-slate-50 p-2 border border-slate-200 rounded')

                with ui.row().classes('w-full justify-between items-center mt-2'):
                    ui.label(f"Fichier: {dipe.get('filename', '')}").classes('text-xs font-mono text-slate-400')
                    with ui.row().classes('gap-2'):
                        ui.button('Copier le Texte' if lang() == 'fr' else 'Copy Text', icon='content_copy', on_click=lambda: (ui.run_javascript(f"navigator.clipboard.writeText({repr(dipe.get('textContent', ''))});"), ui.notify('Texte copié !' if lang() == 'fr' else 'Text copied!', type='positive'))).props('outline color=primary size=sm')
                        ui.button('Fermer' if lang() == 'fr' else 'Close', on_click=d.close).props('flat color=grey')
            d.open()
        except Exception as err:
            ui.notify(f"Erreur génération DIPE: {err}", type='negative')

    def _view_payslip_modal(ps: dict, run_data: dict):
        d = ui.dialog()
        with d, ui.card().classes('w-full max-w-2xl p-8 gap-4 bg-white border border-slate-300 shadow-xl rounded-2xl'):
            # Payslip Header
            with ui.row().classes('w-full items-start justify-between border-b-2 border-slate-900 pb-4'):
                with ui.column().classes('gap-0.5'):
                    ui.label('TERTIARY SISTERS OF ST. FRANCIS').classes('text-xs font-bold text-slate-500 tracking-wider uppercase')
                    ui.label('HÔPITAL GÉNÉRAL DE SHISONG').classes('text-lg font-black text-slate-900')
                    ui.label('B.P. 8 Kumbo, N.W. Region, Cameroun | N° Contribuable: M019200012345T').classes('text-xs text-slate-500')
                with ui.column().classes('items-end gap-1'):
                    ui.label('BULLETIN DE PAIE').classes('text-base font-black tracking-wide text-teal-800 bg-teal-50 px-3 py-1 rounded-md border border-teal-200')
                    ui.label(f"Période: {run_data.get('period_name', '')}").classes('text-xs font-semibold text-slate-600')

            # Employee Info Grid
            with ui.row().classes('w-full grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg text-xs'):
                with ui.column().classes('gap-1'):
                    ui.label(f"Matricule: {ps.get('registration_number', '—')}").classes('font-bold')
                    ui.label(f"Salarié: {ps.get('last_name', '')} {ps.get('first_name', '')}").classes('text-sm font-black text-slate-900')
                    ui.label(f"Département: {ps.get('department', '—')}")
                    ui.label(f"Poste: {ps.get('job_title', '—')}")
                with ui.column().classes('gap-1 text-right'):
                    ui.label(f"N° NIU: {ps.get('niu', '—')}")
                    ui.label(f"N° CNPS: {ps.get('cnps_number', '—')}")
                    ui.label(f"Paiement: {ps.get('payment_method', 'VIREMENT')} ({ps.get('bank_name', 'Afriland')})")

            # Remuneration Table
            with ui.column().classes('w-full gap-2 border border-slate-200 rounded-lg overflow-hidden text-xs'):
                with ui.row().classes('w-full bg-slate-100 font-bold p-2 justify-between border-b border-slate-200'):
                    ui.label('Rubrique / Libellé')
                    ui.label('Base / Gains')
                    ui.label('Retenues Salariales')
                    ui.label('Cotisations Patronales')

                # Base salary
                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100'):
                    ui.label('Salaire de base conventionnel')
                    ui.label(f"{w.money(ps.get('base_salary', 0))} XAF").classes('font-mono font-semibold')
                    ui.label('—')
                    ui.label('—')

                # Allowances
                if float(ps.get('transport_allowance', 0) or 0) > 0:
                    with ui.row().classes('w-full p-2 justify-between border-b border-slate-100'):
                        ui.label('Indemnité de transport')
                        ui.label(f"{w.money(ps.get('transport_allowance', 0))} XAF").classes('font-mono')
                        ui.label('—')
                        ui.label('—')

                if float(ps.get('housing_allowance', 0) or 0) > 0:
                    with ui.row().classes('w-full p-2 justify-between border-b border-slate-100'):
                        ui.label('Indemnité de logement')
                        ui.label(f"{w.money(ps.get('housing_allowance', 0))} XAF").classes('font-mono')
                        ui.label('—')
                        ui.label('—')

                # Deductions lines
                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-rose-700'):
                    ui.label('Cotisation Sociale CNPS PVI (4.2%)')
                    ui.label('—')
                    ui.label(f"{w.money(ps.get('cnps_employee', 0))} XAF").classes('font-mono font-semibold')
                    ui.label(f"{w.money(ps.get('total_cnps_employer', 0))} XAF").classes('font-mono text-slate-600')

                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-rose-700'):
                    ui.label('Impôt sur le Revenu (IRPP Barème Progressif)')
                    ui.label('—')
                    ui.label(f"{w.money(ps.get('irpp', 0))} XAF").classes('font-mono font-semibold')
                    ui.label('—')

                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-rose-700'):
                    ui.label('Centimes Additionnels Communaux (CAC 10%)')
                    ui.label('—')
                    ui.label(f"{w.money(ps.get('cac', 0))} XAF").classes('font-mono')
                    ui.label('—')

                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-rose-700'):
                    ui.label('Taxe de Développement Local (TDL)')
                    ui.label('—')
                    ui.label(f"{w.money(ps.get('tdl', 0))} XAF").classes('font-mono')
                    ui.label('—')

                with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-rose-700'):
                    ui.label('Crédit Foncier du Cameroun (CFC 1%)')
                    ui.label('—')
                    ui.label(f"{w.money(ps.get('cfc_employee', 0))} XAF").classes('font-mono')
                    ui.label(f"{w.money(ps.get('cfc_employer', 0))} XAF").classes('font-mono text-slate-600')

                # Totals row
                with ui.row().classes('w-full p-2 bg-slate-50 font-bold justify-between'):
                    ui.label('TOTAUX')
                    ui.label(f"{w.money(ps.get('gross_salary', 0))} XAF").classes('font-mono text-slate-900')
                    ui.label(f"{w.money(ps.get('total_employee_deductions', 0))} XAF").classes('font-mono text-rose-700')
                    ui.label(f"{w.money(ps.get('total_employer_contributions', 0))} XAF").classes('font-mono text-slate-700')

            # Net to Pay Highlight
            with ui.row().classes('w-full items-center justify-between p-4 bg-teal-50 border-2 border-teal-500 rounded-xl my-2'):
                with ui.column().classes('gap-0'):
                    ui.label('NET À PAYER AU SALARIÉ').classes('text-xs font-black text-teal-900 tracking-wider uppercase')
                    ui.label('Virement bancaire irrévocable').classes('text-xs text-teal-700')
                ui.label(f"{w.money(ps.get('net_salary', 0))} XAF").classes('text-2xl font-black text-teal-900 font-mono')

            # Signature boxes
            with ui.row().classes('w-full justify-between pt-6 text-xs text-slate-500'):
                ui.label('Signature de l’Employeur (Direction Financière)')
                ui.label('Signature du Salarié (Pour Acquit)')

            with ui.row().classes('w-full justify-end mt-4'):
                ui.button('Imprimer / Fermer', on_click=d.close).props('unelevated color=primary size=sm')

        d.open()

    await render_content()
