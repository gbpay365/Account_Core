"""
Physical Asset Inventory & Barcode Audit (Inventaire Physique des Immobilisations).
Supports mobile barcode/QR scan audits, multi-room tracking, reconciliation,
and statutory Procès-Verbal (PV) d'Inventaire generation compliant with OHADA AUDCIF.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {
        'fr': 'Inventaire Physique des Immobilisations (Audit Code-Barres)',
        'en': 'Physical Asset Inventory (Barcode Audit)',
    },
    'subtitle': {
        'fr': 'Pointage physique contradictoire, traçabilité des déplacements et Procès-Verbal officiel (PV)',
        'en': 'Physical audit verification, relocation tracking and official statutory report (PV)',
    },
    'btn_new_camp': {'fr': 'Nouvelle Campagne', 'en': 'New Campaign'},
    'lbl_camp': {'fr': 'Campagne d’Inventaire', 'en': 'Inventory Campaign'},
    'btn_reconcile': {'fr': 'Clôturer & Dresser le PV', 'en': 'Close & Generate Report (PV)'},
    'chip_reconciled': {'fr': 'Campagne Clôturée & Réconciliée', 'en': 'Campaign Closed & Reconciled'},
    'reconciled_success': {'fr': 'Inventaire clôturé et PV de réconciliation généré avec succès !', 'en': 'Inventory closed and official reconciliation report generated successfully!'},
    'no_camp': {'fr': 'Aucune campagne d’inventaire active. Veuillez en créer une.', 'en': 'No active inventory campaign. Please create one.'},
    'kpi_expected': {'fr': 'Biens Répertoriés (Attendus)', 'en': 'Expected Assets (Register)'},
    'kpi_expected_sub': {'fr': 'Registre comptable des actifs', 'en': 'Accounting asset register'},
    'kpi_scanned': {'fr': 'Biens Scannés & Vérifiés', 'en': 'Scanned & Verified Assets'},
    'kpi_relocated': {'fr': 'Biens Déplacés (Hors Emplacement)', 'en': 'Relocated Assets (Off-Site)'},
    'kpi_relocated_sub': {'fr': 'Localisation physique non conforme', 'en': 'Non-compliant physical location'},
    'kpi_missing': {'fr': 'Biens Manquants (Non Retrouvés)', 'en': 'Missing Assets (Unlocated)'},
    'kpi_missing_sub': {'fr': 'Écart d’inventaire à investiguer', 'en': 'Inventory variance to investigate'},
    'tab_scanner': {'fr': 'Scanner & Journal des relevés', 'en': 'Scanner & Audit Log'},
    'tab_pv': {'fr': 'Procès-Verbal officiel (PV)', 'en': 'Official Statutory Report (PV)'},
    'scan_station': {'fr': 'POSTE DE SCAN MOBILITÉ / CODE-BARRES / QR / RFID', 'en': 'MOBILE / BARCODE / QR / RFID SCANNING STATION'},
    'scan_placeholder': {'fr': 'Scanner ou saisir le code-barres (ex: TSSF-2026-00001)...', 'en': 'Scan or enter barcode (e.g. TSSF-2026-00001)...'},
    'lbl_current_loc': {'fr': 'Emplacement actuel (Salle/Service)', 'en': 'Current Location (Room/Dept)'},
    'lbl_cond': {'fr': 'État physique', 'en': 'Physical Condition'},
    'cond_good': {'fr': 'Bon état', 'en': 'Good condition'},
    'cond_fair': {'fr': 'État moyen', 'en': 'Fair condition'},
    'cond_poor': {'fr': 'Dégradé', 'en': 'Poor condition'},
    'cond_scrap': {'fr': 'Rebut / HS', 'en': 'Scrap / Out of service'},
    'btn_record_scan': {'fr': 'Enregistrer le scan', 'en': 'Record Scan'},
    'scan_log_title': {'fr': 'Journal des Relevés Physiques ({n} scans)', 'en': 'Physical Audit Log ({n} scans)'},
    'no_scans': {'fr': 'Aucun scan enregistré pour cette campagne.', 'en': 'No scans recorded for this campaign.'},
    'col_scan_time': {'fr': 'Heure du scan', 'en': 'Scan Time'},
    'col_scan_tag': {'fr': 'Code Scanné', 'en': 'Scanned Tag'},
    'col_scan_name': {'fr': 'Équipement identifié', 'en': 'Identified Asset'},
    'col_scan_loc': {'fr': 'Lieu constaté', 'en': 'Observed Location'},
    'col_scan_orig_loc': {'fr': 'Lieu théorique', 'en': 'Expected Location'},
    'col_scan_cond': {'fr': 'État constaté', 'en': 'Observed Condition'},
    'col_scan_verdict': {'fr': 'Résultat d’audit', 'en': 'Audit Verdict'},
    'res_verified': {'fr': 'Vérifié', 'en': 'Verified'},
    'res_relocated': {'fr': 'Déplacé', 'en': 'Relocated'},
    'res_unreg': {'fr': 'Non répertorié', 'en': 'Unregistered'},
    'res_poor': {'fr': 'Dégradé', 'en': 'Degraded'},
    'pv_title': {'fr': 'PROCÈS-VERBAL D’INVENTAIRE PHYSIQUE DES IMMOBILISATIONS', 'en': 'STATUTORY REPORT OF PHYSICAL ASSET INVENTORY (PV)'},
    'pv_sub': {'fr': 'Conforme aux Normes OHADA / SYSCOHADA Révisé & Recommandations des Commissaires aux Comptes', 'en': 'Compliant with OHADA / Revised SYSCOHADA Standards & External Audit Guidelines'},
    'pv_camp': {'fr': 'Campagne : {name} — Exercice : {fy}', 'en': 'Campaign: {name} — Fiscal Year: {fy}'},
    'pv_date': {'fr': 'Date du PV : {d}', 'en': 'Report Date: {d}'},
    'pv_badge': {'fr': 'Inventaire Contradictoire', 'en': 'Physical Audit Report'},
    'pv_verified_title': {'fr': 'BIENS RETROUVÉS EN PLACE :', 'en': 'ASSETS VERIFIED IN PLACE:'},
    'pv_relocated_title': {'fr': 'BIENS DÉPLACÉS (SANS FICHE) :', 'en': 'RELOCATED ASSETS (UNRECORDED MOVE):'},
    'pv_missing_title': {'fr': 'BIENS MANQUANTS (ÉCART D’ACTIF) :', 'en': 'MISSING ASSETS (REGISTER DEFICIT):'},
    'pv_relocated_act': {'fr': 'À régulariser en GMAO / Fiche navette', 'en': 'Action: Transfer ticket update in CMMS'},
    'pv_sec1': {'fr': '1. LISTE DES BIENS DÉPLACÉS DE LEUR AFFECTATION D’ORIGINE', 'en': '1. RELOCATED ASSETS MISSING TRANSFER TICKETS'},
    'pv_sec2': {'fr': '2. LISTE DES BIENS MANQUANTS À L’INVENTAIRE (RECHERCHE / ENQUÊTE REQUISE)', 'en': '2. UNFOUND ASSETS REQUIRING AUDIT INVESTIGATION'},
    'pv_sec3': {'fr': '3. MATÉRIELS PHYSIQUES CONSTATÉS SANS ÉTIQUETTE COMPTABLE', 'en': '3. PHYSICAL ITEMS FOUND WITHOUT ACCOUNTING TAG'},
    'sig_team': {'fr': 'L’Équipe d’Inventaire Physique', 'en': 'Physical Inventory Team'},
    'sig_team_sub': {'fr': '(Noms, dates et signatures)', 'en': '(Names, dates, and signatures)'},
    'sig_mgr': {'fr': 'Le Gestionnaire du Patrimoine (GMAO)', 'en': 'Asset / CMMS Manager'},
    'sig_mgr_sub': {'fr': '(Visa de régularisation)', 'en': '(Adjustment visa)'},
    'sig_cfo': {'fr': 'Le Chef Comptable / DAF', 'en': 'Chief Financial Officer / Head of Accounts'},
    'sig_cfo_sub': {'fr': '(Approbation du PV et écritures d’ajustement)', 'en': '(Approval and journal adjustment)'},
    'modal_camp_title': {'fr': 'Créer une Campagne d’Inventaire Physique', 'en': 'Create Physical Inventory Campaign'},
    'modal_camp_name': {'fr': 'Nom de la campagne', 'en': 'Campaign Name'},
    'modal_camp_fy': {'fr': 'Exercice fiscal rattaché', 'en': 'Attached Fiscal Year'},
    'modal_camp_start': {'fr': 'Date de début', 'en': 'Start Date'},
    'modal_camp_end': {'fr': 'Date de fin estimée', 'en': 'Estimated End Date'},
    'modal_camp_notes': {'fr': 'Objectif / Consignes d’audit', 'en': 'Objective / Audit Guidelines'},
    'modal_camp_btn': {'fr': 'Créer la campagne', 'en': 'Create Campaign'},
    'modal_camp_created': {'fr': 'Campagne d’inventaire créée avec succès !', 'en': 'Inventory campaign created successfully!'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        text = entry.get(cur, entry.get('en', ''))
    else:
        text = t(key)
    return text.format(**kwargs) if kwargs else text


@page('/asset-inventory', title='Physical asset inventory', permissions=('asset.view',))
async def asset_inventory_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    campaigns_res = await api.safe(api.get('/asset-inventory/campaigns'), notify=False) or {'rows': []}
    campaigns = campaigns_res.get('rows', [])
    default_camp_id = campaigns[0]['id'] if campaigns else None

    locations_res = await api.safe(api.get('/assets/locations'), notify=False) or {'rows': []}
    locations = locations_res.get('rows', [])

    years_res = await api.safe(api.get('/fiscal-years'), notify=False) or {'rows': []}
    fiscal_years = years_res.get('rows', [])

    state = {
        'campaign_id': default_camp_id,
        'tab': 'scanner',
    }

    content = ui.column().classes('w-full gap-4')

    def actions() -> None:
        ui.button(
            _loc('btn_new_camp'),
            icon='add_circle',
            on_click=lambda: _new_campaign_modal(fiscal_years, reload_all)
        ).props('unelevated size=sm')

    with ui.element('div').classes('w-full lc-no-print'):
        w.page_header(
            _loc('title'),
            _loc('subtitle'),
            actions=actions,
            emoji='📦'
        )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_camp_id = state['campaign_id']
        if not curr_camp_id:
            ui.label(_loc('no_camp')).classes('text-slate-500 italic p-6')
            return

        camp_data = await api.safe(api.get(f'/asset-inventory/campaigns/{curr_camp_id}'), notify=False) or {}
        campaign = camp_data.get('campaign', {})
        scans = camp_data.get('scans', [])

        tot_expected = campaign.get('total_expected', 0)
        tot_scanned = campaign.get('total_scanned', 0)
        tot_missing = campaign.get('total_missing', 0)
        tot_relocated = campaign.get('total_relocated', 0)
        progress_pct = int((tot_scanned / tot_expected) * 100) if tot_expected > 0 else 0

        # 1. Top Controls Bar: Campaign Selector
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm lc-no-print'):
            with ui.row().classes('items-center gap-4'):
                camp_opts = {c['id']: f"{c['name']} ({c['status'].upper()})" for c in campaigns}
                async def on_camp_change(e):
                    state['campaign_id'] = e.value
                    await reload_all()

                ui.select(camp_opts, value=curr_camp_id, on_change=on_camp_change, label=_loc('lbl_camp')).props('outlined dense options-dense').classes('w-96')

            with ui.row().classes('items-center gap-2'):
                async def do_reconcile():
                    res = await api.safe(api.post(f'/asset-inventory/campaigns/{curr_camp_id}/reconcile', {}))
                    if res:
                        ui.notify(_loc('reconciled_success'), type='positive')
                        await reload_all()

                if campaign.get('status') != 'reconciled':
                    ui.button(_loc('btn_reconcile'), icon='assignment_turned_in', on_click=do_reconcile).props('unelevated color=teal size=sm')
                else:
                    ui.chip(_loc('chip_reconciled'), icon='verified', color='emerald-1', text_color='emerald-9').props('dense font-bold')

                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Key Metrics Strip
        with ui.grid(columns=4).classes('w-full gap-4 lc-no-print'):
            with ui.card().classes('p-4 border-l-4 border-blue-500 shadow-sm'):
                ui.label(_loc('kpi_expected')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{tot_expected}").classes('text-2xl font-bold text-slate-800')
                ui.label(_loc('kpi_expected_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-emerald-500 shadow-sm'):
                ui.label(_loc('kpi_scanned')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{tot_scanned} ({progress_pct}%)").classes('text-2xl font-bold text-emerald-700')
                ui.linear_progress(value=progress_pct / 100, show_value=False).props('color=emerald stripe rounded').classes('h-2 mt-1')

            with ui.card().classes('p-4 border-l-4 border-amber-500 shadow-sm'):
                ui.label(_loc('kpi_relocated')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{tot_relocated}").classes('text-2xl font-bold text-amber-700')
                ui.label(_loc('kpi_relocated_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-rose-500 shadow-sm'):
                ui.label(_loc('kpi_missing')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{tot_missing}").classes('text-2xl font-bold text-rose-700')
                ui.label(_loc('kpi_missing_sub')).classes('text-xs text-slate-400')

        # 3. Tab Navigation
        with ui.tabs().classes('w-full border-b border-slate-200 mt-2 lc-no-print') as tabs:
            tab_scan = ui.tab(_loc('tab_scanner'), icon='qr_code_scanner')
            tab_pv = ui.tab(_loc('tab_pv'), icon='description')

        with ui.tab_panels(tabs, value=tab_scan).classes('w-full bg-transparent p-0 pt-3'):
            # --- Panel 1: Barcode Scanner Workbench ---
            with ui.tab_panel(tab_scan).classes('p-0 gap-4'):
                with ui.card().classes('w-full p-6 bg-slate-900 text-white rounded-xl shadow-md'):
                    with ui.row().classes('items-center gap-2 mb-2'):
                        ui.icon('qr_code_scanner', size='24px', color='primary')
                        ui.label(_loc('scan_station')).classes('font-bold text-sm tracking-wide uppercase text-slate-200')

                    with ui.row().classes('w-full items-center gap-4 flex-wrap'):
                        tag_input = ui.input(placeholder=_loc('scan_placeholder')).props('outlined dark dense').classes('flex-1 min-w-[280px]')

                        loc_default = 'Main location' if lang() == 'en' else 'Localisation principale'
                        loc_opts = {l['id']: f"{l['code']} - {l['name']}" for l in locations} if locations else {1: loc_default}
                        loc_select = ui.select(loc_opts, value=locations[0]['id'] if locations else 1, label=_loc('lbl_current_loc')).props('outlined dark dense').classes('w-64')

                        cond_opts = {
                            'good': _loc('cond_good'),
                            'fair': _loc('cond_fair'),
                            'poor': _loc('cond_poor'),
                            'scrap': _loc('cond_scrap'),
                        }
                        cond_select = ui.select(cond_opts, value='good', label=_loc('lbl_cond')).props('outlined dark dense').classes('w-44')

                        async def submit_scan():
                            val = tag_input.value
                            if not val or not val.strip():
                                ui.notify('Please scan or enter a barcode.' if lang() == 'en' else 'Veuillez scanner ou saisir un code-barres.', type='warning')
                                return

                            payload = {
                                'scanned_tag': val.strip(),
                                'location_id': loc_select.value,
                                'scanned_condition': cond_select.value,
                                'scanned_operational_status': 'in_service' if cond_select.value != 'scrap' else 'out_of_service',
                            }
                            res = await api.safe(api.post(f'/asset-inventory/campaigns/{curr_camp_id}/scan', payload))
                            if res:
                                tag_input.value = ''
                                result_type = res.get('audit_result')
                                if result_type == 'verified':
                                    ui.notify(f"✅ {res.get('asset_name')} verified in place!" if lang() == 'en' else f"✅ {res.get('asset_name')} vérifié en place !", type='positive')
                                elif result_type == 'relocated':
                                    ui.notify(f"⚠️ {res.get('asset_name')} RELOCATED (Different room)" if lang() == 'en' else f"⚠️ {res.get('asset_name')} DÉPLACÉ (Emplacement différent)", type='warning')
                                elif result_type == 'unregistered':
                                    ui.notify(f"🚫 {res.get('scanned_tag')} NOT REGISTERED in asset book!" if lang() == 'en' else f"🚫 {res.get('scanned_tag')} NON RÉPERTORIÉ dans le registre !", type='negative')
                                else:
                                    ui.notify(f"Scan recorded ({result_type})", type='info')
                                await reload_all()

                        tag_input.on('keydown.enter', submit_scan)
                        ui.button(_loc('btn_record_scan'), icon='check', on_click=submit_scan).props('unelevated color=primary')

                # Scans History Table
                with ui.card().classes('w-full p-4 border border-slate-200 shadow-sm'):
                    ui.label(_loc('scan_log_title', n=len(scans))).classes('font-bold text-slate-800 text-base mb-2')

                    if not scans:
                        ui.label(_loc('no_scans')).classes('text-slate-400 italic p-6')
                    else:
                        formatted_scans = [
                            {
                                **s,
                                'time_formatted': str(s.get('scanned_at', ''))[11:19],
                                'asset_name_formatted': s.get('asset_name') or ('Unregistered' if lang() == 'en' else 'Non répertorié'),
                            }
                            for s in scans
                        ]

                        columns = [
                            {'name': 'time', 'label': _loc('col_scan_time'), 'field': 'time_formatted', 'align': 'center'},
                            {'name': 'tag', 'label': _loc('col_scan_tag'), 'field': 'scanned_tag', 'align': 'left'},
                            {'name': 'name', 'label': _loc('col_scan_name'), 'field': 'asset_name_formatted', 'align': 'left'},
                            {'name': 'scanned_loc', 'label': _loc('col_scan_loc'), 'field': 'scanned_location_name', 'align': 'left'},
                            {'name': 'orig_loc', 'label': _loc('col_scan_orig_loc'), 'field': 'original_location_name', 'align': 'left'},
                            {'name': 'cond', 'label': _loc('col_scan_cond'), 'field': 'scanned_condition', 'align': 'center'},
                            {'name': 'verdict', 'label': _loc('col_scan_verdict'), 'field': 'audit_result', 'align': 'center'},
                        ]

                        table = ui.table(columns=columns, rows=formatted_scans, row_key='id').props('flat dense bordered').classes('w-full')

                        table.add_slot('body-cell-tag', '''<q-td :props="props"><span class="font-mono font-bold">{{ props.value }}</span></q-td>''')
                        table.add_slot('body-cell-verdict', '''
                            <q-td :props="props">
                                <q-chip dense size="xs" :color="props.value === 'verified' ? 'emerald-1' : (props.value === 'relocated' ? 'amber-1' : 'rose-1')" :text-color="props.value === 'verified' ? 'emerald-9' : (props.value === 'relocated' ? 'amber-9' : 'rose-9')">
                                    {{ props.value === 'verified' ? 'Verified' : (props.value === 'relocated' ? 'Relocated' : (props.value === 'unregistered' ? 'Unregistered' : 'Degraded')) }}
                                </q-chip>
                            </q-td>
                        ''')

            # --- Panel 2: Procès-Verbal d'Inventaire ---
            with ui.tab_panel(tab_pv).classes('p-0'):
                _render_pv_report(curr_camp_id, currency)

    await render_view()


def _render_pv_report(campaign_id: int, currency: str) -> None:
    async def load_pv(container):
        res = await api.safe(api.post(f'/asset-inventory/campaigns/{campaign_id}/reconcile', {}))
        if not res:
            with container:
                ui.label('Failed to load inventory report.' if lang() == 'en' else 'Impossible de charger le PV d’inventaire.').classes('text-rose-600')
            return

        verified = res.get('verified_assets', [])
        relocated = res.get('relocated_assets', [])
        missing = res.get('missing_assets', [])
        unreg = res.get('unregistered_scans', [])
        camp = res.get('campaign', {})

        with container:
            with ui.card().classes('w-full max-w-5xl mx-auto p-8 bg-white border border-slate-300 shadow-md rounded-xl print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full print:w-full'):
                # Official PV Header
                with ui.row().classes('w-full justify-between items-start no-wrap border-b-2 border-slate-900 pb-4 mb-6 gap-6 print-avoid-break'):
                    with ui.column().classes('gap-1 flex-1 min-w-0'):
                        ui.label(_loc('pv_title')).classes('text-xl font-black text-slate-900 uppercase tracking-tight')
                        ui.label(_loc('pv_sub')).classes('text-xs text-slate-500 font-semibold uppercase')
                        ui.label(_loc('pv_camp', name=camp.get('name', ''), fy=camp.get('fiscal_year_code', ''))).classes('text-sm font-bold text-slate-800 mt-1')

                    with ui.column().classes('items-end shrink-0 gap-1 text-right'):
                        ui.button(t('common.print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary size=sm').classes('lc-no-print mb-1')
                        ui.label(_loc('pv_date', d=res.get('pv_date', ''))).classes('text-sm font-bold text-slate-800')
                        ui.chip(_loc('pv_badge'), color='slate-8', text_color='white').props('square font-mono text-xs')

                # Executive Summary Box
                with ui.grid(columns=3).classes('w-full gap-4 p-4 bg-slate-100 rounded-lg mb-6 border border-slate-200 text-xs font-mono print-avoid-break'):
                    with ui.column().classes('gap-1'):
                        ui.label(_loc('pv_verified_title')).classes('font-bold text-slate-800 font-sans')
                        unit_str = 'equipment(s)' if lang() == 'en' else 'équipement(s)'
                        cost_str = 'Gross value' if lang() == 'en' else 'Valeur brute'
                        ui.label(f"{len(verified)} {unit_str}").classes('font-bold text-sm text-emerald-800')
                        ui.label(f"{cost_str} : {w.money(res.get('total_verified_cost', 0), currency)} {currency}")

                    with ui.column().classes('gap-1'):
                        ui.label(_loc('pv_relocated_title')).classes('font-bold text-slate-800 font-sans')
                        ui.label(f"{len(relocated)} {unit_str}").classes('font-bold text-sm text-amber-800')
                        ui.label(_loc('pv_relocated_act'))

                    with ui.column().classes('gap-1'):
                        ui.label(_loc('pv_missing_title')).classes('font-bold text-slate-800 font-sans')
                        nbv_str = 'NBV Impact' if lang() == 'en' else 'Impact VCN'
                        ui.label(f"{len(missing)} {unit_str}").classes('font-bold text-sm text-rose-800')
                        ui.label(f"{nbv_str} : {w.money(res.get('total_missing_nbv', 0), currency)} {currency}")

                # Relocated Assets Section
                if relocated:
                    ui.label(_loc('pv_sec1')).classes('text-sm font-bold text-slate-800 uppercase bg-amber-50 p-2 rounded border border-amber-200 mt-2 print-avoid-break')
                    for r in relocated:
                        with ui.row().classes('w-full justify-between items-center text-xs py-1.5 border-b border-slate-200 font-mono no-wrap print-avoid-break'):
                            orig_lbl = 'Expected' if lang() == 'en' else 'Origine'
                            actual_lbl = 'Observed' if lang() == 'en' else 'Constaté'
                            ui.label(f"• [{r.get('asset_tag')}] {r.get('name')}").classes('flex-1 min-w-0 truncate font-sans text-xs text-slate-800')
                            ui.label(f"{orig_lbl} : {r.get('original_location', '—')} ➔ {actual_lbl} : {r.get('actual_location', '—')}").classes('font-bold text-amber-800 shrink-0 text-right ml-4')

                # Missing Assets Section
                if missing:
                    ui.label(_loc('pv_sec2')).classes('text-sm font-bold text-slate-800 uppercase bg-rose-50 p-2 rounded border border-rose-200 mt-4 print-avoid-break')
                    for m in missing:
                        with ui.row().classes('w-full justify-between items-center text-xs py-1.5 border-b border-slate-200 font-mono no-wrap print-avoid-break'):
                            exp_lbl = 'Expected location' if lang() == 'en' else 'Lieu théorique'
                            ui.label(f"• [{m.get('asset_tag')}] {m.get('name')} ({exp_lbl} : {m.get('expected_location')})").classes('flex-1 min-w-0 truncate font-sans text-xs text-slate-800')
                            ui.label(f"NBV : {w.money(m.get('ohada_nbv'), currency)} {currency}").classes('font-bold text-rose-800 shrink-0 text-right ml-4')

                # Unregistered Assets Section
                if unreg:
                    ui.label(_loc('pv_sec3')).classes('text-sm font-bold text-slate-800 uppercase bg-purple-50 p-2 rounded border border-purple-200 mt-4 print-avoid-break')
                    for u in unreg:
                        with ui.row().classes('w-full justify-between items-center text-xs py-1.5 border-b border-slate-200 font-mono no-wrap print-avoid-break'):
                            loc_lbl = 'Room' if lang() == 'en' else 'Lieu'
                            note_lbl = 'Note' if lang() == 'en' else 'Note'
                            ui.label(f"• Tag: {u.get('scanned_tag')} ({loc_lbl} : {u.get('location_name')})").classes('flex-1 min-w-0 truncate font-sans text-xs text-slate-800')
                            ui.label(f"{note_lbl} : {u.get('notes', '—')}").classes('italic text-slate-500 shrink-0 text-right ml-4')

                # Commission Signatures
                with ui.grid(columns=3).classes('w-full gap-8 mt-12 pt-8 border-t border-slate-300 text-center text-xs print-avoid-break'):
                    with ui.column().classes('items-center gap-10'):
                        ui.label(_loc('sig_team')).classes('font-bold text-slate-700 uppercase')
                        ui.label(_loc('sig_team_sub')).classes('text-slate-400 italic')

                    with ui.column().classes('items-center gap-10'):
                        ui.label(_loc('sig_mgr')).classes('font-bold text-slate-700 uppercase')
                        ui.label(_loc('sig_mgr_sub')).classes('text-slate-400 italic')

                    with ui.column().classes('items-center gap-10'):
                        ui.label(_loc('sig_cfo')).classes('font-bold text-slate-700 uppercase')
                        ui.label(_loc('sig_cfo_sub')).classes('text-slate-400 italic')

    pv_container = ui.column().classes('w-full')
    ui.timer(0.1, lambda: load_pv(pv_container), once=True)


def _new_campaign_modal(fiscal_years: list, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[520px] p-6 gap-4'):
        w.modal_header(_loc('modal_camp_title'), emoji='📋')

        camp_name_val = 'Physical Inventory Campaign 2026' if lang() == 'en' else 'Campagne d’Inventaire Physique 2026'
        name_in = ui.input(label=_loc('modal_camp_name'), value=camp_name_val).props('outlined dense').classes('w-full')
        fy_prefix = 'Fiscal Year' if lang() == 'en' else 'Exercice'
        fy_opts = {fy['id']: f"{fy_prefix} {fy.get('code', fy['id'])}" for fy in fiscal_years}
        fy_sel = ui.select(fy_opts, value=fiscal_years[0]['id'] if fiscal_years else 1, label=_loc('modal_camp_fy')).props('outlined dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            d_start = ui.input(label=_loc('modal_camp_start'), value='2026-10-01').props('outlined dense')
            d_end = ui.input(label=_loc('modal_camp_end'), value='2026-10-31').props('outlined dense')

        notes_in = ui.input(label=_loc('modal_camp_notes')).props('outlined dense').classes('w-full')

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_create():
                payload = {
                    'name': name_in.value,
                    'fiscal_year_id': fy_sel.value,
                    'start_date': d_start.value,
                    'end_date': d_end.value,
                    'notes': notes_in.value,
                }
                res = await api.safe(api.post('/asset-inventory/campaigns', payload))
                if res:
                    ui.notify(_loc('modal_camp_created'), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('modal_camp_btn'), icon='check', on_click=do_create).props('unelevated color=primary')

    dlg.open()
