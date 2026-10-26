"""
LedgerCore Health — Sage Enterprise Interoperability & Multi-Branch Budget Gateway
Supports:
1. Sage X3 Finance Module (Syracuse REST/GraphQL, Analytical Dimensions AXE_CC, AXE_PRG)
2. Sage Intacct (XML-RPC 3.0 Web Services & CSV, Location/Department/Project dimensions)
3. Sage 300 / Accpac (Web API OData v4, GL Budget Sets 1-5, 12 fiscal periods)
4. Sage 200 Professional (Columbus REST Gateway, Nominal Ledger, Cost Centres, Departments)
5. Sage 100c Comptabilité & Gestion Budgétaire (Format Paramétrable ASCII .PNM / CSV)
"""

from __future__ import annotations

import datetime
import json
import random
import string
from typing import Any

from nicegui import ui

from app import api
from app.i18n import lang
from app.ui import widgets as w


SAGE_T: dict[str, dict[str, str]] = {
    'banner_title': {
        'en': 'Sage Enterprise Multi-Platform & Multi-Branch Budget Gateway',
        'fr': 'Passerelle Budgétaire Multi-Sites & Écosystème Sage (X3 / Intacct / 300 / 200 / 100c)',
    },
    'banner_subtitle': {
        'en': 'Bidirectional budget sync, real-time AVC statutory overrun protection, and multi-branch network coordination across Sage X3, Sage Intacct, Sage 300, Sage 200 Pro, and Sage 100c.',
        'fr': 'Synchronisation budgétaire bidirectionnelle, validation des engagements en temps réel (AVC), et pilotage multi-sites pour Sage X3, Sage Intacct, Sage 300, Sage 200 Pro, et Sage 100c.',
    },
    'kpi_network_branches': {'en': 'Connected Branches', 'fr': 'Succursales Connectées'},
    'kpi_sage_branches': {'en': 'Using Sage ERPs', 'fr': 'Sous Écosystème Sage'},
    'kpi_network_envelope': {'en': 'Consolidated Budget', 'fr': 'Budget Réseau Consolidé'},
    'kpi_network_committed': {'en': 'Network Commitments', 'fr': 'Engagements Réseau'},
    'kpi_network_rate': {'en': 'Consolidated Rate', 'fr': 'Taux Réseau Global'},
    'kpi_envelope_sub': {'en': 'Global group & branch credit envelope', 'fr': 'Enveloppe globale groupe & succursales'},
    'kpi_available_sub': {'en': 'Net available: {avail}', 'fr': 'Disponible net: {avail}'},

    'sec_branches_title': {'en': 'Branch Network & Enterprise ERP System Configuration', 'fr': 'Réseau d’Établissements & Configuration ERP Multi-Sites'},
    'sec_branches_sub': {'en': 'Manage remote branches running Sage X3, Intacct, 300, 200, 100c, or LedgerCore, sync schedules, and credit envelopes.', 'fr': 'Gestion des sites distants équipés de Sage X3, Intacct, 300, 200, 100c ou LedgerCore, fréquence et dotations.'},
    'sec_exchange_title': {'en': 'Sage Enterprise Budget Data Exchange Hub', 'fr': 'Centre d’Échange de Fichiers & Modèles Budgétaires Sage'},
    'sec_exchange_sub': {'en': 'Export budgets specifically tailored for Sage X3, Sage Intacct, Sage 300, Sage 200 Pro, or Sage 100 PNM.', 'fr': 'Exports et imports nativement adaptés pour Sage X3, Sage Intacct, Sage 300, Sage 200 Pro, ou Sage 100 PNM.'},
    'sec_alloc_title': {'en': 'Inter-Branch Budget Appropriations & Transfers (Account 18)', 'fr': 'Virements & Dotations Budgétaires Inter-Succursales (Compte 18)'},
    'sec_alloc_sub': {'en': 'Authorize budgetary credit transfers between Headquarters and remote Sage branches.', 'fr': 'Attribution et virements d’enveloppes budgétaires entre le siège et les succursales distantes.'},
    'sec_matrix_title': {'en': 'Consolidated Multi-Branch Budget Execution Matrix', 'fr': 'Matrice Consolidée d’Exécution Budgétaire Multi-Sites'},
    'sec_matrix_sub': {'en': 'Consolidated real-time comparison across all company branches (Sage and native).', 'fr': 'Comparatif consolidé en temps réel sur l’ensemble des succursales de l’entreprise.'},
    'sec_gateway_title': {'en': 'Sage Live API Gateway & Interactive Simulator', 'fr': 'Passerelle API Sage en Direct & Simulateur Multi-ERP'},
    'sec_gateway_sub': {'en': 'Test incoming purchase commitments from Sage X3, Intacct, 300, 200, and 100 with real-time AVC availability checking.', 'fr': 'Testez l’ingestion en temps réel des engagements de dépenses émis par Sage X3, Intacct, 300, 200 et 100 avec contrôle AVC.'},

    'btn_export_x3': {'en': 'Export Sage X3 (JSON)', 'fr': 'Export Sage X3 (Syracuse)'},
    'btn_export_intacct': {'en': 'Export Sage Intacct (XML)', 'fr': 'Export Sage Intacct (XML-RPC)'},
    'btn_export_300': {'en': 'Export Sage 300 (OData)', 'fr': 'Export Sage 300 (OData)'},
    'btn_export_200': {'en': 'Export Sage 200 (REST)', 'fr': 'Export Sage 200 (REST)'},
    'btn_export_pnm': {'en': 'Export Sage 100 (.PNM)', 'fr': 'Export Sage 100 (.PNM)'},
    'btn_export_csv': {'en': 'Export Universal CSV', 'fr': 'Export CSV Universel'},
    'btn_import_sage': {'en': 'Import Sage Budget File', 'fr': 'Importer Fichier Sage'},
    'btn_new_allocation': {'en': 'New Branch Allocation', 'fr': 'Nouveau Virement Inter-Sites'},
    'btn_new_branch': {'en': '+ New Branch', 'fr': '+ Nouvelle Succursale'},
    'btn_new_dest_branch': {'en': '+ New Destination Branch', 'fr': '+ Nouvelle Succursale Destinataire'},
    'btn_sync_now': {'en': 'Sync Now', 'fr': 'Synchroniser'},
    'btn_test_conn': {'en': 'Test Connection', 'fr': 'Tester Connexion'},
    'btn_configure_erp': {'en': 'Configure ERP', 'fr': 'Paramétrer ERP'},
    'btn_simulate_push': {'en': 'Simulate Sage Push', 'fr': 'Simuler Envoi Sage'},
    'btn_view_spec': {'en': 'API Specification', 'fr': 'Spécification Technique'},
    'btn_sync_all': {'en': 'Sync All Branches', 'fr': 'Synchroniser Tout le Réseau'},
    'btn_close': {'en': 'Close', 'fr': 'Fermer'},
    'btn_cancel': {'en': 'Cancel', 'fr': 'Annuler'},
    'btn_save': {'en': 'Save', 'fr': 'Enregistrer'},
    'btn_create_branch': {'en': 'Create Branch', 'fr': 'Créer la Succursale'},
    'modal_create_branch_title': {'en': 'Create New Remote Branch & ERP Establishment', 'fr': 'Créer un Nouvel Établissement / Succursale Distante'},
    'lbl_branch_code': {'en': 'Branch Identifier / Code', 'fr': 'Code / Identifiant de la Succursale'},
    'lbl_branch_name': {'en': 'Branch / Establishment Name', 'fr': 'Nom de l’Établissement / Succursale'},
    'lbl_branch_city': {'en': 'City / Location', 'fr': 'Ville / Localisation'},
    'lbl_branch_type': {'en': 'Establishment Type', 'fr': 'Type d’Établissement'},
    'lbl_liaison_account': {'en': 'Liaison Account Code (SYSCOHADA Class 18)', 'fr': 'Compte de Liaison SYSCOHADA (Classe 18)'},
    'type_clinic': {'en': 'Clinic / Medical Centre', 'fr': 'Clinique / Centre Médical'},
    'type_hospital': {'en': 'Hospital Complex', 'fr': 'Complexe Hospitalier'},
    'type_dispensary': {'en': 'Dispensary / Care Unit', 'fr': 'Dispensaire / Poste de Santé'},
    'type_pharmacy': {'en': 'Regional Pharmacy Depot', 'fr': 'Pharmacie Régionale'},
    'type_hq': {'en': 'Headquarters (HQ)', 'fr': 'Siège Social'},
    'opt_create_dest_branch': {'en': '➕ + Create New Destination Branch...', 'fr': '➕ + Créer Nouvelle Succursale Destinataire...'},
    'sim_opt_custom_acct': {'en': '➕ Enter Custom / Unlisted Account Code...', 'fr': '➕ Saisir un Compte SYSCOHADA Personnalisé...'},
    'sim_opt_custom_vendor': {'en': '➕ Enter New / Unlisted Vendor Name...', 'fr': '➕ Saisir un Nouveau Fournisseur...'},
    'lbl_custom_acct': {'en': 'Custom SYSCOHADA Account Code', 'fr': 'Code Compte SYSCOHADA Personnalisé'},
    'lbl_custom_vendor': {'en': 'Custom Vendor / Beneficiary Name', 'fr': 'Nom du Nouveau Fournisseur / Prestataire'},

    'col_branch': {'en': 'Branch / Establishment', 'fr': 'Établissement / Succursale'},
    'col_city': {'en': 'City', 'fr': 'Ville'},
    'col_erp': {'en': 'ERP System', 'fr': 'Système ERP'},
    'col_sage_id': {'en': 'Sage Entity / Company ID', 'fr': 'Dossier / Société Sage'},
    'col_allocated': {'en': 'Allocated Envelope', 'fr': 'Enveloppe Allouée'},
    'col_committed': {'en': 'Committed', 'fr': 'Engagé'},
    'col_available': {'en': 'Available Net', 'fr': 'Disponible Net'},
    'col_rate': {'en': 'Exec %', 'fr': 'Taux %'},
    'col_last_sync': {'en': 'Last Synchronized', 'fr': 'Dernière Synchro'},
    'col_actions': {'en': 'Actions', 'fr': 'Actions'},

    'modal_diag_title': {'en': 'Network Diagnostic Report — {branch}', 'fr': 'Rapport de Diagnostic Réseau — {branch}'},
    'diag_platform': {'en': 'ERP Platform:', 'fr': 'Plateforme ERP :'},
    'diag_handshake': {'en': 'Handshake Status:', 'fr': 'Statut Handshake :'},
    'diag_status_ok': {'en': 'OPERATIONAL (Connected)', 'fr': 'OPÉRATIONNEL (Connecté)'},
    'diag_latency': {'en': 'Response Latency:', 'fr': 'Temps de Réponse (Latence) :'},
    'diag_protocol': {'en': 'Liaison Protocol:', 'fr': 'Protocole de Liaison :'},
    'diag_endpoint': {'en': 'Endpoint URL:', 'fr': 'Point de Terminaison :'},
    'diag_axes_x3': {'en': 'X3 Analytical Axes:', 'fr': 'Axes Analytiques X3 :'},
    'diag_budget_set': {'en': 'Sage 300 Budget Set:', 'fr': 'Jeu de Budget Sage 300 :'},

    'modal_config_title': {'en': 'Configure Branch ERP & Connection Profile', 'fr': 'Paramétrer l’ERP & Profil de Connexion de la Succursale'},
    'modal_import_title': {'en': 'Import Budget File from Sage Ecosystem', 'fr': 'Importer un Fichier Budgétaire depuis l’Écosystème Sage'},
    'modal_alloc_title': {'en': 'New Inter-Branch Budget Credit Allocation (Account 18)', 'fr': 'Nouvelle Dotation Budgétaire Inter-Succursales (Compte 18)'},
    'modal_spec_title': {'en': 'Sage Multi-Platform Technical API Gateway Specification', 'fr': 'Spécification Technique de la Passerelle Sage (X3 / Intacct / 300 / 200 / 100)'},

    'lbl_source_branch': {'en': 'Source Branch (Headquarters)', 'fr': 'Succursale Émettrice (Siège)'},
    'lbl_dest_branch': {'en': 'Destination Branch', 'fr': 'Succursale Destinataire'},
    'lbl_alloc_amt': {'en': 'Appropriation Amount (XAF)', 'fr': 'Montant du Virement de Crédit (XAF)'},
    'lbl_alloc_date': {'en': 'Allocation Date', 'fr': 'Date de la Dotation'},
    'lbl_notes': {'en': 'Justification & Transfer Notes', 'fr': 'Motif / Justification du virement'},
    'lbl_post_liaison': {'en': 'Also generate reciprocal Account 1851/1852 financial entry in General Ledger', 'fr': 'Générer également l’écriture financière de liaison (Compte 1851/1852) au Grand Livre'},

    'lbl_erp_type': {'en': 'ERP Software Tier', 'fr': 'Version / Plateforme ERP Sage'},
    'lbl_sage_company': {'en': 'Sage Company Code / Folder / Entity', 'fr': 'Dossier / Société / Entité Sage'},
    'lbl_endpoint_url': {'en': 'Remote API / Gateway Endpoint URL', 'fr': 'URL Passerelle / Service Web Distant'},
    'lbl_api_token': {'en': 'API Key / Secret Token / Bearer', 'fr': 'Clé API / Jeton / Secret OAuth2'},
    'lbl_sync_freq': {'en': 'Synchronization Frequency', 'fr': 'Fréquence de Synchronisation'},
    'lbl_envelope_budget': {'en': 'Branch Allocated Budget Envelope (XAF)', 'fr': 'Plafond Global de Dotation de la Succursale (XAF)'},

    'lbl_paste_sage': {'en': 'Paste Sage File Content (PNM, CSV, XML, or JSON)', 'fr': 'Coller le Contenu du Fichier Sage (PNM, CSV, XML ou JSON)'},
    'btn_validate_sage': {'en': 'Analyze & Preview (Dry-Run)', 'fr': 'Analyser & Simuler (Dry-Run)'},
    'btn_apply_import': {'en': 'Commit & Import into Budget', 'fr': 'Valider & Importer dans le Budget'},

    'sim_form_title': {'en': 'Sage Multi-ERP Purchase Commitment & Real-Time AVC Visa Simulator', 'fr': 'Simulateur de Transmission d’Engagement Multi-ERP Sage (AVC Temps Réel)'},
    'sim_select_branch': {'en': 'Target Branch', 'fr': 'Succursale Émettrice'},
    'sim_select_erp': {'en': 'Sage ERP Platform Flavor', 'fr': 'Plateforme Sage Émettrice'},
    'sim_account': {'en': 'Account (SYSCOHADA)', 'fr': 'Compte SYSCOHADA'},
    'sim_amount': {'en': 'Amount (XAF)', 'fr': 'Montant (XAF)'},
    'sim_vendor': {'en': 'Vendor / Beneficiary Name', 'fr': 'Bénéficiaire / Fournisseur'},
    'sim_desc': {'en': 'Object / Description', 'fr': 'Objet de la Dépense'},
    'sim_ref': {'en': 'Purchase Order / Commitment Ref', 'fr': 'N° Bon de Commande / Référence'},

    'sim_resp_title': {'en': 'Live Gateway & AVC Visa Response', 'fr': 'Réponse en Direct de la Passerelle AVC'},
    'sim_lbl_platform': {'en': 'Sage Platform:', 'fr': 'Plateforme Sage :'},
    'sim_lbl_ref': {'en': 'Commitment Ref:', 'fr': 'N° Engagement :'},
    'sim_lbl_visa': {'en': 'AVC Authorization Visa:', 'fr': 'Code Visa AVC :'},
    'sim_lbl_envelope': {'en': 'Budget Line Envelope:', 'fr': 'Plafond Dotation :'},
    'sim_lbl_available': {'en': 'Remaining Available:', 'fr': 'Reste Disponible :'},
    'sim_lbl_rate': {'en': 'Absorption Rate:', 'fr': 'Taux d’Absorption :'},
    'sim_empty_title': {'en': 'Awaiting Sage simulation...', 'fr': 'En attente de simulation Sage...'},
    'sim_empty_sub': {'en': 'Select the ERP platform (X3, Intacct, 300, 200, 100) and click "Simulate Sage Push" to test real-time AVC availability enforcement.', 'fr': 'Sélectionnez la plateforme (X3, Intacct, 300, 200, 100) et cliquez sur "Simuler Envoi Sage" pour tester le contrôle AVC en temps réel.'},

    'log_table_title': {'en': 'Recent Multi-ERP Sage Synchronization Audit Log (Inbound & Outbound)', 'fr': 'Journal d’Audit Récent des Échanges Multi-ERP Sage (Inbound & Outbound)'},
    'log_col_time': {'en': 'Timestamp', 'fr': 'Horodatage'},
    'log_col_type': {'en': 'Exchange Type', 'fr': 'Type d’Échange'},
    'log_col_branch': {'en': 'Branch', 'fr': 'Succursale'},
    'log_col_dir': {'en': 'Direction', 'fr': 'Direction'},
    'log_col_format': {'en': 'Format / Platform', 'fr': 'Format / Plateforme'},
    'log_col_amount': {'en': 'Amount', 'fr': 'Montant'},
    'log_col_status': {'en': 'Status', 'fr': 'Statut'},

    'alloc_col_num': {'en': 'Transfer No.', 'fr': 'N° Virement'},
    'alloc_col_date': {'en': 'Date', 'fr': 'Date'},
    'alloc_col_src': {'en': 'Source (HQ)', 'fr': 'Émetteur (Siège)'},
    'alloc_col_dst': {'en': 'Beneficiary (Branch)', 'fr': 'Bénéficiaire (Succursale)'},
    'alloc_col_amount': {'en': 'Allocated Amount', 'fr': 'Montant Alloué'},
    'alloc_col_ref': {'en': 'Remote Sage Ref', 'fr': 'Réf Distante Sage'},
    'alloc_col_status': {'en': 'Sync Status', 'fr': 'Statut Synchro'},
    'alloc_status_synced': {'en': 'Synced', 'fr': 'Synchronisé'},

    'tip_sync_now': {'en': 'Sync now', 'fr': 'Synchroniser maintenant'},
    'tip_diag': {'en': 'Test connection / Diagnostics', 'fr': 'Tester la connexion / Diagnostic'},
    'tip_config': {'en': 'Configure ERP / Sage', 'fr': 'Paramètres ERP / Sage'},
}


def _loc(key: str, **kwargs: Any) -> str:
    is_fr = lang() == 'fr'
    entry = SAGE_T.get(key, {})
    text = entry.get('fr' if is_fr else 'en', key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except Exception:
            return text
    return text


def _erp_badge_color(erp: str) -> tuple[str, str, str]:
    erp_lower = (erp or '').lower()
    if 'sage_x3' in erp_lower:
        return 'purple-1', 'purple-9', 'Sage X3 Finance'
    if 'sage_intacct' in erp_lower:
        return 'sky-1', 'sky-9', 'Sage Intacct'
    if 'sage_300' in erp_lower:
        return 'amber-1', 'amber-9', 'Sage 300 (Accpac)'
    if 'sage_200' in erp_lower:
        return 'rose-1', 'rose-9', 'Sage 200 Pro'
    if 'sage_100' in erp_lower:
        return 'emerald-1', 'emerald-9', 'Sage 100c'
    if 'sage' in erp_lower:
        return 'blue-1', 'blue-9', 'Sage Enterprise'
    return 'teal-1', 'teal-9', 'LedgerCore Native'


async def render_sage_tab(state: dict[str, Any], refreshers: dict[str, Any], currency: str = 'XAF') -> None:
    is_fr = lang() == 'fr'

    # Local state for Sage tab
    sage_state = {
        'branches': [],
        'consolidated': None,
        'allocations': [],
        'logs': [],
        'flavors': {},
        'accounts': [],
        'vendors': [],
        'sim_result': None,
        'diag_result': None,
    }

    async def reload_sage_data() -> None:
        br_res = await api.safe(api.get('/integrations/sage/branches'), default={'rows': []})
        sage_state['branches'] = br_res.get('rows', []) if isinstance(br_res, dict) else (br_res or [])
        sage_state['flavors'] = br_res.get('flavors', {}) if isinstance(br_res, dict) else {}

        consol_res = await api.safe(api.get('/integrations/sage/consolidated'), default=None)
        sage_state['consolidated'] = consol_res

        alloc_res = await api.safe(api.get('/integrations/sage/allocations'), default={'rows': []})
        sage_state['allocations'] = alloc_res.get('rows', []) if isinstance(alloc_res, dict) else (alloc_res or [])

        logs_res = await api.safe(api.get('/integrations/sage/logs', limit=20), default={'rows': []})
        sage_state['logs'] = logs_res.get('rows', []) if isinstance(logs_res, dict) else (logs_res or [])

        # Dynamic accounts loading (avoids hardcoding)
        acct_res = await api.safe(api.get('/accounts', postableOnly=True), default=[])
        sage_state['accounts'] = acct_res if isinstance(acct_res, list) else (acct_res.get('rows', []) if isinstance(acct_res, dict) else [])

        # Dynamic partners/suppliers loading (avoids hardcoding)
        part_res = await api.safe(api.get('/partners', type='supplier'), default={'rows': []})
        sage_state['vendors'] = part_res.get('rows', []) if isinstance(part_res, dict) else (part_res if isinstance(part_res, list) else [])

    await reload_sage_data()

    async def _get_active_budget() -> dict[str, Any] | None:
        """Resolve active budget robustly with multiple fallback mechanisms."""
        b = state.get('active_budget')
        if b and isinstance(b, dict) and b.get('id'):
            return b

        budgets = state.get('budgets', [])
        if budgets:
            b_first = budgets[0]
            b_detail = await api.safe(api.get(f"/budgets/{b_first['id']}"), default=b_first)
            state['active_budget'] = b_detail
            return b_detail

        # Query API directly
        b_res = await api.safe(api.get('/budgets'), default={'rows': []})
        rows = b_res.get('rows', []) if isinstance(b_res, dict) else (b_res or [])
        if rows:
            b_detail = await api.safe(api.get(f"/budgets/{rows[0]['id']}"), default=rows[0])
            state['active_budget'] = b_detail
            return b_detail
        return None

    # --- DIALOGS -------------------------------------------------------------

    def _open_diagnostics_modal(res: dict[str, Any]) -> None:
        diag = res.get('diagnostics', {})
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-xl p-6 gap-4 bg-slate-900 text-white rounded-2xl'):
            with ui.row().classes('items-center justify-between w-full'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('lan').classes('text-emerald-400 text-2xl')
                    ui.label(_loc('modal_diag_title', branch=res.get('branch_name', 'Branch'))).classes('text-base font-bold text-white')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=white')

            with ui.column().classes('w-full gap-2 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800'):
                with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                    ui.label(_loc('diag_platform')).classes('text-slate-400')
                    ui.label(diag.get('platform', res.get('erp_flavor', 'Sage')).upper()).classes('text-emerald-400 font-bold')

                with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                    ui.label(_loc('diag_handshake')).classes('text-slate-400')
                    ui.label(_loc('diag_status_ok')).classes('text-positive font-bold')

                with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                    ui.label(_loc('diag_latency')).classes('text-slate-400')
                    ui.label(f"{res.get('latency_ms', 25)} ms").classes('text-amber-400 font-bold')

                with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                    ui.label(_loc('diag_protocol')).classes('text-slate-400')
                    ui.label(diag.get('protocol', 'HTTPS / Web Services')).classes('text-white')

                with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                    ui.label(_loc('diag_endpoint')).classes('text-slate-400')
                    ui.label(str(diag.get('endpoint') or diag.get('gateway_url') or diag.get('web_api_url') or diag.get('columbus_gateway_url') or 'Active Gateway')).classes('text-slate-300 text-[10px]')

                if 'analytical_axes' in diag:
                    with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                        ui.label(_loc('diag_axes_x3')).classes('text-slate-400')
                        ui.label(', '.join(diag['analytical_axes'])).classes('text-purple-300')

                if 'target_budget_set' in diag:
                    with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1.5'):
                        ui.label(_loc('diag_budget_set')).classes('text-slate-400')
                        ui.label(f"Set #{diag['target_budget_set']} (Original Approved)").classes('text-amber-300')

            ui.label(res.get('message', 'Connection verified successfully.')).classes('text-xs text-teal-200 italic')
            with ui.row().classes('w-full justify-end'):
                ui.button(_loc('btn_close'), on_click=dlg.close).props('flat text-color=teal-3')

        dlg.open()

    def _open_config_modal(branch: dict[str, Any]) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('settings_suggest').classes('text-teal-700 text-2xl')
                ui.label(f"{_loc('modal_config_title')} — {branch.get('name')}").classes('text-base font-bold text-slate-800')

            erp_opts = {
                'sage_x3': '🏢 Sage X3 Finance Module (Syracuse REST/GraphQL)',
                'sage_intacct': '☁️ Sage Intacct Cloud Financials (XML-RPC 3.0)',
                'sage_300': '🌐 Sage 300 (Accpac Web API OData v4)',
                'sage_200': '💼 Sage 200 Professional (Columbus Gateway)',
                'sage_100c': '📑 Sage 100c Accounting & Budget (ASCII .PNM)',
                'ledgercore': '🏥 LedgerCore Health (Central Native)',
            }
            curr_flavor = branch.get('erp_flavor') or branch.get('erp_system') or 'sage_100c'
            if curr_flavor not in erp_opts:
                curr_flavor = 'sage_100c'

            sel_erp = ui.select(erp_opts, value=curr_flavor, label=_loc('lbl_erp_type')).props('outlined dense options-dense').classes('w-full')
            in_company = ui.input(label=_loc('lbl_sage_company'), value=branch.get('sage_company_id') or '').props('outlined dense').classes('w-full')
            in_endpoint = ui.input(label=_loc('lbl_endpoint_url'), value=branch.get('api_endpoint_url') or '').props('outlined dense').classes('w-full')
            in_token = ui.input(label=_loc('lbl_api_token'), value=branch.get('api_key_or_token') or '').props('outlined dense type=password').classes('w-full')

            freq_opts = {
                'realtime': 'Real-Time (Instant Webhooks)' if not is_fr else 'Temps Réel (Instant Webhooks)',
                'hourly': 'Hourly' if not is_fr else 'Toutes les heures',
                'daily': 'Daily (Overnight)' if not is_fr else 'Quotidienne (Chaque nuit)',
                'manual': 'Manual (On demand)' if not is_fr else 'Manuelle (À la demande)',
            }
            sel_freq = ui.select(freq_opts, value=branch.get('sync_frequency') or 'daily', label=_loc('lbl_sync_freq')).props('outlined dense options-dense').classes('w-full')
            in_envelope = ui.number(label=_loc('lbl_envelope_budget'), value=float(branch.get('budget_allocation_total') or 0), format='%.0f').props('outlined dense').classes('w-full')

            diag_status_label = ui.label('').classes('text-xs font-mono font-bold text-teal-800 hidden')

            with ui.row().classes('w-full justify-between items-center mt-2'):
                async def _test_conn_in_modal() -> None:
                    res = await api.safe(api.post(f"/integrations/sage/branches/{branch['id']}/test", {}))
                    if res:
                        diag_status_label.set_visibility(True)
                        diag_status_label.set_text(f"✅ {res.get('erp_flavor', '').upper()} : {res.get('message')} ({res.get('latency_ms')} ms)")
                        ui.notify(f"{'Test passed' if not is_fr else 'Test réussi'} : {res.get('message')}", type='positive')

                ui.button(_loc('btn_test_conn'), icon='network_check', on_click=_test_conn_in_modal).props('outline color=purple-8 dense no-caps size=sm class="font-semibold"')

                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _save_config() -> None:
                        payload = {
                            'erp_system': sel_erp.value,
                            'erp_flavor': sel_erp.value,
                            'sage_company_id': in_company.value.strip() or None,
                            'api_endpoint_url': in_endpoint.value.strip() or None,
                            'api_key_or_token': in_token.value.strip() or None,
                            'sync_frequency': sel_freq.value,
                            'budget_allocation_total': float(in_envelope.value or 0),
                        }
                        res = await api.safe(api.put(f"/integrations/sage/branches/{branch['id']}", payload))
                        if res:
                            ui.notify('Branch ERP settings saved successfully.' if not is_fr else 'Paramètres ERP de la succursale enregistrés avec succès.', type='positive')
                            dlg.close()
                            await reload_sage_data()
                            _render_sage_content.refresh()

                    ui.button(_loc('btn_save'), icon='save', on_click=_save_config).props('unelevated color=teal-8')

        dlg.open()

    def _open_create_branch_modal(on_created: Any = None) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-xl p-6 gap-4'):
            with ui.row().classes('items-center justify-between w-full border-b border-slate-100 pb-2'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('add_business').classes('text-teal-700 text-2xl')
                    ui.label(_loc('modal_create_branch_title')).classes('text-base font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense')

            with ui.column().classes('w-full gap-3 text-xs'):
                with ui.row().classes('w-full gap-3 no-wrap'):
                    in_code = ui.input(label=_loc('lbl_branch_code'), placeholder='e.g. KUMBA-CARE').props('outlined dense uppercase').classes('w-1/2')
                    in_city = ui.input(label=_loc('lbl_branch_city'), placeholder='e.g. Kumba').props('outlined dense').classes('w-1/2')

                in_name = ui.input(label=_loc('lbl_branch_name'), placeholder='e.g. Centre de Soins de Proximité de Kumba').props('outlined dense').classes('w-full')

                type_opts = {
                    'clinic': _loc('type_clinic'),
                    'hospital': _loc('type_hospital'),
                    'dispensary': _loc('type_dispensary'),
                    'pharmacy': _loc('type_pharmacy'),
                    'headquarters': _loc('type_hq'),
                }
                with ui.row().classes('w-full gap-3 no-wrap'):
                    sel_type = ui.select(type_opts, value='clinic', label=_loc('lbl_branch_type')).props('outlined dense options-dense').classes('w-1/2')
                    in_liaison = ui.input(label=_loc('lbl_liaison_account'), value='1851').props('outlined dense font-mono').classes('w-1/2')

                erp_opts = {
                    'sage_100c': '📑 Sage 100c Accounting & Budget (ASCII .PNM)',
                    'sage_x3': '🏢 Sage X3 Finance Module (Syracuse REST/GraphQL)',
                    'sage_intacct': '☁️ Sage Intacct Cloud Financials (XML-RPC 3.0)',
                    'sage_300': '🌐 Sage 300 (Accpac Web API OData v4)',
                    'sage_200': '💼 Sage 200 Professional (Columbus Gateway)',
                    'ledgercore': '🏥 LedgerCore Health (Central Native)',
                }
                with ui.row().classes('w-full gap-3 no-wrap'):
                    sel_erp = ui.select(erp_opts, value='sage_100c', label=_loc('lbl_erp_type')).props('outlined dense options-dense').classes('w-1/2')
                    in_company = ui.input(label=_loc('lbl_sage_company'), placeholder='e.g. SAGE_KUMBO_01').props('outlined dense font-mono').classes('w-1/2')

                with ui.row().classes('w-full gap-3 no-wrap'):
                    in_envelope = ui.number(label=_loc('lbl_envelope_budget'), value=25000000, format='%.0f', min=0).props('outlined dense').classes('w-1/2')
                    freq_opts = {
                        'daily': 'Daily (Overnight)' if not is_fr else 'Quotidienne (Chaque nuit)',
                        'realtime': 'Real-Time (Instant Webhooks)' if not is_fr else 'Temps Réel (Webhooks)',
                        'hourly': 'Hourly' if not is_fr else 'Toutes les heures',
                        'manual': 'Manual (On demand)' if not is_fr else 'Manuelle (À la demande)',
                    }
                    sel_freq = ui.select(freq_opts, value='daily', label=_loc('lbl_sync_freq')).props('outlined dense options-dense').classes('w-1/2')

                with ui.row().classes('w-full gap-3 no-wrap'):
                    in_endpoint = ui.input(label=_loc('lbl_endpoint_url'), placeholder='https://sage-gateway.branch.org/api').props('outlined dense').classes('w-1/2')
                    in_token = ui.input(label=_loc('lbl_api_token'), placeholder='API Key / Token').props('outlined dense type=password').classes('w-1/2')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _submit_create_branch() -> None:
                    code_val = (in_code.value or '').strip().upper()
                    name_val = (in_name.value or '').strip()
                    city_val = (in_city.value or '').strip()
                    if not code_val or not name_val or not city_val:
                        ui.notify('Branch Code, Name, and City are required.' if not is_fr else 'Le code, le nom et la ville de la succursale sont obligatoires.', type='warning')
                        return

                    payload = {
                        'code': code_val,
                        'name': name_val,
                        'city': city_val,
                        'branch_type': sel_type.value,
                        'liaison_account_code': (in_liaison.value or '1851').strip(),
                        'erp_system': sel_erp.value,
                        'erp_flavor': sel_erp.value,
                        'sage_company_id': in_company.value.strip() if in_company.value else None,
                        'api_endpoint_url': in_endpoint.value.strip() if in_endpoint.value else None,
                        'api_key_or_token': in_token.value.strip() if in_token.value else None,
                        'sync_frequency': sel_freq.value,
                        'budget_allocation_total': float(in_envelope.value or 0),
                    }
                    res = await api.safe(api.post('/integrations/sage/branches', payload))
                    if res and res.get('id'):
                        ui.notify(f"{'New branch created successfully' if not is_fr else 'Nouvelle succursale créée avec succès'} : {res.get('name')} ({res.get('code')})", type='positive')
                        dlg.close()
                        await reload_sage_data()
                        _render_sage_content.refresh()
                        if on_created:
                            if callable(on_created):
                                import inspect
                                if inspect.iscoroutinefunction(on_created):
                                    await on_created(res)
                                else:
                                    on_created(res)

                ui.button(_loc('btn_create_branch'), icon='add_business', on_click=_submit_create_branch).props('unelevated color=teal-8')

        dlg.open()

    async def _open_new_allocation_modal() -> None:
        branches = sage_state['branches']
        active_b = await _get_active_budget()
        target_budget_id = active_b['id'] if active_b else 1

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center justify-between w-full'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('move_up').classes('text-teal-700 text-2xl')
                    ui.label(_loc('modal_alloc_title')).classes('text-base font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense')

            def _build_branch_opts() -> dict[Any, str]:
                opts = {b['id']: f"{b['name']} ({b['code']}) — {_erp_badge_color(b.get('erp_flavor') or b['erp_system'])[2]}" for b in sage_state['branches']}
                opts['__create_new_branch__'] = _loc('opt_create_dest_branch')
                return opts

            branch_opts = _build_branch_opts()
            src_opts = {b['id']: f"{b['name']} ({'HQ' if not is_fr else 'Siège'})" for b in sage_state['branches'] if b.get('branch_type') == 'headquarters'} or {b['id']: b['name'] for b in sage_state['branches']}

            src_val = list(src_opts.keys())[0] if src_opts else None
            dst_candidates = [b['id'] for b in sage_state['branches'] if b['id'] != src_val]
            dst_val = dst_candidates[0] if dst_candidates else (src_val or list(branch_opts.keys())[0])

            sel_src = ui.select(src_opts, value=src_val, label=_loc('lbl_source_branch')).props('outlined dense options-dense').classes('w-full')

            with ui.row().classes('w-full items-center justify-between no-wrap mt-1'):
                ui.label(_loc('lbl_dest_branch')).classes('text-xs font-semibold text-slate-700')
                ui.button(
                    _loc('btn_new_dest_branch'),
                    icon='add_business',
                    on_click=lambda: _open_create_branch_modal(on_created=_on_new_dest_created)
                ).props('flat dense size=sm color=teal-8 no-caps class="font-bold text-xs"')

            sel_dst = ui.select(branch_opts, value=dst_val).props('outlined dense options-dense').classes('w-full')

            def _on_new_dest_created(new_b: dict[str, Any]) -> None:
                new_id = new_b['id']
                new_opts = _build_branch_opts()
                sel_dst.options = new_opts
                sel_dst.set_value(new_id)

            def _on_dst_select_change(e: Any) -> None:
                if e.value == '__create_new_branch__':
                    prev = [b['id'] for b in sage_state['branches'] if b['id'] != sel_src.value]
                    sel_dst.set_value(prev[0] if prev else list(branch_opts.keys())[0])
                    _open_create_branch_modal(on_created=_on_new_dest_created)

            sel_dst.on('update:model-value', _on_dst_select_change)

            in_amt = ui.number(label=_loc('lbl_alloc_amt'), value=10000000, format='%.0f', min=10000).props('outlined dense').classes('w-full')
            in_date = ui.input(label=_loc('lbl_alloc_date'), value=datetime.date.today().isoformat()).props('outlined dense type=date').classes('w-full')
            in_notes = ui.textarea(label=_loc('lbl_notes'), placeholder='Special regional branch budgetary appropriation' if not is_fr else 'Dotation budgétaire spéciale antenne régionale').props('outlined dense rows=2').classes('w-full')
            chk_liaison = ui.checkbox(_loc('lbl_post_liaison'), value=True).classes('text-xs text-slate-700')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _submit_alloc() -> None:
                    if sel_src.value == sel_dst.value:
                        ui.notify('Source and destination branches must be distinct.' if not is_fr else 'L’établissement émetteur et récepteur doivent être distincts.', type='warning')
                        return
                    if sel_dst.value == '__create_new_branch__':
                        ui.notify('Please select or create a valid destination branch.' if not is_fr else 'Veuillez sélectionner ou créer une succursale destinataire valide.', type='warning')
                        return
                    payload = {
                        'budget_id': target_budget_id,
                        'source_branch_id': sel_src.value,
                        'dest_branch_id': sel_dst.value,
                        'allocation_date': in_date.value,
                        'amount': float(in_amt.value or 0),
                        'notes': in_notes.value.strip() if in_notes.value else None,
                        'post_liaison_entry': chk_liaison.value,
                    }
                    res = await api.safe(api.post('/integrations/sage/allocations', payload))
                    if res:
                        ui.notify(f"{'Inter-branch allocation confirmed' if not is_fr else 'Dotation inter-succursales validée'} : {res.get('allocation_number')}", type='positive')
                        dlg.close()
                        await reload_sage_data()
                        _render_sage_content.refresh()

                ui.button('Submit Allocation' if not is_fr else 'Valider la Dotation', icon='send', on_click=_submit_alloc).props('unelevated color=teal-8')

        dlg.open()

    async def _open_import_modal() -> None:
        active_b = await _get_active_budget()
        target_budget_id = active_b['id'] if active_b else 1
        budget_title = active_b.get('name') if active_b else ('Budget 2026' if not is_fr else 'Budget Principal')

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-2xl p-6 gap-4'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('file_upload').classes('text-teal-700 text-2xl')
                ui.label(f"{_loc('modal_import_title')} — {budget_title}").classes('text-base font-bold text-slate-800')

            ui.label('Paste Sage X3 (JSON), Sage Intacct (XML), Sage 300 (JSON/CSV), Sage 200, or Sage 100 (.PNM/CSV) file content:' if not is_fr else 'Collez le contenu d’un fichier Sage X3, Sage Intacct (XML), Sage 300, Sage 200 ou Sage 100 (.PNM/CSV) :').classes('text-xs text-slate-600')

            sample_pnm = (
                "#SAGE100_BUDGET_EXPORT;VERSION=10.0;SOFTWARE=Sage100c\r\n"
                "#CODE_POSTE;INTITULE;COMPTE;SECTION;MONTANT;T1;T2;T3;T4\r\n"
                "BGT-2412-IMG;Radiology and imaging medical devices;2412;IMG;12000000;3000000;3000000;3000000;3000000\r\n"
                "BGT-6042-PHAR;Essential drugs and IV solutions;6042;PHAR;45000000;11250000;11250000;11250000;11250000\r\n"
                "BGT-6051-TECH;Facility maintenance and backup power;6051;ADM;15000000;3750000;3750000;3750000;3750000"
            )

            sample_intacct = (
                '<?xml version="1.0" encoding="UTF-8"?>\r\n'
                '<response><operation><result><data listtype="glbudgetitem">\r\n'
                '  <glbudgetitem><accountno>6042</accountno><annualamount>45000000</annualamount><departmentid>PHAR</departmentid><accounttitle>Essential drugs</accounttitle></glbudgetitem>\r\n'
                '  <glbudgetitem><accountno>2412</accountno><annualamount>12000000</annualamount><departmentid>IMG</departmentid><accounttitle>Radiology CT Scanner</accounttitle></glbudgetitem>\r\n'
                '</data></result></operation></response>'
            )

            in_content = ui.textarea(label=_loc('lbl_paste_sage'), value=sample_pnm).props('outlined dense rows=8 font-mono text-xs').classes('w-full font-mono')
            preview_container = ui.element('div').classes('w-full')

            with ui.row().classes('w-full justify-between items-center mt-2'):
                with ui.row().classes('gap-2'):
                    ui.button('Sage 100 PNM Sample', on_click=lambda: in_content.set_value(sample_pnm)).props('flat dense size=sm color=emerald-8')
                    ui.button('Sage Intacct XML Sample', on_click=lambda: in_content.set_value(sample_intacct)).props('flat dense size=sm color=sky-8')

                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _run_dry_run() -> None:
                        if not in_content.value.strip():
                            ui.notify('Please paste the Sage file content.' if not is_fr else 'Veuillez coller le contenu du fichier Sage.', type='warning')
                            return
                        res = await api.safe(api.post('/integrations/sage/import', {
                            'budgetId': target_budget_id,
                            'content': in_content.value.strip(),
                            'dryRun': True,
                        }))
                        if res:
                            preview_container.clear()
                            with preview_container:
                                with ui.card().classes('w-full p-3 bg-emerald-50 border border-emerald-200 mt-2'):
                                    ui.label(f"✅ {'Analysis successful' if not is_fr else 'Analyse réussie'} : {res.get('validCount')} {'valid lines for a total of' if not is_fr else 'lignes valides pour un total de'} {w.money(res.get('totalAllocated', 0), currency)}").classes('text-xs font-bold text-emerald-900')
                                    if res.get('errorCount', 0) > 0:
                                        ui.label(f"⚠️ {res.get('errorCount')} {'errors detected in file.' if not is_fr else 'erreurs détectées dans le fichier.'}").classes('text-xs text-amber-800')

                    async def _commit_import() -> None:
                        if not in_content.value.strip():
                            ui.notify('Please paste the Sage file content.' if not is_fr else 'Veuillez coller le contenu du fichier Sage.', type='warning')
                            return
                        res = await api.safe(api.post('/integrations/sage/import', {
                            'budgetId': target_budget_id,
                            'content': in_content.value.strip(),
                            'dryRun': False,
                        }))
                        if res and res.get('success'):
                            ui.notify(res.get('message', 'Sage import committed successfully.' if not is_fr else 'Import Sage validé avec succès.'), type='positive', position='top')
                            dlg.close()
                            await reload_sage_data()
                            _render_sage_content.refresh()
                            if 'plans' in refreshers:
                                refreshers['plans']()

                    ui.button(_loc('btn_validate_sage'), icon='search', on_click=_run_dry_run).props('flat color=teal-9')
                    ui.button(_loc('btn_apply_import'), icon='check_circle', on_click=_commit_import).props('unelevated color=teal-8')

        dlg.open()

    def _open_spec_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-3xl p-6 gap-4'):
            with ui.row().classes('items-center justify-between w-full'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('integration_instructions').classes('text-teal-700 text-2xl')
                    ui.label(_loc('modal_spec_title')).classes('text-base font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense')

            with ui.column().classes('w-full gap-3 text-xs'):
                with ui.card().classes('w-full p-4 bg-slate-50 border border-slate-200 gap-2'):
                    ui.label('Sage Multi-Platform Integration Specification' if not is_fr else 'Spécification d’Intégration Multi-Plateformes Sage').classes('text-sm font-bold text-slate-800')
                    ui.label('Certified statutory connectors for Sage X3 Finance, Sage Intacct Cloud, Sage 300, Sage 200 Professional, and Sage 100c.' if not is_fr else 'Connecteurs statutaires certifiés pour Sage X3 Finance, Sage Intacct Cloud, Sage 300, Sage 200 Professional et Sage 100c.').classes('text-slate-600')

                    with ui.row().classes('gap-4 mt-2'):
                        with ui.column().classes('gap-1'):
                            ui.label('API Authentication:' if not is_fr else 'Authentification API :').classes('font-bold text-slate-700')
                            ui.label('Header: X-API-Key: lch_live_sage_enterprise_88f9104b2c3d5e6a').classes('font-mono bg-white px-2 py-1 rounded border border-slate-200 text-teal-900')
                        with ui.column().classes('gap-1'):
                            ui.label('Public Webhook Endpoint:' if not is_fr else 'Point de Terminaison Public Webhook :').classes('font-bold text-slate-700')
                            ui.label('POST /api/integrations/sage/commitments').classes('font-mono bg-white px-2 py-1 rounded border border-slate-200 text-teal-900')

                ui.markdown('''
**Supported Sage Platforms & Protocols:**
1. **Sage X3 Finance**: Syracuse REST/GraphQL payloads, 3D analytical axes (AXE_CC Cost Center, AXE_PRG Program, AXE_SITE Clinic).
2. **Sage Intacct**: XML-RPC 3.0 & REST format, Location ID, Department ID, Project ID dimensions.
3. **Sage 300 (Accpac)**: Web API OData v4 endpoints `/Sage300WebApi/v1.0/-/GL/GLBudgetSets` (Budget Sets 1 to 5).
4. **Sage 200 Professional**: Columbus Gateway REST API `/nominal_budgets`, monthly profiles, cost centres.
5. **Sage 100c**: ASCII Parameterized Format .PNM, CSV, native import/export.
''' if not is_fr else '''
**Plateformes Sage Supportées :**
1. **Sage X3 Finance** : Payloads REST/GraphQL Syracuse, dimensions AXE_CC (Centre de coûts), AXE_PRG (Programme).
2. **Sage Intacct** : Format XML-RPC 3.0 & REST, dimensions Location ID, Department ID, Project ID.
3. **Sage 300 (Accpac)** : Endpoints OData v4 `/Sage300WebApi/v1.0/-/GL/GLBudgetSets` (Budget Sets 1 à 5).
4. **Sage 200 Professional** : API Columbus Gateway `/nominal_budgets`, profils mensuels, centres de coûts.
5. **Sage 100c** : Format paramétrable ASCII .PNM, CSV, import/export natif.
''')

        dlg.open()

    async def _do_export(fmt: str, label: str) -> None:
        active_b = await _get_active_budget()
        if not active_b or not active_b.get('id'):
            ui.notify('No active budget available to export.' if not is_fr else 'Aucun budget actif disponible pour l’export.', type='warning')
            return
        res = await api.safe(api.get(f"/integrations/sage/export/{active_b['id']}", format=fmt))
        if res and res.get('content'):
            ui.download(res['content'].encode('utf-8'), res['filename'])
            ui.notify(f"{label} ({res['filename']}) {'downloaded' if not is_fr else 'téléchargé'}.", type='positive')
        else:
            ui.notify(f"Could not generate {label} export." if not is_fr else f"Impossible de générer l'export {label}.", type='negative')

    # --- UI RENDERABLE CONTENT -----------------------------------------------

    @ui.refreshable
    def _render_sage_content() -> None:
        branches = sage_state['branches']
        consol = sage_state['consolidated']

        # EXECUTIVE BANNER
        with ui.card().classes('w-full p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white shadow-md relative overflow-hidden'):
            with ui.row().classes('w-full justify-between items-center relative z-10 flex-wrap gap-4'):
                with ui.column().classes('gap-1 max-w-2xl'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('hub').classes('text-teal-400 text-2xl')
                        ui.label(_loc('banner_title')).classes('text-lg font-bold tracking-tight text-white')
                        ui.badge('Sage Ecosystem Gateway').props('color=emerald text-color=white class="text-[10px] font-bold px-2 py-0.5"')

                    ui.label(_loc('banner_subtitle')).classes('text-xs text-slate-300 leading-relaxed')

                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_new_allocation'), icon='add_card', on_click=_open_new_allocation_modal).props('unelevated color=emerald-7 text-color=white no-caps class="rounded-xl font-semibold shadow-sm"')
                    ui.button(_loc('btn_view_spec'), icon='menu_book', on_click=_open_spec_modal).props('outline color=teal-2 text-color=teal-1 no-caps class="rounded-xl font-semibold"')

        # KPI CARDS ROW
        with ui.grid(columns=4).classes('w-full gap-4'):
            total_branches = len(branches)
            sage_count = sum(1 for b in branches if 'sage' in (b.get('erp_system') or '').lower())
            summary = consol.get('summary', {}) if consol else {}
            tot_alloc = summary.get('total_allocated', 0)
            tot_comm = summary.get('total_committed', 0)
            tot_avail = summary.get('total_available', 0)
            rate_pct = summary.get('global_execution_rate_pct', 0)

            # Card 1: Connected Branches
            with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-white gap-2 shadow-2xs'):
                with ui.row().classes('items-center justify-between w-full'):
                    ui.label(_loc('kpi_network_branches')).classes('text-xs font-semibold text-slate-500 uppercase')
                    ui.icon('apartment').classes('text-teal-700 text-lg')
                ui.label(str(total_branches)).classes('text-2xl font-bold font-mono text-slate-900')
                ui.label(f"{sage_count} {_loc('kpi_sage_branches')}").classes('text-[11px] text-teal-800 font-semibold')

            # Card 2: Consolidated Network Envelope
            with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-white gap-2 shadow-2xs'):
                with ui.row().classes('items-center justify-between w-full'):
                    ui.label(_loc('kpi_network_envelope')).classes('text-xs font-semibold text-slate-500 uppercase')
                    ui.icon('account_balance_wallet').classes('text-indigo-700 text-lg')
                ui.label(w.money(tot_alloc, currency)).classes('text-xl font-bold font-mono text-indigo-950')
                ui.label(_loc('kpi_envelope_sub')).classes('text-[11px] text-slate-500')

            # Card 3: Network Commitments
            with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-white gap-2 shadow-2xs'):
                with ui.row().classes('items-center justify-between w-full'):
                    ui.label(_loc('kpi_network_committed')).classes('text-xs font-semibold text-slate-500 uppercase')
                    ui.icon('shopping_bag').classes('text-purple-700 text-lg')
                ui.label(w.money(tot_comm, currency)).classes('text-xl font-bold font-mono text-purple-950')
                ui.label(_loc('kpi_available_sub', avail=w.money(tot_avail, currency))).classes('text-[11px] text-emerald-800 font-semibold')

            # Card 4: Global Absorption Rate
            with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-white gap-2 shadow-2xs'):
                with ui.row().classes('items-center justify-between w-full'):
                    ui.label(_loc('kpi_network_rate')).classes('text-xs font-semibold text-slate-500 uppercase')
                    ui.icon('speed').classes('text-teal-700 text-lg')
                ui.label(f"{rate_pct}%").classes('text-2xl font-bold font-mono text-teal-900')
                ui.linear_progress(value=min(1.0, rate_pct / 100.0), size='6px', color='teal-8').classes('rounded-full mt-1')

        # SECTION 1: BRANCH ERP NETWORK & CONFIGURATION
        with ui.card().classes('w-full p-5 gap-4 border border-slate-200 bg-white rounded-2xl shadow-2xs'):
            with ui.row().classes('w-full justify-between items-center flex-wrap gap-2'):
                with ui.column().classes('gap-0.5'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('hub').classes('text-teal-800 text-lg')
                        ui.label(_loc('sec_branches_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('sec_branches_sub')).classes('text-xs text-slate-500')

                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_new_branch'), icon='add_business', on_click=lambda: _open_create_branch_modal()).props('unelevated dense color=teal-8 text-color=white no-caps size=sm class="rounded-lg font-semibold shadow-xs"')

                    async def _sync_all() -> None:
                        for b in branches:
                            await api.safe(api.post(f"/integrations/sage/branches/{b['id']}/sync", {}))
                        ui.notify('All branch synchronizations completed.' if not is_fr else 'Synchronisation réseau de l’ensemble des succursales terminée.', type='positive')
                        await reload_sage_data()
                        _render_sage_content.refresh()

                    ui.button(_loc('btn_sync_all'), icon='sync', on_click=_sync_all).props('outline dense color=teal-8 no-caps size=sm class="rounded-lg font-semibold"')

            branch_rows = []
            for b in branches:
                flavor = b.get('erp_flavor') or b.get('erp_system', '')
                bg_chip, text_chip, label_erp = _erp_badge_color(flavor)
                branch_rows.append({
                    'id': b['id'],
                    'code': b['code'],
                    'name': b['name'],
                    'city': b['city'],
                    'erp_flavor': flavor,
                    'erp_label': label_erp,
                    'erp_bg': bg_chip,
                    'erp_text': text_chip,
                    'sage_company_id': b.get('sage_company_id') or '—',
                    'envelope': w.money(b.get('budgetEnvelope', 0), currency),
                    'committed': w.money(b.get('committed', 0), currency),
                    'available': w.money(b.get('available', 0), currency),
                    'rate': f"{b.get('executionRate', 0)}%",
                    'last_sync': str(b.get('last_sync_at') or '')[:16].replace('T', ' ') or ('Never' if not is_fr else 'Jamais'),
                    'status': b.get('last_sync_status') or 'never',
                    '_raw': b,
                })

            branch_cols = [
                {'name': 'name', 'label': _loc('col_branch'), 'field': 'name', 'align': 'left', 'sortable': True},
                {'name': 'city', 'label': _loc('col_city'), 'field': 'city', 'align': 'left'},
                {'name': 'erp', 'label': _loc('col_erp'), 'field': 'erp_label', 'align': 'center'},
                {'name': 'sage_id', 'label': _loc('col_sage_id'), 'field': 'sage_company_id', 'align': 'center'},
                {'name': 'envelope', 'label': _loc('col_allocated'), 'field': 'envelope', 'align': 'right', 'sortable': True},
                {'name': 'committed', 'label': _loc('col_committed'), 'field': 'committed', 'align': 'right'},
                {'name': 'available', 'label': _loc('col_available'), 'field': 'available', 'align': 'right'},
                {'name': 'rate', 'label': _loc('col_rate'), 'field': 'rate', 'align': 'right'},
                {'name': 'last_sync', 'label': _loc('col_last_sync'), 'field': 'last_sync', 'align': 'left'},
                {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
            ]

            tbl_br = ui.table(columns=branch_cols, rows=branch_rows, pagination=10).classes('w-full lc-table')
            tbl_br.add_slot('body-cell-erp', '''
                <q-td :props="props">
                    <q-chip dense :color="props.row.erp_bg" :text-color="props.row.erp_text" class="text-weight-bold">
                        {{ props.value }}
                    </q-chip>
                </q-td>
            ''')
            tbl_br.add_slot('body-cell-envelope', '<q-td :props="props" class="font-mono font-bold text-teal-900">{{ props.value }}</q-td>')
            tbl_br.add_slot('body-cell-actions', f'''
                <q-td :props="props">
                    <div class="row q-gutter-xs justify-center no-wrap">
                        <q-btn dense flat round color="teal-8" icon="sync" size="sm" @click="$parent.$emit('sync_branch', props.row.id)">
                            <q-tooltip>{_loc('tip_sync_now')}</q-tooltip>
                        </q-btn>
                        <q-btn dense flat round color="purple-8" icon="network_check" size="sm" @click="$parent.$emit('diag_branch', props.row.id)">
                            <q-tooltip>{_loc('tip_diag')}</q-tooltip>
                        </q-btn>
                        <q-btn dense flat round color="primary" icon="tune" size="sm" @click="$parent.$emit('config_branch', props.row.id)">
                            <q-tooltip>{_loc('tip_config')}</q-tooltip>
                        </q-btn>
                    </div>
                </q-td>
            ''')

            def _parse_row_id(e: Any) -> Any:
                if isinstance(e, (int, str)):
                    return e
                if hasattr(e, 'args'):
                    args = e.args
                    if isinstance(args, (int, str)):
                        return args
                    if isinstance(args, (list, tuple)) and args:
                        return args[0]
                    if isinstance(args, dict):
                        return args.get('id')
                return None

            async def _on_sync_branch_event(e: Any) -> None:
                bid = _parse_row_id(e)
                if bid:
                    res = await api.safe(api.post(f"/integrations/sage/branches/{bid}/sync", {}))
                    if res:
                        ui.notify(res.get('message', 'Synchronization succeeded.' if not is_fr else 'Synchronisation réussie.'), type='positive')
                        await reload_sage_data()
                        _render_sage_content.refresh()

            async def _on_diag_branch_event(e: Any) -> None:
                bid = _parse_row_id(e)
                if bid:
                    res = await api.safe(api.post(f"/integrations/sage/branches/{bid}/test", {}))
                    if res:
                        _open_diagnostics_modal(res)

            def _on_config_branch_event(e: Any) -> None:
                bid = _parse_row_id(e)
                if bid:
                    raw_b = next((b for b in sage_state['branches'] if str(b['id']) == str(bid)), None)
                    if raw_b:
                        _open_config_modal(raw_b)

            tbl_br.on('sync_branch', _on_sync_branch_event)
            tbl_br.on('diag_branch', _on_diag_branch_event)
            tbl_br.on('config_branch', _on_config_branch_event)

        # SECTION 2: SAGE ENTERPRISE FILE & MODEL EXCHANGE HUB
        with ui.card().classes('w-full p-5 gap-4 border border-slate-200 bg-white rounded-2xl shadow-2xs'):
            with ui.row().classes('w-full justify-between items-center flex-wrap gap-2'):
                with ui.column().classes('gap-0.5'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('import_export').classes('text-teal-800 text-lg')
                        ui.label(_loc('sec_exchange_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('sec_exchange_sub')).classes('text-xs text-slate-500')

                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_import_sage'), icon='file_upload', on_click=_open_import_modal).props('unelevated color=teal-8 no-caps size=sm class="rounded-lg font-semibold"')

            with ui.grid(columns=3).classes('w-full gap-4'):
                # 1. Sage X3 Finance
                with ui.card().classes('p-4 rounded-xl border border-purple-200 bg-purple-50/40 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('domain').classes('text-purple-700 text-xl')
                        ui.label('Sage X3 Finance (Syracuse)').classes('text-xs font-bold text-slate-800')
                    ui.label('Syracuse V12 JSON payload with 3D analytical axes (Cost Center, Program, Site) and P01..P12 monthly spread.' if not is_fr else 'Payload JSON Syracuse V12 avec axes analytiques 3D (Axe CC, Axe Programme, Axe Site) et ventilation mensuelle P01..P12.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_x3'), icon='download', on_click=lambda: _do_export('sage_x3', 'Sage X3')).props('unelevated color=purple-8 dense no-caps size=sm class="w-full font-semibold"')

                # 2. Sage Intacct
                with ui.card().classes('p-4 rounded-xl border border-sky-200 bg-sky-50/40 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('cloud_sync').classes('text-sky-700 text-xl')
                        ui.label('Sage Intacct (XML-RPC 3.0)').classes('text-xs font-bold text-slate-800')
                    ui.label('Web Services 3.0 <create_glbudget> request with Location, Department, Project dimensions and monthly breakdown.' if not is_fr else 'Requête Web Services 3.0 <create_glbudget> avec balises Location, Department, Project et répartition mensuelle.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_intacct'), icon='download', on_click=lambda: _do_export('sage_intacct', 'Sage Intacct')).props('unelevated color=sky-8 dense no-caps size=sm class="w-full font-semibold"')

                # 3. Sage 300 (Accpac)
                with ui.card().classes('p-4 rounded-xl border border-amber-200 bg-amber-50/40 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('table_chart').classes('text-amber-700 text-xl')
                        ui.label('Sage 300 / Accpac (OData v4)').classes('text-xs font-bold text-slate-800')
                    ui.label('Web API OData v4 GLBudgetSets format (Budget Set 1 - Approved Envelope) with 12 fiscal periods distribution.' if not is_fr else 'Format Web API OData v4 GLBudgetSets (Budget Set 1 - Approved Envelope) avec distribution des 12 périodes comptables.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_300'), icon='download', on_click=lambda: _do_export('sage_300', 'Sage 300')).props('unelevated color=amber-9 dense no-caps size=sm class="w-full font-semibold"')

                # 4. Sage 200 Professional
                with ui.card().classes('p-4 rounded-xl border border-rose-200 bg-rose-50/40 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('badge').classes('text-rose-700 text-xl')
                        ui.label('Sage 200 Pro (Columbus REST)').classes('text-xs font-bold text-slate-800')
                    ui.label('nominal_budgets format matching Sage 200 Columbus Gateway with cost centers and equal twelfths profiling.' if not is_fr else 'Format nominal_budgets conforme à la passerelle Columbus Sage 200 avec centres de coûts et profils mensuels.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_200'), icon='download', on_click=lambda: _do_export('sage_200', 'Sage 200 Pro')).props('unelevated color=rose-8 dense no-caps size=sm class="w-full font-semibold"')

                # 5. Sage 100c PNM
                with ui.card().classes('p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('text_snippet').classes('text-emerald-700 text-xl')
                        ui.label('Sage 100c Parameterized (.PNM)' if not is_fr else 'Format Paramétrable Sage 100 (.PNM)').classes('text-xs font-bold text-slate-800')
                    ui.label('ASCII parameterized standard for direct import into Sage 100 via File > Import > Parameterized Format.' if not is_fr else 'Standard paramétrable ASCII pour import direct dans Sage 100 via Fichier > Importer > Format Paramétrable.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_pnm'), icon='download', on_click=lambda: _do_export('pnm', 'Sage 100 PNM')).props('outline color=emerald-8 dense no-caps size=sm class="w-full font-semibold"')

                # 6. Universal CSV
                with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-slate-50 gap-3'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('grid_on').classes('text-teal-700 text-xl')
                        ui.label('Semicolon Delimited CSV' if not is_fr else 'CSV Délimité (Point-Virgule)').classes('text-xs font-bold text-slate-800')
                    ui.label('Complete tabular template with annual and Q1..Q4 quarterly allocations ready for spreadsheets.' if not is_fr else 'Gabarit tabulaire complet avec dotations annuelles et trimestrielles T1..T4 prêt pour tableurs ou assistants d’importation.').classes('text-[11px] text-slate-600')
                    ui.button(_loc('btn_export_csv'), icon='download', on_click=lambda: _do_export('csv', 'Universal CSV')).props('outline color=teal-8 dense no-caps size=sm class="w-full font-semibold"')

        # SECTION 3: INTER-BRANCH APPROPRIATIONS (ACCOUNT 18)
        with ui.card().classes('w-full p-5 gap-4 border border-slate-200 bg-white rounded-2xl shadow-2xs'):
            with ui.row().classes('w-full justify-between items-center flex-wrap gap-2'):
                with ui.column().classes('gap-0.5'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('swap_horiz').classes('text-teal-800 text-lg')
                        ui.label(_loc('sec_alloc_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('sec_alloc_sub')).classes('text-xs text-slate-500')

                ui.button(_loc('btn_new_allocation'), icon='add', on_click=_open_new_allocation_modal).props('outline dense color=teal-8 no-caps size=sm class="rounded-lg font-semibold"')

            alloc_rows = []
            for a in sage_state['allocations']:
                alloc_rows.append({
                    'number': a['allocation_number'],
                    'date': a['allocation_date'],
                    'src': f"{a['source_branch_name']} ({a['source_branch_code']})",
                    'dst': f"{a['dest_branch_name']} ({a['dest_branch_code']})",
                    'amount': w.money(a['amount'], a.get('currency', currency)),
                    'ref': a.get('remote_sync_ref') or '—',
                    'notes': a.get('notes') or ('Inter-branch allocation' if not is_fr else 'Virement inter-succursales'),
                    'status': _loc('alloc_status_synced') if a['status'] == 'synced_to_remote' else a['status'],
                })

            alloc_cols = [
                {'name': 'number', 'label': _loc('alloc_col_num'), 'field': 'number', 'align': 'left', 'sortable': True},
                {'name': 'date', 'label': _loc('alloc_col_date'), 'field': 'date', 'align': 'left', 'sortable': True},
                {'name': 'src', 'label': _loc('alloc_col_src'), 'field': 'src', 'align': 'left'},
                {'name': 'dst', 'label': _loc('alloc_col_dst'), 'field': 'dst', 'align': 'left'},
                {'name': 'amount', 'label': _loc('alloc_col_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                {'name': 'ref', 'label': _loc('alloc_col_ref'), 'field': 'ref', 'align': 'center'},
                {'name': 'status', 'label': _loc('alloc_col_status'), 'field': 'status', 'align': 'center'},
            ]

            tbl_alloc = ui.table(columns=alloc_cols, rows=alloc_rows, pagination=10).classes('w-full lc-table')
            tbl_alloc.add_slot('body-cell-number', '<q-td :props="props" class="font-mono font-bold text-primary">{{ props.value }}</q-td>')
            tbl_alloc.add_slot('body-cell-amount', '<q-td :props="props" class="font-mono font-bold text-teal-900">{{ props.value }}</q-td>')
            tbl_alloc.add_slot('body-cell-ref', '<q-td :props="props" class="font-mono text-xs text-purple-900">{{ props.value }}</q-td>')
            tbl_alloc.add_slot('body-cell-status', '<q-td :props="props"><q-chip dense color="green-1" text-color="green-9" class="text-weight-bold">{{ props.value }}</q-chip></q-td>')

        # SECTION 4: SAGE LIVE API GATEWAY & REAL-TIME INTERACTIVE MULTI-ERP SIMULATOR
        with ui.card().classes('w-full p-5 gap-4 border border-slate-200 bg-white rounded-2xl shadow-2xs'):
            with ui.row().classes('w-full justify-between items-center flex-wrap gap-2'):
                with ui.column().classes('gap-0.5'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('sensors').classes('text-teal-800 text-lg')
                        ui.label(_loc('sec_gateway_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('sec_gateway_sub')).classes('text-xs text-slate-500')

            with ui.grid(columns=2).classes('w-full gap-4'):
                # Simulator Form
                with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-slate-50 gap-3'):
                    ui.label(_loc('sim_form_title')).classes('text-xs font-bold text-slate-800')

                    erp_sim_opts = {
                        'sage_x3': '🏢 Sage X3 Finance (POH / POP Syracuse)',
                        'sage_intacct': '☁️ Sage Intacct (PO Transaction XML)',
                        'sage_300': '🌐 Sage 300 / Accpac (GL Requisition OData)',
                        'sage_200': '💼 Sage 200 Pro (POP Order Columbus)',
                        'sage_100c': '📑 Sage 100c (Standard Purchase Order)',
                    }
                    sim_sel_erp = ui.select(erp_sim_opts, value='sage_x3', label=_loc('sim_select_erp')).props('outlined dense options-dense bg-white').classes('w-full')

                    sim_branches = {b['code']: f"{b['name']} ({_erp_badge_color(b.get('erp_flavor') or b['erp_system'])[2]})" for b in sage_state['branches']}
                    sim_br_val = [b['code'] for b in sage_state['branches'] if 'sage' in (b.get('erp_system') or '').lower()]
                    sim_sel_br = ui.select(sim_branches, value=sim_br_val[0] if sim_br_val else (list(sim_branches.keys())[0] if sim_branches else ''), label=_loc('sim_select_branch')).props('outlined dense options-dense bg-white').classes('w-full')

                    # Dynamic Accounts from Chart of Accounts (no hardcoding)
                    raw_accts = sage_state.get('accounts', [])
                    sim_accts: dict[str, str] = {}
                    for a in raw_accts:
                        acode = str(a.get('code') or '')
                        if not acode:
                            continue
                        aclass = a.get('account_class')
                        if aclass in (2, 6) or acode.startswith(('2', '6')):
                            aname = a.get('name_en') if (not is_fr and a.get('name_en')) else a.get('name')
                            sim_accts[acode] = f"{acode} — {aname}"
                    if not sim_accts:
                        for a in raw_accts[:40]:
                            acode = str(a.get('code') or '')
                            aname = a.get('name_en') if (not is_fr and a.get('name_en')) else a.get('name')
                            sim_accts[acode] = f"{acode} — {aname}"
                    sim_accts['__custom_acct__'] = _loc('sim_opt_custom_acct')

                    init_acct_val = '6042' if '6042' in sim_accts else (list(sim_accts.keys())[0] if sim_accts else '__custom_acct__')
                    sim_sel_acct = ui.select(sim_accts, value=init_acct_val, label=_loc('sim_account')).props('outlined dense options-dense bg-white').classes('w-full')
                    sim_in_custom_acct = ui.input(label=_loc('lbl_custom_acct'), placeholder='e.g. 60421 or 24125').props('outlined dense bg-white font-mono').classes('w-full')
                    sim_in_custom_acct.set_visibility(False)

                    def _on_acct_change(e: Any) -> None:
                        sim_in_custom_acct.set_visibility(e.value == '__custom_acct__')

                    sim_sel_acct.on('update:model-value', _on_acct_change)

                    sim_in_amt = ui.number(label=_loc('sim_amount'), value=1500000, format='%.0f').props('outlined dense bg-white').classes('w-full')

                    # Dynamic Vendors / Suppliers from DB (no hardcoding)
                    raw_vendors = sage_state.get('vendors', [])
                    sim_vendors: dict[str, str] = {}
                    for v in raw_vendors:
                        vname = v.get('name')
                        if vname:
                            sim_vendors[vname] = vname
                    sim_vendors['__custom_vendor__'] = _loc('sim_opt_custom_vendor')

                    init_vend_val = list(sim_vendors.keys())[0] if (sim_vendors and list(sim_vendors.keys())[0] != '__custom_vendor__') else '__custom_vendor__'
                    sim_sel_vendor = ui.select(sim_vendors, value=init_vend_val, label=_loc('sim_vendor')).props('outlined dense options-dense bg-white').classes('w-full')
                    sim_in_custom_vendor = ui.input(label=_loc('lbl_custom_vendor'), placeholder='e.g. Laborex Central Africa Ltd').props('outlined dense bg-white').classes('w-full')
                    sim_in_custom_vendor.set_visibility(init_vend_val == '__custom_vendor__')

                    def _on_vendor_change(e: Any) -> None:
                        sim_in_custom_vendor.set_visibility(e.value == '__custom_vendor__')

                    sim_sel_vendor.on('update:model-value', _on_vendor_change)

                    sim_in_desc = ui.input(label=_loc('sim_desc'), value='Surgical sterile gauze, sutures, and IV infusion sets' if not is_fr else 'Consommables perfusion et pansements stériles bloc').props('outlined dense bg-white').classes('w-full')
                    
                    rand_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
                    sim_in_ref = ui.input(label=_loc('sim_ref'), value=f"POH-X3-DLA-{datetime.date.today().year}-{rand_suffix}").props('outlined dense bg-white font-mono').classes('w-full')

                    def _on_erp_sim_change(e: Any) -> None:
                        val = e.value
                        r = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
                        yr = datetime.date.today().year
                        if val == 'sage_x3':
                            sim_in_ref.set_value(f"POH-X3-DLA-{yr}-{r}")
                        elif val == 'sage_intacct':
                            sim_in_ref.set_value(f"PO-INTACCT-BAF-{yr}-{r}")
                        elif val == 'sage_300':
                            sim_in_ref.set_value(f"REQ-300-GAR-{yr}-{r}")
                        elif val == 'sage_200':
                            sim_in_ref.set_value(f"POP-200-KBA-{yr}-{r}")
                        else:
                            sim_in_ref.set_value(f"PO-SAGE100-YDE-{yr}-{r}")

                    sim_sel_erp.on('update:model-value', _on_erp_sim_change)

                    async def _execute_simulation() -> None:
                        # Resolve account code (selected or custom)
                        if sim_sel_acct.value == '__custom_acct__':
                            resolved_acct = (sim_in_custom_acct.value or '').strip() or '6042'
                        else:
                            resolved_acct = sim_sel_acct.value

                        # Resolve vendor name (selected or custom)
                        if sim_sel_vendor.value == '__custom_vendor__':
                            resolved_vendor = (sim_in_custom_vendor.value or '').strip() or 'Laborex Central Africa Ltd'
                        else:
                            resolved_vendor = sim_sel_vendor.value

                        payload = {
                            'action': 'commitment',
                            'payload': {
                                'sage_erp': sim_sel_erp.value,
                                'branch_code': sim_sel_br.value,
                                'commitment_number': sim_in_ref.value.strip(),
                                'account_code': resolved_acct,
                                'amount': float(sim_in_amt.value or 0),
                                'vendor_name': resolved_vendor,
                                'description': sim_in_desc.value.strip(),
                            },
                        }
                        res = await api.safe(api.post('/integrations/sage/test-payload', payload))
                        if res:
                            sage_state['sim_result'] = res
                            ui.notify(f"{sim_sel_erp.value.upper()} commitment approved by Gateway!" if not is_fr else f"Engagement {sim_sel_erp.value.upper()} validé par la passerelle !", type='positive', position='top')
                            await reload_sage_data()
                            _render_sage_content.refresh()
                            if 'comm' in refreshers:
                                refreshers['comm']()

                    ui.button(_loc('btn_simulate_push'), icon='send', on_click=_execute_simulation).props('unelevated color=teal-8 font-semibold w-full')

                # Simulator Live Result Display
                with ui.card().classes('p-4 rounded-xl border border-slate-200 bg-slate-900 text-white gap-3'):
                    with ui.row().classes('items-center justify-between w-full'):
                        ui.label(_loc('sim_resp_title')).classes('text-xs font-bold text-emerald-400')
                        ui.icon('verified').classes('text-emerald-400')

                    sim_res = sage_state.get('sim_result')
                    if sim_res:
                        with ui.column().classes('gap-2 text-xs font-mono'):
                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_platform')).classes('text-slate-400')
                                ui.label(str(sim_res.get('sage_erp', 'SAGE')).upper()).classes('text-purple-400 font-bold')

                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_ref')).classes('text-slate-400')
                                ui.label(sim_res.get('commitment_number', '—')).classes('text-white font-bold')

                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_visa')).classes('text-slate-400')
                                ui.label(sim_res.get('authorization_code', '—')).classes('text-amber-400 font-bold')

                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_envelope')).classes('text-slate-400')
                                ui.label(w.money(sim_res.get('allocated_line_amount', 0), currency)).classes('text-white')

                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_available')).classes('text-slate-400')
                                ui.label(w.money(sim_res.get('remaining_available', 0), currency)).classes('text-emerald-400 font-bold')

                            with ui.row().classes('justify-between w-full border-b border-slate-800 pb-1'):
                                ui.label(_loc('sim_lbl_rate')).classes('text-slate-400')
                                ui.label(f"{sim_res.get('new_execution_rate_pct', 0)}%").classes('text-blue-400 font-bold')

                            ui.label(sim_res.get('message', '')).classes('text-[11px] text-teal-200 italic mt-1 font-sans')
                    else:
                        with ui.column().classes('items-center justify-center p-8 gap-2 text-center text-slate-500 w-full'):
                            ui.icon('bolt').classes('text-3xl text-slate-700')
                            ui.label(_loc('sim_empty_title')).classes('text-xs')
                            ui.label(_loc('sim_empty_sub')).classes('text-[10px] text-slate-600')

            # Recent Sage Synchronization Logs Table
            ui.label(_loc('log_table_title')).classes('text-xs font-bold text-slate-700 mt-2')

            log_rows = []
            for l in sage_state['logs']:
                dir_label = ('Inbound' if l['direction'] == 'inbound' else 'Outbound') if not is_fr else ('Entrant (In)' if l['direction'] == 'inbound' else 'Sortant (Out)')
                status_label = ('Success' if l['status'] == 'success' else l['status']) if not is_fr else ('Succès' if l['status'] == 'success' else l['status'])
                log_rows.append({
                    'id': l['id'],
                    'time': str(l.get('created_at') or '')[:19].replace('T', ' '),
                    'type': l['sync_type'],
                    'branch': f"{l.get('branch_name') or 'Global'} ({l.get('branch_code') or 'HQ'})",
                    'direction': dir_label,
                    'format': str(l['format']).upper().replace('_', ' '),
                    'status': status_label,
                    'amount': w.money(l['total_amount'], currency) if l['total_amount'] > 0 else '—',
                })

            log_cols = [
                {'name': 'time', 'label': _loc('log_col_time'), 'field': 'time', 'align': 'left'},
                {'name': 'type', 'label': _loc('log_col_type'), 'field': 'type', 'align': 'left'},
                {'name': 'branch', 'label': _loc('log_col_branch'), 'field': 'branch', 'align': 'left'},
                {'name': 'direction', 'label': _loc('log_col_dir'), 'field': 'direction', 'align': 'center'},
                {'name': 'format', 'label': _loc('log_col_format'), 'field': 'format', 'align': 'center'},
                {'name': 'amount', 'label': _loc('log_col_amount'), 'field': 'amount', 'align': 'right'},
                {'name': 'status', 'label': _loc('log_col_status'), 'field': 'status', 'align': 'center'},
            ]

            tbl_logs = ui.table(columns=log_cols, rows=log_rows, pagination=5).classes('w-full lc-table')
            tbl_logs.add_slot('body-cell-status', '<q-td :props="props"><q-chip dense color="teal-1" text-color="teal-9" class="text-weight-bold">{{ props.value }}</q-chip></q-td>')

    refreshers['sage_sync'] = _render_sage_content.refresh
    _render_sage_content()
