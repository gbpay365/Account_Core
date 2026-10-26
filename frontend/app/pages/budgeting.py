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
from pathlib import Path
from typing import Any
from nicegui import app, ui

from .. import api
from ..i18n import lang, t
from ..ui import widgets as w
from ..ui import manual as manual_ui
from ..ui.shell import page
from .budgeting_sage import render_sage_tab, SAGE_T

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
    'kpi_committed': {'en': 'Committed Appropriations', 'fr': 'Crédits Engagés'},
    'kpi_actual': {'en': 'Actual / Liquidated', 'fr': 'Dépenses Réalisées'},
    'kpi_available': {'en': 'Available Balance', 'fr': 'Disponible Budgétaire Net'},
    'kpi_rate': {'en': 'Overall Execution Rate', 'fr': 'Taux d’Exécution Global'},

    'hint_budget_all': {'en': 'All Sections (Opex + Capex)', 'fr': 'Toutes sections (Fonct. + Invest.)'},
    'hint_committed': {'en': 'Statutory expenditure obligations', 'fr': 'Engagements juridiques validés'},
    'hint_actual': {'en': 'Class 6 & 2 GL postings', 'fr': 'Écritures comptables classes 6 & 2'},
    'hint_available': {'en': 'Net available appropriations', 'fr': 'Crédits disponibles nets'},

    'tab_exec': {'en': 'Execution Dashboard', 'fr': 'Tableau de Bord d’Exécution'},
    'tab_plans': {'en': 'Budget Plans & Lines', 'fr': 'Plans & Dotations Budgétaires'},
    'tab_comm': {'en': 'Commitments', 'fr': 'Engagements de Dépenses'},
    'tab_trans': {'en': 'Credit Transfers', 'fr': 'Virements & Modifications'},
    'tab_carry': {'en': 'Carryforwards', 'fr': 'Reports de Crédits Non Consommés'},
    'tab_reports': {'en': 'Reports & Analytics', 'fr': 'Rapports & Analyses'},
    'quick_btn_reports': {'en': 'Executive Reports', 'fr': 'Rapports Budgétaires'},
    'rep_title': {'en': 'Executive Budget Reporting & Financial Analytics', 'fr': 'Centre d’Édition des Rapports Budgétaires & Analyses'},
    'rep_subtitle': {'en': 'Official statutory statements, multi-axial variances, quarterly absorption curves, and expenditure pipeline reconciliation.', 'fr': 'États réglementaires officiels, analyse multidimensionnelle des écarts, consommation trimestrielle et chaîne de dépense.'},
    'rep_type_execution': {'en': '1. Statutory Budget Execution Statement (État Récapitulatif)', 'fr': '1. État Récapitulatif d’Exécution Budgétaire (SYSCOHADA)'},
    'rep_type_variance': {'en': '2. Budget vs Actual Variance & Quarterly Phasing', 'fr': '2. Analyse des Écarts & Phasing Trimestriel (T1–T4)'},
    'rep_type_versions': {'en': '3. Multi-Version Comparative Analysis (V0 vs V1 vs Real)', 'fr': '3. Comparatif Multi-Versions (V0 Initial vs V1 Révisé vs Réel)'},
    'rep_type_pipeline': {'en': '4. 5-Stage Statutory Expenditure Pipeline & Bottlenecks', 'fr': '4. Chaîne de Dépense & Pipeline d’Audit (Engagements ➔ Paiements)'},
    'btn_print_official': {'en': 'Official Print / PDF', 'fr': 'Imprimer / Format Officiel'},
    'btn_export_csv': {'en': 'Export CSV / Excel', 'fr': 'Exporter Excel / CSV'},
    'btn_copy_summary': {'en': 'Copy Briefing', 'fr': 'Copier la Synthèse'},
    'rep_filter_dept': {'en': 'Department / Service', 'fr': 'Département / Service'},
    'rep_filter_prog': {'en': 'Program / Donor', 'fr': 'Programme / Bailleur'},
    'rep_filter_nature': {'en': 'Budget Section', 'fr': 'Section Budgétaire'},
    'rep_filter_avc': {'en': 'AVC Alert Level', 'fr': 'Niveau de Risque AVC'},
    'rep_all_depts': {'en': '— All Departments (Global) —', 'fr': '— Tous les départements —'},
    'rep_all_progs': {'en': '— All Programs & Donors —', 'fr': '— Tous les programmes & bailleurs —'},
    'rep_all_avc': {'en': 'All AVC Tolerances', 'fr': 'Tous les statuts AVC'},
    'rep_avc_safe': {'en': 'Safe (<80% Consumed)', 'fr': 'Normal (<80% Consommé)'},
    'rep_avc_warning': {'en': 'Warning (80–100%)', 'fr': 'Alerte (80–100%)'},
    'rep_avc_breach': {'en': 'Breach / Overrun (>100%)', 'fr': 'Dépassement / Bloqué (>100%)'},
    'rep_stat_total_budget': {'en': 'Approved Envelope', 'fr': 'Enveloppe Votée'},
    'rep_stat_committed': {'en': 'Committed (BC/DA)', 'fr': 'Engagé (BC/DA)'},
    'rep_stat_spent': {'en': 'Realized Postings', 'fr': 'Dépenses Réalisées'},
    'rep_stat_available': {'en': 'Available Balance', 'fr': 'Disponible Net'},
    'rep_stat_rate': {'en': 'Consumption Rate', 'fr': 'Taux d’Absorption'},
    'rep_dept_breakdown_title': {'en': 'Departmental Execution Share', 'fr': 'Consommation par Département / Service'},
    'rep_nature_breakdown_title': {'en': 'Expenditure by Economic Nature', 'fr': 'Répartition par Nature Économique'},
    'rep_avc_radar_title': {'en': 'Statutory Compliance & AVC Tolerance Radar', 'fr': 'Radar de Conformité Budgétaire (AVC)'},
    'rep_lines_count': {'en': 'budget line(s)', 'fr': 'ligne(s) budgétaire(s)'},
    'rep_official_header': {'en': 'SHISONG CARDIAC CENTRE & HOSPITAL COMPLEX', 'fr': 'COMPLEXE HOSPITALIER SHISONG / SHISONG CARDIAC CENTRE'},
    'rep_official_sub': {'en': 'FINANCIAL CONTROLLERSHIP & STATUTORY BUDGETARY SUPERVISION', 'fr': 'DIRECTION ADMINISTRATIVE ET FINANCIÈRE — SERVICE DU BUDGET & CONTRÔLE DE GESTION'},
    'rep_sign_budget': {'en': 'Budget Controller & Management Accounting', 'fr': 'Le Contrôleur Budgétaire & Comptabilité Matières'},
    'rep_sign_auditor': {'en': 'Chief Financial Officer / Internal Audit', 'fr': 'Le Directeur Financier / Auditeur Interne'},
    'rep_sign_dg': {'en': 'Authorizing Officer (General Director)', 'fr': 'L’Ordonnateur / Directeur Général'},
    'notify_copied_briefing': {'en': 'Executive briefing copied to clipboard!', 'fr': 'Synthèse exécutive copiée dans le presse-papiers !'},
    'col_variance_val': {'en': 'Variance (Value)', 'fr': 'Écart en Valeur'},
    'col_variance_pct': {'en': 'Variance (%)', 'fr': 'Écart (%)'},
    'col_variance_status': {'en': 'Impact', 'fr': 'Impact'},
    'col_phasing_q1': {'en': 'Q1 Planned', 'fr': 'T1 Prévu'},
    'col_phasing_q2': {'en': 'Q2 Planned', 'fr': 'T2 Prévu'},
    'col_phasing_q3': {'en': 'Q3 Planned', 'fr': 'T3 Prévu'},
    'col_phasing_q4': {'en': 'Q4 Planned', 'fr': 'T4 Prévu'},
    'pipe_step1': {'en': '1. Voted Budget', 'fr': '1. Budget Voté'},
    'pipe_step2': {'en': '2. Engaged (PO)', 'fr': '2. Engagé (BC)'},
    'pipe_step3': {'en': '3. Certified (GR)', 'fr': '3. Service Fait (PV)'},
    'pipe_step4': {'en': '4. Mandated', 'fr': '4. Ordonnancé'},
    'pipe_step5': {'en': '5. Disbursed', 'fr': '5. Décaissé'},
    'pipe_pending_cert': {'en': 'Pending Delivery Certification', 'fr': 'En attente de réception technique'},
    'pipe_pending_mandat': {'en': 'Certified Pending Payment Order', 'fr': 'Certifié en attente d’ordonnancement'},
    'pipe_pending_pay': {'en': 'Mandated Pending Treasury Payment', 'fr': 'Mandaté en attente de paiement bancaire'},

    'lbl_comm_section_title': {
        'en': 'Budget Commitments & Credit Reservations',
        'fr': 'Engagements Budgétaires & Réservations de Crédits',
    },
    'comm_search_placeholder': {'en': 'Search by reference, description, vendor, account...', 'fr': 'Rechercher par référence, objet, fournisseur, compte...'},
    'filter_pill_all': {'en': 'All Commitments', 'fr': 'Tous les engagements'},
    'filter_pill_da': {'en': 'Purchase Requests (DA)', 'fr': 'Demandes d’Achat (DA)'},
    'filter_pill_bc': {'en': 'Purchase Orders (BC)', 'fr': 'Bons de Commande (BC)'},
    'filter_pill_draft': {'en': 'Drafts', 'fr': 'Brouillons'},
    'filter_pill_approved': {'en': 'Approved', 'fr': 'Approuvés'},
    'filter_pill_certified': {'en': 'Certified (PV)', 'fr': 'Certifiés (PV)'},
    'filter_pill_mandated': {'en': 'Mandated', 'fr': 'Mandatés'},
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
    'col_initial': {'en': 'Initial Allocation', 'fr': 'Dotation Initiale'},
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
    'advisory_warning': {
        'en': '⚠️ Advisory Alert: Commitment will bring envelope consumption to {pct}%, exceeding the {thresh}% warning threshold.',
        'fr': '⚠️ Alerte Préventive : Cet engagement portera la consommation à {pct}%, dépassant le seuil d’alerte de {thresh}%.',
    },
    'credit_ok': {'en': '✅ Sufficient credit. Remaining balance after commitment: {rem} {curr} ({pct}% consumed)', 'fr': '✅ Crédit suffisant. Solde restant après engagement : {rem} {curr} ({pct}% consommé)'},
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

    'dialog_comm_title': {'en': 'Register Budget Commitment', 'fr': 'Enregistrer un Engagement Budgétaire'},
    'dialog_transfer_title': {'en': 'Authorize Credit Transfer', 'fr': 'Effectuer un Virement de Crédits'},
    'dialog_line_title': {'en': 'Add Budget Line Allocation', 'fr': 'Ajouter une Ligne Budgétaire'},
    'dialog_budget_title': {'en': 'Create Budget Plan', 'fr': 'Créer un Plan Budgétaire'},
    'lbl_cofin_key': {'en': 'Multi-Donor Co-Financing Key (Optional)', 'fr': 'Clé de Co-Financement Multi-Bailleurs (Optionnel)'},

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
    'msg_line_updated': {'en': 'Budget line and quarterly phasing updated.', 'fr': 'Ligne budgétaire et phasage trimestriel mis à jour avec succès.'},
    'msg_budget_approved': {'en': 'Budget plan approved and active.', 'fr': 'Plan budgétaire approuvé et actif.'},
    'msg_budget_updated': {'en': 'Budget plan settings and AVC thresholds updated.', 'fr': 'Paramètres budgétaires et seuils AVC mis à jour avec succès.'},
    'msg_respread_success': {'en': 'Successfully re-spread all budget lines with curve: {curve}.', 'fr': 'Profil de répartition trimestriel appliqué avec succès ({curve}).'},

    'view_annual': {'en': 'Annual Allocations', 'fr': 'Dotations Annuelles'},
    'view_quarterly': {'en': 'Quarterly Phasing (T1–T4)', 'fr': 'Phasage Trimestriel (T1–T4)'},
    'curve_equal': {'en': 'Equal Quarterly (25% / quarter)', 'fr': 'Répartition Égale (25% / trimestre)'},
    'curve_monthly': {'en': 'Even Monthly (1/12th / month)', 'fr': 'Lissage Mensuel (1/12ème / mois)'},
    'curve_front': {'en': 'Front-loaded (40% Q1, 30% Q2, 20% Q3, 10% Q4)', 'fr': 'Anticipé (40% T1, 30% T2, 20% T3, 10% T4)'},
    'curve_back': {'en': 'Back-loaded (10% Q1, 20% Q2, 30% Q3, 40% Q4)', 'fr': 'Différé (10% T1, 20% T2, 30% T3, 40% T4)'},
    'curve_custom': {'en': 'Custom Phasing', 'fr': 'Phasage Personnalisé'},

    'col_avc_status': {'en': 'AVC Tolerance', 'fr': 'Disponibilité AVC'},
    'col_curve': {'en': 'Spread Curve', 'fr': 'Profil de Répartition'},
    'lbl_curve': {'en': 'Periodic Spreading Profile', 'fr': 'Profil de Répartition Périodique'},
    'lbl_warning_threshold': {'en': 'Advisory Warning Threshold (%)', 'fr': 'Seuil d’Alerte Préventif (%)'},
    'lbl_block_threshold': {'en': 'Hard Stop Ceiling (%)', 'fr': 'Plafond de Blocage Strict (%)'},
    'btn_edit_line': {'en': 'Edit Phasing', 'fr': 'Modifier le Phasage'},
    'btn_avc_settings': {'en': 'AVC & Threshold Settings', 'fr': 'Paramètres AVC & Seuils'},
    'btn_respread': {'en': 'Re-Spread Phasing', 'fr': 'Recalculer Répartition'},
    'dialog_avc_title': {'en': 'Availability Control (AVC) & Budget Tolerance Settings', 'fr': 'Configuration du Contrôle de Disponibilité (AVC)'},
    'dialog_edit_line_title': {'en': 'Edit Budget Line & Quarterly Phasing (T1–T4)', 'fr': 'Modifier la Ligne Budgétaire & Phasage Trimestriel (T1–T4)'},
    'dialog_respread_title': {'en': 'Batch Periodic Phasing & Spreading Curves', 'fr': 'Application Groupée d’un Profil de Répartition Trimestriel'},
    'col_q1': {'en': 'T1 (Q1)', 'fr': 'T1 (Jan-Mar)'},
    'col_q2': {'en': 'T2 (Q2)', 'fr': 'T2 (Avr-Juin)'},
    'col_q3': {'en': 'T3 (Q3)', 'fr': 'T3 (Juil-Sep)'},
    'col_q4': {'en': 'T4 (Q4)', 'fr': 'T4 (Oct-Déc)'},
    'hint_respread_desc': {
        'en': 'Select an enterprise spreading curve to re-calculate quarterly allocations (T1–T4) across all active budget lines.',
        'fr': 'Sélectionnez un profil d’étalement pour recalculer les allocations trimestrielles (T1–T4) sur l’ensemble des lignes budgétaires.',
    },
    'hint_avc_desc': {
        'en': 'Define enterprise multi-threshold tolerances: Advisory warning alert (e.g. 80%) and hard commitment blocking ceiling (e.g. 100%).',
        'fr': 'Définissez les seuils de tolérance progressive : alerte préventive sans blocage (ex. 80%) et plafond d’arrêt strict (ex. 100%).',
    },
    'tab_comp': {'en': 'Comparative Analysis (Initial vs Revised)', 'fr': 'Analyse Comparative (V0 vs V1)'},
    'lbl_comp_section_title': {'en': 'Multi-Version Budget Variance & Absorption Analysis', 'fr': 'Analyse Multi-Versions & Écarts Budgétaires (V0 Initial vs V1 Révisé vs Réel)'},
    'comp_intro_desc': {
        'en': 'Audit variance between initial voted appropriations, carried-forward funds, transfers, revised envelopes, purchase requisitions, firm purchase orders, and actual accounting postings.',
        'fr': 'Audit des écarts entre la dotation initiale votée (V0), les reports à nouveau, les virements, l’enveloppe révisée (V1), les demandes d’achat (DA), les bons de commande (BC) et les écritures comptables réelles.',
    },
    'col_v0': {'en': 'Voted (V0)', 'fr': 'Voté (V0)'},
    'col_v1': {'en': 'Revised (V1)', 'fr': 'Révisé (V1)'},
    'col_delta': {'en': 'Δ Amendment', 'fr': 'Δ Rectificatif'},
    'col_pre_comm': {'en': 'Requisitions (PR)', 'fr': 'Demandes d’Achat (DA)'},
    'col_firm_comm': {'en': 'Orders (PO)', 'fr': 'Bons de Commande (BC)'},
    'col_consumed': {'en': 'Total Consumed', 'fr': 'Total Consommé'},
    'col_exec_v0': {'en': 'Exec % (V0)', 'fr': 'Exéc % (V0)'},
    'col_exec_v1': {'en': 'Exec % (V1)', 'fr': 'Exéc % (V1)'},
    'btn_overrides': {'en': 'Emergency Overrides', 'fr': 'Dérogations Budgétaires'},
    'dialog_override_title': {'en': 'Controller Emergency Overrides', 'fr': 'Dérogations Budgétaires d’Urgence (Contrôleur Financier)'},
    'dialog_new_override_title': {'en': 'Issue Emergency Controller Override Ticket', 'fr': 'Émettre un Ticket de Dérogation Budgétaire'},
    'lbl_override_amount': {'en': 'Authorized Overrun Ceiling (XAF)', 'fr': 'Plafond de Dépassement Autorisé (XAF)'},
    'lbl_override_days': {'en': 'Validity Window (Days)', 'fr': 'Durée de Validité (Jours)'},
    'lbl_override_reason': {'en': 'Emergency Justification & Controller Approval', 'fr': 'Motif d’Urgence & Visa du Contrôleur'},
    'btn_issue_override': {'en': 'Issue Override Ticket', 'fr': 'Émettre le Ticket'},
    'col_ticket_num': {'en': 'Ticket #', 'fr': 'N° Dérogation'},
    'col_overrun': {'en': 'Ceiling (XAF)', 'fr': 'Plafond (XAF)'},
    'col_expires': {'en': 'Expires', 'fr': 'Expiration'},
    'col_used_in': {'en': 'Used in Commitment', 'fr': 'Imputé sur Engagement'},
    'col_stage': {'en': 'Stage', 'fr': 'Stade'},
    'stage_pre_comm': {'en': 'Purchase Requisition (PR)', 'fr': 'Demande d’Achat (DA)'},
    'stage_firm_comm': {'en': 'Purchase Order (PO)', 'fr': 'Bon de Commande (BC)'},
    'btn_convert_bc': {'en': 'Convert to PO', 'fr': 'Convertir en BC'},
    'dialog_convert_title': {'en': 'Convert Purchase Requisition to Purchase Order', 'fr': 'Convertir la Demande d’Achat en Bon de Commande'},
    'lbl_override_ticket_opt': {'en': 'Emergency Override Ticket # (Optional)', 'fr': 'N° Ticket Dérogation (Optionnel)'},
    'msg_override_issued': {'en': 'Emergency override ticket {ticket} issued successfully.', 'fr': 'Ticket de dérogation {ticket} émis avec succès.'},
    'msg_convert_success': {'en': 'Purchase requisition {da} converted to Purchase Order {bc}.', 'fr': 'Demande d’achat {da} convertie en Bon de Commande {bc}.'},
    'filter_all_stages': {'en': 'All Stages (PR & PO)', 'fr': 'Tous les stades (DA & BC)'},
    'stage_da_badge': {'en': 'PR (Purchase Requisition)', 'fr': 'DA (Expression Besoin)'},
    'stage_bc_badge': {'en': 'PO (Firm Purchase Order)', 'fr': 'BC (Engagement Ferme)'},

    # --- Phase 3: Secondary Allocations & Derivations (SAP / Sage X3) --------
    'tab_alloc': {'en': 'Cost Allocations', 'fr': 'Répartitions Analytiques'},
    'lbl_alloc_section_title': {
        'en': 'Secondary Cost Center Allocation & Repartition Cycles (OHADA)',
        'fr': 'Cycles de Répartition Analytique Secondaire & Déversements (OHADA)',
    },
    'alloc_intro_desc': {
        'en': 'Multi-segment indirect overhead pooling and reallocation from support cost centers (Direction, IT, Maintenance) to operational cost centers with automated balanced OHADA entries in Journal OD (Crédit 781 Transferts vs Débit 658 Charges).',
        'fr': 'Déversement des centres de coûts auxiliaires (Direction Générale, Informatique, Maintenance) vers les centres opérationnels avec génération automatique d’écritures équilibrées au Journal OD (Crédit compte 781 / Débit compte 658).',
    },
    'btn_new_cycle': {'en': 'New Allocation Cycle', 'fr': 'Nouveau Cycle de Répartition'},
    'btn_derivations': {'en': 'Derivation Rules', 'fr': 'Règles de Dérivation'},
    'btn_simulate_run': {'en': 'Simulate & Run Allocation', 'fr': 'Simuler & Exécuter'},
    'col_cycle_code': {'en': 'Cycle Code', 'fr': 'Code Cycle'},
    'col_cycle_name': {'en': 'Cycle Name', 'fr': 'Intitulé du Cycle'},
    'col_cycle_type': {'en': 'Cycle Type', 'fr': 'Type de Cycle'},
    'col_segments_count': {'en': 'Segments', 'fr': 'Segments'},
    'col_run_num': {'en': 'Run #', 'fr': 'N° Exécution'},
    'col_run_date': {'en': 'Run Date', 'fr': 'Date Exécution'},
    'col_allocated_amt': {'en': 'Total Allocated (XAF)', 'fr': 'Montant Réparti (XAF)'},
    'col_executed_by': {'en': 'Executed by', 'fr': 'Exécuté par'},
    'col_je_ref': {'en': 'GL Journal Entry', 'fr': 'Pièce Comptable (OD)'},
    'dialog_new_cycle_title': {'en': 'Create Secondary Cost Allocation Cycle', 'fr': 'Créer un Cycle de Répartition Analytique'},
    'dialog_run_alloc_title': {'en': 'Simulate & Execute Allocation Run', 'fr': 'Simulation & Exécution de la Répartition Analytique'},
    'dialog_derivations_title': {'en': 'Hierarchical Dimension Derivations', 'fr': 'Dérivation & Rollup Hiérarchique des Dimensions'},
    'derivations_desc': {
        'en': 'Define pattern matching rules (e.g. 6042* -> 6042) to map transactional sub-accounts to parent budget envelope lines during real-time availability checking.',
        'fr': 'Définissez des règles de correspondance (ex. 6042* -> 6042) pour agréger les sous-comptes transactionnels vers la ligne d’enveloppe budgétaire parente lors du contrôle de disponibilité.',
    },
    'lbl_rule_code': {'en': 'Rule Code', 'fr': 'Code Règle'},
    'lbl_rule_name': {'en': 'Rule Name', 'fr': 'Nom de la Règle'},
    'lbl_dim_type': {'en': 'Dimension Type', 'fr': 'Type de Dimension'},
    'lbl_pattern': {'en': 'Source Pattern (Wildcard * or %)', 'fr': 'Motif Source (Joker * ou %)'},
    'lbl_target_account': {'en': 'Target Budget Account', 'fr': 'Compte Budgétaire Cible'},
    'lbl_priority': {'en': 'Priority (1-999)', 'fr': 'Priorité (1-999)'},
    'btn_add_rule': {'en': 'Add Rule', 'fr': 'Ajouter la Règle'},
    'msg_rule_added': {'en': 'Derivation rule registered.', 'fr': 'Règle de dérivation enregistrée avec succès.'},
    'msg_cycle_created': {'en': 'Cost allocation cycle created.', 'fr': 'Cycle de répartition créé avec succès.'},
    'msg_run_executed': {'en': 'Allocation run {num} posted with journal entry {je}.', 'fr': 'Exécution {num} comptabilisée avec la pièce {je}.'},
    'lbl_sender_cc': {'en': 'Sender Cost Center (Pool Source)', 'fr': 'Centre Émetteur (Pôle de Charges)'},
    'lbl_receiver_cc': {'en': 'Receiver Cost Center', 'fr': 'Centre Récepteur'},
    'lbl_weight_pct': {'en': 'Weight Share (%)', 'fr': 'Quote-part (%)'},
    'lbl_override_pool': {'en': 'Allocation Pool Amount (XAF)', 'fr': 'Montant du Pôle à Répartir (XAF)'},
    'btn_simulate': {'en': 'Simulate Breakdown', 'fr': 'Simuler le Calcul'},
    'btn_execute_post': {'en': 'Execute & Post Journal Entry', 'fr': 'Exécuter & Comptabiliser'},
    'type_assessment': {'en': 'Assessment (Expense Transfer)', 'fr': 'Déversement / Évaluation (Transfert de charges)'},
    'type_distribution': {'en': 'Distribution (Direct Analytical)', 'fr': 'Distribution (Analytique Direct)'},
    'lbl_desc_justification': {'en': 'Description / Justification', 'fr': 'Description / Justification'},
    'val_default_cycle_name': {'en': 'General Management & Support Overhead', 'fr': 'Direction Générale & Support Logistique'},
    'val_default_cycle_desc': {'en': 'Reallocation of administrative indirect overhead to operational departments', 'fr': 'Réallocation des frais généraux d’administration vers les départements opérationnels'},


    # --- Phase 4: Institutional Procurement, Acceptance & PTBA Mass Formulation ---
    'tab_carry_budget': {'en': 'Unconsumed Budget Allocations (Year N-1)', 'fr': 'Reports de Crédits Non Consommés (N-1)'},
    'tab_carry_po': {'en': 'Open Commitments Rollover (Year N-1)', 'fr': 'Reports des Engagements Fermes Non Soldés (BC N-1)'},
    'btn_rollover_po': {'en': 'Rollover Open Commitments', 'fr': 'Reporter les Engagements Fermes (BC)'},
    'dialog_rollover_po_title': {'en': 'Rollover Open Firm Commitments to Next Year', 'fr': 'Report des Engagements Fermes Non Soldés vers N+1'},
    'rollover_po_desc': {
        'en': 'Roll forward unliquidated contractual purchase orders into the target fiscal year without double-counting fresh appropriations.',
        'fr': 'Transférez les engagements juridiques fermes (BC) approuvés non soldés vers l’exercice N+1 pour garantir la continuité des contrats sans double imputation budgétaire.',
    },
    'col_rollover_num': {'en': 'Rollover #', 'fr': 'N° Report'},
    'col_source_comm': {'en': 'Source PO (Year N)', 'fr': 'Engagement N (Source)'},
    'col_target_comm': {'en': 'Rolled PO (Year N+1)', 'fr': 'Engagement N+1 (Reporté)'},
    'col_rollover_amt': {'en': 'Rolled Amount (XAF)', 'fr': 'Montant Reporté (XAF)'},
    'lbl_rollover_history': {'en': 'Firm Commitment & Purchase Order Rollover Audit Ledger', 'fr': 'Registre d’Audit des Reports d’Engagements Contractuels (BC)'},
    'btn_certify': {'en': 'Certify (Receipt)', 'fr': 'Certifier (PV)'},
    'btn_view_certs': {'en': 'Acceptance Certificates', 'fr': 'Procès-Verbaux de Réception'},
    'dialog_certify_title': {'en': 'Issue Service Certification / Goods Acceptance Certificate', 'fr': 'Établir un Procès-Verbal de Réception / Service Fait'},
    'dialog_certs_list_title': {'en': 'Service Acceptance & Reception Certificates Register (Goods Receipt)', 'fr': 'Registre des Procès-Verbaux de Réception & Service Fait'},
    'certs_desc': {
        'en': 'Official inspection and acceptance milestone between firm commitment and accounting liquidation, validating technical delivery and conformity.',
        'fr': 'Jalon officiel de constatation du service fait entre l’engagement ferme (BC) et la liquidation comptable, attestant de la conformité des livraisons.',
    },
    'lbl_cert_date': {'en': 'Reception Date', 'fr': 'Date de Réception'},
    'lbl_inspector': {'en': 'Inspector / Reception Committee', 'fr': 'Inspecteur / Commission de Réception'},
    'lbl_cert_amount': {'en': 'Certified Amount (XAF)', 'fr': 'Montant Certifié (XAF)'},
    'lbl_conformity': {'en': 'Conformity Rating', 'fr': 'Constat de Conformité'},
    'conf_full': {'en': 'Full Conformity (Accepted without reserves)', 'fr': 'Conformité Totale (Sans réserve)'},
    'conf_minor': {'en': 'Minor Reserves (Warranty / Snag list)', 'fr': 'Réserves Mineures (Garantie / Finition)'},
    'conf_major': {'en': 'Major Non-Conformity (Rejection / Dispute)', 'fr': 'Non-Conformité Majeure (Rejet / Litige)'},
    'lbl_observations': {'en': 'Technical Inspection Observations', 'fr': 'Observations de la Commission Technique'},
    'msg_cert_success': {'en': 'Reception certificate {cert} registered successfully.', 'fr': 'Procès-verbal de réception {cert} enregistré avec succès.'},
    'btn_grp_ptba': {'en': 'PTBA & Phasing', 'fr': 'PTBA & Phasage'},
    'btn_grp_ppm': {'en': 'Procurement (PPM)', 'fr': 'Marchés & PPM'},
    'btn_grp_gov': {'en': 'Governance & Rules', 'fr': 'Règles & Gouvernance'},
    'btn_ptba_import': {'en': 'PTBA Batch Import (Excel/CSV)', 'fr': 'Import Masse PTBA (Excel/CSV)'},
    'dialog_ptba_title': {'en': 'PTBA Mass Budget Formulation & Batch CSV/Excel Importer', 'fr': 'Formulation Budgétaire PTBA & Import Masse (Excel/CSV)'},
    'ptba_desc': {
        'en': 'Automated template generation and bulk CSV/Excel import/updating of budget lines across accounts, cost centers, and programs with automatic quarterly spread validation.',
        'fr': 'Génération automatisée de modèles et import en masse (CSV/Excel) des lignes budgétaires avec calcul automatique du phasage trimestriel (T1-T4).',
    },
    'btn_download_template': {'en': 'Download CSV Template', 'fr': 'Télécharger Modèle CSV'},
    'lbl_csv_data': {'en': 'CSV Budget Lines (Format: account_code,cost_center_code,program_code,budget_type,initial_amount,spread_curve,notes)', 'fr': 'Lignes Budgétaires CSV (Format: account_code,cost_center_code,program_code,budget_type,initial_amount,spread_curve,notes)'},
    'chk_update_existing': {'en': 'Update existing budget lines if already defined', 'fr': 'Mettre à jour les lignes budgétaires déjà existantes'},
    'btn_execute_import': {'en': 'Validate & Import PTBA', 'fr': 'Valider & Importer le PTBA'},
    'msg_ptba_success': {'en': 'PTBA Batch Import completed: {imported} line(s) imported, {updated} line(s) updated, Total: {total}.', 'fr': 'Import PTBA terminé : {imported} ligne(s) importée(s), {updated} mise(s) à jour, Total : {total}.'},
    'lbl_ptba_history': {'en': 'PTBA Batch Import Runs & Audits', 'fr': 'Historique des Imports par Lots PTBA'},
    'col_batch_num': {'en': 'Batch #', 'fr': 'N° Lot'},
    'col_file_name': {'en': 'File Name', 'fr': 'Fichier'},
    'col_lines_imp': {'en': 'Imported', 'fr': 'Créées'},
    'col_lines_upd': {'en': 'Updated', 'fr': 'Actualisées'},
    'col_total_imported': {'en': 'Total Amount', 'fr': 'Enveloppe Totale'},
    'col_certified': {'en': 'Certified (PV)', 'fr': 'Certifié (PV)'},

    # --- Phase 5: Ordonnancement & Mandats de Paiement (5-Stage Expenditure Chain) ---
    'tab_payment_orders': {'en': 'Payment Orders', 'fr': 'Ordonnancement & Mandats'},
    'btn_new_mandat': {'en': 'Issue Payment Order', 'fr': 'Émettre un Mandat de Paiement'},
    'btn_mandats_register': {'en': 'Payment Orders Register', 'fr': 'Mandats de Paiement'},
    'dialog_mandat_title': {'en': 'Issue Budget Payment Order', 'fr': 'Émettre un Mandat de Paiement'},
    'dialog_mandats_list_title': {'en': 'Public & Institutional Payment Orders Register', 'fr': 'Registre des Mandats de Paiement & Titres d’Ordonnancement'},
    'mandat_desc': {
        'en': 'Fourth statutory milestone of public expenditure: Formal payment authorization issued by the Financial Director / Authorizing Officer, visaed by Financial Control, and transmitted to Treasury.',
        'fr': 'Quatrième étape réglementaire de la dépense publique : Ordre formel de payer émis par l’Ordonnateur, revêtu du visa du Contrôleur Financier et transmis au Trésorier pour règlement.',
    },
    'col_mandat_number': {'en': 'Payment Order #', 'fr': 'N° Mandat'},
    'col_mandat_date': {'en': 'Payment Order Date', 'fr': 'Date Mandat'},
    'col_beneficiary': {'en': 'Beneficiary', 'fr': 'Bénéficiaire'},
    'col_gross_amount': {'en': 'Gross Amount', 'fr': 'Montant Brut'},
    'col_tax_withholding': {'en': 'Tax Withheld (AIR)', 'fr': 'Retenue Fiscale (AIR)'},
    'col_warranty_retention': {'en': 'Warranty Retention', 'fr': 'Retenue Garantie'},
    'col_penalty': {'en': 'Penalties', 'fr': 'Pénalités'},
    'col_net_amount': {'en': 'Net Payable', 'fr': 'Net Ordonnancé'},
    'col_visa_status': {'en': 'Controller Visa', 'fr': 'Visa Contrôleur'},
    'col_disbursed_status': {'en': 'Treasury / Payment', 'fr': 'Règlement / Trésorerie'},
    'lbl_mandat_gross': {'en': 'Gross Invoice Amount (XAF)', 'fr': 'Montant Brut Facture (XAF)'},
    'lbl_air_tax': {'en': 'Tax Withholding / AIR (XAF)', 'fr': 'Acompte / Retenue AIR / TVA (XAF)'},
    'lbl_warranty_ret': {'en': 'Warranty Retention (XAF)', 'fr': 'Retenue de Garantie (5%-10%) (XAF)'},
    'lbl_penalty_amt': {'en': 'Late Delivery Penalties (XAF)', 'fr': 'Pénalités de Retard (XAF)'},
    'lbl_net_to_pay': {'en': 'Net Payable to Beneficiary (XAF)', 'fr': 'Net à Payer au Bénéficiaire (XAF)'},
    'lbl_beneficiary_name': {'en': 'Beneficiary Name / Entity', 'fr': 'Nom / Raison Sociale du Bénéficiaire'},
    'lbl_beneficiary_bank': {'en': 'Beneficiary Bank / RIB', 'fr': 'Coordonnées Bancaires / RIB Bénéficiaire'},
    'lbl_invoice_num': {'en': 'Invoice #', 'fr': 'N° Facture Fournisseur'},
    'lbl_invoice_date': {'en': 'Invoice Date', 'fr': 'Date de la Facture'},
    'lbl_object_desc': {'en': 'Object / Expenditure Motif', 'fr': 'Objet / Motif de la Dépense'},
    'btn_submit_for_visa': {'en': 'Submit for Visa', 'fr': 'Soumettre au Contrôleur'},
    'btn_grant_visa': {'en': 'Grant Visa (Payment Approval)', 'fr': 'Accorder Visa (Bon à Payer)'},
    'btn_reject_visa': {'en': 'Reject Visa', 'fr': 'Refuser le Visa'},
    'btn_transmit_treasury': {'en': 'Transmit to Treasury', 'fr': 'Transmettre à la Trésorerie'},
    'btn_disburse_pay': {'en': 'Disburse (Issue Payment)', 'fr': 'Régler / Décaisser'},
    'dialog_visa_title': {'en': 'Financial Controller Visa Review', 'fr': 'Examen du Visa par le Contrôleur Financier'},
    'dialog_disburse_title': {'en': 'Treasury Payment & Disbursement Settlement', 'fr': 'Règlement & Décaissement en Trésorerie'},
    'lbl_visa_notes': {'en': 'Visa Assessment & Observations', 'fr': 'Motifs / Observations du Contrôleur'},
    'lbl_pay_method': {'en': 'Payment Method', 'fr': 'Mode de Règlement'},
    'lbl_pay_ref': {'en': 'Check # / Transfer Reference', 'fr': 'N° Chèque ou Référence Virement'},
    'lbl_disbursed_amt': {'en': 'Disbursed Amount (XAF)', 'fr': 'Montant Décaissé (XAF)'},
    'msg_mandat_created': {'en': 'Payment order {num} created successfully.', 'fr': 'Mandat de paiement {num} créé avec succès.'},
    'msg_mandat_submitted': {'en': 'Payment order {num} submitted for visa.', 'fr': 'Mandat {num} soumis pour visa préalable.'},
    'msg_mandat_visa_approved': {'en': 'Visa granted for payment order {num}. Commitment mandated amount updated.', 'fr': 'Visa accordé pour le mandat {num}. Engagement budgétaire imputé.'},
    'msg_mandat_visa_rejected': {'en': 'Visa rejected for payment order {num}.', 'fr': 'Visa rejeté pour le mandat {num}.'},
    'msg_mandat_transmitted': {'en': 'Payment order {num} transmitted to Treasury.', 'fr': 'Mandat {num} transmis à la Trésorerie.'},
    'msg_mandat_disbursed': {'en': 'Payment order {num} settled and paid: {amt} XAF.', 'fr': 'Mandat {num} réglé et décaissé : {amt} XAF.'},
    'col_mandated_amt': {'en': 'Mandated', 'fr': 'Mandaté'},
    'col_paid_amt': {'en': 'Paid / Disbursed', 'fr': 'Réglé / Soldé'},
    'col_retentions': {'en': 'Retentions (AIR/Gar.)', 'fr': 'Retenues (AIR/Gar.)'},
    'stat_total_mandats': {'en': 'Total Mandated (Gross)', 'fr': 'Total Mandaté (Brut)'},
    'stat_total_retentions': {'en': 'Total Retentions (Tax + Warranty)', 'fr': 'Total Retenues (AIR + Garantie)'},
    'stat_total_paid': {'en': 'Total Disbursed / Paid', 'fr': 'Total Décaissé / Réglé'},
    'btn_create_mandat_for_comm': {'en': 'Issue Payment Order', 'fr': 'Ordonnancer'},


    # --- Phase 6: Plan de Passation des Marchés (PPM) & Seuils Réglementaires ---
    'tab_ppm': {'en': 'Procurement Plans (PPM)', 'fr': 'Plans de Passation des Marchés (PPM)'},
    'btn_ppm': {'en': 'Procurement Plan (PPM)', 'fr': 'Plan de Passation (PPM)'},
    'btn_ppm_packages': {'en': 'Packages & Contracts', 'fr': 'Lots & Marchés PPM'},
    'btn_thresholds': {'en': 'Procurement Thresholds', 'fr': 'Seuils des Marchés'},
    'dialog_ppm_title': {'en': 'Annual & Multi-Year Procurement Plans', 'fr': 'Plans de Passation des Marchés (PPM) & Avis de Non-Objection (ANO)'},
    'dialog_new_ppm_title': {'en': 'Create Procurement Plan (PPM)', 'fr': 'Créer un Plan de Passation des Marchés (PPM)'},
    'dialog_approve_ppm_title': {'en': 'Donor No-Objection Approval', 'fr': 'Avis de Non-Objection Bailleur (ANO)'},
    'dialog_packages_title': {'en': 'Procurement Packages & Milestone Tracking', 'fr': 'Lots de Passation des Marchés & Jalons Réglementaires'},
    'dialog_new_pkg_title': {'en': 'Add Procurement Package / Lot', 'fr': 'Ajouter un Lot / Marché au PPM'},
    'dialog_award_pkg_title': {'en': 'Award Contract & Generate Firm Commitment', 'fr': 'Attribution du Marché & Engagement Juridique Ferme'},
    'dialog_thresholds_title': {'en': 'Regulatory Procurement Thresholds & Review Matrix', 'fr': 'Matrice Réglementaire des Seuils & Modalités de Revue'},
    'ppm_desc': {
        'en': 'Statutory procurement planning required by donors (World Bank, AfDB, EU) and Public Procurement Regulatory Authorities (ARMP). Organizes procurement packages by category, method, review type, and milestones.',
        'fr': 'Planification réglementaire obligatoire des marchés (Bailleurs de fonds & ARMP). Regroupe les lots par catégorie, méthode de passation, seuil de revue préalable (ANO) et calendrier prévisionnel des jalons.',
    },
    'col_ppm_code': {'en': 'PPM Code', 'fr': 'Code PPM'},
    'col_ppm_title': {'en': 'Plan Title', 'fr': 'Intitulé du PPM'},
    'col_donor_ref': {'en': 'Donor / Financing Ref.', 'fr': 'Référence Bailleur / Financement'},
    'col_ano_ref': {'en': 'Donor Clearance Reference', 'fr': 'Avis de Non-Objection (ANO)'},
    'col_packages_count': {'en': 'Packages', 'fr': 'Nombre de Lots'},
    'col_total_estimated': {'en': 'Estimated Envelope (XAF)', 'fr': 'Enveloppe Estimée (XAF)'},
    'col_total_contracted': {'en': 'Contracted Amount (XAF)', 'fr': 'Montant Contractualisé (XAF)'},
    'col_package_num': {'en': 'Package # / Lot', 'fr': 'N° Lot / Marché'},
    'col_category': {'en': 'Category', 'fr': 'Catégorie'},
    'col_method': {'en': 'Method', 'fr': 'Méthode'},
    'col_review_type': {'en': 'Review Type', 'fr': 'Modalité de Revue'},
    'col_milestones': {'en': 'Key Milestones', 'fr': 'Jalons Clés'},
    'col_contract_num': {'en': 'Contract #', 'fr': 'N° Contrat'},
    'col_contract_amt': {'en': 'Contract Amount', 'fr': 'Montant Marché'},
    'lbl_ppm_title': {'en': 'Procurement Plan Title', 'fr': 'Intitulé du Plan de Passation'},
    'lbl_donor_ano': {'en': 'Donor Clearance Reference', 'fr': 'Référence de Non-Objection (ANO Bailleur)'},
    'lbl_ano_date': {'en': 'Clearance Grant Date', 'fr': 'Date de Non-Objection'},
    'lbl_pkg_desc': {'en': 'Package Description / Scope', 'fr': 'Objet / Consistance du Marché'},
    'lbl_pkg_budget_line': {'en': 'Budget Envelope Line', 'fr': 'Ligne Budgétaire d’Imputation'},
    'lbl_pkg_cat': {'en': 'Procurement Category', 'fr': 'Catégorie du Marché'},
    'lbl_pkg_method': {'en': 'Procurement Method', 'fr': 'Méthode de Passation'},
    'lbl_pkg_est_amt': {'en': 'Estimated Cost (XAF)', 'fr': 'Montant Estimatif / Prévisionnel (XAF)'},
    'lbl_date_launch': {'en': 'Planned Launch Date', 'fr': 'Date Prévisionnelle de Lancement'},
    'lbl_date_opening': {'en': 'Planned Bid Opening Date', 'fr': 'Date Prévisionnelle Dépouillement'},
    'lbl_date_award': {'en': 'Planned Award Date', 'fr': 'Date Prévisionnelle Attribution'},
    'lbl_date_completion': {'en': 'Planned Completion Date', 'fr': 'Date Prévisionnelle Réception Finale'},
    'lbl_awarded_supplier': {'en': 'Awarded Supplier / Contractor', 'fr': 'Titulaire / Attributaire du Marché'},
    'lbl_contract_ref': {'en': 'Signed Contract Reference #', 'fr': 'N° du Marché / Contrat Signé'},
    'lbl_contract_amt': {'en': 'Definitive Contract Amount (XAF)', 'fr': 'Montant Définitif du Marché (XAF)'},
    'lbl_sign_date': {'en': 'Contract Signature Date', 'fr': 'Date de Signature du Marché'},
    'chk_create_comm': {'en': 'Automatically generate firm budget commitment linked to this contract', 'fr': 'Créer automatiquement l’engagement juridique ferme imputé sur la ligne budgétaire'},
    'btn_add_ppm': {'en': 'New Procurement Plan', 'fr': 'Nouveau PPM'},
    'btn_add_package': {'en': 'New Package / Lot', 'fr': 'Nouveau Lot'},
    'btn_award_pkg': {'en': 'Award & Sign Contract', 'fr': 'Attribuer & Signer'},
    'btn_launch_tender': {'en': 'Launch Tender', 'fr': 'Lancer Appel d’Offres'},
    'btn_evaluate_bids': {'en': 'Evaluate Bids', 'fr': 'Dépouiller Offres'},
    'msg_ppm_created': {'en': 'Procurement plan {code} created successfully.', 'fr': 'Plan de passation {code} créé avec succès.'},
    'msg_ppm_approved': {'en': 'Procurement plan {code} approved with donor clearance {ano}.', 'fr': 'Plan de passation {code} approuvé avec l’ANO {ano}.'},
    'msg_pkg_created': {'en': 'Package {num} added to PPM with review mode: {rev}.', 'fr': 'Lot {num} ajouté au PPM (Mode de revue : {rev}).'},
    'msg_pkg_updated': {'en': 'Package {num} updated.', 'fr': 'Lot {num} mis à jour.'},
    'msg_pkg_awarded': {'en': 'Contract {contract} awarded to {supp}. Firm commitment generated: {bc}.', 'fr': 'Marché {contract} attribué à {supp}. Engagement ferme {bc} généré.'},
    'badge_ppm_pkg': {'en': 'PPM Contract Lot', 'fr': 'Marché PPM'},

    # --- Action Buttons & Tables i18n ---
    'btn_submit_mandat': {'en': 'Submit', 'fr': 'Soumettre'},
    'btn_visa_mandat': {'en': 'Review Visa', 'fr': 'Viser'},
    'btn_transmit_mandat': {'en': 'Transmit', 'fr': 'Transmettre'},
    'btn_settle_mandat': {'en': 'Pay / Settle', 'fr': 'Régler'},
    'btn_launch_ao': {'en': 'Launch Tender', 'fr': 'Lancer AO'},
    'btn_evaluate_bids_short': {'en': 'Evaluate Bids', 'fr': 'Dépouiller'},
    'btn_award_short': {'en': 'Award', 'fr': 'Attribuer'},
    'btn_manage_lots': {'en': 'Manage Lots', 'fr': 'Gérer les Lots'},
    'btn_approve_ano_short': {'en': 'Approve Clearance', 'fr': 'Approuver ANO'},
    'btn_new_lot_short': {'en': 'New Lot', 'fr': 'Nouveau Lot'},
    'btn_simulate_run_short': {'en': 'Simulate & Run', 'fr': 'Simuler & Exécuter'},
    'lbl_display_mode': {'en': 'Display Mode:', 'fr': 'Mode d’affichage :'},
    'lbl_cofin_own_funds': {'en': '— Own Funds (No Co-Financing) —', 'fr': '— Fonds Propres (Aucun Co-Financement) —'},
    'lbl_alloc_creates_je': {'en': 'Creates balanced journal entry in Journal OD (Credit 781 / Debit 658)', 'fr': 'Génère une écriture équilibrée au Journal OD (Crédit 781 / Débit 658)'},
    'lbl_open_comm_avail_rollover': {'en': 'Open Firm Commitments Available for Rollover:', 'fr': 'Engagements Fermes Non Soldés Disponibles pour Report :'},
    'lbl_rollover_auto_creation': {'en': 'Automatic creation of target budget lines and indexed Year N+1 commitments', 'fr': 'Création automatique de lignes budgétaires cibles et engagements N+1 indexés'},
    'lbl_ptba_std_cols': {'en': 'Standardized PTBA Column Format:', 'fr': 'Format de colonnes standardisé PTBA :'},
    'btn_ptba_sample': {'en': 'Load Sample Template', 'fr': 'Charger Exemple'},
    'lbl_ptba_auto_spread': {'en': 'Quarterly phasing (Q1-Q4) automatically calculated based on spreading curve', 'fr': 'Phasage trimestriel (T1-T4) calculé automatiquement selon le profil d’étalement'},
    'lbl_no_rules_configured': {'en': 'No derivation rules configured yet. Rules map accounts like 6042* to target budget envelope lines.', 'fr': 'Aucune règle de dérivation configurée. Les règles associent les comptes (ex. 6042*) aux lignes budgétaires cibles.'},
    'lbl_segment_config': {'en': 'Segment Configuration (Sender & Receivers)', 'fr': 'Configuration des Segments (Émetteur & Récepteurs)'},
    'lbl_total_share_balanced': {'en': 'Total Share: 100% (Balanced)', 'fr': 'Quote-part Totale : 100% (Équilibrée)'},
    'lbl_gross_amount_colon': {'en': 'Gross Amount:', 'fr': 'Montant Brut :'},
    'lbl_withholdings_colon': {'en': 'Withholdings (Tax / Retention):', 'fr': 'Retenues (AIR / Garantie) :'},
    'lbl_net_payable_colon': {'en': 'Net Payable to Beneficiary:', 'fr': 'Net Ordonnancé à Payer :'},
    'lbl_gross_amount_short': {'en': 'Gross Amount', 'fr': 'Montant Brut'},
    'lbl_withholdings_short': {'en': 'Withholdings (Tax + Ret.)', 'fr': 'Retenues (AIR + Gar.)'},
    'lbl_net_mandated_short': {'en': 'Net Mandated', 'fr': 'Net Ordonnancé'},
    'lbl_audit_history_visas': {'en': 'Audit History & Controller Visas', 'fr': 'Historique d’Audit & Visas'},
    'lbl_no_additional_audit': {'en': 'No additional audit records.', 'fr': 'Aucun enregistrement d’audit supplémentaire.'},
    'lbl_tax_warranty_deducted': {'en': 'Tax + Retention Deducted', 'fr': 'AIR + Retenues Déduites'},
    'lbl_thresholds_regulatory_note': {'en': 'Regulatory thresholds determining mandatory procurement method and prior review requirements.', 'fr': 'Limites réglementaires déterminant la méthode obligatoire et la modalité de revue (Préalable / A posteriori).'},
    'lbl_select_active_budget_first': {'en': 'Please select an active budget plan first.', 'fr': 'Veuillez d’abord sélectionner un budget actif.'},
    'lbl_no_active_ppm': {'en': 'No active Procurement Plan (PPM) found. Please create a PPM first.', 'fr': 'Aucun Plan de Passation des Marchés (PPM) actif. Veuillez créer un PPM d’abord.'},
    'lbl_no_budget_lines_in_budget': {'en': 'No budget lines available in the active budget.', 'fr': 'Aucune ligne budgétaire disponible dans le budget actif.'},
    'lbl_vendor_free_input': {'en': 'Or Enter Free Vendor Name (if unlisted)', 'fr': 'Ou Saisir Nom Fournisseur Libre (si non répertorié)'},
    'placeholder_vendor_free': {'en': 'Vendor / Legal Entity Name', 'fr': 'Nom / Raison Sociale'},
    'placeholder_pkg_desc': {'en': 'Precise object and scope of the procurement package...', 'fr': 'Objet précis du lot de marché...'},
    'placeholder_pkg_specs': {'en': 'Technical specifications, lot packaging details...', 'fr': 'Spécifications techniques, allotissement...'},
    'placeholder_award_notes': {'en': 'Award committee minutes, evaluation report references...', 'fr': 'Procès-verbal d’attribution, références avis...'},
    'lbl_packages_operational_tracking': {'en': 'Operational tracking of tender dossiers, clearances, thresholds, and conversion to firm commitments.', 'fr': 'Suivi opérationnel des dossiers d’appel d’offres, avis de non-objection, seuils et conversion en engagements fermes.'},
    'lbl_ppm_lots_count': {'en': 'Packages in PPM', 'fr': 'Lots au PPM'},
    'lbl_ppm_est_envelope': {'en': 'Total Estimated Envelope', 'fr': 'Enveloppe Estimative Totale'},
    'lbl_ppm_initial_planning': {'en': 'Initial overall planning', 'fr': 'Planification initiale globale'},
    'lbl_ppm_contracted_markets': {'en': 'Contracted Awards', 'fr': 'Marchés Contractualisés'},
    'lbl_voted_dotation_kpi': {'en': 'Voted Allocation (Initial)', 'fr': 'Dotation Votée (Initiale)'},
    'lbl_carryforward_n1_kpi': {'en': 'Carryforward (Year N-1)', 'fr': 'Report N-1'},
    'lbl_net_transfers_kpi': {'en': 'Net Transfers', 'fr': 'Virements Nets'},
    'lbl_pre_comm_da_kpi': {'en': 'Purchase Requisitions (PR)', 'fr': 'Demandes d’Achat (DA)'},
    'lbl_firm_comm_bc_kpi': {'en': 'Purchase Orders (PO)', 'fr': 'Bons de Commande (BC)'},
    'lbl_active_alloc_cycles': {'en': 'Configured Cost Allocation Cycles', 'fr': 'Cycles de Répartition Paramétrés'},
    'lbl_history_alloc_runs': {'en': 'Allocation Runs History & Journal Entries (Journal OD)', 'fr': 'Registre Historique des Exécutions & Écritures Comptables (Journal OD)'},

    # --- Notifications i18n ---
    'notify_no_active_lines': {'en': 'No active budget lines available.', 'fr': 'Aucune ligne budgétaire active disponible.'},
    'notify_provide_override_fields': {'en': 'Please provide overrun ceiling and emergency justification.', 'fr': 'Plafond de dépassement et motif d’urgence obligatoires.'},
    'notify_fill_required_fields': {'en': 'Please fill required fields.', 'fr': 'Veuillez renseigner les champs obligatoires.'},
    'notify_two_lines_for_transfer': {'en': 'At least two budget lines are required to execute a credit transfer.', 'fr': 'Au moins deux lignes budgétaires sont requises pour effectuer un virement.'},
    'notify_distinct_lines': {'en': 'Source and target lines must be distinct.', 'fr': 'Les lignes source et cible doivent être distinctes.'},
    'notify_fill_amount_reason': {'en': 'Please fill amount and reason.', 'fr': 'Veuillez renseigner le montant et le motif.'},
    'notify_select_budget_first': {'en': 'Please create or select a budget plan first.', 'fr': 'Veuillez d’abord créer ou sélectionner un budget.'},
    'notify_select_account_amount': {'en': 'Please select account and amount.', 'fr': 'Veuillez sélectionner un compte et un montant.'},
    'notify_select_active_budget': {'en': 'Please select an active budget plan.', 'fr': 'Veuillez sélectionner un plan budgétaire actif.'},
    'notify_fill_code_name': {'en': 'Please fill code and name.', 'fr': 'Veuillez renseigner le code et l’intitulé.'},
    'notify_budget_created': {'en': 'Budget plan created.', 'fr': 'Plan budgétaire créé avec succès.'},
    'notify_no_active_budget_carry': {'en': 'No active budget to carry forward from.', 'fr': 'Aucun budget actif à reporter.'},
    'notify_select_line_gt_zero': {'en': 'Please select at least one line with amount > 0.', 'fr': 'Veuillez sélectionner au moins une ligne avec un montant > 0.'},
    'notify_fill_rule_fields': {'en': 'Please fill all required rule fields.', 'fr': 'Veuillez renseigner tous les champs de la règle.'},
    'notify_rule_deleted': {'en': 'Rule deleted.', 'fr': 'Règle supprimée avec succès.'},
    'notify_two_cc_required': {'en': 'At least 2 cost centers required for allocation cycles.', 'fr': 'Au moins 2 centres de coûts sont requis pour un cycle.'},
    'notify_fill_cycle_fields': {'en': 'Please fill cycle code and name.', 'fr': 'Veuillez renseigner le code et le nom du cycle.'},
    'notify_weights_100': {'en': 'Total weights must equal 100% (currently {sum_pct}%).', 'fr': 'Le total des quotes-parts doit être égal à 100% (actuellement {sum_pct}%).'},
    'notify_no_cycles_defined': {'en': 'No allocation cycles defined yet.', 'fr': 'Aucun cycle de répartition défini.'},
    'notify_comm_not_found': {'en': 'Commitment not found.', 'fr': 'Engagement introuvable.'},
    'notify_provide_inspector_amt': {'en': 'Please provide inspector name and certified amount.', 'fr': 'Nom de l’inspecteur et montant certifié obligatoires.'},
    'notify_cert_exceeds_bal': {'en': 'Certified amount cannot exceed remaining uncertified balance ({bal}).', 'fr': 'Le montant certifié ne peut excéder le solde non certifié ({bal}).'},
    'notify_no_open_comm_found': {'en': 'No open unliquidated firm commitments found in this fiscal year.', 'fr': 'Aucun engagement ferme non soldé trouvé pour cet exercice.'},
    'notify_select_dest_budget': {'en': 'Please select destination budget plan.', 'fr': 'Veuillez sélectionner le budget de destination.'},
    'notify_select_one_open_comm': {'en': 'Please select at least one open commitment.', 'fr': 'Veuillez sélectionner au moins un engagement ouvert.'},
    'notify_provide_csv': {'en': 'Please provide CSV data.', 'fr': 'Veuillez fournir les données CSV.'},
    'notify_no_valid_csv_rows': {'en': 'No valid budget rows found in CSV.', 'fr': 'Aucune ligne budgétaire valide trouvée dans le CSV.'},
    'notify_provide_mandat_fields': {'en': 'Please provide beneficiary, gross amount, and description.', 'fr': 'Bénéficiaire, montant brut et objet obligatoires.'},
    'notify_mandat_exceeds_env': {'en': 'Gross amount exceeds remaining unmandated envelope ({bal}).', 'fr': 'Le montant brut excède l’enveloppe non mandatée restante ({bal}).'},
    'notify_budget_ref_missing': {'en': 'Budget or budget line reference missing.', 'fr': 'Référence du budget ou de la ligne budgétaire manquante.'},
    'notify_mandat_not_found': {'en': 'Payment order not found.', 'fr': 'Mandat de paiement introuvable.'},
    'notify_mandat_submitted': {'en': 'Payment order submitted for visa.', 'fr': 'Mandat soumis pour visa préalable.'},
    'notify_mandat_transmitted': {'en': 'Payment order transmitted to Treasury.', 'fr': 'Mandat transmis à la Trésorerie.'},
    'notify_ppm_title_required': {'en': 'Procurement plan title is required.', 'fr': 'L’intitulé du PPM est obligatoire.'},
    'notify_ano_ref_required': {'en': 'Donor clearance reference is required.', 'fr': 'La référence de Non-Objection (ANO) est requise.'},
    'notify_pkg_desc_cost_required': {'en': 'Description and valid estimated cost are required.', 'fr': 'Description et montant estimatif valide obligatoires.'},
    'notify_contract_fields_required': {'en': 'Contract number, amount, and awarded contractor are required.', 'fr': 'Numéro de contrat, montant et attributaire obligatoires.'},
    'notify_tender_launched': {'en': 'Tender officially launched.', 'fr': 'Appel d’offres officiellement lancé.'},
    'notify_bids_evaluated': {'en': 'Bid evaluation recorded.', 'fr': 'Évaluation des offres / cotations enregistrée.'},
    'notify_cycle_deleted': {'en': 'Allocation cycle deleted.', 'fr': 'Cycle de répartition supprimé.'},

    # --- PTBA, Colors & Modal Fixes i18n ---
    'notify_sample_loaded': {'en': 'Sample PTBA template loaded into editor.', 'fr': 'Modèle d’exemple PTBA chargé dans l’éditeur.'},
    'notify_template_downloaded': {'en': 'PTBA CSV template downloaded.', 'fr': 'Modèle CSV PTBA téléchargé.'},
    'btn_clear': {'en': 'Clear', 'fr': 'Effacer'},
    'placeholder_csv_input': {'en': 'Paste CSV budget lines here or click "Load Sample Template"...', 'fr': 'Collez les lignes budgétaires CSV ici ou cliquez sur "Charger Exemple"...'},
    'placeholder_override_reason': {'en': 'e.g. Emergency override for operating theater equipment repair...', 'fr': 'Ex : Dérogation pour réparation d’urgence scanner IRM bloc opératoire...'},
    'lbl_comm_amount_colon': {'en': 'Commitment:', 'fr': 'Engagement :'},
    'lbl_certified_colon': {'en': 'Certified (Inspection):', 'fr': 'Certifié (PV) :'},
    'lbl_already_mandated_colon': {'en': 'Already Mandated:', 'fr': 'Déjà mandaté :'},
    'lbl_remaining_to_mandate_colon': {'en': 'Remaining to Mandate:', 'fr': 'Reliquat à mandater :'},
    'placeholder_mandat_obj': {'en': 'Settlement of final statement of works or goods delivery...', 'fr': 'Règlement décompte définitif des travaux ou fournitures...'},
    'lbl_debtor_bank_acct': {'en': 'Debtor Treasury / Bank Account', 'fr': 'Compte Trésorerie Débiteur'},
    'opt_pay_bank_transfer': {'en': 'Bank Wire Transfer', 'fr': 'Virement Bancaire (Ordre de virement)'},
    'opt_pay_check': {'en': 'Bank Check', 'fr': 'Chèque Bancaire'},
    'opt_pay_cash': {'en': 'Cash (Petty Cash)', 'fr': 'Caisse (Espèces)'},
    'opt_pay_other': {'en': 'Other Payment Method', 'fr': 'Autre mode de règlement'},
    'lbl_pay_notes_ref': {'en': 'Notes / Transmission Slip Ref.', 'fr': 'Notes / Référence Bordereau'},
    'val_pay_default_notes': {'en': 'Settlement processed via bank transfer', 'fr': 'Règlement régularisé par virement bancaire'},
    'lbl_payment_order_title_prefix': {'en': 'Payment Order', 'fr': 'Mandat de Paiement'},
    'lbl_linked_commitment': {'en': 'Linked Commitment', 'fr': 'Engagement lié'},
    'stat_mandats_issued_count': {'en': '{count} orders issued', 'fr': '{count} mandats émis'},
    'stat_visa_approved_count': {'en': '{count} approved / ready to pay', 'fr': '{count} visés / bons à payer'},
    'stat_paid_count': {'en': '{count} disbursed / settled', 'fr': '{count} soldés / décaissés'},
    'lbl_already_certified_colon': {'en': 'Already certified:', 'fr': 'Déjà certifié :'},
    'lbl_solde_to_certify_colon': {'en': 'Remaining to certify:', 'fr': 'Solde à certifier :'},
    'val_default_inspector': {'en': 'Works & Goods Acceptance Committee', 'fr': 'Commission de Réception des Marchés'},
    'placeholder_cert_obs': {'en': 'Technical conformity observations and attachments (delivery slip, test report)...', 'fr': 'Observations techniques de conformité et pièces jointes (bordereau de livraison, rapport d’essai)...'},
    'default_carryforward_reason': {'en': 'Carryforward of unconsumed appropriations {fy}', 'fr': 'Report des crédits non consommés {fy}'},
    'lbl_linked_ppm': {'en': 'Linked PPM', 'fr': 'PPM Rattaché'},
    'placeholder_ano_notes': {'en': 'Clearance conditions, no-objection terms or reserves...', 'fr': 'Conditions ou réserves de non-objection...'},
    'lbl_launch_prefix': {'en': 'Launch', 'fr': 'Lancement'},
    'lbl_award_prefix': {'en': 'Award', 'fr': 'Attribution'},
    'lbl_pkg_prefix': {'en': 'Package', 'fr': 'Lot'},
    'lbl_cat_prefix': {'en': 'Category', 'fr': 'Catégorie'},
    'lbl_meth_prefix': {'en': 'Method', 'fr': 'Méthode'},
    'lbl_est_ppm_amt': {'en': 'Estimated PPM Envelope', 'fr': 'Montant Estimé PPM'},
    'supplier_fallback': {'en': 'Vendor', 'fr': 'Fournisseur'},
    'none_label': {'en': 'None', 'fr': 'Aucun'},
    'invoice_num_prefix': {'en': 'Invoice #', 'fr': 'Facture N°'},

    # --- Quick Action Hub, Stepper & Availability Checker ---
    'quick_hub_title': {'en': '⚡ Quick Action & Expenditure Launcher', 'fr': '⚡ Centre d’Actions Rapides & Guidées'},
    'quick_hub_subtitle': {'en': 'One-click shortcuts to check budget, commit expenses, make transfers or view payment orders', 'fr': 'Raccourcis en un clic pour tester la disponibilité, engager une dépense, virer des crédits ou émettre un mandat'},
    'btn_quick_check_avail': {'en': 'Check Available Budget', 'fr': 'Vérifier la Disponibilité'},
    'hint_quick_check': {'en': 'Simulate if an expense fits in budget', 'fr': 'Tester en 5 secondes si une dépense passe'},
    'btn_quick_new_comm': {'en': 'New Commitment', 'fr': 'Nouvel Engagement'},
    'hint_quick_comm': {'en': 'Reserve budget before issuing PO', 'fr': 'Réserver les crédits avant commande'},
    'btn_quick_transfer': {'en': 'Credit Transfer', 'fr': 'Virement de Crédit'},
    'hint_quick_transfer': {'en': 'Move credits between budget lines', 'fr': 'Transférer des crédits entre lignes'},
    'btn_quick_mandats': {'en': 'Payment Orders', 'fr': 'Mandats de Paiement'},
    'hint_quick_mandats': {'en': 'Visas, tax retentions & payments', 'fr': 'Gérer les visas, retenues et règlements'},
    'btn_quick_procurement': {'en': 'Procurement (PPM)', 'fr': 'Marchés & PPM'},
    'hint_quick_procurement': {'en': 'Annual tender plans & packages', 'fr': 'Plan prévisionnel des marchés'},
    'btn_quick_guide': {'en': 'How-To Manual', 'fr': 'Guide Illustré'},
    'hint_quick_guide': {'en': 'Step-by-step worked examples', 'fr': 'Consulter le manuel et cas pratiques'},

    # 5-Stage Stepper
    'stepper_title': {'en': '🏛️ The 5-Stage Statutory Expenditure Chain (Chaîne de la Dépense)', 'fr': '🏛️ La Chaîne de la Dépense en 5 Étapes Réglementaires'},
    'step_1_title': {'en': '1. Planning / Budget Plan', 'fr': '1. Plan & Dotation'},
    'step_1_desc': {'en': 'Approved annual envelope', 'fr': 'Plafond voté / autorisé'},
    'step_2_title': {'en': '2. Commitment', 'fr': '2. Engagement Juridique'},
    'step_2_desc': {'en': 'Credit reservation (PR/PO)', 'fr': 'Réservation de crédits (DA/BC)'},
    'step_3_title': {'en': '3. Service Receipt', 'fr': '3. Service Fait'},
    'step_3_desc': {'en': 'Delivery PV & Certification', 'fr': 'PV de réception & certification'},
    'step_4_title': {'en': '4. Payment Order', 'fr': '4. Mandat de Paiement'},
    'step_4_desc': {'en': 'Liquidation, tax & visas', 'fr': 'Ordonnancement & retenues'},
    'step_5_title': {'en': '5. Bank Disbursement', 'fr': '5. Règlement Trésorerie'},
    'step_5_desc': {'en': 'Disbursement & GL posting', 'fr': 'Paiement effectif & écriture'},

    # Quick Checker Modal
    'checker_modal_title': {'en': 'Instant Budget Availability Checker', 'fr': 'Vérificateur Express de Disponibilité Budgétaire'},
    'checker_modal_desc': {'en': 'Quickly test if your department has sufficient budget before signing contracts or purchase orders.', 'fr': 'Vérifiez instantanément si votre service dispose des crédits suffisants avant de signer un bon de commande.'},
    'checker_select_line': {'en': 'Select Budget Line / Account to Test', 'fr': 'Sélectionnez la ligne budgétaire à tester'},
    'checker_amount_label': {'en': 'Proposed Expense Amount', 'fr': 'Montant prévisionnel de la dépense'},
    'checker_status_approved': {'en': '✅ APPROVED: Budget is available!', 'fr': '✅ DISPONIBLE : Crédit suffisant accordé !'},
    'checker_status_warning': {'en': '🟡 WARNING: Budget available, but reaches alert threshold', 'fr': '🟡 ATTENTION : Crédit suffisant mais seuil d’alerte atteint'},
    'checker_status_blocked': {'en': '🛑 BLOCKED: Budget ceiling exceeded!', 'fr': '🛑 DÉPASSEMENT : Crédit insuffisant (Blocage AVC)'},
    'checker_btn_commit_now': {'en': '⚡ Proceed to Create Commitment with this Line', 'fr': '⚡ Créer directement l’engagement avec cette ligne'},
    'checker_btn_request_transfer': {'en': '🔄 Request Credit Transfer into this Line', 'fr': '🔄 Demander un virement de crédits pour cette ligne'},

    # Help Banner
    'help_banner_title': {'en': '💡 How to use the Budget Module in 3 Simple Steps', 'fr': '💡 Comment utiliser le Module Budgétaire en 3 étapes simples'},
    'help_step_1': {'en': '1. Check Your Balance', 'fr': '1. Consultez vos Disponibilités'},
    'help_step_1_sub': {'en': 'See your approved budget and remaining balance in the Execution Dashboard.', 'fr': 'Visualisez vos plafonds autorisés et soldes disponibles dans le tableau de bord.'},
    'help_step_2': {'en': '2. Reserve Before Buying', 'fr': '2. Réservez Avant d’Acheter'},
    'help_step_2_sub': {'en': 'Click "+ New Commitment" to reserve credit before issuing vendor purchase orders.', 'fr': 'Cliquez sur "+ Nouvel Engagement" pour garantir les fonds avant de commander.'},
    'help_step_3': {'en': '3. Authorize & Pay', 'fr': '3. Réceptionnez & Payez'},
    'help_step_3_sub': {'en': 'Record receipt of goods, issue payment orders (mandats), and settle via bank.', 'fr': 'Validez le service fait, émettez le mandat de paiement avec retenues fiscales, et payez.'},
}

_DATA_I18N = {
    'en': {
        'Budget Prévisionnel 2026 — Exploitation & Investissements': 'Operating & Capital Expenditure Budget 2026',
        'Budget de fonctionnement et d investissement 2026': 'Operating & Capital Expenditure Budget 2026',
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
_T.update(SAGE_T)


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
        'submitted': {'en': 'SUBMITTED (VISA)', 'fr': 'SOUMIS (VISA)'},
        'visa_approved': {'en': 'VISA APPROVED', 'fr': 'VISÉ (BON À PAYER)'},
        'visa_rejected': {'en': 'VISA REJECTED', 'fr': 'VISA REFUSÉ'},
        'transmitted_treasury': {'en': 'IN TREASURY', 'fr': 'EN TRÉSORERIE'},
        'paid': {'en': 'PAID / DISBURSED', 'fr': 'RÉGLÉ / DÉCAISSÉ'},
        'cancelled': {'en': 'CANCELLED', 'fr': 'ANNULÉ'},
        'planned': {'en': 'PLANNED', 'fr': 'PLANIFIÉ'},
        'tender_launched': {'en': 'TENDER LAUNCHED', 'fr': 'AO LANCÉ'},
        'bids_evaluated': {'en': 'BIDS EVALUATED', 'fr': 'OFFRES ÉVALUÉES'},
        'awarded': {'en': 'AWARDED', 'fr': 'ATTRIBUÉ'},
        'contract_signed': {'en': 'CONTRACT SIGNED', 'fr': 'CONTRAT SIGNÉ'},
        'archived': {'en': 'ARCHIVED', 'fr': 'ARCHIVÉ'},
    }
    return mapping.get(s, {}).get(lang(), s.upper())


def _tr_procurement_cat(cat: Any) -> str:
    c = str(cat or 'goods').lower()
    mapping = {
        'works': {'en': 'Works & Infrastructure', 'fr': 'Travaux & BTP'},
        'goods': {'en': 'Goods & Equipment', 'fr': 'Fournitures & Équipements'},
        'consulting_firms': {'en': 'Consulting Firms', 'fr': 'Cabinets & Firmes Conseil'},
        'individual_consultants': {'en': 'Individual Consultants', 'fr': 'Consultants Individuels'},
        'non_consulting_services': {'en': 'Non-Consulting Services', 'fr': 'Services Généraux / Gardiennage'},
    }
    return mapping.get(c, {}).get(lang(), c.upper())


def _tr_procurement_method(meth: Any) -> str:
    m = str(meth or 'AON').upper()
    mapping = {
        'AON': {'en': 'National Competitive Bidding (AON)', 'fr': 'Appel d’Offres National (AON)'},
        'AOI': {'en': 'International Competitive Bidding (AOI)', 'fr': 'Appel d’Offres International (AOI)'},
        'DC': {'en': 'Request for Quotations (RFQ)', 'fr': 'Demande de Cotations (DC)'},
        'ED': {'en': 'Direct Contracting', 'fr': 'Entente Directe / Gré à Gré (ED)'},
        'SFQ': {'en': 'Selection Based on Qualifications (SFQ)', 'fr': 'Sélection Fondée sur les Qualifications (SFQ)'},
        'QCBS': {'en': 'Quality & Cost-Based Selection (QCBS)', 'fr': 'Sélection Qualité/Coût (QCBS)'},
        'LCS': {'en': 'Least-Cost Selection (LCS)', 'fr': 'Moindre Coût (LCS)'},
        '3CV': {'en': 'Comparison of 3 CVs', 'fr': 'Consultants Individuels (3 CV)'},
    }
    return mapping.get(m, {}).get(lang(), m)


def _tr_review_type(rev: Any) -> tuple[str, str, str]:
    r = str(rev or 'post_review').lower()
    if r in ('prior', 'prior_review'):
        return ('Revue Préalable (ANO Obligatoire)' if lang() == 'fr' else 'Prior Review (Clearance Required)', 'red-1', 'red-9')
    return ('Revue a posteriori' if lang() == 'fr' else 'Post Review', 'sky-1', 'sky-9')


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


def _tr_curve(curve: Any) -> str:
    c = str(curve or 'equal_quarterly').lower()
    mapping = {
        'equal_quarterly': {'en': 'Equal (25%/Q)', 'fr': 'Égale (25%/T)'},
        'even_monthly': {'en': 'Monthly (1/12th)', 'fr': 'Mensuelle (1/12ème)'},
        'front_loaded': {'en': 'Front-loaded (40/30/20/10)', 'fr': 'Anticipée (40/30/20/10)'},
        'back_loaded': {'en': 'Back-loaded (10/20/30/40)', 'fr': 'Différée (10/20/30/40)'},
        'custom': {'en': 'Custom Phasing', 'fr': 'Personnalisée'},
    }
    return mapping.get(c, {}).get(lang(), c)


def _tr_avc_badge(status: Any) -> tuple[str, str, str]:
    st = str(status or 'normal').lower()
    if st == 'breach':
        return ('Plafond Dépassé' if lang() == 'fr' else 'Hard Ceiling Breached', 'red-1', 'red-9')
    if st == 'warning':
        return ('Alerte Seuil (80%+)' if lang() == 'fr' else 'Advisory Alert (80%+)', 'amber-1', 'amber-9')
    return ('Normal (< 80%)' if lang() == 'fr' else 'Normal (< 80%)', 'green-1', 'green-9')


def _calc_spread_quarters(amt: float, curve: str) -> tuple[float, float, float, float]:
    total = float(amt or 0)
    if curve == 'front_loaded':
        q1 = round(total * 0.40, 2)
        q2 = round(total * 0.30, 2)
        q3 = round(total * 0.20, 2)
        q4 = round(total - (q1 + q2 + q3), 2)
        return (q1, q2, q3, q4)
    elif curve == 'back_loaded':
        q1 = round(total * 0.10, 2)
        q2 = round(total * 0.20, 2)
        q3 = round(total * 0.30, 2)
        q4 = round(total - (q1 + q2 + q3), 2)
        return (q1, q2, q3, q4)
    else:  # equal_quarterly or even_monthly
        q = round(total / 4.0, 2)
        return (q, q, q, round(total - (3 * q), 2))


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

    bank_resp = await api.safe(api.get('/bank/accounts'), default={'rows': []})
    bank_accounts = bank_resp.get('rows', []) if isinstance(bank_resp, dict) else (bank_resp or [])

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
        'overrides': [],
        'comparative': None,
        'comm_stage_filter': None,
        'view_mode': 'annual',
        'allocation_cycles': [],
        'allocation_runs': [],
        'derivations': [],
        'certifications': [],
        'commitment_rollovers': [],
        'ptba_imports': [],
        'carry_submode': 'budget',
        'payment_orders': [],
        'payment_order_stats': {},
        'procurement_plans': [],
        'procurement_packages': [],
        'procurement_thresholds': [],
        'procurement_stats': {},
        'active_ppm_id': None,
    }

    refreshers: dict[str, Any] = {}
    tab_badges: dict[str, Any] = {}

    def _update_tab_badges() -> None:
        try:
            rep = state.get('report') or {}
            rows = rep.get('rows', [])
            breach_count = sum(1 for r in rows if r.get('avc_status') == 'breach')
            if 'exec' in tab_badges and tab_badges['exec']:
                if breach_count > 0:
                    tab_badges['exec'].set_text(f"⚠️ {breach_count}")
                    tab_badges['exec'].props('color=negative')
                    tab_badges['exec'].set_visibility(True)
                else:
                    tab_badges['exec'].set_text(str(len(rows)))
                    tab_badges['exec'].props('color=teal-8')
                    tab_badges['exec'].set_visibility(len(rows) > 0)

            lines_cnt = len((state.get('active_budget') or {}).get('lines', []))
            if 'plans' in tab_badges and tab_badges['plans']:
                tab_badges['plans'].set_text(str(lines_cnt))
                tab_badges['plans'].set_visibility(lines_cnt > 0)

            comm_cnt = len(state.get('commitments', []))
            if 'comm' in tab_badges and tab_badges['comm']:
                tab_badges['comm'].set_text(str(comm_cnt))
                tab_badges['comm'].set_visibility(comm_cnt > 0)

            tr_cnt = len(state.get('transfers', []))
            if 'trans' in tab_badges and tab_badges['trans']:
                tab_badges['trans'].set_text(str(tr_cnt))
                tab_badges['trans'].set_visibility(tr_cnt > 0)
        except Exception:
            pass

    def _refresh_all() -> None:
        for fn in list(refreshers.values()):
            try:
                fn()
            except Exception:
                pass
        _update_tab_badges()

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
        comm_params: dict[str, Any] = {'budgetId': b_id_param}
        if state.get('comm_stage_filter'):
            comm_params['stage'] = state['comm_stage_filter']
        comm_resp = await api.safe(api.get('/budget-commitments', **comm_params), default={'rows': []})
        state['commitments'] = comm_resp.get('rows', [])

        tr_resp = await api.safe(api.get('/budget-transfers', budgetId=b_id_param), default={'rows': []})
        state['transfers'] = tr_resp.get('rows', [])

        cf_resp = await api.safe(api.get('/budget-carryforwards', fiscalYearId=state['fy_id']), default={'rows': []})
        state['carryforwards'] = cf_resp.get('rows', [])

        ovr_resp = await api.safe(api.get('/budget-overrides', budgetId=b_id_param), default={'rows': []})
        state['overrides'] = ovr_resp.get('rows', [])

        if b_id_param:
            state['comparative'] = await api.safe(api.get(f'/budgets/{b_id_param}/comparative-analysis'), default=None)
        else:
            state['comparative'] = None

        cycles_resp = await api.safe(api.get('/cost-allocations/cycles'), default={'rows': []})
        state['allocation_cycles'] = cycles_resp.get('rows', [])

        runs_resp = await api.safe(api.get('/cost-allocations/runs', fiscalYearId=state['fy_id']), default={'rows': []})
        state['allocation_runs'] = runs_resp.get('rows', [])

        derivs_resp = await api.safe(api.get('/budget-derivations'), default={'rows': []})
        state['derivations'] = derivs_resp.get('rows', [])

        certs_resp = await api.safe(api.get('/budget-certifications'), default={'rows': []})
        state['certifications'] = certs_resp.get('rows', [])

        rolls_resp = await api.safe(api.get('/budget-commitments/rollovers'), default={'rows': []})
        state['commitment_rollovers'] = rolls_resp.get('rows', [])

        if b_id_param:
            ptba_resp = await api.safe(api.get(f'/budgets/{b_id_param}/ptba/imports'), default={'rows': []})
            state['ptba_imports'] = ptba_resp.get('rows', [])
            ord_resp = await api.safe(api.get('/budget-payment-orders', budgetId=b_id_param), default={'rows': []})
            state['payment_orders'] = ord_resp.get('rows', [])
            state['payment_order_stats'] = await api.safe(api.get('/budget-payment-orders/stats', budgetId=b_id_param), default={})
        else:
            state['ptba_imports'] = []
            ord_resp = await api.safe(api.get('/budget-payment-orders'), default={'rows': []})
            state['payment_orders'] = ord_resp.get('rows', [])
            state['payment_order_stats'] = await api.safe(api.get('/budget-payment-orders/stats'), default={})

        # Phase 6: Procurement Plans (PPM), Packages & Thresholds
        ppm_params = {'fiscalYearId': state['fy_id']}
        if b_id_param:
            ppm_params['budgetId'] = b_id_param
        ppm_resp = await api.safe(api.get('/procurement-plans', **ppm_params), default={'rows': []})
        state['procurement_plans'] = ppm_resp.get('rows', []) if isinstance(ppm_resp, dict) else (ppm_resp or [])

        if state['procurement_plans']:
            if not state.get('active_ppm_id') or not any(p['id'] == state['active_ppm_id'] for p in state['procurement_plans']):
                state['active_ppm_id'] = state['procurement_plans'][0]['id']
        else:
            state['active_ppm_id'] = None

        pkg_params = {}
        if state.get('active_ppm_id'):
            pkg_params['planId'] = state['active_ppm_id']
        pkg_resp = await api.safe(api.get('/procurement-packages', **pkg_params), default={'rows': []})
        state['procurement_packages'] = pkg_resp.get('rows', []) if isinstance(pkg_resp, dict) else (pkg_resp or [])

        th_resp = await api.safe(api.get('/procurement-thresholds'), default={'rows': []})
        state['procurement_thresholds'] = th_resp.get('rows', []) if isinstance(th_resp, dict) else (th_resp or [])

        stats_params = {}
        if state.get('active_ppm_id'):
            stats_params['planId'] = state['active_ppm_id']
        elif state.get('fy_id'):
            stats_params['fiscalYearId'] = state['fy_id']
        state['procurement_stats'] = await api.safe(api.get('/procurement-stats', **stats_params), default={})
        _update_tab_badges()

    await reload_data()

    # --- UI RENDER -----------------------------------------------------------
    async def _change_fy(new_id: int) -> None:
        state['fy_id'] = new_id
        await reload_data()
        _refresh_all()

    async def _change_comm_stage(stage_val: str | None) -> None:
        state['comm_stage_filter'] = stage_val if stage_val else None
        await reload_data()
        if 'comm' in refreshers:
            refreshers['comm']()

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

    async def _handle_convert_comm(comm_id: int) -> None:
        res = await api.safe(api.post(f'/budget-commitments/{comm_id}/convert-to-firm', {}))
        if res and res.get('commitmentNumber'):
            ui.notify(_loc('msg_convert_success', da=res.get('parentCommitmentNumber', ''), bc=res.get('commitmentNumber', '')), type='positive', position='top')
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

    # --- Modal: Issue New Emergency Override Ticket
    def _open_new_override_modal(preselected_line_id: int | None = None) -> None:
        b = state['active_budget']
        if not b or not b.get('lines'):
            ui.notify(_loc('notify_no_active_lines'), type='warning')
            return

        lines = b.get('lines', [])
        line_opts = {
            l['id']: f"{_tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))} ({_tr_type(l.get('budget_type'))})"
            for l in lines
        }
        init_line = preselected_line_id if (preselected_line_id and preselected_line_id in line_opts) else list(line_opts.keys())[0]

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('shield').classes('text-amber-600 text-2xl')
                ui.label(_loc('dialog_new_override_title')).classes('text-lg font-bold text-slate-800')

            sel_line = ui.select(line_opts, value=init_line, label=_loc('lbl_select_line')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_override_amount'), value=5000000, format='%.0f').props('outlined dense').classes('w-full')
            days_in = ui.number(label=_loc('lbl_override_days'), value=14, format='%.0f', min=1, max=90).props('outlined dense').classes('w-full')
            reason_in = ui.textarea(label=_loc('lbl_override_reason'), placeholder=_loc('placeholder_override_reason')).props('outlined dense rows=3').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _submit_override() -> None:
                    if not reason_in.value or not amt_in.value:
                        ui.notify(_loc('notify_provide_override_fields'), type='warning')
                        return
                    payload = {
                        'budgetLineId': sel_line.value,
                        'overrunAmount': float(amt_in.value),
                        'validityDays': int(days_in.value or 14),
                        'justification': reason_in.value.strip(),
                    }
                    res = await api.safe(api.post('/budget-overrides', payload))
                    if res and res.get('ticketNumber'):
                        ui.notify(_loc('msg_override_issued', ticket=res['ticketNumber']), type='positive', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_issue_override'), icon='gavel', on_click=_submit_override).props('unelevated color=amber-9')

        dlg.open()

    # --- Modal: Override Tickets List
    def _open_override_list_modal() -> None:
        b = state['active_budget']
        overrides = state.get('overrides', [])

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-4xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('verified_user').classes('text-amber-600 text-2xl')
                    ui.label(_loc('dialog_override_title')).classes('text-lg font-bold text-slate-800')

                ui.button(_loc('dialog_new_override_title'), icon='add_moderator', on_click=lambda: _open_new_override_modal()).props('unelevated color=amber-9')

            ovr_rows = []
            for o in overrides:
                ovr_rows.append({
                    'id': o.get('id'),
                    'ticket': o.get('ticket_number'),
                    'account': _tr_account(o.get('account_code'), o.get('account_name'), o.get('account_name_en')),
                    'overrun': w.money(o.get('overrun_amount', 0), currency),
                    'justification': o.get('justification') or '—',
                    'status': _tr_status(o.get('status')),
                    '_status_raw': o.get('status'),
                    'expires': str(o.get('expires_at') or '')[:10],
                    'used_in': o.get('used_in_commitment_number') or '—',
                })

            cols = [
                {'name': 'ticket', 'label': _loc('col_ticket_num'), 'field': 'ticket', 'align': 'left', 'sortable': True},
                {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                {'name': 'overrun', 'label': _loc('col_overrun'), 'field': 'overrun', 'align': 'right', 'sortable': True},
                {'name': 'expires', 'label': _loc('col_expires'), 'field': 'expires', 'align': 'center'},
                {'name': 'justification', 'label': _loc('col_notes'), 'field': 'justification', 'align': 'left'},
                {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                {'name': 'used_in', 'label': _loc('col_used_in'), 'field': 'used_in', 'align': 'center'},
            ]

            tbl = ui.table(columns=cols, rows=ovr_rows, pagination=10).classes('w-full lc-table')
            tbl.add_slot('body-cell-status', '''
                <q-td :props="props">
                    <q-chip dense :color="props.row._status_raw === 'used' ? 'indigo-1' : (props.row._status_raw === 'approved' ? 'green-1' : 'grey-2')"
                            :text-color="props.row._status_raw === 'used' ? 'indigo-9' : (props.row._status_raw === 'approved' ? 'green-9' : 'grey-8')"
                            class="text-weight-bold">
                        {{ props.value }}
                    </q-chip>
                </q-td>
            ''')

            with ui.row().classes('w-full justify-end mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

        dlg.open()

    # --- Modal: New Budget Commitment
    async def _open_new_comm_modal(initial_line_id: int | None = None, initial_amount: float | None = None, initial_desc: str = '') -> None:
        b = state['active_budget']
        if not b or not b.get('lines'):
            ui.notify(_loc('notify_no_active_lines'), type='warning')
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

        first_line_id = initial_line_id if (initial_line_id and initial_line_id in line_options) else list(line_options.keys())[0]

        asset_options = {0: _loc('no_asset_opt')}
        for a in assets_list:
            a_name = a.get('name_en') if (lang() == 'en' and a.get('name_en')) else a.get('name')
            asset_options[a['id']] = f"🏷️ {a.get('tag')} - {_tr_val(a_name)}"

        vendor_options = {0: _loc('no_vendor_opt')}
        for v in vendors:
            vendor_options[v['id']] = v.get('legal_name') or v.get('trade_name')

        cofin_options = {0: _loc('lbl_cofin_own_funds')}
        cofin_res = await api.safe(api.get('/donor-cofinancing/keys'), default={'rows': []})
        for ck in (cofin_res.get('rows') or []):
            cofin_options[ck['id']] = f"🤝 [{ck.get('code')}] {ck.get('name')}"

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_comm_title')).classes('text-lg font-bold text-slate-800')

            sel_line = ui.select(line_options, value=first_line_id, label=_loc('lbl_select_line')).props('outlined dense options-dense').classes('w-full')

            stage_sel = ui.select(
                {'firm_commitment': _loc('stage_firm_comm'), 'pre_commitment': _loc('stage_pre_comm')},
                value='firm_commitment',
                label=_loc('col_stage')
            ).props('outlined dense options-dense').classes('w-full')

            desc_in = ui.input(label=_loc('col_desc'), value=initial_desc, placeholder=_loc('comm_desc_placeholder')).props('outlined dense').classes('w-full')

            def _open_new_vendor_modal() -> None:
                dlg_v = ui.dialog()
                with dlg_v, ui.card().classes('w-full max-w-sm p-5 gap-3'):
                    ui.label('Create New Supplier / Beneficiary' if lang() == 'en' else 'Créer un Nouveau Fournisseur / Prestataire').classes('text-base font-bold text-slate-800')
                    v_name = ui.input('Supplier / Company Name', placeholder='e.g. MedSupply International SARL').props('outlined dense')
                    v_phone = ui.input('Phone (Optional)', placeholder='+237 6...').props('outlined dense')
                    v_email = ui.input('Email (Optional)', placeholder='contact@company.com').props('outlined dense')

                    async def _save_v():
                        if not v_name.value or not v_name.value.strip():
                            ui.notify('Supplier name is required' if lang() == 'en' else 'Le nom du fournisseur est obligatoire', type='warning')
                            return
                        res = await api.safe(api.post('/partners', {
                            'type': 'supplier',
                            'name': v_name.value.strip(),
                            'phone': v_phone.value.strip() if v_phone.value else None,
                            'email': v_email.value.strip() if v_email.value else None,
                        }))
                        if res and res.get('id'):
                            vendor_options[res['id']] = res.get('name')
                            vend_sel.options = vendor_options
                            vend_sel.set_value(res['id'])
                            ui.notify(f"Supplier {res.get('name')} created!" if lang() == 'en' else f"Fournisseur {res.get('name')} créé !", type='positive')
                            dlg_v.close()

                    with ui.row().classes('w-full justify-end gap-2 mt-2'):
                        ui.button('Cancel' if lang() == 'en' else 'Annuler', on_click=dlg_v.close).props('flat color=grey')
                        ui.button('Create' if lang() == 'en' else 'Créer', on_click=_save_v).props('unelevated color=teal size=sm')
                dlg_v.open()

            with ui.row().classes('w-full gap-3 no-wrap'):
                with ui.column().classes('flex-1 gap-1'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        ui.label(_loc('lbl_vendor')).classes('text-xs font-semibold text-slate-700')
                        ui.button('+ New' if lang() == 'en' else '+ Nouveau', icon='add_circle', on_click=_open_new_vendor_modal).props('flat dense size=xs color=teal-8 no-caps class="text-[11px] font-bold"')
                    vend_sel = ui.select(vendor_options, value=0).props('outlined dense options-dense').classes('w-full')
                asset_sel = ui.select(asset_options, value=0, label=_loc('lbl_asset')).props('outlined dense options-dense').classes('flex-1 mt-4')

            with ui.row().classes('w-full gap-3 no-wrap'):
                amt_in = ui.number(label=_loc('lbl_amount'), value=initial_amount if initial_amount is not None else 1000000, format='%.0f').props('outlined dense').classes('flex-1')
                override_inp = ui.input(label=_loc('lbl_override_ticket_opt'), placeholder='OVR-2026-XXXX').props('outlined dense clearable').classes('flex-1')

            cofin_sel = ui.select(cofin_options, value=0, label=_loc('lbl_cofin_key')).props('outlined dense options-dense').classes('w-full')

            # Real-time availability indicator
            status_label = ui.label('').classes('text-xs font-semibold leading-normal')

            def update_status() -> None:
                cur_line = line_lookup.get(sel_line.value)
                if not cur_line:
                    return
                avail_raw = cur_line.get('available_balance')
                if avail_raw is None:
                    avail_val = float(cur_line.get('amount') or cur_line.get('revised_amount') or 0)
                else:
                    avail_val = float(str(avail_raw).replace(',', ''))
                req_val = float(amt_in.value or 0)
                tot_budget = float(cur_line.get('amount') or cur_line.get('revised_amount') or 1)
                consumed_so_far = tot_budget - avail_val
                new_consumed = consumed_so_far + req_val
                new_pct = round((new_consumed / tot_budget) * 100, 1) if tot_budget > 0 else 0
                warn_thresh = float(cur_line.get('warning_threshold_pct') or (b.get('warning_threshold_pct') if b else 80.0) or 80.0)

                if req_val > avail_val:
                    status_label.text = _loc('overrun_warning', avail=w.money(avail_val, currency), curr=currency, deficit=w.money(req_val - avail_val, currency))
                    status_label.classes('text-rose-600', remove='text-emerald-600 text-amber-600')
                elif new_pct >= warn_thresh:
                    status_label.text = _loc('advisory_warning', pct=new_pct, thresh=warn_thresh)
                    status_label.classes('text-amber-600', remove='text-emerald-600 text-rose-600')
                else:
                    status_label.text = _loc('credit_ok', rem=w.money(avail_val - req_val, currency), curr=currency, pct=new_pct)
                    status_label.classes('text-emerald-600', remove='text-rose-600 text-amber-600')

            sel_line.on_value_change(update_status)
            amt_in.on_value_change(update_status)
            update_status()

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_comm() -> None:
                    if not desc_in.value or not amt_in.value:
                        ui.notify(_loc('notify_fill_required_fields'), type='warning')
                        return
                    payload = {
                        'budgetLineId': sel_line.value,
                        'description': desc_in.value.strip(),
                        'stage': stage_sel.value,
                        'overrideTicketNumber': override_inp.value.strip() if override_inp.value else None,
                        'vendorId': vend_sel.value if vend_sel.value else None,
                        'assetId': asset_sel.value if asset_sel.value else None,
                        'amount': float(amt_in.value),
                        'committedDate': datetime.date.today().isoformat(),
                        'cofinancingKeyId': cofin_sel.value if (cofin_sel.value and cofin_sel.value > 0) else None,
                    }
                    res = await api.safe(api.post('/budget-commitments', payload))
                    if res and res.get('commitmentNumber'):
                        if res.get('warningNotice'):
                            ui.notify(res['warningNotice'], type='warning', position='top', timeout=6000)
                        ui.notify(_loc('msg_comm_success', ref=res['commitmentNumber']), type='positive')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_confirm_commit'), icon='check', on_click=submit_comm).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Credit Transfer (Virement)
    def _open_new_transfer_modal(initial_source_line_id: int | None = None, initial_target_line_id: int | None = None) -> None:
        b = state['active_budget']
        if not b or not b.get('lines') or len(b.get('lines', [])) < 2:
            ui.notify(_loc('notify_two_lines_for_transfer'), type='warning')
            return

        lines = b.get('lines', [])
        avail_label = _loc('source_line_avail')
        src_opts = {l['id']: f"{_tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))} - {avail_label} {w.money(l.get('available_balance', l.get('amount', 0)), currency)} {currency}" for l in lines}
        tgt_opts = {l['id']: f"{_tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))} ({_tr_type(l.get('budget_type') or 'opex')})" for l in lines}

        src_val = initial_source_line_id if (initial_source_line_id and initial_source_line_id in src_opts) else lines[0]['id']
        tgt_val = initial_target_line_id if (initial_target_line_id and initial_target_line_id in tgt_opts) else (lines[1]['id'] if len(lines) > 1 else lines[0]['id'])

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            ui.label(_loc('dialog_transfer_title')).classes('text-lg font-bold text-slate-800')

            src_sel = ui.select(src_opts, value=src_val, label=_loc('lbl_src_line')).props('outlined dense options-dense').classes('w-full')
            tgt_sel = ui.select(tgt_opts, value=tgt_val, label=_loc('lbl_tgt_line')).props('outlined dense options-dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_amount'), value=500000, format='%.0f').props('outlined dense').classes('w-full')
            reason_in = ui.input(label=_loc('lbl_reason'), placeholder=_loc('transfer_reason_placeholder')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_tr() -> None:
                    if src_sel.value == tgt_sel.value:
                        ui.notify(_loc('notify_distinct_lines'), type='warning')
                        return
                    if not reason_in.value or not amt_in.value:
                        ui.notify(_loc('notify_fill_amount_reason'), type='warning')
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

    # --- Modal: Instant Budget Availability Checker (Vérificateur Express)
    def _open_quick_checker_modal(preselected_line_id: int | None = None) -> None:
        b = state['active_budget']
        if not b or not b.get('lines'):
            ui.notify(_loc('notify_no_active_lines'), type='warning')
            return

        lines = b.get('lines', [])
        avail_label = _loc('source_line_avail')
        line_lookup = {l['id']: l for l in lines}
        line_options = {}
        for l in lines:
            b_type = _tr_type(l.get('budget_type') or 'opex')
            avail = l.get('available_balance') if l.get('available_balance') is not None else l.get('amount', 0)
            acct_display = _tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))
            dept_name = _tr_dept(l.get('cost_center_name'), l.get('cost_center_name_en'))
            line_options[l['id']] = f"{acct_display} [{dept_name}] ({b_type}) — {avail_label} {w.money(avail, currency)} {currency}"

        init_line_id = preselected_line_id if (preselected_line_id and preselected_line_id in line_options) else (list(line_options.keys())[0] if line_options else None)

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-2xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2.5'):
                    with ui.element('div').classes('w-10 h-10 rounded-xl bg-teal-500/10 text-teal-800 flex items-center justify-center border border-teal-200'):
                        ui.icon('calculate').classes('text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('checker_modal_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('checker_modal_desc')).classes('text-xs text-slate-500')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            # Select line & amount
            with ui.column().classes('w-full gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200'):
                sel_line = ui.select(
                    line_options,
                    value=init_line_id,
                    label=_loc('checker_select_line'),
                ).props('outlined dense options-dense bg-white').classes('w-full')

                with ui.row().classes('w-full items-center gap-3 no-wrap'):
                    amt_in = ui.number(
                        label=_loc('checker_amount_label'),
                        value=500000,
                        min=1,
                        format='%.0f',
                    ).props('outlined dense bg-white').classes('flex-1')
                    ui.label(currency).classes('font-mono font-bold text-slate-700 text-sm')

            # Live calculation results container
            res_box = ui.column().classes('w-full gap-3')

            def _recompute() -> None:
                res_box.clear()
                cur_l = line_lookup.get(sel_line.value)
                if not cur_l:
                    return
                req = float(amt_in.value or 0)
                tot_b = float(cur_l.get('amount') or cur_l.get('revised_amount') or 0)
                avail_raw = cur_l.get('available_balance')
                avail = float(str(avail_raw).replace(',', '')) if avail_raw is not None else tot_b
                committed = float(cur_l.get('committed_amount') or 0)
                rem_after = avail - req
                pct_after = round(((tot_b - rem_after) / tot_b * 100), 1) if tot_b > 0 else 0
                warn_thresh = float(cur_l.get('warning_threshold_pct') or 80.0)
                is_breach = req > avail

                with res_box:
                    # Metric cards grid
                    with ui.grid(columns=4).classes('w-full gap-2.5 text-center'):
                        with ui.element('div').classes('p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs'):
                            ui.label('Dotation Votée' if lang() == 'fr' else 'Approved Budget').classes('text-[10px] uppercase font-bold text-slate-400')
                            ui.label(w.money(tot_b, currency)).classes('text-sm font-mono font-bold text-slate-800 truncate')
                        with ui.element('div').classes('p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs'):
                            ui.label('Déjà Engagé' if lang() == 'fr' else 'Committed').classes('text-[10px] uppercase font-bold text-amber-600')
                            ui.label(w.money(committed, currency)).classes('text-sm font-mono font-bold text-amber-800 truncate')
                        with ui.element('div').classes('p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs'):
                            ui.label('Disponible Net' if lang() == 'fr' else 'Available Now').classes('text-[10px] uppercase font-bold text-teal-600')
                            ui.label(w.money(avail, currency)).classes('text-sm font-mono font-bold text-teal-800 truncate')
                        with ui.element('div').classes(f"p-2.5 rounded-xl border shadow-2xs {'bg-rose-50 border-rose-200' if is_breach else 'bg-emerald-50 border-emerald-200'}"):
                            ui.label('Après Dépense' if lang() == 'fr' else 'After Expense').classes(f"text-[10px] uppercase font-bold {'text-rose-600' if is_breach else 'text-emerald-700'}")
                            ui.label(w.money(rem_after, currency)).classes(f"text-sm font-mono font-extrabold {'text-rose-700' if is_breach else 'text-emerald-800'} truncate")

                    # Verdict Box
                    if is_breach:
                        deficit = req - avail
                        with ui.element('div').classes('w-full p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col gap-1.5'):
                            with ui.row().classes('items-center gap-2'):
                                ui.icon('error').classes('text-rose-600 text-xl')
                                ui.label(_loc('checker_status_blocked')).classes('text-sm font-bold text-rose-800')
                            ui.label(f"{'Déficit constaté' if lang() == 'fr' else 'Deficit'}: {w.money(deficit, currency)} {currency}. {'Le contrôle AVC bloque les dépassements budgétaires. Vous pouvez effectuer un virement pour abonder cette ligne.' if lang() == 'fr' else 'Availability control blocks overruns. You can initiate a credit transfer to fund this line.'}").classes('text-xs text-rose-700')
                    elif pct_after >= warn_thresh:
                        with ui.element('div').classes('w-full p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-1.5'):
                            with ui.row().classes('items-center gap-2'):
                                ui.icon('warning').classes('text-amber-600 text-xl')
                                ui.label(_loc('checker_status_warning')).classes('text-sm font-bold text-amber-800')
                            ui.label(f"{'Cette dépense portera la consommation à' if lang() == 'fr' else 'This expense will bring consumption to'} {pct_after}% ({'seuil d’alerte' if lang() == 'fr' else 'threshold'}: {warn_thresh}%).").classes('text-xs text-amber-700')
                    else:
                        with ui.element('div').classes('w-full p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col gap-1.5'):
                            with ui.row().classes('items-center gap-2'):
                                ui.icon('check_circle').classes('text-emerald-600 text-xl')
                                ui.label(_loc('checker_status_approved')).classes('text-sm font-bold text-emerald-800')
                            ui.label(f"{'Solde restant' if lang() == 'fr' else 'Remaining balance'}: {w.money(rem_after, currency)} {currency} ({pct_after}% {'consommé' if lang() == 'fr' else 'consumed'}).").classes('text-xs text-emerald-700')

            sel_line.on_value_change(lambda _e: _recompute())
            amt_in.on_value_change(lambda _e: _recompute())
            _recompute()

            # Footer actions
            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-1'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                with ui.row().classes('items-center gap-2'):
                    async def _proceed_to_comm():
                        lid = sel_line.value
                        amt = float(amt_in.value or 0)
                        dlg.close()
                        await _open_new_comm_modal(initial_line_id=lid, initial_amount=amt)

                    def _proceed_to_transfer():
                        lid = sel_line.value
                        dlg.close()
                        _open_new_transfer_modal(initial_target_line_id=lid)

                    ui.button(
                        _loc('checker_btn_request_transfer'),
                        icon='swap_horiz',
                        on_click=_proceed_to_transfer,
                    ).props('outline color=purple size=sm')

                    ui.button(
                        _loc('checker_btn_commit_now'),
                        icon='bolt',
                        on_click=_proceed_to_comm,
                    ).props('unelevated color=teal size=sm')

        dlg.open()

    # --- Modal: Add Budget Line
    def _open_add_line_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify(_loc('notify_select_budget_first'), type='warning')
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

        curve_opts = {
            'equal_quarterly': _loc('curve_equal'),
            'even_monthly': _loc('curve_monthly'),
            'front_loaded': _loc('curve_front'),
            'back_loaded': _loc('curve_back'),
            'custom': _loc('curve_custom'),
        }

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-xl p-6 gap-4'):
            ui.label(_loc('dialog_line_title')).classes('text-lg font-bold text-slate-800')

            acct_sel = ui.select(acct_opts, value=list(acct_opts.keys())[0] if acct_opts else None, label=_loc('col_account')).props('outlined dense options-dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                type_sel = ui.select({'opex': _loc('type_opex'), 'capex': _loc('type_capex'), 'maintenance': _loc('type_maint'), 'revenue': _loc('type_rev')}, value='opex', label=_loc('col_type')).props('outlined dense').classes('flex-1')
                ctrl_sel = ui.select({'strict_block': _loc('ctrl_strict'), 'warning': _loc('ctrl_warning')}, value='strict_block', label=_loc('lbl_ctrl_mode')).props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                cc_sel = ui.select(cc_opts, value=0, label=_loc('col_dept')).props('outlined dense options-dense').classes('flex-1')
                prog_sel = ui.select(prog_opts, value=0, label=_loc('col_program')).props('outlined dense options-dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                amt_in = ui.number(label=_loc('lbl_amount'), value=4000000, format='%.0f').props('outlined dense').classes('flex-1')
                curve_sel = ui.select(curve_opts, value='equal_quarterly', label=_loc('lbl_curve')).props('outlined dense options-dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                warn_thresh_in = ui.number(label=_loc('lbl_warning_threshold'), value=80.0, format='%.1f', min=1, max=100).props('outlined dense').classes('w-48')
                notes_in = ui.input(label=_loc('col_notes')).props('outlined dense').classes('flex-1')

            # Periodic Phasing Inputs (T1–T4)
            ui.label(_loc('view_quarterly')).classes('text-xs font-bold uppercase tracking-wider text-slate-600 mt-1')
            with ui.row().classes('w-full gap-2 no-wrap bg-slate-50 p-2.5 rounded-lg border border-slate-200'):
                q1_in = ui.number(label=_loc('col_q1'), value=1000000, format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q2_in = ui.number(label=_loc('col_q2'), value=1000000, format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q3_in = ui.number(label=_loc('col_q3'), value=1000000, format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q4_in = ui.number(label=_loc('col_q4'), value=1000000, format='%.0f').props('outlined dense bg-white').classes('flex-1')

            def _recalc_q() -> None:
                if curve_sel.value != 'custom':
                    q1, q2, q3, q4 = _calc_spread_quarters(float(amt_in.value or 0), curve_sel.value)
                    q1_in.set_value(q1)
                    q2_in.set_value(q2)
                    q3_in.set_value(q3)
                    q4_in.set_value(q4)

            amt_in.on_value_change(lambda _: _recalc_q())
            curve_sel.on_value_change(lambda _: _recalc_q())

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_line() -> None:
                    if not acct_sel.value or not amt_in.value:
                        ui.notify(_loc('notify_select_account_amount'), type='warning')
                        return
                    payload = {
                        'accountId': acct_sel.value,
                        'budgetType': type_sel.value,
                        'costCenterId': cc_sel.value if cc_sel.value else None,
                        'programId': prog_sel.value if prog_sel.value else None,
                        'amount': float(amt_in.value),
                        'spreadCurve': curve_sel.value,
                        'warningThresholdPct': float(warn_thresh_in.value or 80.0),
                        'q1Amount': float(q1_in.value or 0),
                        'q2Amount': float(q2_in.value or 0),
                        'q3Amount': float(q3_in.value or 0),
                        'q4Amount': float(q4_in.value or 0),
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

    # --- Modal: Edit Budget Line & Phasing
    def _open_edit_line_modal(line: dict[str, Any]) -> None:
        b = state['active_budget']
        if not b or not line:
            return

        curve_opts = {
            'equal_quarterly': _loc('curve_equal'),
            'even_monthly': _loc('curve_monthly'),
            'front_loaded': _loc('curve_front'),
            'back_loaded': _loc('curve_back'),
            'custom': _loc('curve_custom'),
        }

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-xl p-6 gap-4'):
            ui.label(_loc('dialog_edit_line_title')).classes('text-lg font-bold text-slate-800')

            acct_str = _tr_account(line.get('account_code'), line.get('account_name'), line.get('account_name_en'))
            dept_str = _tr_dept(line.get('cost_center_name'), line.get('cost_center_name_en'))
            with ui.row().classes('w-full p-2.5 rounded bg-slate-50 border border-slate-200 justify-between items-center'):
                ui.label(acct_str).classes('text-xs font-bold text-slate-800')
                ui.label(dept_str).classes('text-xs text-slate-500 font-semibold')

            cur_amt = float(line.get('revised_amount') or line.get('amount') or 0)
            cur_curve = line.get('spread_curve') or 'equal_quarterly'
            cur_warn = float(line.get('warning_threshold_pct') or 80.0)

            with ui.row().classes('w-full gap-3 no-wrap'):
                amt_in = ui.number(label=_loc('col_budget'), value=cur_amt, format='%.0f').props('outlined dense').classes('flex-1')
                curve_sel = ui.select(curve_opts, value=cur_curve, label=_loc('lbl_curve')).props('outlined dense options-dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                warn_thresh_in = ui.number(label=_loc('lbl_warning_threshold'), value=cur_warn, format='%.1f', min=1, max=100).props('outlined dense').classes('w-48')
                notes_in = ui.input(label=_loc('col_notes'), value=line.get('notes') or '').props('outlined dense').classes('flex-1')

            # Periodic Phasing Inputs (T1–T4)
            ui.label(_loc('view_quarterly')).classes('text-xs font-bold uppercase tracking-wider text-slate-600 mt-1')
            with ui.row().classes('w-full gap-2 no-wrap bg-slate-50 p-2.5 rounded-lg border border-slate-200'):
                q1_in = ui.number(label=_loc('col_q1'), value=float(line.get('q1_amount') or 0), format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q2_in = ui.number(label=_loc('col_q2'), value=float(line.get('q2_amount') or 0), format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q3_in = ui.number(label=_loc('col_q3'), value=float(line.get('q3_amount') or 0), format='%.0f').props('outlined dense bg-white').classes('flex-1')
                q4_in = ui.number(label=_loc('col_q4'), value=float(line.get('q4_amount') or 0), format='%.0f').props('outlined dense bg-white').classes('flex-1')

            def _recalc_edit_q() -> None:
                if curve_sel.value != 'custom':
                    q1, q2, q3, q4 = _calc_spread_quarters(float(amt_in.value or 0), curve_sel.value)
                    q1_in.set_value(q1)
                    q2_in.set_value(q2)
                    q3_in.set_value(q3)
                    q4_in.set_value(q4)

            amt_in.on_value_change(lambda _: _recalc_edit_q())
            curve_sel.on_value_change(lambda _: _recalc_edit_q())

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_edit_line() -> None:
                    payload = {
                        'amount': float(amt_in.value or 0),
                        'spreadCurve': curve_sel.value,
                        'warningThresholdPct': float(warn_thresh_in.value or 80.0),
                        'q1Amount': float(q1_in.value or 0),
                        'q2Amount': float(q2_in.value or 0),
                        'q3Amount': float(q3_in.value or 0),
                        'q4Amount': float(q4_in.value or 0),
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.patch(f"/budgets/{b['id']}/lines/{line['id']}", payload))
                    if res and res.get('ok'):
                        ui.notify(_loc('msg_line_updated'), type='positive')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_save_line'), icon='save', on_click=submit_edit_line).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Availability Control (AVC) & Threshold Settings
    def _open_avc_settings_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify(_loc('notify_select_active_budget'), type='warning')
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            ui.label(_loc('dialog_avc_title')).classes('text-lg font-bold text-slate-800')
            ui.label(_loc('hint_avc_desc')).classes('text-xs text-slate-500 leading-relaxed')

            warn_in = ui.number(
                label=_loc('lbl_warning_threshold'),
                value=float(b.get('warning_threshold_pct') or 80.0),
                min=1,
                max=150,
                format='%.1f'
            ).props('outlined dense').classes('w-full')

            block_in = ui.number(
                label=_loc('lbl_block_threshold'),
                value=float(b.get('block_threshold_pct') or 100.0),
                min=1,
                max=200,
                format='%.1f'
            ).props('outlined dense').classes('w-full')

            notes_in = ui.input(
                label=_loc('notes_label'),
                value=b.get('notes') or ''
            ).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_avc() -> None:
                    payload = {
                        'warningThresholdPct': float(warn_in.value or 80.0),
                        'blockThresholdPct': float(block_in.value or 100.0),
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.patch(f"/budgets/{b['id']}", payload))
                    if res and res.get('ok'):
                        ui.notify(_loc('msg_budget_updated'), type='positive')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_save_line'), icon='save', on_click=submit_avc).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Batch Periodic Re-Spread
    def _open_respread_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify(_loc('notify_select_active_budget'), type='warning')
            return

        curve_opts = {
            'equal_quarterly': _loc('curve_equal'),
            'even_monthly': _loc('curve_monthly'),
            'front_loaded': _loc('curve_front'),
            'back_loaded': _loc('curve_back'),
        }

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            ui.label(_loc('dialog_respread_title')).classes('text-lg font-bold text-slate-800')
            ui.label(_loc('hint_respread_desc')).classes('text-xs text-slate-500 leading-relaxed')

            curve_sel = ui.select(curve_opts, value='equal_quarterly', label=_loc('lbl_curve')).props('outlined dense options-dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_respread() -> None:
                    payload = {'spreadCurve': curve_sel.value}
                    res = await api.safe(api.post(f"/budgets/{b['id']}/re-spread", payload))
                    if res and res.get('success'):
                        c_name = _tr_curve(curve_sel.value)
                        ui.notify(_loc('msg_respread_success', curve=c_name), type='positive')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_respread'), icon='timeline', on_click=submit_respread).props('unelevated color=primary')

        dlg.open()

    # --- Modal: New Budget Master Plan
    def _open_new_budget_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            ui.label(_loc('dialog_budget_title')).classes('text-lg font-bold text-slate-800')

            code_in = ui.input(label=_loc('lbl_code'), value='BUD-2026-REV').props('outlined dense').classes('w-full')
            name_in = ui.input(label=_loc('lbl_name'), value=_loc('default_budget_name')).props('outlined dense').classes('w-full')
            notes_in = ui.input(label=_loc('notes_label')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def submit_budget() -> None:
                    if not code_in.value or not name_in.value:
                        ui.notify(_loc('notify_fill_code_name'), type='warning')
                        return
                    payload = {
                        'fiscalYearId': state['fy_id'],
                        'code': code_in.value.strip(),
                        'name': name_in.value.strip(),
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.post('/budgets', payload))
                    if res and res.get('id'):
                        ui.notify(_loc('notify_budget_created'), type='positive')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_create_plan'), icon='add', on_click=submit_budget).props('unelevated color=primary')

        dlg.open()

    # --- Modal: Carryforward Unconsumed Budget
    async def _open_carryforward_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify(_loc('notify_no_active_budget_carry'), type='warning')
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
                    value=_loc('default_carryforward_reason', fy=b.get('fiscal_year_code', ''))
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
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _submit_carryforward() -> None:
                        selected = [
                            {'lineId': c['lineId'], 'amount': float(c['input'].value)}
                            for c in line_controls
                            if c['checkbox'].value and float(c['input'].value or 0) > 0
                        ]
                        if not selected:
                            ui.notify(_loc('notify_select_line_gt_zero'), type='warning')
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

    # --- Phase 3 Modals: Derivations & Secondary Cost Allocations ------------
    def _open_derivation_rules_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-5xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between no-wrap border-b border-slate-200 pb-3'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_derivations_title')).classes('text-lg font-bold text-slate-800')
                    ui.label(_loc('derivations_desc')).classes('text-xs text-slate-500 max-w-3xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            # Section: New Rule Creation
            with ui.expansion('➕ ' + _loc('btn_add_rule'), icon='playlist_add').classes('w-full bg-slate-50 rounded-lg border border-slate-200'):
                with ui.row().classes('w-full gap-3 p-3 items-center'):
                    r_code = ui.input(label=_loc('lbl_rule_code'), value='R-6042-ROLLUP').props('outlined dense bg-white').classes('w-44')
                    r_name = ui.input(label=_loc('lbl_rule_name'), value='Rollup Medical Supplies Sub-Accounts').props('outlined dense bg-white').classes('flex-1')
                    r_patt = ui.input(label=_loc('lbl_pattern'), value='6042*').props('outlined dense bg-white').classes('w-36')

                    acct_opts = {a['id']: f"{a.get('code')} — {a.get('name')}" for a in budgetable_accounts}
                    default_acc_id = list(acct_opts.keys())[0] if acct_opts else None
                    target_acc_sel = ui.select(acct_opts, value=default_acc_id, label=_loc('lbl_target_account')).props('outlined dense bg-white options-dense').classes('w-72')
                    r_prio = ui.number(label=_loc('lbl_priority'), value=10, min=1, max=999, format='%.0f').props('outlined dense bg-white').classes('w-24')

                    async def _create_rule() -> None:
                        if not r_code.value or not r_name.value or not r_patt.value or not target_acc_sel.value:
                            ui.notify(_loc('notify_fill_rule_fields'), type='warning')
                            return
                        payload = {
                            'ruleCode': r_code.value.strip(),
                            'ruleName': r_name.value.strip(),
                            'dimensionType': 'account',
                            'sourcePattern': r_patt.value.strip(),
                            'targetAccountId': int(target_acc_sel.value),
                            'priority': int(r_prio.value or 10),
                        }
                        res = await api.safe(api.post('/budget-derivations', payload))
                        if res and res.get('id'):
                            ui.notify(_loc('msg_rule_added'), type='positive')
                            await reload_data()
                            _refresh_rules_tbl()

                    ui.button(_loc('btn_add_rule'), icon='add', on_click=_create_rule).props('unelevated color=primary')

            # Section: Existing Rules Table
            rules_container = ui.column().classes('w-full gap-2')

            def _refresh_rules_tbl() -> None:
                rules_container.clear()
                current_rules = state.get('derivations', [])
                with rules_container:
                    if not current_rules:
                        ui.label(_loc('lbl_no_rules_configured')).classes('text-xs text-slate-400 italic p-3')
                        return

                    tbl_rows = []
                    for r in current_rules:
                        tbl_rows.append({
                            'id': r.get('id'),
                            'code': r.get('rule_code'),
                            'name': r.get('rule_name'),
                            'dimension': r.get('dimension_type', 'account'),
                            'pattern': r.get('source_pattern'),
                            'target': f"{r.get('target_account_code', '')} — {r.get('target_account_name', '')}",
                            'priority': r.get('priority', 10),
                            'status': 'Active' if r.get('is_active') else 'Inactive',
                        })

                    cols = [
                        {'name': 'code', 'label': _loc('lbl_rule_code'), 'field': 'code', 'align': 'left', 'sortable': True},
                        {'name': 'name', 'label': _loc('lbl_rule_name'), 'field': 'name', 'align': 'left'},
                        {'name': 'dimension', 'label': _loc('lbl_dim_type'), 'field': 'dimension', 'align': 'center'},
                        {'name': 'pattern', 'label': _loc('lbl_pattern'), 'field': 'pattern', 'align': 'center'},
                        {'name': 'target', 'label': _loc('lbl_target_account'), 'field': 'target', 'align': 'left'},
                        {'name': 'priority', 'label': _loc('lbl_priority'), 'field': 'priority', 'align': 'right'},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                    ]
                    r_tbl = ui.table(columns=cols, rows=tbl_rows, pagination=10).classes('w-full lc-table')
                    r_tbl.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <q-btn flat dense round icon="delete" color="negative" size="sm" @click="$parent.$emit('delete_rule', props.row.id)" />
                        </q-td>
                    ''')

                    async def _del_rule(rule_id: int) -> None:
                        await api.safe(api.delete(f'/budget-derivations/{rule_id}'))
                        ui.notify(_loc('notify_rule_deleted'), type='info')
                        await reload_data()
                        _refresh_rules_tbl()

                    r_tbl.on('delete_rule', lambda e: _del_rule(int(e.args)))

            _refresh_rules_tbl()

            with ui.row().classes('w-full justify-end border-t border-slate-200 pt-3'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

        dlg.open()

    def _open_new_cycle_modal() -> None:
        cc_opts = {cc['id']: f"{cc.get('code')} — {cc.get('name')}" for cc in cost_centers}
        if len(cost_centers) < 2:
            ui.notify(_loc('notify_two_cc_required'), type='warning')
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-3xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between no-wrap border-b border-slate-200 pb-3'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_new_cycle_title')).classes('text-lg font-bold text-slate-800')
                    ui.label(_loc('alloc_intro_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            with ui.row().classes('w-full gap-3'):
                c_code = ui.input(label=_loc('col_cycle_code'), value='CYC-ADMIN-POOL').props('outlined dense').classes('w-48')
                c_name = ui.input(label=_loc('col_cycle_name'), value=_loc('val_default_cycle_name')).props('outlined dense').classes('flex-1')
                c_type = ui.select(
                    {'assessment': _loc('type_assessment'), 'distribution': _loc('type_distribution')},
                    value='assessment',
                    label=_loc('col_cycle_type')
                ).props('outlined dense options-dense').classes('w-64')

            desc_in = ui.input(label=_loc('lbl_desc_justification'), value=_loc('val_default_cycle_desc')).props('outlined dense').classes('w-full')

            ui.label(_loc('lbl_segment_config')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-2')

            sender_cc = ui.select(cc_opts, value=cost_centers[0]['id'], label=_loc('lbl_sender_cc')).props('outlined dense options-dense bg-slate-50').classes('w-full')

            # 2 target receivers
            rec_1_val = cost_centers[1]['id'] if len(cost_centers) > 1 else cost_centers[0]['id']
            rec_2_val = cost_centers[2]['id'] if len(cost_centers) > 2 else rec_1_val

            with ui.row().classes('w-full gap-3 items-center'):
                tgt_1_cc = ui.select(cc_opts, value=rec_1_val, label=f"{_loc('lbl_receiver_cc')} 1").props('outlined dense options-dense').classes('flex-1')
                tgt_1_pct = ui.number(label=_loc('lbl_weight_pct'), value=60.0, min=0, max=100, format='%.1f').props('outlined dense').classes('w-32')

            with ui.row().classes('w-full gap-3 items-center'):
                tgt_2_cc = ui.select(cc_opts, value=rec_2_val, label=f"{_loc('lbl_receiver_cc')} 2").props('outlined dense options-dense').classes('flex-1')
                tgt_2_pct = ui.number(label=_loc('lbl_weight_pct'), value=40.0, min=0, max=100, format='%.1f').props('outlined dense').classes('w-32')

            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-2'):
                ui.label(_loc('lbl_total_share_balanced')).classes('text-xs font-bold text-emerald-700')
                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _submit_cycle() -> None:
                        if not c_code.value or not c_name.value:
                            ui.notify(_loc('notify_fill_cycle_fields'), type='warning')
                            return
                        p1 = float(tgt_1_pct.value or 0)
                        p2 = float(tgt_2_pct.value or 0)
                        if abs((p1 + p2) - 100.0) > 0.01:
                            ui.notify(_loc('notify_weights_100', sum_pct=p1+p2), type='warning')
                            return

                        payload = {
                            'code': c_code.value.strip().upper(),
                            'name': c_name.value.strip(),
                            'cycleType': c_type.value,
                            'description': desc_in.value or None,
                            'segments': [
                                {
                                    'segmentName': f"Déversement {c_name.value.strip()}",
                                    'senderCostCenterId': int(sender_cc.value),
                                    'method': 'percentage',
                                    'targets': [
                                        {'receiverCostCenterId': int(tgt_1_cc.value), 'weightPct': p1, 'fixedAmount': 0},
                                        {'receiverCostCenterId': int(tgt_2_cc.value), 'weightPct': p2, 'fixedAmount': 0},
                                    ]
                                }
                            ]
                        }
                        res = await api.safe(api.post('/cost-allocations/cycles', payload))
                        if res and res.get('id'):
                            ui.notify(_loc('msg_cycle_created'), type='positive')
                            dlg.close()
                            await reload_data()
                            _refresh_all()

                    ui.button(_loc('btn_new_cycle'), icon='hub', on_click=_submit_cycle).props('unelevated color=primary')

        dlg.open()

    def _open_run_allocation_modal(cycle_id: int | None = None) -> None:
        cycles = state.get('allocation_cycles', [])
        if not cycles:
            ui.notify(_loc('notify_no_cycles_defined'), type='warning')
            return

        c_opts = {c['id']: f"{c.get('code')} — {c.get('name')}" for c in cycles}
        default_c_id = cycle_id if cycle_id and cycle_id in c_opts else list(c_opts.keys())[0]

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-4xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between no-wrap border-b border-slate-200 pb-3'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_run_alloc_title')).classes('text-lg font-bold text-slate-800')
                    ui.label(_loc('alloc_intro_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            with ui.row().classes('w-full gap-3 items-center bg-slate-50 p-3 rounded-lg border border-slate-200'):
                cycle_sel = ui.select(c_opts, value=default_c_id, label=_loc('col_cycle_code')).props('outlined dense options-dense bg-white').classes('w-72')
                pool_in = ui.number(label=_loc('lbl_override_pool'), value=5000000, min=0, format='%.0f').props('outlined dense bg-white').classes('w-56')

                async def _run_sim() -> None:
                    payload = {
                        'cycleId': int(cycle_sel.value),
                        'fiscalYearId': state['fy_id'],
                        'poolAmountOverride': float(pool_in.value or 0),
                    }
                    sim_res = await api.safe(api.post('/cost-allocations/simulate', payload))
                    if sim_res:
                        _render_sim_result(sim_res)

                ui.button(_loc('btn_simulate'), icon='calculate', on_click=_run_sim).props('outline color=primary')

            # Live Simulation breakdown display container
            sim_container = ui.column().classes('w-full gap-2')

            def _render_sim_result(data: dict) -> None:
                sim_container.clear()
                with sim_container:
                    with ui.row().classes('w-full items-center justify-between bg-emerald-50 p-3 rounded-lg border border-emerald-200'):
                        with ui.column().classes('gap-0'):
                            ui.label(f"Cycle: {data.get('cycleName')} ({data.get('cycleCode')})").classes('text-sm font-bold text-emerald-900')
                            ui.label(f"Type: {data.get('cycleType')} | Method: Percentage Weight Distribution").classes('text-xs text-emerald-700')
                        ui.badge(f"Total: {w.money(data.get('grandTotalAllocated', 0), currency)}", color='positive').props('text-color=white class=text-sm font-mono')

                    for seg in data.get('segments', []):
                        with ui.card().classes('w-full p-3 bg-slate-50 border border-slate-200 gap-2'):
                            with ui.row().classes('w-full justify-between items-center'):
                                ui.label(f"Segment: {seg.get('segmentName')} (Sender CC: {seg.get('senderCostCenterCode')} - {seg.get('senderCostCenterName')})").classes('text-xs font-bold text-slate-800')
                                ui.label(f"Pool: {w.money(seg.get('senderPool', 0), currency)}").classes('text-xs font-mono font-bold text-slate-600')

                            # Target lines table
                            t_rows = []
                            for t in seg.get('targets', []):
                                t_rows.append({
                                    'receiver': f"{t.get('receiverCostCenterCode')} — {t.get('receiverCostCenterName')}",
                                    'weight': f"{t.get('weightPct')}%",
                                    'amount': w.money(t.get('allocatedAmount', 0), currency),
                                })
                            cols = [
                                {'name': 'receiver', 'label': _loc('lbl_receiver_cc'), 'field': 'receiver', 'align': 'left'},
                                {'name': 'weight', 'label': _loc('lbl_weight_pct'), 'field': 'weight', 'align': 'right'},
                                {'name': 'amount', 'label': _loc('col_allocated_amt'), 'field': 'amount', 'align': 'right'},
                            ]
                            ui.table(columns=cols, rows=t_rows).classes('w-full lc-table')

            # Initial simulation render
            ui.timer(0.2, lambda: _run_sim(), once=True)

            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-2'):
                ui.label(_loc('lbl_alloc_creates_je')).classes('text-xs text-slate-500 italic')
                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _execute_alloc() -> None:
                        payload = {
                            'cycleId': int(cycle_sel.value),
                            'fiscalYearId': state['fy_id'],
                            'poolAmountOverride': float(pool_in.value or 0),
                            'notes': f"Execution cycle {cycle_sel.value} for FY {state['fy_id']}",
                        }
                        res = await api.safe(api.post('/cost-allocations/execute', payload))
                        if res and res.get('runNumber'):
                            msg = _loc('msg_run_executed', num=res.get('runNumber'), je=f"#{res.get('journalEntryId')}")
                            ui.notify(msg, type='positive', position='top')
                            dlg.close()
                            await reload_data()
                            _refresh_all()

                    ui.button(_loc('btn_execute_post'), icon='bolt', on_click=_execute_alloc).props('unelevated color=positive')

        dlg.open()

    # --- Phase 4 Modals: Service Certification, PO Rollover & PTBA Import ----

    def _open_certification_modal(comm_id: int) -> None:
        comm = next((c for c in state['commitments'] if c.get('id') == comm_id), None)
        if not comm:
            ui.notify(_loc('notify_comm_not_found'), type='warning')
            return

        tot_amt = float(comm.get('amount') or 0)
        cert_already = float(comm.get('certified_amount') or 0)
        max_cert = max(0.0, tot_amt - cert_already)

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center gap-2 border-b border-slate-200 pb-3 w-full'):
                ui.icon('verified').classes('text-teal-600 text-2xl')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_certify_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('certs_desc')).classes('text-xs text-slate-500 max-w-md')

            with ui.column().classes('w-full bg-slate-50 p-3 rounded-lg border border-slate-200 gap-1'):
                with ui.row().classes('w-full justify-between items-center text-xs'):
                    ui.label(f"{comm.get('commitment_number')} — {comm.get('vendor_name') or 'Fournisseur'}").classes('font-bold text-slate-800')
                    ui.label(f"Total: {w.money(tot_amt, currency)}").classes('font-mono font-semibold')
                with ui.row().classes('w-full justify-between items-center text-xs text-slate-600'):
                    ui.label(f"{_loc('lbl_already_certified_colon')} {w.money(cert_already, currency)}").classes('font-mono')
                    ui.label(f"{_loc('lbl_solde_to_certify_colon')} {w.money(max_cert, currency)}").classes('font-mono font-bold text-teal-800')

            today_str = datetime.date.today().isoformat()
            with ui.row().classes('w-full gap-3 no-wrap'):
                date_in = ui.input(label=_loc('lbl_cert_date'), value=today_str).props('outlined dense type=date').classes('flex-1')
                amt_in = ui.number(label=_loc('lbl_cert_amount'), value=max_cert, min=1, max=max_cert, format='%.0f').props('outlined dense').classes('flex-1')

            inspector_in = ui.input(label=_loc('lbl_inspector'), value=_loc('val_default_inspector')).props('outlined dense').classes('w-full')

            conf_opts = {
                'full_conformity': _loc('conf_full'),
                'minor_reserves': _loc('conf_minor'),
                'major_non_conformity': _loc('conf_major'),
            }
            conf_sel = ui.select(conf_opts, value='full_conformity', label=_loc('lbl_conformity')).props('outlined dense options-dense').classes('w-full')
            obs_in = ui.textarea(label=_loc('lbl_observations'), placeholder=_loc('placeholder_cert_obs')).props('outlined dense rows=2').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 border-t border-slate-200 pt-3 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _submit_cert() -> None:
                    if not inspector_in.value or not amt_in.value:
                        ui.notify(_loc('notify_provide_inspector_amt'), type='warning')
                        return
                    if float(amt_in.value or 0) > max_cert:
                        ui.notify(_loc('notify_cert_exceeds_bal', bal=w.money(max_cert, currency)), type='warning')
                        return

                    payload = {
                        'commitmentId': comm_id,
                        'certificateDate': date_in.value or today_str,
                        'inspectorName': inspector_in.value.strip(),
                        'certifiedAmount': float(amt_in.value or 0),
                        'conformityRating': conf_sel.value,
                        'observations': obs_in.value or None,
                        'status': 'certified',
                    }
                    res = await api.safe(api.post('/budget-certifications', payload))
                    if res and res.get('certificateNumber'):
                        ui.notify(_loc('msg_cert_success', cert=res.get('certificateNumber')), type='positive', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_certify'), icon='verified', on_click=_submit_cert).props('unelevated color=teal')

        dlg.open()

    def _open_certifications_list_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-4xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('verified').classes('text-teal-600 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_certs_list_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('certs_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            cert_rows = []
            for cert in state.get('certifications', []):
                conf_raw = cert.get('conformity_rating', 'full_conformity')
                conf_str = _loc('conf_full') if conf_raw == 'full_conformity' else (_loc('conf_minor') if conf_raw == 'minor_reserves' else _loc('conf_major'))
                cert_rows.append({
                    'number': cert.get('certificate_number'),
                    'date': str(cert.get('certificate_date') or '')[:10],
                    'commitment': f"{cert.get('commitment_number', '')} — {cert.get('vendor_name') or ''}",
                    'inspector': cert.get('inspector_name') or '—',
                    'amount': w.money(cert.get('certified_amount', 0), currency),
                    'conformity': conf_str,
                    'status': _tr_status(cert.get('status')),
                    'obs': cert.get('observations') or '—',
                })

            cols = [
                {'name': 'number', 'label': _loc('col_ref'), 'field': 'number', 'align': 'left', 'sortable': True},
                {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center'},
                {'name': 'commitment', 'label': _loc('col_desc'), 'field': 'commitment', 'align': 'left'},
                {'name': 'amount', 'label': _loc('lbl_cert_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                {'name': 'conformity', 'label': _loc('lbl_conformity'), 'field': 'conformity', 'align': 'center'},
                {'name': 'inspector', 'label': _loc('lbl_inspector'), 'field': 'inspector', 'align': 'left'},
                {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
            ]

            tbl = ui.table(columns=cols, rows=cert_rows, pagination=10).classes('w-full lc-table')
            tbl.add_slot('body-cell-amount', '''
                <q-td :props="props" class="font-mono font-bold text-teal-800">
                    {{ props.value }}
                </q-td>
            ''')
            tbl.add_slot('body-cell-conformity', '''
                <q-td :props="props">
                    <q-badge color="teal-8" outline>{{ props.value }}</q-badge>
                </q-td>
            ''')

            with ui.row().classes('w-full justify-end border-t border-slate-200 pt-3'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

        dlg.open()

    async def _open_po_rollover_modal() -> None:
        open_resp = await api.safe(api.get('/budget-commitments/open-for-rollover', fiscalYearId=state['fy_id']), default={'rows': []})
        open_data = open_resp.get('rows', []) if isinstance(open_resp, dict) else (open_resp or [])
        if not open_data:
            ui.notify(_loc('notify_no_open_comm_found'), type='info')
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-3xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('assignment_return').classes('text-indigo-600 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_rollover_po_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('rollover_po_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            target_fy_opts = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years if fy['id'] != state['fy_id']}
            if not target_fy_opts:
                target_fy_opts = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years}

            init_target_fy = list(target_fy_opts.keys())[0]

            with ui.row().classes('w-full gap-3'):
                target_fy_sel = ui.select(target_fy_opts, value=init_target_fy, label=_loc('lbl_target_fy')).props('outlined dense options-dense bg-slate-50').classes('w-72')
                target_budget_sel = ui.select({}, label=_loc('lbl_target_budget')).props('outlined dense options-dense').classes('flex-1')

            async def _load_target_budgets(fy_id: int) -> None:
                b_resp = await api.safe(api.get('/budgets', fiscalYearId=fy_id), default={'rows': []})
                b_list = b_resp.get('rows', [])
                opts = {b_item['id']: f"{b_item['code']} — {_tr_val(b_item.get('name'))}" for b_item in b_list}
                target_budget_sel.options = opts
                target_budget_sel.value = list(opts.keys())[0] if opts else None

            await _load_target_budgets(init_target_fy)
            target_fy_sel.on_value_change(lambda e: _load_target_budgets(e.value))

            ui.label(_loc('lbl_open_comm_avail_rollover')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-2')

            selected_comm_ids: set[int] = {c['commitment_id'] for c in open_data}
            lines_container = ui.column().classes('w-full max-h-60 overflow-y-auto border border-slate-200 rounded-lg p-2 gap-1 bg-slate-50')

            with lines_container:
                for c in open_data:
                    c_id = c['commitment_id']
                    with ui.row().classes('w-full items-center justify-between p-2 rounded bg-white border border-slate-100 no-wrap'):
                        with ui.row().classes('items-center gap-2'):
                            cb = ui.checkbox(value=True)
                            def _toggle(val: bool, cid: int = c_id) -> None:
                                if val:
                                    selected_comm_ids.add(cid)
                                else:
                                    selected_comm_ids.discard(cid)
                            cb.on_value_change(lambda e, cid=c_id: _toggle(e.value, cid))
                            with ui.column().classes('gap-0'):
                                ui.label(f"{c.get('commitment_number')} — {c.get('vendor_name') or 'Fournisseur'}").classes('text-xs font-bold text-slate-800')
                                ui.label(f"{c.get('account_code')} | {c.get('cost_center_code')} | {c.get('description') or ''}").classes('text-[11px] text-slate-500 truncate max-w-md')
                        with ui.column().classes('items-end gap-0'):
                            ui.label(w.money(c.get('open_unliquidated_amount', 0), currency)).classes('text-xs font-mono font-bold text-indigo-900')
                            ui.label(f"Certifié: {w.money(c.get('certified_amount', 0), currency)}").classes('text-[10px] text-slate-400 font-mono')

            notes_in = ui.input(label=_loc('notes_label'), value='Report contractuel des engagements fermes non soldés vers l’exercice suivant').props('outlined dense').classes('w-full mt-2')

            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-2'):
                ui.label(_loc('lbl_rollover_auto_creation')).classes('text-xs text-slate-500 italic')
                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _execute_rollover() -> None:
                        if not target_budget_sel.value:
                            ui.notify(_loc('notify_select_dest_budget'), type='warning')
                            return
                        if not selected_comm_ids:
                            ui.notify(_loc('notify_select_one_open_comm'), type='warning')
                            return

                        payload = {
                            'sourceFiscalYearId': state['fy_id'],
                            'targetFiscalYearId': target_fy_sel.value,
                            'targetBudgetId': target_budget_sel.value,
                            'sourceCommitmentIds': list(selected_comm_ids),
                            'notes': notes_in.value or None,
                        }
                        res = await api.safe(api.post('/budget-commitments/rollover', payload))
                        if res and res.get('success'):
                            msg = _loc('msg_rollover_success', count=res.get('count', 0), total=res.get('formattedTotal', 0))
                            ui.notify(msg, type='positive', position='top')
                            dlg.close()
                            await reload_data()
                            _refresh_all()

                    ui.button(_loc('btn_rollover_po'), icon='assignment_return', on_click=_execute_rollover).props('unelevated color=indigo')

        dlg.open()

    async def _open_ptba_modal() -> None:
        b = state['active_budget']
        if not b:
            ui.notify(_loc('notify_select_active_budget'), type='warning')
            return

        b_id = b['id']
        template_res = await api.safe(api.get(f'/budgets/{b_id}/ptba/template'), default={})

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-4xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('file_upload').classes('text-emerald-700 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(f"{_loc('dialog_ptba_title')} — {b.get('code')}").classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('ptba_desc')).classes('text-xs text-slate-500 max-w-2xl')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            ccs = template_res.get('availableCostCenters', [])
            sample_cc = ccs[0].get('code', 'ADM') if ccs else 'ADM'

            if lang == 'fr':
                n1 = "Fournitures de laboratoire et réactifs"
                n2 = "Sous-traitance et maintenance biomédicale"
                n3 = "Acquisition équipement d'imagerie médicale"
            else:
                n1 = "Laboratory supplies and reagents"
                n2 = "Subcontracting and biomedical maintenance"
                n3 = "Medical imaging equipment acquisition"

            sample_csv = f"""account_code,cost_center_code,program_code,budget_type,initial_amount,spread_curve,notes
604,{sample_cc},,opex,15000000,equal_quarterly,{n1}
611,{sample_cc},,opex,8000000,front_loaded,{n2}
215,{sample_cc},,capex,25000000,back_loaded,{n3}"""

            with ui.row().classes('w-full items-center justify-between bg-emerald-50 p-3 rounded-lg border border-emerald-200'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('lbl_ptba_std_cols')).classes('text-xs font-bold text-emerald-900')
                    ui.label('account_code, cost_center_code, program_code, budget_type, initial_amount, spread_curve, notes').classes('text-xs font-mono text-emerald-800')

                with ui.row().classes('items-center gap-2'):
                    def _download_sample() -> None:
                        ui.download(sample_csv.encode('utf-8'), f"PTBA_Template_{b.get('code')}.csv")
                        ui.notify(_loc('notify_template_downloaded'), type='positive', position='top')

                    def _clear_sample() -> None:
                        csv_in.value = ''
                        csv_in.update()

                    def _fill_sample() -> None:
                        csv_in.value = sample_csv
                        csv_in.update()
                        ui.notify(_loc('notify_sample_loaded'), type='positive', position='top')

                    ui.button(_loc('btn_download_template'), icon='download', on_click=_download_sample).props('flat color=positive dense')
                    ui.button(_loc('btn_clear'), icon='clear', on_click=_clear_sample).props('flat color=grey-8 dense')
                    ui.button(_loc('btn_ptba_sample'), icon='content_paste', on_click=_fill_sample).props('unelevated color=positive dense')

            csv_in = ui.textarea(label=_loc('lbl_csv_data'), value=sample_csv, placeholder=_loc('placeholder_csv_input')).props('outlined dense rows=8 font-mono text-xs').classes('w-full')

            update_chk = ui.checkbox(_loc('chk_update_existing'), value=True).classes('text-xs text-slate-700')

            with ui.row().classes('w-full justify-between items-center border-t border-slate-200 pt-3 mt-2'):
                ui.label(_loc('lbl_ptba_auto_spread')).classes('text-xs text-slate-500 italic')
                with ui.row().classes('gap-2'):
                    ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                    async def _submit_ptba() -> None:
                        raw_text = (csv_in.value or '').strip()
                        if not raw_text:
                            ui.notify(_loc('notify_provide_csv'), type='warning')
                            return

                        import csv
                        import io
                        try:
                            f = io.StringIO(raw_text)
                            reader = csv.reader(f)
                            header_row = next(reader, None)
                            if not header_row:
                                ui.notify(_loc('notify_provide_csv'), type='warning')
                                return
                            headers = [h.strip() for h in header_row]
                            lines = []
                            for parts in reader:
                                if not parts or not any(p.strip() for p in parts):
                                    continue
                                row_dict = {}
                                for h_idx, h_name in enumerate(headers):
                                    if h_idx < len(parts):
                                        row_dict[h_name] = parts[h_idx].strip()
                                if row_dict:
                                    lines.append(row_dict)
                        except Exception as e:
                            ui.notify(f"CSV Parse Error: {e}", type='negative')
                            return

                        if not lines:
                            ui.notify(_loc('notify_no_valid_csv_rows'), type='warning')
                            return

                        payload = {
                            'fileName': f'PTBA_Batch_{b.get("code")}.csv',
                            'updateExisting': update_chk.value,
                            'lines': lines,
                        }
                        res = await api.safe(api.post(f'/budgets/{b_id}/ptba/import', payload))
                        if res and res.get('success'):
                            msg = _loc(
                                'msg_ptba_success',
                                imported=res.get('linesImported', 0),
                                updated=res.get('linesUpdated', 0),
                                total=w.money(res.get('totalAmount', 0), currency)
                            )
                            ui.notify(msg, type='positive', position='top')
                            dlg.close()
                            await reload_data()
                            _refresh_all()

                    ui.button(_loc('btn_execute_import'), icon='cloud_upload', on_click=_submit_ptba).props('unelevated color=positive')

            if state.get('ptba_imports'):
                ui.label(_loc('lbl_ptba_history')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-2')
                imp_rows = []
                for imp in state.get('ptba_imports', []):
                    imp_rows.append({
                        'batch': imp.get('batch_number'),
                        'date': str(imp.get('created_at', ''))[:16],
                        'file': imp.get('file_name'),
                        'imported': imp.get('lines_imported'),
                        'updated': imp.get('lines_updated'),
                        'total': w.money(imp.get('total_amount', 0), currency),
                        'user': imp.get('imported_by_name') or '—',
                    })
                imp_cols = [
                    {'name': 'batch', 'label': _loc('col_batch_num'), 'field': 'batch', 'align': 'left'},
                    {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center'},
                    {'name': 'file', 'label': _loc('col_file_name'), 'field': 'file', 'align': 'left'},
                    {'name': 'imported', 'label': _loc('col_lines_imp'), 'field': 'imported', 'align': 'center'},
                    {'name': 'updated', 'label': _loc('col_lines_upd'), 'field': 'updated', 'align': 'center'},
                    {'name': 'total', 'label': _loc('col_total_imported'), 'field': 'total', 'align': 'right'},
                    {'name': 'user', 'label': _loc('carried_by_label'), 'field': 'user', 'align': 'center'},
                ]
                ui.table(columns=imp_cols, rows=imp_rows, pagination=5).classes('w-full lc-table')

        dlg.open()

    # --- Phase 5 Modals: Ordonnancement & Mandats de Paiement ----------------

    def _open_create_mandat_modal(comm_id: int | None = None) -> None:
        comm = next((c for c in state['commitments'] if c.get('id') == comm_id), None) if comm_id else None

        tot_amt = float(comm.get('amount') or 0) if comm else 0.0
        mandated_already = float(comm.get('mandated_amount') or 0) if comm else 0.0
        max_mandat = max(0.0, tot_amt - mandated_already) if comm else 999999999.0
        cert_amt = float(comm.get('certified_amount') or 0) if comm else 0.0

        matching_cert = next((sc for sc in state.get('certifications', []) if sc.get('commitment_id') == comm_id and sc.get('status') == 'certified'), None) if comm_id else None

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-2xl p-6 gap-4'):
            with ui.row().classes('items-center gap-2 border-b border-slate-200 pb-3 w-full'):
                ui.icon('receipt_long').classes('text-purple-700 text-2xl')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_mandat_title')).classes('text-base font-bold text-slate-800')
                    ui.label(_loc('mandat_desc')).classes('text-xs text-slate-500 max-w-xl')

            if comm:
                with ui.column().classes('w-full bg-purple-50 p-3 rounded-lg border border-purple-200 gap-1'):
                    with ui.row().classes('w-full justify-between items-center text-xs'):
                        ui.label(f"{comm.get('commitment_number')} — {comm.get('vendor_name') or _loc('supplier_fallback')}").classes('font-bold text-purple-950')
                        ui.label(f"{_loc('lbl_comm_amount_colon')} {w.money(tot_amt, currency)}").classes('font-mono font-semibold')
                    with ui.row().classes('w-full justify-between items-center text-xs text-purple-800'):
                        ui.label(f"{_loc('lbl_certified_colon')} {w.money(cert_amt, currency)}").classes('font-mono')
                        ui.label(f"{_loc('lbl_already_mandated_colon')} {w.money(mandated_already, currency)}").classes('font-mono')
                        ui.label(f"{_loc('lbl_remaining_to_mandate_colon')} {w.money(max_mandat, currency)}").classes('font-mono font-bold text-purple-900')

            today_str = datetime.date.today().isoformat()
            with ui.row().classes('w-full gap-3 no-wrap'):
                date_in = ui.input(label=_loc('col_mandat_date'), value=today_str).props('outlined dense type=date').classes('flex-1')
                ben_in = ui.input(label=_loc('lbl_beneficiary_name'), value=comm.get('vendor_name') if comm else '').props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                inv_num_in = ui.input(label=_loc('lbl_invoice_num'), placeholder='Ex: FACT-2026-0042').props('outlined dense').classes('flex-1')
                inv_date_in = ui.input(label=_loc('lbl_invoice_date'), value=today_str).props('outlined dense type=date').classes('flex-1')

            bank_rib_in = ui.input(label=_loc('lbl_beneficiary_bank'), placeholder='Code Banque - Guichet - Compte - Clé RIB').props('outlined dense').classes('w-full')

            default_gross = min(max_mandat, cert_amt if cert_amt > 0 else max_mandat)
            with ui.row().classes('w-full gap-3 no-wrap'):
                gross_in = ui.number(label=_loc('lbl_mandat_gross'), value=default_gross, min=1, max=max_mandat, format='%.0f').props('outlined dense').classes('flex-1')
                air_in = ui.number(label=_loc('lbl_air_tax'), value=round(default_gross * 0.055, 2), min=0, format='%.0f').props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 no-wrap'):
                ret_in = ui.number(label=_loc('lbl_warranty_ret'), value=round(default_gross * 0.05, 2), min=0, format='%.0f').props('outlined dense').classes('flex-1')
                pen_in = ui.number(label=_loc('lbl_penalty_amt'), value=0, min=0, format='%.0f').props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-300 text-sm'):
                ui.label(_loc('lbl_net_to_pay')).classes('font-semibold text-slate-700')
                net_lbl = ui.label('0 XAF').classes('font-mono font-bold text-emerald-800 text-base')

            def _update_net() -> None:
                g = float(gross_in.value or 0)
                a = float(air_in.value or 0)
                r = float(ret_in.value or 0)
                p = float(pen_in.value or 0)
                net = max(0.0, g - a - r - p)
                net_lbl.set_text(w.money(net, currency))

            gross_in.on_value_change(lambda _: _update_net())
            air_in.on_value_change(lambda _: _update_net())
            ret_in.on_value_change(lambda _: _update_net())
            pen_in.on_value_change(lambda _: _update_net())
            _update_net()

            obj_in = ui.textarea(label=_loc('lbl_object_desc'), placeholder=_loc('placeholder_mandat_obj')).props('outlined dense rows=2').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 border-t border-slate-200 pt-3 mt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _submit_mandat() -> None:
                    if not ben_in.value or not gross_in.value or not obj_in.value:
                        ui.notify(_loc('notify_provide_mandat_fields'), type='warning')
                        return
                    g = float(gross_in.value or 0)
                    if comm and g > max_mandat + 0.01:
                        ui.notify(_loc('notify_mandat_exceeds_env', bal=w.money(max_mandat, currency)), type='warning')
                        return

                    b_id = comm.get('budget_id') if comm else (state['active_budget']['id'] if state['active_budget'] else None)
                    l_id = comm.get('budget_line_id') if comm else None

                    if not b_id or not l_id:
                        ui.notify(_loc('notify_budget_ref_missing'), type='warning')
                        return

                    payload = {
                        'budget_id': b_id,
                        'budget_line_id': l_id,
                        'commitment_id': comm_id,
                        'certification_id': matching_cert.get('id') if matching_cert else None,
                        'supplier_id': comm.get('vendor_id') if comm else None,
                        'beneficiary_name': ben_in.value.strip(),
                        'beneficiary_bank_details': bank_rib_in.value.strip() if bank_rib_in.value else None,
                        'invoice_number': inv_num_in.value.strip() if inv_num_in.value else None,
                        'invoice_date': inv_date_in.value or today_str,
                        'gross_amount': g,
                        'tax_withholding_amount': float(air_in.value or 0),
                        'warranty_retention_amount': float(ret_in.value or 0),
                        'penalty_amount': float(pen_in.value or 0),
                        'currency': currency,
                        'object_description': obj_in.value.strip(),
                        'mandat_date': date_in.value or today_str,
                    }

                    res = await api.safe(api.post('/budget-payment-orders', payload))
                    if res and res.get('mandat_number'):
                        ui.notify(_loc('msg_mandat_created', num=res.get('mandat_number')), type='positive', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()

                ui.button(_loc('btn_new_mandat'), icon='receipt_long', on_click=_submit_mandat).props('unelevated color=purple-8')

        dlg.open()

    def _open_visa_review_modal(mandat_id: int, on_done=None) -> None:
        order = next((o for o in state['payment_orders'] if o.get('id') == mandat_id), None)
        if not order:
            ui.notify(_loc('notify_mandat_not_found'), type='warning')
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center gap-2 border-b border-slate-200 pb-3 w-full'):
                ui.icon('gavel').classes('text-amber-800 text-2xl')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_visa_title')).classes('text-base font-bold text-slate-800')
                    ui.label(f"Mandat {order.get('mandat_number')} — {order.get('beneficiary_name')}").classes('text-xs text-slate-500')

            with ui.column().classes('w-full bg-slate-50 p-3 rounded-lg border border-slate-200 gap-1 text-xs'):
                with ui.row().classes('w-full justify-between'):
                    ui.label(_loc('lbl_gross_amount_colon')).classes('text-slate-600')
                    ui.label(w.money(order.get('gross_amount', 0), currency)).classes('font-mono font-bold')
                with ui.row().classes('w-full justify-between'):
                    ui.label(_loc('lbl_withholdings_colon')).classes('text-slate-600')
                    ui.label(w.money(float(order.get('tax_withholding_amount', 0)) + float(order.get('warranty_retention_amount', 0)), currency)).classes('font-mono text-red-700')
                with ui.row().classes('w-full justify-between border-t border-slate-300 pt-1 mt-1 font-bold'):
                    ui.label(_loc('lbl_net_payable_colon')).classes('text-slate-800')
                    ui.label(w.money(order.get('net_amount', 0), currency)).classes('font-mono text-emerald-800 text-sm')

            notes_in = ui.textarea(label=_loc('lbl_visa_notes'), value='Pièces justificatives vérifiées (Facture + PV de réception conformes) - Bon à payer accordé.').props('outlined dense rows=2').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 border-t border-slate-200 pt-3'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _reject_visa() -> None:
                    res = await api.safe(api.post(f'/budget-payment-orders/{mandat_id}/visa', {'visaStatus': 'rejected', 'visaNotes': notes_in.value or 'Visa refusé pour pièces non conformes.'}))
                    if res and res.get('id'):
                        ui.notify(_loc('msg_mandat_visa_rejected', num=res.get('mandat_number')), type='warning', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()
                        if on_done:
                            on_done()

                async def _approve_visa() -> None:
                    res = await api.safe(api.post(f'/budget-payment-orders/{mandat_id}/visa', {'visaStatus': 'approved', 'visaNotes': notes_in.value or 'Visa préalable accordé.'}))
                    if res and res.get('id'):
                        ui.notify(_loc('msg_mandat_visa_approved', num=res.get('mandat_number')), type='positive', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()
                        if on_done:
                            on_done()

                ui.button(_loc('btn_reject_visa'), icon='close', on_click=_reject_visa).props('outline color=red')
                ui.button(_loc('btn_grant_visa'), icon='check_circle', on_click=_approve_visa).props('unelevated color=teal')

        dlg.open()

    def _open_disburse_modal(mandat_id: int, on_done=None) -> None:
        order = next((o for o in state['payment_orders'] if o.get('id') == mandat_id), None)
        if not order:
            ui.notify(_loc('notify_mandat_not_found'), type='warning')
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('items-center gap-2 border-b border-slate-200 pb-3 w-full'):
                ui.icon('account_balance').classes('text-emerald-700 text-2xl')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('dialog_disburse_title')).classes('text-base font-bold text-slate-800')
                    ui.label(f"Mandat {order.get('mandat_number')} — Net à payer : {w.money(order.get('net_amount', 0), currency)}").classes('text-xs text-slate-500')

            bank_opts = {ba['id']: f"{ba.get('code')} — {ba.get('name')} ({ba.get('bank_name') or ''})" for ba in bank_accounts}
            bank_sel = ui.select(bank_opts, value=bank_accounts[0]['id'] if bank_accounts else None, label=_loc('lbl_debtor_bank_acct')).props('outlined dense options-dense').classes('w-full')

            method_opts = {
                'bank_transfer': _loc('opt_pay_bank_transfer'),
                'check': _loc('opt_pay_check'),
                'cash': _loc('opt_pay_cash'),
                'other': _loc('opt_pay_other'),
            }
            method_sel = ui.select(method_opts, value='bank_transfer', label=_loc('lbl_pay_method')).props('outlined dense options-dense').classes('w-full')

            ref_in = ui.input(label=_loc('lbl_pay_ref'), value=f"VIR-2026-{order.get('id')}").props('outlined dense').classes('w-full')
            amt_in = ui.number(label=_loc('lbl_disbursed_amt'), value=float(order.get('net_amount', 0)), min=1, format='%.0f').props('outlined dense').classes('w-full')
            notes_in = ui.input(label=_loc('lbl_pay_notes_ref'), value=_loc('val_pay_default_notes')).props('outlined dense').classes('w-full')

            with ui.row().classes('w-full justify-end gap-2 border-t border-slate-200 pt-3'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8')

                async def _settle_disburse() -> None:
                    payload = {
                        'paymentMethod': method_sel.value,
                        'bankAccountId': bank_sel.value,
                        'paymentReference': ref_in.value.strip() if ref_in.value else None,
                        'paidAmount': float(amt_in.value or order.get('net_amount', 0)),
                        'notes': notes_in.value or None,
                    }
                    res = await api.safe(api.post(f'/budget-payment-orders/{mandat_id}/disburse', payload))
                    if res and res.get('id'):
                        ui.notify(_loc('msg_mandat_disbursed', num=res.get('mandat_number'), amt=w.money(res.get('paid_amount', 0), currency)), type='positive', position='top')
                        dlg.close()
                        await reload_data()
                        _refresh_all()
                        if on_done:
                            on_done()

                ui.button(_loc('btn_disburse_pay'), icon='payment', on_click=_settle_disburse).props('unelevated color=positive')

        dlg.open()

    def _open_mandat_details_modal(mandat_id: int) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-2xl p-6 gap-4'):
            order = next((o for o in state['payment_orders'] if o.get('id') == mandat_id), None)
            if not order:
                ui.notify(_loc('notify_mandat_not_found'), type='warning')
                return

            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('receipt_long').classes('text-purple-800 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(f"{_loc('lbl_payment_order_title_prefix')} {order.get('mandat_number')}").classes('text-lg font-bold text-slate-800')
                        ui.label(f"{order.get('beneficiary_name')} — {_loc('invoice_num_prefix')} {order.get('invoice_number') or 'N/A'}").classes('text-xs text-slate-500')
                ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            with ui.grid(columns=3).classes('w-full gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs'):
                with ui.column().classes('gap-0'):
                    ui.label(_loc('lbl_gross_amount_short')).classes('text-slate-500')
                    ui.label(w.money(order.get('gross_amount', 0), currency)).classes('font-mono font-bold text-slate-800')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('lbl_withholdings_short')).classes('text-slate-500')
                    ui.label(w.money(float(order.get('tax_withholding_amount', 0)) + float(order.get('warranty_retention_amount', 0)), currency)).classes('font-mono font-bold text-red-700')
                with ui.column().classes('gap-0'):
                    ui.label(_loc('lbl_net_mandated_short')).classes('text-slate-500')
                    ui.label(w.money(order.get('net_amount', 0), currency)).classes('font-mono font-bold text-emerald-800 text-sm')

            with ui.column().classes('w-full gap-1 text-xs'):
                ui.label(f"{_loc('col_desc')} : {order.get('object_description')}").classes('text-slate-700 font-medium')
                ui.label(f"{_loc('lbl_linked_commitment')} : {order.get('commitment_number') or _loc('none_label')}").classes('text-slate-500')
                if order.get('visa_notes'):
                    ui.label(f"Visa Contrôleur : {order.get('visa_status')} ({order.get('visa_notes')})").classes('text-teal-900 font-semibold bg-teal-50 p-2 rounded')

            ui.label(_loc('lbl_audit_history_visas')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-2')
            trail = order.get('audit_trail') or []
            if trail:
                for step in trail:
                    with ui.row().classes('w-full justify-between items-center text-xs border-b border-slate-100 py-1.5'):
                        with ui.row().classes('items-center gap-2'):
                            ui.icon('check_circle' if step.get('new_status') in ('visa_approved', 'paid') else 'circle').classes('text-xs text-slate-400')
                            ui.label(f"{step.get('action_type')} ({step.get('previous_status') or 'init'} -> {step.get('new_status')})").classes('font-semibold text-slate-800')
                        ui.label(step.get('notes') or '—').classes('text-slate-500 truncate max-w-xs')
                        ui.label(str(step.get('action_date') or '')[:16]).classes('text-slate-400 font-mono')
            else:
                ui.label(_loc('lbl_no_additional_audit')).classes('text-xs text-slate-400 italic')

        dlg.open()

    def _open_mandats_list_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-6xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('receipt_long').classes('text-purple-800 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_mandats_list_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('mandat_desc')).classes('text-xs text-slate-500 max-w-3xl')
                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_new_mandat'), icon='add', on_click=lambda: _open_create_mandat_modal()).props('unelevated color=purple-8 dense')
                    ui.button(icon='close', on_click=dlg.close).props('flat dense round')

            st = state.get('payment_order_stats') or {}
            with ui.grid(columns=4).classes('w-full gap-3'):
                with ui.card().classes('p-3 bg-purple-50 border border-purple-200'):
                    ui.label(_loc('stat_total_mandats')).classes('text-xs font-semibold text-purple-900')
                    ui.label(w.money(st.get('total_gross_amount', 0), currency)).classes('text-lg font-bold font-mono text-purple-950')
                    ui.label(_loc('stat_mandats_issued_count', count=st.get('total_mandats', 0))).classes('text-[10px] text-purple-700')
                with ui.card().classes('p-3 bg-red-50 border border-red-200'):
                    ui.label(_loc('stat_total_retentions')).classes('text-xs font-semibold text-red-900')
                    ui.label(w.money(float(st.get('total_tax_withholding', 0)) + float(st.get('total_warranty_retention', 0)), currency)).classes('text-lg font-bold font-mono text-red-950')
                    ui.label(_loc('lbl_tax_warranty_deducted')).classes('text-[10px] text-red-700')
                with ui.card().classes('p-3 bg-teal-50 border border-teal-200'):
                    ui.label(_loc('col_net_amount')).classes('text-xs font-semibold text-teal-900')
                    ui.label(w.money(st.get('total_net_amount', 0), currency)).classes('text-lg font-bold font-mono text-teal-950')
                    ui.label(_loc('stat_visa_approved_count', count=st.get('count_visa_approved', 0))).classes('text-[10px] text-teal-700')
                with ui.card().classes('p-3 bg-emerald-50 border border-emerald-200'):
                    ui.label(_loc('stat_total_paid')).classes('text-xs font-semibold text-emerald-900')
                    ui.label(w.money(st.get('total_paid_amount', 0), currency)).classes('text-lg font-bold font-mono text-emerald-950')
                    ui.label(_loc('stat_paid_count', count=st.get('count_paid', 0))).classes('text-[10px] text-emerald-700')

            @ui.refreshable
            def _render_mandats_table():
                mandat_rows = []
                for m in state.get('payment_orders', []):
                    mandat_rows.append({
                        'id': m.get('id'),
                        'number': m.get('mandat_number'),
                        'date': str(m.get('mandat_date') or '')[:10],
                        'beneficiary': m.get('beneficiary_name') or '—',
                        'invoice': f"{m.get('invoice_number') or '—'} ({str(m.get('invoice_date') or '')[:10]})",
                        'commitment': m.get('commitment_number') or '—',
                        'gross': w.money(m.get('gross_amount', 0), currency),
                        'retentions': w.money(float(m.get('tax_withholding_amount', 0)) + float(m.get('warranty_retention_amount', 0)), currency),
                        'net': w.money(m.get('net_amount', 0), currency),
                        'status': _tr_status(m.get('status')),
                        '_status_raw': m.get('status'),
                        'visa_status': _tr_status(m.get('visa_status')),
                        '_visa_raw': m.get('visa_status'),
                        'paid_amt': w.money(m.get('paid_amount', 0), currency),
                        '_btn_submit': _loc('btn_submit_mandat'),
                        '_btn_visa': _loc('btn_visa_mandat'),
                        '_btn_transmit': _loc('btn_transmit_mandat'),
                        '_btn_settle': _loc('btn_settle_mandat'),
                    })

                cols = [
                    {'name': 'number', 'label': _loc('col_mandat_number'), 'field': 'number', 'align': 'left', 'sortable': True},
                    {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center'},
                    {'name': 'beneficiary', 'label': _loc('col_beneficiary'), 'field': 'beneficiary', 'align': 'left', 'sortable': True},
                    {'name': 'invoice', 'label': _loc('lbl_invoice_num'), 'field': 'invoice', 'align': 'left'},
                    {'name': 'commitment', 'label': _loc('col_stage'), 'field': 'commitment', 'align': 'center'},
                    {'name': 'gross', 'label': _loc('col_gross_amount'), 'field': 'gross', 'align': 'right', 'sortable': True},
                    {'name': 'retentions', 'label': _loc('col_retentions'), 'field': 'retentions', 'align': 'right'},
                    {'name': 'net', 'label': _loc('col_net_amount'), 'field': 'net', 'align': 'right', 'sortable': True},
                    {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                    {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                ]

                tbl = ui.table(columns=cols, rows=mandat_rows, pagination=10).classes('w-full lc-table')
                tbl.add_slot('body-cell-net', '''
                    <q-td :props="props" class="font-mono font-bold text-emerald-800">
                        {{ props.value }}
                    </q-td>
                ''')
                tbl.add_slot('body-cell-status', '''
                    <q-td :props="props">
                        <q-badge :color="props.row._status_raw === 'paid' ? 'positive' : (props.row._status_raw === 'visa_approved' ? 'teal' : (props.row._status_raw === 'transmitted_treasury' ? 'blue' : (props.row._status_raw === 'submitted' ? 'amber-8' : (props.row._status_raw === 'visa_rejected' ? 'negative' : 'grey-7'))))">
                            {{ props.value }}
                        </q-badge>
                    </q-td>
                ''')
                tbl.add_slot('body-cell-actions', '''
                    <q-td :props="props">
                        <q-btn v-if="props.row._status_raw === 'draft' || props.row._status_raw === 'visa_rejected'" size="xs" color="amber-9" dense outline :label="props.row._btn_submit"
                               @click="$parent.$emit('submit-mandat', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw === 'submitted'" size="xs" color="teal" dense outline icon="gavel" :label="props.row._btn_visa"
                               @click="$parent.$emit('visa-mandat', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw === 'visa_approved'" size="xs" color="blue-8" dense outline icon="send" :label="props.row._btn_transmit"
                               @click="$parent.$emit('transmit-mandat', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw === 'transmitted_treasury' || props.row._status_raw === 'visa_approved'" size="xs" color="emerald-8" dense outline icon="payment" :label="props.row._btn_settle"
                               @click="$parent.$emit('disburse-mandat', props.row.id)" class="q-mr-xs" />
                        <q-btn size="xs" color="slate-6" dense flat icon="visibility" @click="$parent.$emit('detail-mandat', props.row.id)" />
                    </q-td>
                ''')

                async def _on_submit_mandat(m_id: int):
                    res = await api.safe(api.post(f'/budget-payment-orders/{m_id}/submit', {'notes': 'Soumission pour visa du Contrôleur Financier'}))
                    if res:
                        ui.notify(_loc('notify_mandat_submitted'), type='positive')
                        await reload_data()
                        _render_mandats_table.refresh()
                        _refresh_all()

                async def _on_transmit_mandat(m_id: int):
                    res = await api.safe(api.post(f'/budget-payment-orders/{m_id}/transmit', {'notes': 'Bordereau de transmission à la Trésorerie'}))
                    if res:
                        ui.notify(_loc('notify_mandat_transmitted'), type='positive')
                        await reload_data()
                        _render_mandats_table.refresh()
                        _refresh_all()

                tbl.on('submit-mandat', lambda e: _on_submit_mandat(e.args))
                tbl.on('visa-mandat', lambda e: _open_visa_review_modal(e.args, on_done=_render_mandats_table.refresh))
                tbl.on('transmit-mandat', lambda e: _on_transmit_mandat(e.args))
                tbl.on('disburse-mandat', lambda e: _open_disburse_modal(e.args, on_done=_render_mandats_table.refresh))
                tbl.on('detail-mandat', lambda e: _open_mandat_details_modal(e.args))

            _render_mandats_table()

        dlg.open()

    # --- Phase 6: PPM & Procurement Packages Modals --------------------------

    def _open_thresholds_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-5xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('balance').classes('text-slate-700 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_thresholds_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('lbl_thresholds_regulatory_note')).classes('text-xs text-slate-500')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            th_rows = []
            for t in state.get('procurement_thresholds', []):
                rev_badge, _, _ = _tr_review_type('prior' if t.get('prior_review_threshold') else 'post')
                th_rows.append({
                    'id': t.get('id'),
                    'donor': t.get('donor_code') or 'NATIONAL',
                    'cat': _tr_procurement_cat(t.get('category')),
                    'method': _tr_procurement_method(t.get('method')),
                    '_method_code': t.get('method'),
                    'min_amt': w.money(t.get('min_amount', 0), currency),
                    'max_amt': w.money(t.get('max_amount', 0), currency) if float(t.get('max_amount', 0)) < 900000000000 else 'Illimité (No ceiling)',
                    'prior_rev': w.money(t.get('prior_review_threshold', 0), currency),
                    'desc': t.get('description') or '—',
                })

            th_cols = [
                {'name': 'donor', 'label': _loc('col_donor_ref'), 'field': 'donor', 'align': 'center'},
                {'name': 'cat', 'label': _loc('col_category'), 'field': 'cat', 'align': 'left', 'sortable': True},
                {'name': 'method', 'label': _loc('col_method'), 'field': 'method', 'align': 'left', 'sortable': True},
                {'name': 'min_amt', 'label': 'Seuil Min', 'field': 'min_amt', 'align': 'right'},
                {'name': 'max_amt', 'label': 'Plafond Max', 'field': 'max_amt', 'align': 'right'},
                {'name': 'prior_rev', 'label': 'Seuil Revue Préalable (ANO)', 'field': 'prior_rev', 'align': 'right', 'sortable': True},
                {'name': 'desc', 'label': _loc('col_desc'), 'field': 'desc', 'align': 'left'},
            ]

            tbl = ui.table(columns=th_cols, rows=th_rows, pagination=15).classes('w-full lc-table')
            tbl.add_slot('body-cell-prior_rev', '''
                <q-td :props="props" class="font-mono font-bold text-amber-9">
                    {{ props.value }}
                </q-td>
            ''')
        dlg.open()

    def _open_create_ppm_modal(on_done: Any = None) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('post_add').classes('text-indigo-800 text-2xl')
                    ui.label(_loc('dialog_new_ppm_title')).classes('text-lg font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            b = state['active_budget']
            if not b:
                ui.label(_loc('lbl_select_active_budget_first')).classes('text-rose-600')
                return

            with ui.column().classes('w-full gap-3'):
                ui.label(f"Budget : {b.get('code')} — {_tr_val(b.get('name'))}").classes('text-xs font-semibold text-slate-600 bg-slate-100 p-2 rounded')
                inp_title = ui.input(_loc('lbl_ppm_title'), value=f"Plan de Passation des Marchés {state['fy_id']}").props('outlined dense')
                inp_donor_ref = ui.input(_loc('col_donor_ref'), placeholder='Ex: IDA-CR-6890 / BM / FED').props('outlined dense')
                inp_notes = ui.textarea(_loc('col_notes'), placeholder='Notes de cadrage ou objectifs...').props('outlined dense rows=3')

            async def _submit_new_ppm():
                title = str(inp_title.value or '').strip()
                if not title:
                    ui.notify(_loc('notify_ppm_title_required'), type='warning')
                    return
                payload = {
                    'budget_id': b['id'],
                    'fiscal_year_id': state['fy_id'],
                    'title': title,
                    'donor_approval_reference': str(inp_donor_ref.value or '').strip() or None,
                    'notes': str(inp_notes.value or '').strip() or None,
                }
                res = await api.safe(api.post('/procurement-plans', payload))
                if res:
                    ui.notify(_loc('msg_ppm_created', code=res.get('plan_code')), type='positive')
                    dlg.close()
                    await reload_data()
                    _refresh_all()
                    if on_done:
                        on_done()

            with ui.row().classes('w-full justify-end gap-2 pt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat')
                ui.button(_loc('btn_add_ppm'), icon='check', on_click=_submit_new_ppm).props('unelevated color=indigo-9')

        dlg.open()

    def _open_approve_ppm_modal(plan_id: int, on_done: Any = None) -> None:
        plan = next((p for p in state['procurement_plans'] if p.get('id') == plan_id), None)
        if not plan:
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-md p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('verified').classes('text-emerald-800 text-2xl')
                    ui.label(_loc('dialog_approve_ppm_title')).classes('text-lg font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            with ui.column().classes('w-full gap-3 text-xs'):
                ui.label(f"PPM : {plan.get('plan_code')} — {plan.get('title')}").classes('font-bold text-slate-800')
                inp_ano = ui.input(_loc('lbl_donor_ano'), value=plan.get('donor_approval_reference') or '').props('outlined dense placeholder="Ex: ANO-BM-2026-N089"')
                inp_ano_date = ui.input(_loc('lbl_ano_date'), value=str(datetime.date.today())).props('outlined dense type=date')
                inp_notes = ui.textarea(_loc('col_notes'), placeholder=_loc('placeholder_ano_notes')).props('outlined dense rows=2')

            async def _submit_approval():
                ano_val = str(inp_ano.value or '').strip()
                if not ano_val:
                    ui.notify(_loc('notify_ano_ref_required'), type='warning')
                    return
                payload = {
                    'donorApprovalReference': ano_val,
                    'donorApprovalDate': str(inp_ano_date.value or '') or None,
                    'notes': str(inp_notes.value or '').strip() or None,
                }
                res = await api.safe(api.post(f"/procurement-plans/{plan['id']}/approve", payload))
                if res:
                    ui.notify(_loc('msg_ppm_approved', code=res.get('plan_code'), ano=ano_val), type='positive')
                    dlg.close()
                    await reload_data()
                    _refresh_all()
                    if on_done:
                        on_done()

            with ui.row().classes('w-full justify-end gap-2 pt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat')
                ui.button(_loc('btn_approve'), icon='check_circle', on_click=_submit_approval).props('unelevated color=positive')

        dlg.open()

    def _open_create_package_modal(default_plan_id: int | None = None, on_done: Any = None) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('add_box').classes('text-teal-800 text-2xl')
                    ui.label(_loc('dialog_new_pkg_title')).classes('text-lg font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            plans_opts = {p['id']: f"{p['plan_code']} — {p['title']}" for p in state['procurement_plans']}
            if not plans_opts:
                ui.label(_loc('lbl_no_active_ppm')).classes('text-rose-600')
                return

            sel_plan_id = default_plan_id or list(plans_opts.keys())[0]

            b = state['active_budget']
            lines = b.get('lines', []) if b else []
            line_opts = {
                l['id']: f"{l.get('account_code')} — {l.get('cost_center_name') or 'Global'} ({w.money(l.get('remaining_amount', l.get('revised_amount', 0)), currency)})"
                for l in lines
            }
            if not line_opts:
                ui.label(_loc('lbl_no_budget_lines_in_budget')).classes('text-rose-600')
                return

            cat_opts = {
                'works': _tr_procurement_cat('works'),
                'goods': _tr_procurement_cat('goods'),
                'consulting_firms': _tr_procurement_cat('consulting_firms'),
                'individual_consultants': _tr_procurement_cat('individual_consultants'),
                'non_consulting_services': _tr_procurement_cat('non_consulting_services'),
            }

            meth_opts = {
                'AON': _tr_procurement_method('AON'),
                'AOI': _tr_procurement_method('AOI'),
                'DC': _tr_procurement_method('DC'),
                'ED': _tr_procurement_method('ED'),
                'SFQ': _tr_procurement_method('SFQ'),
                'QCBS': _tr_procurement_method('QCBS'),
                'LCS': _tr_procurement_method('LCS'),
                '3CV': _tr_procurement_method('3CV'),
            }

            with ui.column().classes('w-full gap-3 text-xs'):
                inp_plan = ui.select(plans_opts, value=sel_plan_id, label=_loc('lbl_linked_ppm')).props('outlined dense bg-white')
                inp_line = ui.select(line_opts, value=list(line_opts.keys())[0], label=_loc('lbl_pkg_budget_line')).props('outlined dense bg-white')

                with ui.row().classes('w-full gap-2 no-wrap'):
                    inp_num = ui.input(_loc('col_package_num'), placeholder='Ex: LOT-01-TRAVAUX').props('outlined dense').classes('w-1/2')
                    inp_cat = ui.select(cat_opts, value='goods', label=_loc('lbl_pkg_cat')).props('outlined dense bg-white').classes('w-1/2')

                inp_desc = ui.input(_loc('lbl_pkg_desc'), placeholder=_loc('placeholder_pkg_desc')).props('outlined dense')

                with ui.row().classes('w-full gap-2 no-wrap'):
                    inp_meth = ui.select(meth_opts, value='AON', label=_loc('lbl_pkg_method')).props('outlined dense bg-white').classes('w-1/2')
                    inp_amt = ui.number(_loc('lbl_pkg_est_amt'), value=10000000, min=1000).props('outlined dense font-mono').classes('w-1/2')

                with ui.row().classes('w-full gap-2 no-wrap'):
                    inp_launch = ui.input(_loc('lbl_date_launch'), value=str(datetime.date.today())).props('outlined dense type=date').classes('w-1/2')
                    inp_opening = ui.input(_loc('lbl_date_opening')).props('outlined dense type=date').classes('w-1/2')

                with ui.row().classes('w-full gap-2 no-wrap'):
                    inp_award = ui.input(_loc('lbl_date_award')).props('outlined dense type=date').classes('w-1/2')
                    inp_completion = ui.input(_loc('lbl_date_completion')).props('outlined dense type=date').classes('w-1/2')

                inp_notes = ui.textarea(_loc('col_notes'), placeholder=_loc('placeholder_pkg_specs')).props('outlined dense rows=2')

            async def _submit_package():
                desc_val = str(inp_desc.value or '').strip()
                amt_val = float(inp_amt.value or 0)
                if not desc_val or amt_val <= 0:
                    ui.notify(_loc('notify_pkg_desc_cost_required'), type='warning')
                    return
                payload = {
                    'plan_id': int(inp_plan.value),
                    'budget_line_id': int(inp_line.value),
                    'package_number': str(inp_num.value or '').strip() or None,
                    'description': desc_val,
                    'procurement_category': str(inp_cat.value),
                    'procurement_method': str(inp_meth.value),
                    'estimated_amount': amt_val,
                    'planned_launch_date': str(inp_launch.value or '') or None,
                    'planned_opening_date': str(inp_opening.value or '') or None,
                    'planned_award_date': str(inp_award.value or '') or None,
                    'planned_completion_date': str(inp_completion.value or '') or None,
                    'notes': str(inp_notes.value or '').strip() or None,
                }
                res = await api.safe(api.post('/procurement-packages', payload))
                if res:
                    rev_txt, _, _ = _tr_review_type(res.get('review_type'))
                    ui.notify(_loc('msg_pkg_created', num=res.get('package_number'), rev=rev_txt), type='positive')
                    dlg.close()
                    await reload_data()
                    _refresh_all()
                    if on_done:
                        on_done()

            with ui.row().classes('w-full justify-end gap-2 pt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat')
                ui.button(_loc('btn_add_package'), icon='check', on_click=_submit_package).props('unelevated color=teal-8')

        dlg.open()

    def _open_award_package_modal(pkg_id: int, on_done: Any = None) -> None:
        pkg = next((p for p in state['procurement_packages'] if p.get('id') == pkg_id), None)
        if not pkg:
            return

        with ui.dialog() as dlg, ui.card().classes('w-full max-w-lg p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('handshake').classes('text-emerald-800 text-2xl')
                    ui.label(_loc('dialog_award_pkg_title')).classes('text-lg font-bold text-slate-800')
                ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            with ui.column().classes('w-full gap-2 p-3 bg-slate-50 rounded-lg text-xs'):
                ui.label(f"{_loc('lbl_pkg_prefix')} : {pkg.get('package_number')} — {pkg.get('description')}").classes('font-bold text-slate-800')
                ui.label(f"{_loc('lbl_cat_prefix')} : {_tr_procurement_cat(pkg.get('procurement_category'))} | {_loc('lbl_meth_prefix')} : {pkg.get('procurement_method')}").classes('text-slate-600')
                ui.label(f"{_loc('lbl_est_ppm_amt')} : {w.money(pkg.get('estimated_amount', 0), currency)}").classes('font-mono font-semibold text-slate-700')

            vendor_opts = {v['id']: v.get('name') or v.get('legal_name') for v in vendors}
            default_v_id = list(vendor_opts.keys())[0] if vendor_opts else None

            with ui.column().classes('w-full gap-3 text-xs'):
                inp_vendor = ui.select(vendor_opts, value=default_v_id, label=_loc('lbl_awarded_supplier')).props('outlined dense bg-white')
                inp_vendor_free = ui.input(_loc('lbl_vendor_free_input'), placeholder=_loc('placeholder_vendor_free')).props('outlined dense')

                with ui.row().classes('w-full gap-2 no-wrap'):
                    inp_ctr_ref = ui.input(_loc('lbl_contract_ref'), value=f"CTR-2026-{pkg.get('package_number') or 'LOT'}").props('outlined dense').classes('w-1/2')
                    inp_ctr_amt = ui.number(_loc('lbl_contract_amt'), value=float(pkg.get('estimated_amount', 0)), min=1000).props('outlined dense font-mono').classes('w-1/2')

                inp_ctr_date = ui.input(_loc('lbl_sign_date'), value=str(datetime.date.today())).props('outlined dense type=date')
                chk_create_bc = ui.checkbox(_loc('chk_create_comm'), value=True).classes('text-xs text-slate-700 font-semibold')
                inp_notes = ui.textarea(_loc('col_notes'), placeholder=_loc('placeholder_award_notes')).props('outlined dense rows=2')

            async def _submit_award():
                ctr_num = str(inp_ctr_ref.value or '').strip()
                amt_val = float(inp_ctr_amt.value or 0)
                supp_name = str(inp_vendor_free.value or '').strip()
                v_id = inp_vendor.value
                if not supp_name and v_id in vendor_opts:
                    supp_name = vendor_opts[v_id]

                if not ctr_num or amt_val <= 0 or not supp_name:
                    ui.notify(_loc('notify_contract_fields_required'), type='warning')
                    return

                payload = {
                    'supplierId': int(v_id) if v_id else None,
                    'supplierName': supp_name,
                    'contractNumber': ctr_num,
                    'contractAmount': amt_val,
                    'contractSignedDate': str(inp_ctr_date.value or str(datetime.date.today())),
                    'createCommitment': bool(chk_create_bc.value),
                    'notes': str(inp_notes.value or '').strip() or None,
                }
                res = await api.safe(api.post(f"/procurement-packages/{pkg['id']}/award", payload))
                if res:
                    ui.notify(_loc('msg_pkg_awarded', contract=ctr_num, supp=supp_name, bc=res.get('commitment_id') or 'Oui'), type='positive')
                    dlg.close()
                    await reload_data()
                    _refresh_all()
                    if on_done:
                        on_done()

            with ui.row().classes('w-full justify-end gap-2 pt-2'):
                ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat')
                ui.button(_loc('btn_award_pkg'), icon='gavel', on_click=_submit_award).props('unelevated color=positive')

        dlg.open()

    def _open_procurement_packages_modal(initial_plan_id: int | None = None) -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-7xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('inventory_2').classes('text-teal-800 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_packages_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('lbl_packages_operational_tracking')).classes('text-xs text-slate-500')
                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_thresholds'), icon='balance', on_click=_open_thresholds_modal).props('outline color=slate-700 dense')
                    ui.button(_loc('btn_add_package'), icon='add', on_click=lambda: _open_create_package_modal(initial_plan_id, on_done=_render_pkgs_view.refresh)).props('unelevated color=teal-8 dense')
                    ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            @ui.refreshable
            def _render_pkgs_view():
                pkgs = state.get('procurement_packages', [])
                if initial_plan_id:
                    pkgs = [p for p in pkgs if p.get('plan_id') == initial_plan_id]

                pkg_rows = []
                for p in pkgs:
                    rev_txt, _, _ = _tr_review_type(p.get('review_type'))
                    is_prior = p.get('review_type') in ('prior', 'prior_review')

                    milestones_str = (
                        f"{_loc('lbl_launch_prefix')}: {str(p.get('actual_launch_date') or p.get('planned_launch_date') or '—')[:10]} | "
                        f"{_loc('lbl_award_prefix')}: {str(p.get('actual_award_date') or p.get('planned_award_date') or '—')[:10]}"
                    )

                    pkg_rows.append({
                        'id': p.get('id'),
                        'plan_id': p.get('plan_id'),
                        'num': p.get('package_number') or f"LOT-{p.get('id')}",
                        'desc': p.get('description'),
                        'category': _tr_procurement_cat(p.get('procurement_category')),
                        '_cat_raw': p.get('procurement_category'),
                        'method': p.get('procurement_method'),
                        'review': rev_txt,
                        '_is_prior': is_prior,
                        'estimated': w.money(p.get('estimated_amount', 0), currency),
                        'contract': w.money(p.get('contract_amount', 0), currency) if p.get('contract_amount') else '—',
                        'contract_num': p.get('contract_number') or '—',
                        'supplier': p.get('awarded_supplier_name') or '—',
                        'milestones': milestones_str,
                        'status': _tr_status(p.get('status')),
                        '_status_raw': p.get('status'),
                        'commitment_id': p.get('commitment_id'),
                    })

                cols = [
                    {'name': 'num', 'label': _loc('col_package_num'), 'field': 'num', 'align': 'left', 'sortable': True},
                    {'name': 'desc', 'label': _loc('col_desc'), 'field': 'desc', 'align': 'left', 'sortable': True},
                    {'name': 'category', 'label': _loc('col_category'), 'field': 'category', 'align': 'center'},
                    {'name': 'method', 'label': _loc('col_method'), 'field': 'method', 'align': 'center'},
                    {'name': 'review', 'label': _loc('col_review_type'), 'field': 'review', 'align': 'center'},
                    {'name': 'estimated', 'label': _loc('col_total_estimated'), 'field': 'estimated', 'align': 'right', 'sortable': True},
                    {'name': 'contract', 'label': _loc('col_total_contracted'), 'field': 'contract', 'align': 'right', 'sortable': True},
                    {'name': 'contract_num', 'label': _loc('col_contract_num'), 'field': 'contract_num', 'align': 'center'},
                    {'name': 'supplier', 'label': _loc('lbl_awarded_supplier'), 'field': 'supplier', 'align': 'left'},
                    {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                    {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                ]

                tbl = ui.table(columns=cols, rows=pkg_rows, pagination=12).classes('w-full lc-table')

                tbl.add_slot('body-cell-review', '''
                    <q-td :props="props">
                        <q-badge :color="props.row._is_prior ? 'red-8' : 'sky-8'" :label="props.value" />
                    </q-td>
                ''')

                tbl.add_slot('body-cell-status', '''
                    <q-td :props="props">
                        <q-badge :color="props.row._status_raw === 'contract_signed' ? 'positive' : (props.row._status_raw === 'awarded' ? 'teal' : (props.row._status_raw === 'tender_launched' ? 'blue' : (props.row._status_raw === 'bids_evaluated' ? 'amber-8' : 'grey-7')))">
                            {{ props.value }}
                        </q-badge>
                    </q-td>
                ''')

                tbl.add_slot('body-cell-actions', '''
                    <q-td :props="props">
                        <q-btn v-if="props.row._status_raw === 'planned'" size="xs" color="blue-8" dense outline icon="campaign" :label="props.row._btn_launch"
                               @click="$parent.$emit('launch-tender', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw === 'tender_launched'" size="xs" color="amber-9" dense outline icon="checklist" :label="props.row._btn_evaluate"
                               @click="$parent.$emit('evaluate-bids', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw === 'tender_launched' || props.row._status_raw === 'bids_evaluated' || props.row._status_raw === 'planned'" size="xs" color="emerald-8" dense outline icon="handshake" :label="props.row._btn_award"
                               @click="$parent.$emit('award-pkg', props.row.id)" class="q-mr-xs" />
                        <q-badge v-if="props.row.commitment_id" color="purple-9" :label="'BC #' + props.row.commitment_id" class="cursor-pointer" />
                    </q-td>
                ''')

                async def _on_launch_tender(p_id: int):
                    res = await api.safe(api.put(f'/procurement-packages/{p_id}', {'status': 'tender_launched', 'actual_launch_date': str(datetime.date.today())}))
                    if res:
                        ui.notify(_loc('notify_tender_launched'), type='positive')
                        await reload_data()
                        _render_pkgs_view.refresh()
                        _refresh_all()

                async def _on_evaluate_bids(p_id: int):
                    res = await api.safe(api.put(f'/procurement-packages/{p_id}', {'status': 'bids_evaluated', 'actual_opening_date': str(datetime.date.today())}))
                    if res:
                        ui.notify(_loc('notify_bids_evaluated'), type='positive')
                        await reload_data()
                        _render_pkgs_view.refresh()
                        _refresh_all()

                tbl.on('launch-tender', lambda e: _on_launch_tender(e.args))
                tbl.on('evaluate-bids', lambda e: _on_evaluate_bids(e.args))
                tbl.on('award-pkg', lambda e: _open_award_package_modal(e.args, on_done=_render_pkgs_view.refresh))

            _render_pkgs_view()

        dlg.open()

    def _open_procurement_plans_modal() -> None:
        with ui.dialog() as dlg, ui.card().classes('w-full max-w-6xl p-6 gap-4'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('assignment').classes('text-indigo-900 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label(_loc('dialog_ppm_title')).classes('text-lg font-bold text-slate-800')
                        ui.label(_loc('ppm_desc')).classes('text-xs text-slate-500 max-w-3xl')
                with ui.row().classes('items-center gap-2'):
                    ui.button(_loc('btn_thresholds'), icon='balance', on_click=_open_thresholds_modal).props('outline color=slate-700 dense')
                    ui.button(_loc('btn_add_ppm'), icon='add', on_click=lambda: _open_create_ppm_modal(on_done=_render_ppm_table.refresh)).props('unelevated color=indigo-9 dense')
                    ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            @ui.refreshable
            def _render_ppm_table():
                plans = state.get('procurement_plans', [])
                st = state.get('procurement_stats') or {}

                # Top Stats Banner
                with ui.row().classes('w-full gap-3 no-wrap'):
                    with ui.card().classes('flex-1 p-3 bg-indigo-50/50 border border-indigo-200'):
                        ui.label(_loc('lbl_ppm_lots_count')).classes('text-[11px] font-bold uppercase text-indigo-700')
                        ui.label(str(st.get('total_packages', len(state.get('procurement_packages', []))))).classes('text-lg font-bold text-indigo-950')
                        ui.label(f"{st.get('count_prior_review', 0)} lots sous revue préalable").classes('text-[10px] text-indigo-600')

                    with ui.card().classes('flex-1 p-3 bg-teal-50/50 border border-teal-200'):
                        ui.label(_loc('lbl_ppm_est_envelope')).classes('text-[11px] font-bold uppercase text-teal-700')
                        ui.label(w.money(st.get('total_estimated_amount', 0), currency)).classes('text-lg font-bold text-teal-950')
                        ui.label(_loc('lbl_ppm_initial_planning')).classes('text-[10px] text-teal-600')

                    with ui.card().classes('flex-1 p-3 bg-emerald-50/50 border border-emerald-200'):
                        ui.label(_loc('lbl_ppm_contracted_markets')).classes('text-[11px] font-bold uppercase text-emerald-700')
                        ui.label(w.money(st.get('total_contract_amount', 0), currency)).classes('text-lg font-bold text-emerald-950')
                        ui.label(f"{st.get('count_signed', 0)} contrats signés").classes('text-[10px] text-emerald-600')

                ppm_rows = []
                for p in plans:
                    ppm_rows.append({
                        'id': p.get('id'),
                        'code': p.get('plan_code'),
                        'title': p.get('title'),
                        'status': _tr_status(p.get('status')),
                        '_status_raw': p.get('status'),
                        'donor_ref': p.get('donor_approval_reference') or '—',
                        'packages_count': p.get('packages_count', 0),
                        'total_est': w.money(p.get('total_estimated_amount', 0), currency),
                        'total_act': w.money(p.get('total_contract_amount', 0), currency),
                    })

                cols = [
                    {'name': 'code', 'label': _loc('col_ppm_code'), 'field': 'code', 'align': 'left', 'sortable': True},
                    {'name': 'title', 'label': _loc('col_ppm_title'), 'field': 'title', 'align': 'left', 'sortable': True},
                    {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                    {'name': 'donor_ref', 'label': _loc('col_ano_ref'), 'field': 'donor_ref', 'align': 'center'},
                    {'name': 'packages_count', 'label': _loc('col_packages_count'), 'field': 'packages_count', 'align': 'center', 'sortable': True},
                    {'name': 'total_est', 'label': _loc('col_total_estimated'), 'field': 'total_est', 'align': 'right', 'sortable': True},
                    {'name': 'total_act', 'label': _loc('col_total_contracted'), 'field': 'total_act', 'align': 'right', 'sortable': True},
                    {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                ]

                tbl = ui.table(columns=cols, rows=ppm_rows, pagination=10).classes('w-full lc-table')
                tbl.add_slot('body-cell-status', '''
                    <q-td :props="props">
                        <q-badge :color="props.row._status_raw === 'approved' ? 'positive' : (props.row._status_raw === 'submitted' ? 'amber-8' : 'grey-7')">
                            {{ props.value }}
                        </q-badge>
                    </q-td>
                ''')
                tbl.add_slot('body-cell-actions', '''
                    <q-td :props="props">
                        <q-btn size="xs" color="teal-8" dense outline icon="inventory_2" :label="props.row._btn_manage"
                               @click="$parent.$emit('manage-packages', props.row.id)" class="q-mr-xs" />
                        <q-btn v-if="props.row._status_raw !== 'approved'" size="xs" color="positive" dense outline icon="verified" :label="props.row._btn_approve"
                               @click="$parent.$emit('approve-ppm', props.row.id)" class="q-mr-xs" />
                        <q-btn size="xs" color="indigo-8" dense flat icon="add" :label="props.row._btn_add_pkg"
                               @click="$parent.$emit('add-pkg', props.row.id)" />
                    </q-td>
                ''')

                tbl.on('manage-packages', lambda e: _open_procurement_packages_modal(e.args))
                tbl.on('approve-ppm', lambda e: _open_approve_ppm_modal(e.args, on_done=_render_ppm_table.refresh))
                tbl.on('add-pkg', lambda e: _open_create_package_modal(e.args, on_done=_render_ppm_table.refresh))

            _render_ppm_table()

        dlg.open()

    def _open_budget_manual_dialog() -> None:
        ui.add_css(manual_ui.MANUAL_CSS)
        docs_dir = Path(__file__).resolve().parent.parent.parent.parent / 'docs'
        md_file = docs_dir / 'BUDGET_MODULE_USER_GUIDE.md'
        raw_md = md_file.read_text(encoding='utf-8') if md_file.exists() else "Budget User Guide not found."
        with ui.dialog().classes('w-full') as dlg, ui.card().classes('w-full max-w-5xl h-[88vh] p-6 flex flex-col gap-3'):
            with ui.row().classes('w-full items-center justify-between border-b border-slate-200 pb-3 no-wrap'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('menu_book').classes('text-teal-700 text-2xl')
                    with ui.column().classes('gap-0'):
                        ui.label('💰 LedgerCore — Budget Module & Commitment Control Manual').classes('text-lg font-bold text-slate-800')
                        ui.label('Official comprehensive manual, commitment workflows, carryforwards & practical examples').classes('text-xs text-slate-500')
                with ui.row().classes('items-center gap-2'):
                    def _go_full_guide():
                        app.storage.user['guide_selected_doc'] = 'BUDGET_MODULE_USER_GUIDE.md'
                        ui.navigate.to('/user-guide')
                    ui.button('Full Screen Guide', icon='open_in_new', on_click=_go_full_guide).props('outline color=teal-8 dense size=sm')
                    ui.button('HTML Manual', icon='description', on_click=lambda: ui.navigate.to('/docs-static/BUDGET_MODULE_USER_GUIDE.html', new_tab=True)).props('outline color=slate-7 dense size=sm')
                    ui.button('Download PDF', icon='picture_as_pdf', on_click=lambda: ui.download('/docs-static/BUDGET_MODULE_USER_GUIDE.pdf')).props('unelevated color=teal dense size=sm')
                    ui.button(icon='close', on_click=dlg.close).props('flat round dense text-color=grey-7')

            with ui.scroll_area().classes('w-full flex-1 p-5 rounded-xl border border-slate-200').style('background:#fff'):
                ui.html(manual_ui.render_manual(raw_md)['html'], sanitize=False).classes('w-full')
            manual_ui.activate_motion()

        dlg.open()

    def _header_actions() -> None:
        with ui.row().classes('items-center gap-2 flex-wrap sm:flex-nowrap'):
            ui.button(
                _loc('btn_new_comm'),
                icon='add_shopping_cart',
                on_click=_open_new_comm_modal,
            ).props('unelevated color=teal text-white dense no-caps shadow-sm font-bold').classes('px-3 py-1.5 text-xs')

            ui.button(
                '⚡ ' + ('Vérifier Crédit' if lang() == 'fr' else 'Check Availability'),
                icon='calculate',
                on_click=_open_quick_checker_modal,
            ).props('outline color=teal-8 dense no-caps size=sm').tooltip('Pre-commitment budget credit simulation' if lang() != 'fr' else 'Simulateur de disponibilité pré-engagement')

            ui.button(
                '📘 ' + ('Manuel' if lang() == 'fr' else 'Guide & Manual'),
                icon='menu_book',
                on_click=_open_budget_manual_dialog,
            ).props('outline color=slate-7 dense no-caps size=sm')

            fy_opts = {fy['id']: f"{fy['code']} ({fy['name']})" for fy in fiscal_years}
            ui.select(
                fy_opts,
                value=state['fy_id'],
                label=_loc('filter_fy'),
                on_change=lambda e: _change_fy(e.value),
            ).props('outlined dense options-dense bg-white').classes('w-56')

    w.page_header(
        _loc('title'),
        _loc('subtitle'),
        icon='account_balance_wallet',
        actions=_header_actions,
    )

    # -------------------------------------------------------------------------
    # REVAMPED EXECUTIVE COMMAND HUB (High-Density Hero Hub, KPIs & 5-Stage Flow)
    # -------------------------------------------------------------------------
    tabs_ref: dict[str, Any] = {'tabs': None}

    @ui.refreshable
    def _render_command_hub() -> None:
        rep = state['report'] or {}
        tot_b = rep.get('totalBudget', 0)
        tot_comm = rep.get('totalCommitted', 0)
        tot_spent = rep.get('totalSpent', 0)
        tot_avail = rep.get('remainingBudget', 0)
        pct = rep.get('overallPctConsumed', 0)
        is_fr = lang() == 'fr'

        comms = state.get('commitments', [])
        st_orders = state.get('payment_order_stats') or {}
        tot_mandat = st_orders.get('total_net_amount', 0)
        tot_paid = st_orders.get('total_paid_amount', 0)
        cert_count = len(state.get('certifications', []))
        active_lines = (state.get('active_budget') or {}).get('lines', [])

        da_comms = [c for c in comms if c.get('stage') == 'pre_commitment']
        bc_comms = [c for c in comms if c.get('stage') != 'pre_commitment']
        da_total = sum(float(c.get('amount', 0) or 0) for c in da_comms)
        bc_total = sum(float(c.get('amount', 0) or 0) for c in bc_comms)

        def _goto_stage(tab_name: str, stage_filter: str | None = None) -> None:
            if tabs_ref.get('tabs'):
                tabs_ref['tabs'].set_value(tab_name)
            if stage_filter is not None:
                state['comm_pill_filter'] = stage_filter
                if 'comm' in refreshers:
                    refreshers['comm']()

        with ui.card().classes(
            'w-full p-4 md:p-5 bg-gradient-to-r from-slate-900 via-slate-950 to-teal-950 '
            'text-white rounded-2xl shadow-lg border border-slate-800 gap-3.5'
        ):
            # Top Row: Active Protection Status & Quick Shortcut Pills
            with ui.row().classes('w-full items-center justify-between no-wrap gap-2'):
                with ui.row().classes('items-center gap-2.5'):
                    with ui.element('div').classes('w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-500/30'):
                        ui.icon('shield').classes('text-lg')
                    with ui.column().classes('gap-0'):
                        with ui.row().classes('items-center gap-2'):
                            ui.label('⚡ ' + ('Protection Anti-Déficit AVC Active' if is_fr else 'Real-Time AVC Overrun Protection Active')).classes('text-xs md:text-sm font-extrabold text-white tracking-wide')
                            with ui.element('span').classes('w-2 h-2 rounded-full bg-emerald-400 animate-pulse'):
                                pass
                        ui.label(('Contrôle strict des engagements juridiques et imputations budgétaires OHADA' if is_fr else 'Strict statutory budget verification on all purchase requests & orders')).classes('text-[11px] text-teal-200/80 hidden sm:block')

                with ui.row().classes('items-center gap-1.5 flex-wrap'):
                    ui.button(
                        '➕ ' + _loc('btn_new_comm'),
                        on_click=_open_new_comm_modal,
                    ).props('unelevated bg-teal-600 hover:bg-teal-500 text-white font-bold dense no-caps size=sm rounded')

                    ui.button(
                        '💸 ' + ('Virement' if is_fr else 'Transfer'),
                        on_click=_open_new_transfer_modal,
                    ).props('outline color=slate-3 text-white dense no-caps size=sm rounded')

                    ui.button(
                        '📑 ' + ('Mandats' if is_fr else 'Payment Orders'),
                        on_click=_open_mandats_list_modal,
                    ).props('outline color=purple-3 text-purple-200 dense no-caps size=sm rounded')

                    ui.button(
                        '📜 ' + ('Certifications (PV)' if is_fr else 'Certifications (PV)'),
                        on_click=_open_certifications_list_modal,
                    ).props('outline color=teal-3 text-teal-200 dense no-caps size=sm rounded')

                    with ui.button(icon='more_horiz').props('flat round dense text-color=slate-3 size=sm'):
                        with ui.menu().classes('p-1 rounded-xl shadow-xl border border-slate-200 min-w-[210px]'):
                            ui.menu_item('🛡️ ' + ('Dérogations AVC' if is_fr else 'AVC Overrides & Waivers'), on_click=_open_override_list_modal, auto_close=True).classes('text-xs font-semibold text-amber-800')
                            ui.menu_item('📋 ' + ('Plans de Passation (PPM)' if is_fr else 'Procurement Plans (PPM)'), on_click=_open_procurement_plans_modal, auto_close=True).classes('text-xs font-semibold text-indigo-800')
                            ui.menu_item('📥 ' + ('Importer PTBA (Excel)' if is_fr else 'Import PTBA (Excel)'), on_click=_open_ptba_modal, auto_close=True).classes('text-xs font-semibold text-slate-700')
                            ui.menu_item('📊 ' + ('Rapports & Analyses' if is_fr else 'Reports & Analytics'), on_click=lambda: (tabs_ref['tabs'].set_value('reports') if tabs_ref.get('tabs') else None), auto_close=True).classes('text-xs font-semibold text-emerald-800')

            # Middle Row: 5-Metric Financial Health Ribbon
            with ui.row().classes('w-full gap-2.5 items-stretch flex-wrap md:flex-nowrap'):
                # 1. Total Approved Budget
                with ui.element('div').classes(
                    'flex-1 min-w-[145px] p-3 rounded-xl bg-white/5 border border-white/10 '
                    'flex flex-col justify-between hover:bg-white/10 transition-all'
                ):
                    with ui.row().classes('items-center justify-between no-wrap gap-1'):
                        ui.label(_loc('kpi_total_budget')).classes('text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate')
                        ui.icon('account_balance').classes('text-sky-400 text-sm shrink-0')
                    ui.label(w.money(tot_b, currency)).classes('text-lg xl:text-xl font-extrabold font-mono text-white tracking-tight mt-1 truncate')
                    ui.label(f"{len(active_lines)} {'lignes votées' if is_fr else 'voted lines'}").classes('text-[10px] text-slate-400 truncate')

                # 2. Total Committed
                with ui.element('div').classes(
                    'flex-1 min-w-[145px] p-3 rounded-xl bg-white/5 border border-white/10 '
                    'flex flex-col justify-between hover:bg-white/10 transition-all'
                ):
                    with ui.row().classes('items-center justify-between no-wrap gap-1'):
                        ui.label(_loc('kpi_committed')).classes('text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate')
                        ui.icon('assignment_turned_in').classes('text-amber-400 text-sm shrink-0')
                    ui.label(w.money(tot_comm, currency)).classes('text-lg xl:text-xl font-extrabold font-mono text-amber-300 tracking-tight mt-1 truncate')
                    comm_pct = round((tot_comm / tot_b * 100) if tot_b else 0, 1)
                    ui.label(f"{len(comms)} {'engagements' if is_fr else 'commitments'} ({comm_pct}%)").classes('text-[10px] text-amber-200/70 truncate')

                # 3. Liquidated / Actual Spent
                with ui.element('div').classes(
                    'flex-1 min-w-[145px] p-3 rounded-xl bg-white/5 border border-white/10 '
                    'flex flex-col justify-between hover:bg-white/10 transition-all'
                ):
                    with ui.row().classes('items-center justify-between no-wrap gap-1'):
                        ui.label(_loc('kpi_actual')).classes('text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate')
                        ui.icon('receipt_long').classes('text-indigo-400 text-sm shrink-0')
                    ui.label(w.money(tot_spent, currency)).classes('text-lg xl:text-xl font-extrabold font-mono text-indigo-300 tracking-tight mt-1 truncate')
                    ui.label(f"{'Ordonnancé :' if is_fr else 'Mandated:'} {w.money(tot_mandat, currency)}").classes('text-[10px] text-indigo-200/70 truncate')

                # 4. Net Available Appropriations
                avail_color = 'text-emerald-400' if tot_avail >= 0 else 'text-rose-400'
                avail_badge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' if tot_avail >= 0 else 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                with ui.element('div').classes(
                    'flex-1 min-w-[145px] p-3 rounded-xl bg-white/5 border border-white/10 '
                    'flex flex-col justify-between hover:bg-white/10 transition-all'
                ):
                    with ui.row().classes('items-center justify-between no-wrap gap-1'):
                        ui.label(_loc('kpi_available')).classes('text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate')
                        ui.icon('savings' if tot_avail >= 0 else 'warning').classes(f"{'text-emerald-400' if tot_avail >= 0 else 'text-rose-400'} text-sm shrink-0")
                    ui.label(w.money(tot_avail, currency)).classes(f'text-lg xl:text-xl font-extrabold font-mono {avail_color} tracking-tight mt-1 truncate')
                    with ui.element('div').classes(f'text-[10px] font-bold px-1.5 py-0.5 rounded border {avail_badge} w-fit truncate'):
                        ui.label(('Solde Positif' if tot_avail >= 0 else 'Déficit!') if is_fr else ('Solvent Balance' if tot_avail >= 0 else 'Overrun Alert!'))

                # 5. Overall Execution Rate %
                rate_text_color = 'text-rose-400' if pct > 90 else ('text-amber-400' if pct > 75 else 'text-teal-300')
                rate_bar_color = 'negative' if pct > 90 else ('warning' if pct > 75 else 'teal')
                with ui.element('div').classes(
                    'flex-1 min-w-[145px] p-3 rounded-xl bg-white/5 border border-white/10 '
                    'flex flex-col justify-between hover:bg-white/10 transition-all'
                ):
                    with ui.row().classes('items-center justify-between no-wrap gap-1'):
                        ui.label(_loc('kpi_rate')).classes('text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate')
                        ui.icon('speed').classes('text-teal-400 text-sm shrink-0')
                    with ui.row().classes('items-baseline gap-1.5 no-wrap mt-1'):
                        ui.label(f"{pct}%").classes(f'text-lg xl:text-xl font-extrabold font-mono {rate_text_color}')
                        ui.label(_loc('consumed_label')).classes('text-[10px] text-slate-400')
                    ui.linear_progress(value=min(1.0, pct / 100.0), size='5px').props(f'rounded color={rate_bar_color}').classes('w-full mt-1')

            # Bottom Row: Interactive 5-Stage Statutory Expenditure Pipeline
            with ui.element('div').classes('w-full pt-1.5 border-t border-slate-800/80 flex flex-col gap-1'):
                with ui.row().classes('items-center justify-between no-wrap'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('account_tree').classes('text-teal-400 text-xs')
                        ui.label(('Chaîne Réglementaire de la Dépense (OHADA / CEMAC)' if is_fr else 'Statutory Expenditure Lifecycle (OHADA / CEMAC)')).classes('text-[11px] font-bold uppercase tracking-wider text-slate-400')
                    ui.label(('Cliquez sur une étape pour filtrer ou agir' if is_fr else 'Click any step to inspect or execute')).classes('text-[10px] text-teal-300/80 italic hidden sm:block')

                with ui.row().classes('w-full gap-2 items-center justify-between no-wrap overflow-x-auto py-0.5'):
                    # Step 1: Voted Budget
                    with ui.element('div').classes(
                        'flex-1 min-w-[150px] p-2 rounded-xl bg-slate-900/70 border border-slate-700/60 '
                        'hover:border-sky-400/60 hover:bg-sky-950/40 cursor-pointer transition-all'
                    ).on('click', lambda: _goto_stage('plans')):
                        with ui.row().classes('items-center justify-between no-wrap'):
                            with ui.row().classes('items-center gap-1.5'):
                                ui.label('1').classes('w-4 h-4 rounded-full bg-sky-500 text-slate-950 font-black text-[10px] flex items-center justify-center')
                                ui.label(('Budget Voté' if is_fr else 'Voted Budget')).classes('text-[11px] font-bold text-slate-200')
                            ui.icon('table_chart').classes('text-sky-400 text-xs')
                        with ui.row().classes('items-baseline justify-between no-wrap mt-1'):
                            ui.label(w.money(tot_b, currency)).classes('text-xs font-mono font-bold text-sky-300 truncate')
                            ui.label(f"{len(active_lines)}").classes('text-[10px] text-slate-400 font-mono')

                    ui.icon('chevron_right').classes('text-slate-600 text-xs shrink-0')

                    # Step 2: Demande d'Achat (DA)
                    with ui.element('div').classes(
                        'flex-1 min-w-[150px] p-2 rounded-xl bg-slate-900/70 border border-slate-700/60 '
                        'hover:border-cyan-400/60 hover:bg-cyan-950/40 cursor-pointer transition-all'
                    ).on('click', lambda: _goto_stage('comm', 'da')):
                        with ui.row().classes('items-center justify-between no-wrap'):
                            with ui.row().classes('items-center gap-1.5'):
                                ui.label('2').classes('w-4 h-4 rounded-full bg-cyan-400 text-slate-950 font-black text-[10px] flex items-center justify-center')
                                ui.label(('Demande d’Achat (DA)' if is_fr else 'Requisition (DA)')).classes('text-[11px] font-bold text-slate-200')
                            ui.icon('pending_actions').classes('text-cyan-400 text-xs')
                        with ui.row().classes('items-baseline justify-between no-wrap mt-1'):
                            ui.label(w.money(da_total, currency)).classes('text-xs font-mono font-bold text-cyan-300 truncate')
                            ui.label(f"{len(da_comms)} DA").classes('text-[10px] text-cyan-200/80 font-mono')

                    ui.icon('chevron_right').classes('text-slate-600 text-xs shrink-0')

                    # Step 3: Bon de Commande (BC)
                    with ui.element('div').classes(
                        'flex-1 min-w-[150px] p-2 rounded-xl bg-slate-900/70 border border-slate-700/60 '
                        'hover:border-purple-400/60 hover:bg-purple-950/40 cursor-pointer transition-all'
                    ).on('click', lambda: _goto_stage('comm', 'bc')):
                        with ui.row().classes('items-center justify-between no-wrap'):
                            with ui.row().classes('items-center gap-1.5'):
                                ui.label('3').classes('w-4 h-4 rounded-full bg-purple-400 text-slate-950 font-black text-[10px] flex items-center justify-center')
                                ui.label(('Bon de Commande (BC)' if is_fr else 'Purchase Order (BC)')).classes('text-[11px] font-bold text-slate-200')
                            ui.icon('shopping_bag').classes('text-purple-400 text-xs')
                        with ui.row().classes('items-baseline justify-between no-wrap mt-1'):
                            ui.label(w.money(bc_total, currency)).classes('text-xs font-mono font-bold text-purple-300 truncate')
                            ui.label(f"{len(bc_comms)} BC").classes('text-[10px] text-purple-200/80 font-mono')

                    ui.icon('chevron_right').classes('text-slate-600 text-xs shrink-0')

                    # Step 4: Service Fait (PV)
                    with ui.element('div').classes(
                        'flex-1 min-w-[150px] p-2 rounded-xl bg-slate-900/70 border border-slate-700/60 '
                        'hover:border-teal-400/60 hover:bg-teal-950/40 cursor-pointer transition-all'
                    ).on('click', lambda: _open_certifications_list_modal()):
                        with ui.row().classes('items-center justify-between no-wrap'):
                            with ui.row().classes('items-center gap-1.5'):
                                ui.label('4').classes('w-4 h-4 rounded-full bg-teal-400 text-slate-950 font-black text-[10px] flex items-center justify-center')
                                ui.label(('Service Fait (PV)' if is_fr else 'Service Delivery (PV)')).classes('text-[11px] font-bold text-slate-200')
                            ui.icon('verified').classes('text-teal-400 text-xs')
                        with ui.row().classes('items-baseline justify-between no-wrap mt-1'):
                            ui.label(f"{cert_count} PV").classes('text-xs font-mono font-bold text-teal-300 truncate')
                            ui.label(('Certifié' if is_fr else 'Verified')).classes('text-[10px] text-teal-200/80')

                    ui.icon('chevron_right').classes('text-slate-600 text-xs shrink-0')

                    # Step 5: Mandats & Paiement
                    with ui.element('div').classes(
                        'flex-1 min-w-[150px] p-2 rounded-xl bg-slate-900/70 border border-slate-700/60 '
                        'hover:border-emerald-400/60 hover:bg-emerald-950/40 cursor-pointer transition-all'
                    ).on('click', lambda: _open_mandats_list_modal()):
                        with ui.row().classes('items-center justify-between no-wrap'):
                            with ui.row().classes('items-center gap-1.5'):
                                ui.label('5').classes('w-4 h-4 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px] flex items-center justify-center')
                                ui.label(('Mandats & Trésorerie' if is_fr else 'Mandats & Payment')).classes('text-[11px] font-bold text-slate-200')
                            ui.icon('payments').classes('text-emerald-400 text-xs')
                        with ui.row().classes('items-baseline justify-between no-wrap mt-1'):
                            ui.label(w.money(tot_mandat, currency)).classes('text-xs font-mono font-bold text-emerald-300 truncate')
                            ui.label(f"{'Payé:' if is_fr else 'Paid:'} {w.money(tot_paid, currency)}").classes('text-[10px] text-emerald-200/80 font-mono truncate')

        _update_tab_badges()

    refreshers['kpis'] = _render_command_hub.refresh
    refreshers['quick_launcher'] = _render_command_hub.refresh
    refreshers['stepper'] = _render_command_hub.refresh
    refreshers['command_hub'] = _render_command_hub.refresh
    _render_command_hub()

    # Navigation Tabs with Live Reactive Counters
    tabs = ui.tabs().props('active-color=teal-9 active-bg-color=teal-50 indicator-color=teal-7 inline-label no-caps align=left').classes(
        'w-full border-b border-slate-200 bg-white rounded-t-2xl px-2 pt-1 shadow-2xs font-bold text-slate-600 gap-1'
    )
    tabs_ref['tabs'] = tabs
    with tabs:
        with ui.tab('exec').classes('rounded-t-xl px-3 py-1') as t_exec:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('query_stats').classes('text-teal-700 text-base')
                ui.label(_loc('tab_exec')).classes('text-xs')
                tab_badges['exec'] = ui.badge('', color='teal-8').classes('text-[10px] px-1.5 py-0.2 font-mono')

        with ui.tab('plans').classes('rounded-t-xl px-3 py-1') as t_plans:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('table_chart').classes('text-sky-700 text-base')
                ui.label(_loc('tab_plans')).classes('text-xs')
                tab_badges['plans'] = ui.badge('', color='slate-7').classes('text-[10px] px-1.5 py-0.2 font-mono')

        with ui.tab('comm').classes('rounded-t-xl px-3 py-1') as t_comm:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('shopping_cart_checkout').classes('text-amber-700 text-base')
                ui.label(_loc('tab_comm')).classes('text-xs')
                tab_badges['comm'] = ui.badge('', color='amber-8').classes('text-[10px] px-1.5 py-0.2 font-mono')

        with ui.tab('trans').classes('rounded-t-xl px-3 py-1') as t_trans:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('sync_alt').classes('text-indigo-700 text-base')
                ui.label(_loc('tab_trans')).classes('text-xs')
                tab_badges['trans'] = ui.badge('', color='indigo-7').classes('text-[10px] px-1.5 py-0.2 font-mono')

        with ui.tab('carry').classes('rounded-t-xl px-3 py-1') as t_carry:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('move_up').classes('text-purple-700 text-base')
                ui.label(_loc('tab_carry')).classes('text-xs')

        with ui.tab('comp').classes('rounded-t-xl px-3 py-1') as t_comp:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('compare_arrows').classes('text-cyan-700 text-base')
                ui.label(_loc('tab_comp')).classes('text-xs')

        with ui.tab('alloc').classes('rounded-t-xl px-3 py-1') as t_alloc:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('hub').classes('text-orange-700 text-base')
                ui.label(_loc('tab_alloc')).classes('text-xs')

        with ui.tab('reports').classes('rounded-t-xl px-3 py-1') as t_reports:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('insights').classes('text-emerald-700 text-base')
                ui.label(_loc('tab_reports')).classes('text-xs')

        with ui.tab('sage_sync').classes('rounded-t-xl px-3 py-1') as t_sage:
            with ui.row().classes('items-center gap-1.5 no-wrap'):
                ui.icon('cloud_sync').classes('text-teal-700 text-base')
                ui.label(_loc('tab_sage_sync')).classes('text-xs')
                ui.badge('Sage ERP', color='teal-9').classes('text-[9px] px-1.5 py-0.2 font-mono')

    _update_tab_badges()

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
                    breach_count = sum(1 for r in rows if r.get('avc_status') == 'breach')
                    warning_count = sum(1 for r in rows if r.get('avc_status') == 'warning')
                    normal_count = len(rows) - breach_count - warning_count
                    is_fr = lang() == 'fr'

                    cur_status_filter = state.get('exec_status_filter', 'all')

                    def _set_status_filter(st_val: str) -> None:
                        state['exec_status_filter'] = st_val
                        _render_exec_tab.refresh()

                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.row().classes('items-center gap-3 flex-wrap'):
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
                            ).props('outlined dense options-dense bg-white').classes('w-64')

                            with ui.row().classes('items-center gap-1.5'):
                                all_cls = 'bg-teal-700 text-white font-bold' if cur_status_filter == 'all' else 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                ui.button(f"{len(rows)} {'lignes' if is_fr else 'lines'}", on_click=lambda: _set_status_filter('all')).props(f'unelevated dense no-caps size=xs class="{all_cls} border border-slate-300 rounded-md px-2 py-1"')

                                if breach_count > 0:
                                    br_cls = 'bg-red-700 text-white font-bold' if cur_status_filter == 'breach' else 'bg-red-50 text-red-700 hover:bg-red-100'
                                    ui.button(f"🔴 {breach_count} {'Dépassements' if is_fr else 'Overruns'}", on_click=lambda: _set_status_filter('breach')).props(f'unelevated dense no-caps size=xs class="{br_cls} border border-red-200 rounded-md px-2 py-1"')

                                if warning_count > 0:
                                    wn_cls = 'bg-amber-600 text-white font-bold' if cur_status_filter == 'warning' else 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    ui.button(f"🟡 {warning_count} {'Alertes' if is_fr else 'Warnings'}", on_click=lambda: _set_status_filter('warning')).props(f'unelevated dense no-caps size=xs class="{wn_cls} border border-amber-200 rounded-md px-2 py-1"')

                                if normal_count > 0:
                                    ok_cls = 'bg-emerald-700 text-white font-bold' if cur_status_filter == 'normal' else 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    ui.button(f"🟢 {normal_count} {'Conformes' if is_fr else 'Within Budget'}", on_click=lambda: _set_status_filter('normal')).props(f'unelevated dense no-caps size=xs class="{ok_cls} border border-emerald-200 rounded-md px-2 py-1"')

                        with ui.row().classes('items-center gap-2'):
                            search_inp = ui.input(placeholder=_loc('search_placeholder')).props('outlined dense clearable bg-white')
                            search_inp.classes('w-64')

                    # Filter rows by status filter if active
                    filtered_rows = rows
                    if cur_status_filter == 'breach':
                        filtered_rows = [r for r in rows if r.get('avc_status') == 'breach']
                    elif cur_status_filter == 'warning':
                        filtered_rows = [r for r in rows if r.get('avc_status') == 'warning']
                    elif cur_status_filter == 'normal':
                        filtered_rows = [r for r in rows if r.get('avc_status') not in ('breach', 'warning')]

                    table_rows = []
                    active_lines = (state['active_budget'] or {}).get('lines', [])
                    for r in filtered_rows:
                        b_type_str = _tr_type(r.get('budget_type') or ('capex' if r.get('account_class') == 2 else 'opex'))
                        acct_str = _tr_account(r.get('account_code'), r.get('account_name'), r.get('account_name_en'))
                        dept_str = _tr_dept(r.get('cost_center_name'), r.get('cost_center_name_en'))
                        prog_str = _tr_prog(r.get('program_code'), r.get('program_name_en'))
                        avc_badge_text, _, _ = _tr_avc_badge(r.get('avc_status'))

                        matched_line = next((l for l in active_lines if l.get('account_id') == r.get('account_id') and (not r.get('cost_center_id') or l.get('cost_center_id') == r.get('cost_center_id'))), None)
                        matched_id = matched_line['id'] if matched_line else None

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
                            'avc': avc_badge_text,
                            '_avail_num': r.get('remaining_budget', 0),
                            '_rate_num': r.get('pct_consumed', 0),
                            '_avc_raw': r.get('avc_status', 'normal'),
                            '_line_id': matched_id,
                            '_btn_commit': 'Engager' if is_fr else 'Commit',
                            '_btn_check': 'Tester' if is_fr else 'Check',
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
                        {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center', 'sortable': True},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
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

                    exec_table.add_slot('body-cell-avc', '''
                        <q-td :props="props">
                            <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                    :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                    class="text-weight-bold">
                                {{ props.value }}
                            </q-chip>
                        </q-td>
                    ''')

                    exec_table.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <div class="row no-wrap gap-1 justify-center" v-if="props.row._line_id">
                                <q-btn dense unelevated color="teal" icon="bolt" :label="props.row._btn_commit" size="xs"
                                       @click="$parent.$emit('quick_commit', props.row._line_id)" class="q-px-xs" />
                                <q-btn dense outline color="primary" icon="calculate" :label="props.row._btn_check" size="xs"
                                       @click="$parent.$emit('quick_check', props.row._line_id)" class="q-px-xs" />
                            </div>
                            <span v-else class="text-grey-5 text-caption">—</span>
                        </q-td>
                    ''')

                    async def _on_quick_commit(e):
                        await _open_new_comm_modal(initial_line_id=int(e.args))

                    exec_table.on('quick_commit', _on_quick_commit)
                    exec_table.on('quick_check', lambda e: _open_quick_checker_modal(preselected_line_id=int(e.args)))

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
                view_mode = state.get('view_mode', 'annual')

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
                                warn_th = b.get('warning_threshold_pct', 80.0)
                                block_th = b.get('block_threshold_pct', 100.0)
                                ui.badge(f"AVC: {warn_th}% / {block_th}%", color='indigo-7').props('outline')
                        else:
                            ui.label(_loc('no_plan_notice')).classes('text-slate-500 italic')

                        with ui.row().classes('items-center gap-2 flex-wrap justify-end'):
                            if b and b.get('status') != 'approved':
                                ui.button(_loc('btn_approve'), icon='check_circle', on_click=_handle_approve_budget).props('unelevated color=positive').classes('font-semibold shadow-xs')

                            # Primary CTA
                            ui.button(_loc('btn_new_line'), icon='add', on_click=_open_add_line_modal).props('unelevated color=primary').classes('font-semibold shadow-xs')

                            # Group 1: PTBA & Phasing Menu
                            if b:
                                with ui.button(_loc('btn_grp_ptba'), icon='tune').props('outline color=teal dense').classes('font-medium'):
                                    with ui.menu().classes('p-1 rounded-xl shadow-lg border border-slate-200 min-w-[220px]'):
                                        ui.menu_item(_loc('btn_ptba_import'), on_click=_open_ptba_modal, auto_close=True).classes('text-xs font-semibold text-teal-800')
                                        ui.menu_item(_loc('btn_respread'), on_click=_open_respread_modal, auto_close=True).classes('text-xs font-semibold text-slate-700')
                                        ui.menu_item(_loc('btn_avc_settings'), on_click=_open_avc_settings_modal, auto_close=True).classes('text-xs font-semibold text-slate-700')

                            # Group 2: Procurement & PPM Menu
                            with ui.button(_loc('btn_grp_ppm'), icon='assignment').props('outline color=indigo dense').classes('font-medium'):
                                with ui.menu().classes('p-1 rounded-xl shadow-lg border border-slate-200 min-w-[220px]'):
                                    ui.menu_item(_loc('btn_ppm'), on_click=_open_procurement_plans_modal, auto_close=True).classes('text-xs font-semibold text-indigo-800')
                                    ui.menu_item(_loc('btn_ppm_packages'), on_click=lambda: _open_procurement_packages_modal(state.get('active_ppm_id')), auto_close=True).classes('text-xs font-semibold text-slate-700')
                                    ui.menu_item(_loc('btn_thresholds'), on_click=_open_thresholds_modal, auto_close=True).classes('text-xs font-semibold text-slate-700')

                            # Group 3: Governance & Rollovers Menu
                            with ui.button(_loc('btn_grp_gov'), icon='account_tree').props('outline color=purple dense').classes('font-medium'):
                                with ui.menu().classes('p-1 rounded-xl shadow-lg border border-slate-200 min-w-[220px]'):
                                    ui.menu_item(_loc('btn_derivations'), on_click=_open_derivation_rules_modal, auto_close=True).classes('text-xs font-semibold text-purple-800')
                                    ui.menu_item(_loc('btn_carryforward'), on_click=_open_carryforward_modal, auto_close=True).classes('text-xs font-semibold text-amber-800')
                                    ui.menu_item(_loc('btn_new_budget'), on_click=_open_new_budget_modal, auto_close=True).classes('text-xs font-semibold text-slate-700')

                    # View Mode Toggle & Search Row
                    with ui.row().classes('w-full items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200 mt-1'):
                        with ui.row().classes('items-center gap-3'):
                            ui.label(_loc('lbl_display_mode')).classes('text-xs font-bold text-slate-600')

                            def _switch_mode(val: str) -> None:
                                state['view_mode'] = val
                                _render_plans_tab.refresh()

                            ui.toggle(
                                {'annual': f"📋 {_loc('view_annual')}", 'quarterly': f"⏱️ {_loc('view_quarterly')}"},
                                value=view_mode,
                                on_change=lambda e: _switch_mode(e.value)
                            ).props('dense no-caps toggle-color=primary bg-white')

                        search_plans_inp = ui.input(placeholder=_loc('search_placeholder')).props('outlined dense clearable bg-white').classes('w-64')

                    lines_lookup = {l['id']: l for l in lines}
                    btn_edit_txt = _loc('btn_edit_line')

                    if view_mode == 'quarterly':
                        q_rows = []
                        for l in lines:
                            acct_str = _tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))
                            dept_str = _tr_dept(l.get('cost_center_name'), l.get('cost_center_name_en'))
                            curve_str = _tr_curve(l.get('spread_curve'))
                            avc_text, _, _ = _tr_avc_badge(l.get('avc_status'))

                            q1_amt = float(l.get('q1_amount') or 0)
                            q1_act = float(l.get('q1_actual') or 0)
                            q1_comm = float(l.get('q1_committed') or 0)
                            q1_spent = q1_act + q1_comm

                            q2_amt = float(l.get('q2_amount') or 0)
                            q2_act = float(l.get('q2_actual') or 0)
                            q2_comm = float(l.get('q2_committed') or 0)
                            q2_spent = q2_act + q2_comm

                            q3_amt = float(l.get('q3_amount') or 0)
                            q3_act = float(l.get('q3_actual') or 0)
                            q3_comm = float(l.get('q3_committed') or 0)
                            q3_spent = q3_act + q3_comm

                            q4_amt = float(l.get('q4_amount') or 0)
                            q4_act = float(l.get('q4_actual') or 0)
                            q4_comm = float(l.get('q4_committed') or 0)
                            q4_spent = q4_act + q4_comm

                            q_rows.append({
                                'id': l.get('id'),
                                'account': acct_str,
                                'dept': dept_str,
                                'amount': w.money(l.get('revised_amount', 0), currency),
                                'curve': curve_str,
                                'q1': f"{w.money(q1_amt, currency)} (Dép: {w.money(q1_spent, currency)})",
                                'q2': f"{w.money(q2_amt, currency)} (Dép: {w.money(q2_spent, currency)})",
                                'q3': f"{w.money(q3_amt, currency)} (Dép: {w.money(q3_spent, currency)})",
                                'q4': f"{w.money(q4_amt, currency)} (Dép: {w.money(q4_spent, currency)})",
                                'avc': avc_text,
                                '_avc_raw': l.get('avc_status', 'normal'),
                                '_btn_edit': btn_edit_txt,
                            })

                        q_cols = [
                            {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                            {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                            {'name': 'amount', 'label': _loc('col_budget'), 'field': 'amount', 'align': 'right', 'sortable': True},
                            {'name': 'curve', 'label': _loc('col_curve'), 'field': 'curve', 'align': 'center'},
                            {'name': 'q1', 'label': _loc('col_q1'), 'field': 'q1', 'align': 'right'},
                            {'name': 'q2', 'label': _loc('col_q2'), 'field': 'q2', 'align': 'right'},
                            {'name': 'q3', 'label': _loc('col_q3'), 'field': 'q3', 'align': 'right'},
                            {'name': 'q4', 'label': _loc('col_q4'), 'field': 'q4', 'align': 'right'},
                            {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center'},
                            {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                        ]

                        q_table = ui.table(columns=q_cols, rows=q_rows, pagination=15).classes('w-full lc-table')
                        q_table.bind_filter_from(search_plans_inp, 'value')

                        q_table.add_slot('body-cell-avc', '''
                            <q-td :props="props">
                                <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                        :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                        class="text-weight-bold">
                                    {{ props.value }}
                                </q-chip>
                            </q-td>
                        ''')

                        q_table.add_slot('body-cell-actions', '''
                            <q-td :props="props">
                                <q-btn size="xs" color="primary" dense outline icon="edit" :label="props.row._btn_edit"
                                       @click="$parent.$emit('edit-line', props.row.id)" />
                            </q-td>
                        ''')

                        q_table.on('edit-line', lambda e: _open_edit_line_modal(lines_lookup.get(e.args)))

                    else:
                        line_rows = []
                        for l in lines:
                            acct_str = _tr_account(l.get('account_code'), l.get('account_name'), l.get('account_name_en'))
                            dept_str = _tr_dept(l.get('cost_center_name'), l.get('cost_center_name_en'))
                            prog_str = _tr_prog(l.get('program_code'), l.get('program_name_en'))
                            type_str = _tr_type(l.get('budget_type'))
                            ctrl_str = _tr_ctrl(l.get('control_mode'))
                            curve_str = _tr_curve(l.get('spread_curve'))
                            avc_text, _, _ = _tr_avc_badge(l.get('avc_status'))
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
                                'curve': curve_str,
                                'control': ctrl_str,
                                'avc': avc_text,
                                'notes': notes_str,
                                '_avc_raw': l.get('avc_status', 'normal'),
                                '_btn_edit': btn_edit_txt,
                            })

                        line_cols = [
                            {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                            {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                            {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                            {'name': 'program', 'label': _loc('col_program'), 'field': 'program', 'align': 'left'},
                            {'name': 'initial', 'label': _loc('col_initial'), 'field': 'initial', 'align': 'right'},
                            {'name': 'carried', 'label': _loc('col_carried'), 'field': 'carried', 'align': 'right'},
                            {'name': 'transfers', 'label': _loc('col_transfers'), 'field': 'transfers', 'align': 'right'},
                            {'name': 'amount', 'label': _loc('col_budget'), 'field': 'amount', 'align': 'right', 'sortable': True},
                            {'name': 'curve', 'label': _loc('col_curve'), 'field': 'curve', 'align': 'center'},
                            {'name': 'control', 'label': _loc('col_control_mode'), 'field': 'control', 'align': 'center'},
                            {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center'},
                            {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                        ]

                        table_annual = ui.table(columns=line_cols, rows=line_rows, pagination=15).classes('w-full lc-table')
                        table_annual.bind_filter_from(search_plans_inp, 'value')

                        table_annual.add_slot('body-cell-avc', '''
                            <q-td :props="props">
                                <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                        :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                        class="text-weight-bold">
                                    {{ props.value }}
                                </q-chip>
                            </q-td>
                        ''')

                        table_annual.add_slot('body-cell-actions', '''
                            <q-td :props="props">
                                <q-btn size="xs" color="primary" dense outline icon="edit" :label="props.row._btn_edit"
                                       @click="$parent.$emit('edit-line', props.row.id)" />
                            </q-td>
                        ''')

                        table_annual.on('edit-line', lambda e: _open_edit_line_modal(lines_lookup.get(e.args)))

            refreshers['plans'] = _render_plans_tab.refresh
            _render_plans_tab()

        # ---------------------------------------------------------------------
        # TAB 3: COMMITMENTS (ENGAGEMENTS)
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_comm).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_comm_tab() -> None:
                comms = state['commitments']
                is_fr = lang() == 'fr'
                cur_pill = state.get('comm_pill_filter', 'all')

                all_cnt = len(comms)
                da_cnt = sum(1 for c in comms if c.get('stage') == 'pre_commitment')
                bc_cnt = sum(1 for c in comms if c.get('stage') != 'pre_commitment')
                draft_cnt = sum(1 for c in comms if c.get('status') == 'draft')
                appr_cnt = sum(1 for c in comms if c.get('status') == 'approved')
                cert_cnt = sum(1 for c in comms if float(c.get('certified_amount', 0) or 0) > 0)
                mand_cnt = sum(1 for c in comms if float(c.get('mandated_amount', 0) or 0) > 0)

                def _set_pill(val: str) -> None:
                    state['comm_pill_filter'] = val
                    _render_comm_tab.refresh()

                with ui.card().classes('w-full p-4 gap-3'):
                    # Row 1: Section Title & Primary Action Buttons
                    with ui.row().classes('w-full items-center justify-between no-wrap gap-2 flex-wrap sm:flex-nowrap'):
                        with ui.column().classes('gap-0'):
                            ui.label(_loc('lbl_comm_section_title')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('note_comm_intro')).classes('text-xs text-slate-500 max-w-2xl hidden md:block')

                        with ui.row().classes('items-center gap-2 flex-wrap'):
                            ui.button(_loc('btn_mandats_register'), icon='receipt_long', on_click=_open_mandats_list_modal).props('outline color=purple-8 dense no-caps size=sm')
                            ui.button(_loc('btn_view_certs'), icon='verified', on_click=_open_certifications_list_modal).props('outline color=teal dense no-caps size=sm')
                            ui.button(_loc('btn_overrides'), icon='shield', on_click=_open_override_list_modal).props('outline color=amber-800 dense no-caps size=sm')
                            ui.button(_loc('btn_new_comm'), icon='add_shopping_cart', on_click=_open_new_comm_modal).props('unelevated color=teal text-white dense no-caps font-bold shadow-xs size=sm')

                    # Row 2: Filter Pills & Instant Search
                    with ui.row().classes('w-full items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 gap-2 flex-wrap'):
                        with ui.row().classes('items-center gap-1.5 flex-wrap'):
                            p_all_cls = 'bg-teal-700 text-white font-bold' if cur_pill == 'all' else 'bg-white text-slate-700 hover:bg-slate-100'
                            ui.button(f"{_loc('filter_pill_all')} ({all_cnt})", on_click=lambda: _set_pill('all')).props(f'unelevated dense no-caps size=xs class="{p_all_cls} border border-slate-300 rounded-lg px-2.5 py-1"')

                            p_da_cls = 'bg-cyan-700 text-white font-bold' if cur_pill == 'da' else 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
                            ui.button(f"🛒 {_loc('filter_pill_da')} ({da_cnt})", on_click=lambda: _set_pill('da')).props(f'unelevated dense no-caps size=xs class="{p_da_cls} border border-cyan-200 rounded-lg px-2.5 py-1"')

                            p_bc_cls = 'bg-purple-800 text-white font-bold' if cur_pill == 'bc' else 'bg-purple-50 text-purple-900 hover:bg-purple-100'
                            ui.button(f"📦 {_loc('filter_pill_bc')} ({bc_cnt})", on_click=lambda: _set_pill('bc')).props(f'unelevated dense no-caps size=xs class="{p_bc_cls} border border-purple-200 rounded-lg px-2.5 py-1"')

                            if draft_cnt > 0:
                                p_dr_cls = 'bg-amber-700 text-white font-bold' if cur_pill == 'draft' else 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                ui.button(f"🕒 {_loc('filter_pill_draft')} ({draft_cnt})", on_click=lambda: _set_pill('draft')).props(f'unelevated dense no-caps size=xs class="{p_dr_cls} border border-amber-200 rounded-lg px-2.5 py-1"')

                            if appr_cnt > 0:
                                p_ap_cls = 'bg-emerald-700 text-white font-bold' if cur_pill == 'approved' else 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                ui.button(f"✅ {_loc('filter_pill_approved')} ({appr_cnt})", on_click=lambda: _set_pill('approved')).props(f'unelevated dense no-caps size=xs class="{p_ap_cls} border border-emerald-200 rounded-lg px-2.5 py-1"')

                            if cert_cnt > 0:
                                p_ce_cls = 'bg-teal-800 text-white font-bold' if cur_pill == 'certified' else 'bg-teal-50 text-teal-900 hover:bg-teal-100'
                                ui.button(f"📜 {_loc('filter_pill_certified')} ({cert_cnt})", on_click=lambda: _set_pill('certified')).props(f'unelevated dense no-caps size=xs class="{p_ce_cls} border border-teal-200 rounded-lg px-2.5 py-1"')

                            if mand_cnt > 0:
                                p_ma_cls = 'bg-indigo-800 text-white font-bold' if cur_pill == 'mandated' else 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                                ui.button(f"💰 {_loc('filter_pill_mandated')} ({mand_cnt})", on_click=lambda: _set_pill('mandated')).props(f'unelevated dense no-caps size=xs class="{p_ma_cls} border border-indigo-200 rounded-lg px-2.5 py-1"')

                        search_comm_inp = ui.input(placeholder=_loc('comm_search_placeholder')).props('outlined dense clearable bg-white').classes('w-72')

                    # Filter comms by pill
                    filtered_comms = comms
                    if cur_pill == 'da':
                        filtered_comms = [c for c in comms if c.get('stage') == 'pre_commitment']
                    elif cur_pill == 'bc':
                        filtered_comms = [c for c in comms if c.get('stage') != 'pre_commitment']
                    elif cur_pill == 'draft':
                        filtered_comms = [c for c in comms if c.get('status') == 'draft']
                    elif cur_pill == 'approved':
                        filtered_comms = [c for c in comms if c.get('status') == 'approved']
                    elif cur_pill == 'certified':
                        filtered_comms = [c for c in comms if float(c.get('certified_amount', 0) or 0) > 0]
                    elif cur_pill == 'mandated':
                        filtered_comms = [c for c in comms if float(c.get('mandated_amount', 0) or 0) > 0]

                    comm_rows = []
                    btn_approve_txt = _loc('btn_approve_comm')
                    btn_liquidate_txt = _loc('btn_liquidate_comm')
                    btn_convert_txt = _loc('btn_convert_bc')
                    btn_certify_txt = _loc('btn_certify')
                    btn_mandate_txt = _loc('btn_create_mandat_for_comm')

                    for c in filtered_comms:
                        asset_str = _tr_asset(c.get('asset_tag'), c.get('asset_name'), c.get('asset_name_en'))
                        desc_str = _tr_val(c.get('description'))
                        type_str = _tr_type(c.get('budget_type'))
                        acct_code = c.get('account_code') or ''
                        is_da = c.get('stage') == 'pre_commitment'
                        amt_num = float(c.get('amount', 0) or 0)

                        comm_rows.append({
                            'id': c.get('id'),
                            'ref': c.get('commitment_number'),
                            'date': str(c.get('committed_date') or '')[:10],
                            'stage': _loc('stage_da_badge') if is_da else _loc('stage_bc_badge'),
                            '_stage': c.get('stage') or 'firm_commitment',
                            '_ppm_pkg_id': c.get('procurement_package_id'),
                            'desc': desc_str,
                            'account': f"{acct_code} ({type_str})",
                            'vendor': c.get('vendor_name') or '—',
                            'asset': asset_str,
                            'amount': w.money(amt_num, currency),
                            '_amount_raw': amt_num,
                            'certified': w.money(c.get('certified_amount', 0), currency),
                            '_certified_raw': float(c.get('certified_amount', 0) or 0),
                            'mandated': w.money(c.get('mandated_amount', 0), currency),
                            '_mandated_raw': float(c.get('mandated_amount', 0) or 0),
                            'status': _tr_status(c.get('status')),
                            '_status_raw': c.get('status'),
                            '_btn_approve': btn_approve_txt,
                            '_btn_liquidate': btn_liquidate_txt,
                            '_btn_convert': btn_convert_txt,
                            '_btn_certify': btn_certify_txt,
                            '_btn_mandate': btn_mandate_txt,
                        })

                    comm_cols = [
                        {'name': 'ref', 'label': _loc('col_ref'), 'field': 'ref', 'align': 'left', 'sortable': True},
                        {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center', 'sortable': True},
                        {'name': 'stage', 'label': _loc('col_stage'), 'field': 'stage', 'align': 'center', 'sortable': True},
                        {'name': 'desc', 'label': _loc('col_desc'), 'field': 'desc', 'align': 'left'},
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left'},
                        {'name': 'vendor', 'label': _loc('col_vendor'), 'field': 'vendor', 'align': 'left'},
                        {'name': 'asset', 'label': _loc('col_asset'), 'field': 'asset', 'align': 'left'},
                        {'name': 'amount', 'label': _loc('col_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                        {'name': 'certified', 'label': _loc('col_certified'), 'field': 'certified', 'align': 'right', 'sortable': True},
                        {'name': 'mandated', 'label': _loc('col_mandated_amt'), 'field': 'mandated', 'align': 'right', 'sortable': True},
                        {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                    ]

                    tbl = ui.table(columns=comm_cols, rows=comm_rows, pagination=15).classes('w-full lc-table')
                    tbl.bind_filter_from(search_comm_inp, 'value')

                    tbl.add_slot('body-cell-ref', '''
                        <q-td :props="props" class="font-mono font-bold text-slate-800">
                            {{ props.value }}
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-stage', '''
                        <q-td :props="props">
                            <q-chip dense :color="props.row._stage === 'pre_commitment' ? 'cyan-1' : 'purple-1'"
                                    :text-color="props.row._stage === 'pre_commitment' ? 'cyan-9' : 'purple-9'"
                                    class="text-weight-bold font-mono">
                                {{ props.value }}
                            </q-chip>
                            <q-badge v-if="props.row._ppm_pkg_id" color="indigo-8" class="q-ml-xs">
                                📋 Lot PPM #{{ props.row._ppm_pkg_id }}
                            </q-badge>
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-amount', '''
                        <q-td :props="props" class="font-mono font-extrabold text-slate-900">
                            {{ props.value }}
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-certified', '''
                        <q-td :props="props" class="font-mono text-teal-800 font-bold">
                            {{ props.value }}
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-mandated', '''
                        <q-td :props="props" class="font-mono text-purple-900 font-bold">
                            {{ props.value }}
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-status', '''
                        <q-td :props="props">
                            <q-badge :color="props.row._status_raw === 'approved' ? 'positive' : (props.row._status_raw === 'liquidated' ? 'indigo' : (props.row._status_raw === 'converted' ? 'cyan-8' : 'amber-8'))">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')

                    tbl.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <div class="row no-wrap items-center justify-center gap-1">
                                <!-- Draft status: Single approve button -->
                                <q-btn v-if="props.row._status_raw === 'draft'" size="xs" color="positive" dense unelevated icon="check"
                                       :label="props.row._btn_approve" @click="$parent.$emit('approve-comm', props.row.id)" class="q-px-xs" />

                                <!-- Pre-commitment (DA) approved: Convert to BC -->
                                <q-btn v-if="props.row._status_raw === 'approved' && props.row._stage === 'pre_commitment'"
                                       size="xs" color="cyan-9" dense unelevated icon="transform"
                                       :label="props.row._btn_convert" @click="$parent.$emit('convert-comm', props.row.id)" class="q-px-xs" />

                                <!-- Firm commitment (BC) approved: Contextual workflow actions -->
                                <template v-if="props.row._status_raw === 'approved' && props.row._stage !== 'pre_commitment'">
                                    <!-- Step 1: Certify PV if certified < amount -->
                                    <q-btn v-if="props.row._certified_raw < props.row._amount_raw"
                                           size="xs" color="teal" dense outline icon="verified"
                                           :label="props.row._btn_certify" @click="$parent.$emit('certify-comm', props.row.id)" class="q-px-xs">
                                        <q-tooltip>Enregistrer le procès-verbal de réception (Service Fait)</q-tooltip>
                                    </q-btn>

                                    <!-- Step 2: Mandate if certified > 0 and mandated < certified -->
                                    <q-btn v-if="props.row._certified_raw > 0 && props.row._mandated_raw < props.row._certified_raw"
                                           size="xs" color="purple-8" dense outline icon="receipt_long"
                                           :label="props.row._btn_mandate" @click="$parent.$emit('mandate-comm', props.row.id)" class="q-px-xs">
                                        <q-tooltip>Émettre le Mandat de Paiement (Ordonnancement)</q-tooltip>
                                    </q-btn>

                                    <!-- Step 3: Liquidate -->
                                    <q-btn size="xs" color="indigo" dense flat icon="task_alt"
                                           :label="props.row._btn_liquidate" @click="$parent.$emit('liquidate-comm', props.row.id)" class="q-px-xs">
                                        <q-tooltip>Clôturer et liquider l'engagement</q-tooltip>
                                    </q-btn>
                                </template>

                                <!-- Liquidated status badge -->
                                <span v-if="props.row._status_raw === 'liquidated'" class="text-caption text-indigo-8 text-weight-bold">
                                    ✓ Soldé
                                </span>
                            </div>
                        </q-td>
                    ''')

                    tbl.on('approve-comm', lambda e: _handle_approve_comm(e.args))
                    tbl.on('convert-comm', lambda e: _handle_convert_comm(e.args))
                    tbl.on('certify-comm', lambda e: _open_certification_modal(e.args))
                    tbl.on('mandate-comm', lambda e: _open_create_mandat_modal(e.args))
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
                po_rolls = state.get('commitment_rollovers', [])
                submode = state.get('carry_submode', 'budget')

                with ui.card().classes('w-full p-4 gap-4'):
                    # Submode switcher row
                    with ui.row().classes('items-center gap-2 border-b border-slate-200 pb-3 w-full'):
                        def _set_mode(m: str) -> None:
                            state['carry_submode'] = m
                            _render_carry_tab.refresh()

                        is_b = submode == 'budget'
                        ui.button(_loc('tab_carry_budget'), icon='move_up', on_click=lambda: _set_mode('budget')).props(f"{'unelevated color=primary' if is_b else 'flat color=slate-700'} dense no-caps")
                        ui.button(_loc('tab_carry_po'), icon='assignment_return', on_click=lambda: _set_mode('po')).props(f"{'unelevated color=indigo' if not is_b else 'flat color=slate-700'} dense no-caps")

                    if submode == 'budget':
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
                    else:
                        with ui.row().classes('w-full items-center justify-between no-wrap'):
                            with ui.column().classes('gap-0'):
                                ui.label(_loc('lbl_rollover_history')).classes('text-base font-bold text-slate-800')
                                ui.label(_loc('rollover_po_desc')).classes('text-xs text-slate-500 max-w-2xl')

                            ui.button(_loc('btn_rollover_po'), icon='assignment_return', on_click=_open_po_rollover_modal).props('unelevated color=indigo')

                        po_rows = []
                        for pr in po_rolls:
                            po_rows.append({
                                'number': pr.get('rollover_number'),
                                'date': str(pr.get('created_at', ''))[:16],
                                'source': f"{pr.get('source_commitment_number')} ({pr.get('source_fiscal_year_code')})",
                                'target': f"{pr.get('target_commitment_number')} ({pr.get('target_fiscal_year_code')})",
                                'amount': w.money(pr.get('rollover_amount', 0), currency),
                                'notes': pr.get('notes') or '—',
                                'user': pr.get('executed_by_name') or '—',
                            })

                        po_cols = [
                            {'name': 'number', 'label': _loc('col_rollover_num'), 'field': 'number', 'align': 'left', 'sortable': True},
                            {'name': 'date', 'label': _loc('col_date'), 'field': 'date', 'align': 'center'},
                            {'name': 'source', 'label': _loc('col_source_comm'), 'field': 'source', 'align': 'left'},
                            {'name': 'target', 'label': _loc('col_target_comm'), 'field': 'target', 'align': 'left'},
                            {'name': 'amount', 'label': _loc('col_rollover_amt'), 'field': 'amount', 'align': 'right', 'sortable': True},
                            {'name': 'notes', 'label': _loc('col_notes'), 'field': 'notes', 'align': 'left'},
                            {'name': 'user', 'label': _loc('carried_by_label'), 'field': 'user', 'align': 'center'},
                        ]

                        po_tbl = ui.table(columns=po_cols, rows=po_rows, pagination=15).classes('w-full lc-table')
                        po_tbl.add_slot('body-cell-amount', '''
                            <q-td :props="props" class="font-mono font-bold text-indigo-900">
                                {{ props.value }}
                            </q-td>
                        ''')

            refreshers['carry'] = _render_carry_tab.refresh
            _render_carry_tab()

        # ---------------------------------------------------------------------
        # TAB 6: MULTI-VERSION COMPARATIVE ANALYSIS (V0 vs V1 vs REEL)
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_comp).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_comp_tab() -> None:
                comp_data = state.get('comparative') or {}
                summary = comp_data.get('summary', {})
                rows = comp_data.get('rows', [])

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.column().classes('gap-0'):
                            ui.label(_loc('lbl_comp_section_title')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('comp_intro_desc')).classes('text-xs text-slate-500 max-w-3xl')

                        with ui.row().classes('items-center gap-2'):
                            search_comp_inp = ui.input(placeholder=_loc('search_placeholder')).props('outlined dense clearable').classes('w-64')

                    # Summary cards for V0 vs V1 vs Execution
                    with ui.row().classes('w-full gap-3 items-stretch my-2'):
                        # Card V0 Initial
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_v0')).classes('text-[11px] font-bold uppercase tracking-wider text-slate-500')
                            ui.label(w.money(summary.get('totalV0', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-slate-800')
                            ui.label(_loc('lbl_voted_dotation_kpi')).classes('text-[10px] text-slate-400')

                        # Card Carried Forward
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-amber-50/50 border border-amber-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_carried')).classes('text-[11px] font-bold uppercase tracking-wider text-amber-700')
                            ui.label(w.money(summary.get('totalCarried', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-amber-900')
                            ui.label(_loc('lbl_carryforward_n1_kpi')).classes('text-[10px] text-amber-600')

                        # Card Transfers
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-sky-50/50 border border-sky-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_transfers')).classes('text-[11px] font-bold uppercase tracking-wider text-sky-700')
                            ui.label(w.money(summary.get('totalTransfers', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-sky-900')
                            ui.label(_loc('lbl_net_transfers_kpi')).classes('text-[10px] text-sky-600')

                        # Card V1 Revised
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-indigo-50/50 border border-indigo-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_v1')).classes('text-[11px] font-bold uppercase tracking-wider text-indigo-700')
                            ui.label(w.money(summary.get('totalV1', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-indigo-900')
                            ui.label(f"Δ: {summary.get('totalDeltaPct', 0)}% vs V0").classes('text-[10px] font-bold text-indigo-600')

                        # Card Pre-Committed
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-cyan-50/50 border border-cyan-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_pre_comm')).classes('text-[11px] font-bold uppercase tracking-wider text-cyan-700')
                            ui.label(w.money(summary.get('totalPreCommitted', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-cyan-900')
                            ui.label(_loc('lbl_pre_comm_da_kpi')).classes('text-[10px] text-cyan-600')

                        # Card Firm Committed
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-purple-50/50 border border-purple-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_firm_comm')).classes('text-[11px] font-bold uppercase tracking-wider text-purple-700')
                            ui.label(w.money(summary.get('totalFirmCommitted', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-purple-900')
                            ui.label(_loc('lbl_firm_comm_bc_kpi')).classes('text-[10px] text-purple-600')

                        # Card Total Consumed
                        with ui.element('div').classes('lc-card p-3 flex-1 min-w-[150px] bg-emerald-50/50 border border-emerald-200/80 rounded-lg flex flex-col justify-between'):
                            ui.label(_loc('col_consumed')).classes('text-[11px] font-bold uppercase tracking-wider text-emerald-700')
                            ui.label(w.money(summary.get('totalConsumed', 0), currency)).classes('text-base xl:text-lg font-bold font-mono text-emerald-900')
                            ui.label(f"Exéc V1: {summary.get('overallExecVsV1Pct', 0)}%").classes('text-[10px] font-bold text-emerald-700')

                    table_rows = []
                    for r in rows:
                        b_type_str = _tr_type(r.get('budgetType'))
                        acct_str = _tr_account(r.get('accountCode'), r.get('accountName'), r.get('accountNameEn'))
                        dept_str = _tr_dept(r.get('costCenterName'), r.get('costCenterNameEn'))
                        avc_badge_text, _, _ = _tr_avc_badge(r.get('avcStatus'))

                        table_rows.append({
                            'account': acct_str,
                            'type': b_type_str,
                            'dept': dept_str,
                            'v0': w.money(r.get('v0Amount', 0), currency),
                            'carried': w.money(r.get('carriedAmount', 0), currency),
                            'transfers': w.money(r.get('transfersAmount', 0), currency),
                            'v1': w.money(r.get('v1Amount', 0), currency),
                            'delta': f"{w.money(r.get('amendmentDelta', 0), currency)} ({r.get('amendmentDeltaPct', 0)}%)",
                            'pre_comm': w.money(r.get('preCommittedAmount', 0), currency),
                            'firm_comm': w.money(r.get('firmCommittedAmount', 0), currency),
                            'spent': w.money(r.get('actualSpent', 0), currency),
                            'consumed': w.money(r.get('totalConsumed', 0), currency),
                            'avail': w.money(r.get('availableBalance', 0), currency),
                            'rate_v1': f"{r.get('execVsV1Pct', 0)}%",
                            'avc': avc_badge_text,
                            '_avc_raw': r.get('avcStatus', 'normal'),
                        })

                    comp_cols = [
                        {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                        {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                        {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                        {'name': 'v0', 'label': _loc('col_v0'), 'field': 'v0', 'align': 'right', 'sortable': True},
                        {'name': 'carried', 'label': _loc('col_carried'), 'field': 'carried', 'align': 'right'},
                        {'name': 'transfers', 'label': _loc('col_transfers'), 'field': 'transfers', 'align': 'right'},
                        {'name': 'v1', 'label': _loc('col_v1'), 'field': 'v1', 'align': 'right', 'sortable': True},
                        {'name': 'delta', 'label': _loc('col_delta'), 'field': 'delta', 'align': 'right'},
                        {'name': 'pre_comm', 'label': _loc('col_pre_comm'), 'field': 'pre_comm', 'align': 'right'},
                        {'name': 'firm_comm', 'label': _loc('col_firm_comm'), 'field': 'firm_comm', 'align': 'right'},
                        {'name': 'spent', 'label': _loc('col_spent'), 'field': 'spent', 'align': 'right'},
                        {'name': 'consumed', 'label': _loc('col_consumed'), 'field': 'consumed', 'align': 'right', 'sortable': True},
                        {'name': 'avail', 'label': _loc('col_avail'), 'field': 'avail', 'align': 'right', 'sortable': True},
                        {'name': 'rate_v1', 'label': _loc('col_exec_v1'), 'field': 'rate_v1', 'align': 'right', 'sortable': True},
                        {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center', 'sortable': True},
                    ]

                    tbl_comp = ui.table(columns=comp_cols, rows=table_rows, pagination=15).classes('w-full lc-table')
                    tbl_comp.bind_filter_from(search_comp_inp, 'value')

                    tbl_comp.add_slot('body-cell-avc', '''
                        <q-td :props="props">
                            <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                    :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                    class="text-weight-bold">
                                {{ props.value }}
                            </q-chip>
                        </q-td>
                    ''')

            refreshers['comp'] = _render_comp_tab.refresh
            _render_comp_tab()

        # ---------------------------------------------------------------------
        # TAB 7: SECONDARY COST ALLOCATIONS & REPARTITION CYCLES (PHASE 3)
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_alloc).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_alloc_tab() -> None:
                cycles = state.get('allocation_cycles', [])
                runs = state.get('allocation_runs', [])

                with ui.card().classes('w-full p-4 gap-4'):
                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                        with ui.column().classes('gap-0'):
                            ui.label(_loc('lbl_alloc_section_title')).classes('text-base font-bold text-slate-800')
                            ui.label(_loc('alloc_intro_desc')).classes('text-xs text-slate-500 max-w-3xl')

                        with ui.row().classes('items-center gap-2'):
                            ui.button(_loc('btn_derivations'), icon='account_tree', on_click=_open_derivation_rules_modal).props('outline color=purple')
                            ui.button(_loc('btn_new_cycle'), icon='add_circle', on_click=_open_new_cycle_modal).props('unelevated color=primary')

                    # 1. Active Cycles Table
                    ui.label(_loc('lbl_active_alloc_cycles')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-2')

                    cycle_table_rows = []
                    for c in cycles:
                        c_type_label = _loc('type_assessment') if c.get('cycle_type') == 'assessment' else _loc('type_distribution')
                        cycle_table_rows.append({
                            'id': c.get('id'),
                            'code': c.get('code'),
                            'name': c.get('name'),
                            'type': c_type_label,
                            'desc': c.get('description') or '—',
                            'segments': c.get('segment_count', len(c.get('segments', []))),
                            'status': 'Active' if c.get('is_active') else 'Inactive',
                            '_btn_run': _loc('btn_simulate_run'),
                        })

                    cycle_cols = [
                        {'name': 'code', 'label': _loc('col_cycle_code'), 'field': 'code', 'align': 'left', 'sortable': True},
                        {'name': 'name', 'label': _loc('col_cycle_name'), 'field': 'name', 'align': 'left', 'sortable': True},
                        {'name': 'type', 'label': _loc('col_cycle_type'), 'field': 'type', 'align': 'center'},
                        {'name': 'desc', 'label': 'Description', 'field': 'desc', 'align': 'left'},
                        {'name': 'segments', 'label': _loc('col_segments_count'), 'field': 'segments', 'align': 'center'},
                        {'name': 'actions', 'label': _loc('col_actions'), 'field': 'actions', 'align': 'center'},
                    ]

                    tbl_cycles = ui.table(columns=cycle_cols, rows=cycle_table_rows, pagination=10).classes('w-full lc-table')
                    tbl_cycles.add_slot('body-cell-type', '''
                        <q-td :props="props">
                            <q-badge color="indigo-1" text-color="indigo-9" class="text-weight-bold">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')
                    tbl_cycles.add_slot('body-cell-actions', '''
                        <q-td :props="props">
                            <div class="row no-wrap gap-1 justify-center">
                                <q-btn dense unelevated color="primary" icon="play_arrow" :label="props.row._btn_run" size="sm" @click="$parent.$emit('run_cycle', props.row.id)" class="q-px-sm" />
                                <q-btn flat dense round icon="delete" color="negative" size="sm" @click="$parent.$emit('delete_cycle', props.row.id)" />
                            </div>
                        </q-td>
                    ''')

                    tbl_cycles.on('run_cycle', lambda e: _open_run_allocation_modal(int(e.args)))

                    async def _handle_delete_cycle(c_id: int) -> None:
                        await api.safe(api.delete(f'/cost-allocations/cycles/{c_id}'))
                        ui.notify(_loc('notify_cycle_deleted'), type='info')
                        await reload_data()
                        _render_alloc_tab.refresh()

                    tbl_cycles.on('delete_cycle', lambda e: _handle_delete_cycle(int(e.args)))

                    # 2. Historical Allocation Runs Table
                    ui.label(_loc('lbl_history_alloc_runs')).classes('text-xs font-bold text-slate-700 uppercase tracking-wider mt-4')

                    run_table_rows = []
                    for r in runs:
                        run_table_rows.append({
                            'id': r.get('id'),
                            'run_num': r.get('run_number'),
                            'cycle': f"{r.get('cycle_code')} — {r.get('cycle_name')}",
                            'run_date': str(r.get('run_date', ''))[:10],
                            'fy': r.get('fiscal_year_code', ''),
                            'amount': w.money(r.get('total_allocated_amount', 0), currency),
                            'user': r.get('executed_by_name') or 'Administrateur',
                            'je': r.get('journal_entry_number') or (f"#{r.get('journal_entry_id')}" if r.get('journal_entry_id') else '—'),
                            'status': 'POSTED (OD)',
                            'notes': r.get('notes') or '—',
                        })

                    run_cols = [
                        {'name': 'run_num', 'label': _loc('col_run_num'), 'field': 'run_num', 'align': 'left', 'sortable': True},
                        {'name': 'cycle', 'label': _loc('col_cycle_name'), 'field': 'cycle', 'align': 'left'},
                        {'name': 'run_date', 'label': _loc('col_run_date'), 'field': 'run_date', 'align': 'center', 'sortable': True},
                        {'name': 'amount', 'label': _loc('col_allocated_amt'), 'field': 'amount', 'align': 'right', 'sortable': True},
                        {'name': 'user', 'label': _loc('col_executed_by'), 'field': 'user', 'align': 'left'},
                        {'name': 'je', 'label': _loc('col_je_ref'), 'field': 'je', 'align': 'center'},
                        {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                        {'name': 'notes', 'label': 'Notes', 'field': 'notes', 'align': 'left'},
                    ]

                    tbl_runs = ui.table(columns=run_cols, rows=run_table_rows, pagination=10).classes('w-full lc-table')
                    tbl_runs.add_slot('body-cell-run_num', '''
                        <q-td :props="props" class="font-mono font-bold text-primary">
                            {{ props.value }}
                        </q-td>
                    ''')
                    tbl_runs.add_slot('body-cell-je', '''
                        <q-td :props="props">
                            <q-badge color="purple-1" text-color="purple-9" class="font-mono font-bold">
                                {{ props.value }}
                            </q-badge>
                        </q-td>
                    ''')
                    tbl_runs.add_slot('body-cell-status', '''
                        <q-td :props="props">
                            <q-badge color="green-1" text-color="green-9" class="font-bold">
                                POSTED (OD)
                            </q-badge>
                        </q-td>
                    ''')

            refreshers['alloc'] = _render_alloc_tab.refresh
            _render_alloc_tab()

        # ---------------------------------------------------------------------
        # TAB 8: WORLD-CLASS EXECUTIVE BUDGET REPORTING & ANALYTICS MODULE
        # ---------------------------------------------------------------------
        def _open_official_print_modal(report_type: str, rows_data: list, summary_info: dict) -> None:
            is_fr = lang() == 'fr'
            curr = currency
            today_str = datetime.date.today().strftime('%d/%m/%Y')
            now_time = datetime.datetime.now().strftime('%H:%M:%S')

            type_titles = {
                'statutory': 'ÉTAT RÉCAPITULATIF STATUTAIRE D’EXÉCUTION BUDGÉTAIRE ET DE DISPONIBILITÉ AVC' if is_fr else 'STATUTORY BUDGET EXECUTION AND AVAILABILITY CONTROL STATEMENT',
                'variance': 'TABLEAU DE BORD D’ANALYSE DES ÉCARTS BUDGÉTAIRES ET PHASAGE TRIMESTRIEL' if is_fr else 'BUDGET VS ACTUAL VARIANCE ANALYSIS AND QUARTERLY PHASING STATEMENT',
                'versions': 'ÉTAT COMPARATIF MULTI-VERSIONS DES CRÉDITS (V0 INITIAL ➔ V1 RECTIFIÉ ➔ RÉALISATIONS)' if is_fr else 'MULTI-VERSION APPROPRIATIONS RECONCILIATION STATEMENT (V0 VOTED vs V1 REVISED vs ACTUALS)',
                'pipeline': 'PISTE D’AUDIT RÉGLEMENTAIRE ET FLUX D’EXÉCUTION DE LA DÉPENSE PUBLIQUE' if is_fr else 'STATUTORY EXPENDITURE PIPELINE AND STAGE-GATE AUDIT TRAIL',
            }
            rep_title = type_titles.get(report_type, type_titles['statutory'])

            with ui.dialog().props('maximized') as dlg, ui.card().classes('w-full h-full p-8 bg-slate-100 flex flex-col gap-6 overflow-y-auto'):
                # Action Header (Non-printed toolbar)
                with ui.row().classes('w-full justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden no-wrap'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('verified').classes('text-teal-700 text-2xl')
                        with ui.column().classes('gap-0'):
                            ui.label('Format Officiel Certifié & Prêt pour Impression' if is_fr else 'Certified Official Document Ready for Printing').classes('text-sm font-bold text-slate-800')
                            ui.label('Conforme aux standards SYSCOHADA Révisé, CEMAC et IFRS' if is_fr else 'Compliant with Revised SYSCOHADA, CEMAC and IFRS statutory norms').classes('text-xs text-slate-500')
                    with ui.row().classes('items-center gap-3'):
                        ui.button(_loc('btn_cancel'), on_click=dlg.close).props('flat color=grey-8 dense')
                        ui.button(
                            '🖨️ ' + ('Lancer l’Impression / Générer PDF' if is_fr else 'Print / Save as PDF'),
                            on_click=lambda: ui.run_javascript('window.print()')
                        ).props('unelevated color=indigo-9 dense size=md class="px-4 py-1.5 shadow-sm"')

                # The Official A4 Printable Document Container
                with ui.element('div').classes('w-full max-w-5xl mx-auto p-10 bg-white rounded-xl border border-slate-300 shadow-md flex flex-col gap-6 text-slate-900'):
                    # 1. State / Hospital Formal Header
                    with ui.row().classes('w-full justify-between items-start no-wrap border-b-2 border-slate-900 pb-5'):
                        with ui.column().classes('gap-0.5 text-center items-center w-72'):
                            ui.label('RÉPUBLIQUE DU CAMEROUN').classes('text-xs font-black tracking-wide text-slate-900')
                            ui.label('Paix – Travail – Patrie').classes('text-[10px] italic text-slate-600')
                            ui.label('----------------').classes('text-[10px] text-slate-400')
                            ui.label('MINISTÈRE DE LA SANTÉ PUBLIQUE').classes('text-[10px] font-bold text-slate-800')
                            ui.label('COMPLEXE HOSPITALIER SHISONG').classes('text-[11px] font-black text-slate-900')
                            ui.label('SHISONG CARDIAC CENTRE').classes('text-[10px] font-bold text-teal-800')

                        with ui.column().classes('items-center justify-center text-center px-4'):
                            with ui.element('div').classes('w-16 h-16 rounded-full border-2 border-teal-800 flex items-center justify-center bg-teal-50 shadow-inner mb-1'):
                                ui.icon('account_balance').classes('text-teal-900 text-3xl')
                            ui.label('CONTRÔLE BUDGÉTAIRE').classes('text-[10px] font-black tracking-widest text-teal-900 uppercase')
                            ui.label('FINANCIAL AUDIT DIVISION').classes('text-[9px] font-bold text-slate-500')

                        with ui.column().classes('gap-0.5 text-center items-center w-72'):
                            ui.label('REPUBLIC OF CAMEROON').classes('text-xs font-black tracking-wide text-slate-900')
                            ui.label('Peace – Work – Fatherland').classes('text-[10px] italic text-slate-600')
                            ui.label('----------------').classes('text-[10px] text-slate-400')
                            ui.label('MINISTRY OF PUBLIC HEALTH').classes('text-[10px] font-bold text-slate-800')
                            ui.label('DIRECTION ADMINISTRATIVE ET FINANCIÈRE').classes('text-[10px] font-extrabold text-slate-800')
                            ui.label('SERVICE DU BUDGET & DE LA COMPTABILITÉ MATIÈRES').classes('text-[9px] font-bold text-slate-700')

                    # 2. Formal Title
                    with ui.column().classes('w-full items-center text-center gap-1 my-2'):
                        ui.label(rep_title).classes('text-base font-black text-slate-900 uppercase tracking-wide border-b-2 border-teal-800 pb-1')
                        ui.label(f"{'EXERCICE BUDGÉTAIRE' if is_fr else 'FISCAL YEAR'} 2026 — {'RESTITUTION OFFICIELLE AU' if is_fr else 'OFFICIAL POSITION AS OF'} {today_str} ({now_time})").classes('text-xs font-bold text-slate-600')

                    # 3. Metadata Parameters Box
                    with ui.grid(columns=4).classes('w-full gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs'):
                        with ui.column().classes('gap-0'):
                            ui.label('Entité / Établissement' if is_fr else 'Institution').classes('text-[10px] uppercase font-bold text-slate-400')
                            ui.label('Complexe Hospitalier Shisong').classes('font-bold text-slate-800')
                        with ui.column().classes('gap-0'):
                            ui.label('Devise de Restitution' if is_fr else 'Currency').classes('text-[10px] uppercase font-bold text-slate-400')
                            ui.label(f'Francs CFA ({curr})').classes('font-bold text-slate-800')
                        with ui.column().classes('gap-0'):
                            ui.label('Référentiel Juridique' if is_fr else 'Accounting Standard').classes('text-[10px] uppercase font-bold text-slate-400')
                            ui.label('SYSCOHADA Révisé / CEMAC').classes('font-bold text-teal-800')
                        with ui.column().classes('gap-0'):
                            ui.label('Mode de Contrôle' if is_fr else 'Control Enforcement').classes('text-[10px] uppercase font-bold text-slate-400')
                            ui.label('AVC Strict Blocker (Temps Réel)').classes('font-bold text-indigo-900')

                    # 4. Executive KPI Summary Cards
                    tot_b = summary_info.get('totalBudget', 0)
                    tot_c = summary_info.get('totalCommitted', 0)
                    tot_s = summary_info.get('totalSpent', 0)
                    tot_cons = tot_c + tot_s
                    tot_rem = tot_b - tot_cons
                    pct = round((tot_cons / tot_b) * 100, 1) if tot_b > 0 else 0

                    with ui.grid(columns=5).classes('w-full gap-2.5 text-center my-1'):
                        with ui.element('div').classes('p-3 rounded-lg border border-slate-300 bg-slate-50'):
                            ui.label('Dotation Votée' if is_fr else 'Approved Budget').classes('text-[10px] font-bold text-slate-500 uppercase')
                            ui.label(w.money(tot_b, curr)).classes('text-sm font-mono font-bold text-slate-900')
                        with ui.element('div').classes('p-3 rounded-lg border border-amber-200 bg-amber-50/50'):
                            ui.label('Engagé (BC/DA)' if is_fr else 'Committed').classes('text-[10px] font-bold text-amber-700 uppercase')
                            ui.label(w.money(tot_c, curr)).classes('text-sm font-mono font-bold text-amber-900')
                        with ui.element('div').classes('p-3 rounded-lg border border-indigo-200 bg-indigo-50/50'):
                            ui.label('Dépenses Réalisées' if is_fr else 'Actual Spent').classes('text-[10px] font-bold text-indigo-700 uppercase')
                            ui.label(w.money(tot_s, curr)).classes('text-sm font-mono font-bold text-indigo-900')
                        with ui.element('div').classes('p-3 rounded-lg border border-teal-200 bg-teal-50/50'):
                            ui.label('Disponible Net' if is_fr else 'Net Available').classes('text-[10px] font-bold text-teal-700 uppercase')
                            ui.label(w.money(tot_rem, curr)).classes('text-sm font-mono font-bold text-teal-900')
                        with ui.element('div').classes('p-3 rounded-lg border border-slate-300 bg-slate-50'):
                            ui.label('Taux d’Absorption' if is_fr else 'Execution Rate').classes('text-[10px] font-bold text-slate-500 uppercase')
                            ui.label(f"{pct}%").classes('text-sm font-mono font-extrabold text-slate-900')

                    # 5. Tabular Data Representation
                    html_table_rows = []
                    for idx, r in enumerate(rows_data[:60]):
                        acct_label = f"{r.get('account_code')} - {r.get('account_name')}"
                        dept_label = r.get('cost_center_name') or 'Direction Générale'
                        b_val = float(r.get('budget_amount') or 0)
                        c_val = float(r.get('committed_amount') or 0)
                        s_val = float(r.get('actual_spent') or 0)
                        rem_val = float(r.get('remaining_budget') or 0)
                        pct_val = r.get('pct_consumed') or 0
                        avc_badge = '🟢 NORMAL' if r.get('avc_status') == 'normal' else ('🟡 ALERTE' if r.get('avc_status') == 'warning' else '🔴 DÉPASSEMENT')

                        row_bg = '#ffffff' if idx % 2 == 0 else '#f8fafc'
                        html_table_rows.append(
                            f"<tr style='background-color:{row_bg}; border-bottom:1px solid #e2e8f0;'>"
                            f"<td style='padding:6px 8px; font-weight:600; font-size:11px;'>{acct_label}</td>"
                            f"<td style='padding:6px 8px; font-size:11px;'>{dept_label}</td>"
                            f"<td style='padding:6px 8px; text-align:right; font-family:monospace; font-size:11px;'>{w.money(b_val, curr)}</td>"
                            f"<td style='padding:6px 8px; text-align:right; font-family:monospace; font-size:11px;'>{w.money(c_val, curr)}</td>"
                            f"<td style='padding:6px 8px; text-align:right; font-family:monospace; font-size:11px;'>{w.money(s_val, curr)}</td>"
                            f"<td style='padding:6px 8px; text-align:right; font-family:monospace; font-weight:bold; font-size:11px;'>{w.money(rem_val, curr)}</td>"
                            f"<td style='padding:6px 8px; text-align:center; font-family:monospace; font-size:11px;'>{pct_val}%</td>"
                            f"<td style='padding:6px 8px; text-align:center; font-size:10px; font-weight:bold;'>{avc_badge}</td>"
                            f"</tr>"
                        )

                    all_rows_html = "".join(html_table_rows)
                    table_html = f"""
                    <table style="width:100%; border-collapse:collapse; margin-top:8px; border:1px solid #cbd5e1; font-family:inherit;">
                        <thead>
                            <tr style="background-color:#0f172a; color:#ffffff; font-size:11px; text-transform:uppercase;">
                                <th style="padding:8px; text-align:left;">Compte SYSCOHADA</th>
                                <th style="padding:8px; text-align:left;">Service</th>
                                <th style="padding:8px; text-align:right;">Dotation Votée</th>
                                <th style="padding:8px; text-align:right;">Engagé</th>
                                <th style="padding:8px; text-align:right;">Réalisé</th>
                                <th style="padding:8px; text-align:right;">Disponible Net</th>
                                <th style="padding:8px; text-align:center;">Taux</th>
                                <th style="padding:8px; text-align:center;">Statut AVC</th>
                            </tr>
                        </thead>
                        <tbody>
                            {all_rows_html}
                        </tbody>
                        <tfoot>
                            <tr style="background-color:#e2e8f0; font-weight:bold; font-size:11px; border-top:2px solid #0f172a;">
                                <td colspan="2" style="padding:8px; text-align:left;">TOTAL GÉNÉRAL CONSOLIDÉ</td>
                                <td style="padding:8px; text-align:right; font-family:monospace;">{w.money(tot_b, curr)}</td>
                                <td style="padding:8px; text-align:right; font-family:monospace;">{w.money(tot_c, curr)}</td>
                                <td style="padding:8px; text-align:right; font-family:monospace;">{w.money(tot_s, curr)}</td>
                                <td style="padding:8px; text-align:right; font-family:monospace;">{w.money(tot_rem, curr)}</td>
                                <td style="padding:8px; text-align:center; font-family:monospace;">{pct}%</td>
                                <td style="padding:8px; text-align:center;">CERTIFIÉ CONFORME</td>
                            </tr>
                        </tfoot>
                    </table>
                    """
                    ui.html(table_html).classes('w-full')

                    # 6. Statutory Tripartite Signatory Box
                    with ui.row().classes('w-full justify-between items-start no-wrap mt-8 pt-6 border-t border-slate-300 text-center text-xs'):
                        with ui.column().classes('items-center w-64 gap-12'):
                            ui.label(_loc('rep_sign_budget')).classes('font-bold text-slate-900 uppercase text-[11px]')
                            with ui.column().classes('gap-0 items-center'):
                                ui.label('Date : ____/____/2026').classes('text-[10px] text-slate-500')
                                ui.label('Visa & Cachet').classes('text-[10px] italic text-slate-400')

                        with ui.column().classes('items-center w-64 gap-12'):
                            ui.label(_loc('rep_sign_auditor')).classes('font-bold text-slate-900 uppercase text-[11px]')
                            with ui.column().classes('gap-0 items-center'):
                                ui.label('Date : ____/____/2026').classes('text-[10px] text-slate-500')
                                ui.label('Visa & Cachet').classes('text-[10px] italic text-slate-400')

                        with ui.column().classes('items-center w-64 gap-12'):
                            ui.label(_loc('rep_sign_dg')).classes('font-bold text-slate-900 uppercase text-[11px]')
                            with ui.column().classes('gap-0 items-center'):
                                ui.label('Date : ____/____/2026').classes('text-[10px] text-slate-500')
                                ui.label('Signature & Sceau de l’Établissement').classes('text-[10px] italic text-slate-400')

            dlg.open()

        # Reports Tab Interactive State
        report_internal_state = {
            'type': 'statutory',
            'dept_id': 0,
            'prog_id': 0,
            'nature': 'all',
            'avc': 'all',
            'search': '',
        }

        with ui.tab_panel(t_reports).classes('p-0 gap-4 flex flex-col'):
            @ui.refreshable
            def _render_reports_tab() -> None:
                rep = state['report'] or {}
                raw_rows = rep.get('rows', [])
                comp = state.get('comparative') or {}
                orders = state.get('payment_orders', [])
                certs = state.get('certifications', [])
                comms = state.get('commitments', [])
                curr = currency
                is_fr = lang() == 'fr'

                # Filtering dataset
                f_dept = report_internal_state['dept_id']
                f_prog = report_internal_state['prog_id']
                f_nature = report_internal_state['nature']
                f_avc = report_internal_state['avc']
                f_search = (report_internal_state['search'] or '').strip().lower()

                filtered_rows = []
                for r in raw_rows:
                    if f_dept and f_dept > 0 and r.get('cost_center_id') != f_dept:
                        continue
                    if f_prog and f_prog > 0 and r.get('program_id') != f_prog:
                        continue
                    if f_nature != 'all' and r.get('budget_type') != f_nature:
                        continue
                    if f_avc != 'all' and r.get('avc_status') != f_avc:
                        continue
                    if f_search:
                        text_match = (
                            f_search in str(r.get('account_code', '')).lower()
                            or f_search in str(r.get('account_name', '')).lower()
                            or f_search in str(r.get('account_name_en', '')).lower()
                            or f_search in str(r.get('cost_center_name', '')).lower()
                        )
                        if not text_match:
                            continue
                    filtered_rows.append(r)

                # Recomputed totals for the filtered set
                filt_b = sum(float(r.get('budget_amount') or 0) for r in filtered_rows)
                filt_c = sum(float(r.get('committed_amount') or 0) for r in filtered_rows)
                filt_s = sum(float(r.get('actual_spent') or 0) for r in filtered_rows)
                filt_cons = filt_c + filt_s
                filt_rem = filt_b - filt_cons
                filt_pct = round((filt_cons / filt_b) * 100, 1) if filt_b > 0 else 0

                filt_summary = {
                    'totalBudget': filt_b,
                    'totalCommitted': filt_c,
                    'totalSpent': filt_s,
                    'totalConsumed': filt_cons,
                    'remainingBudget': filt_rem,
                    'overallPctConsumed': filt_pct,
                }

                with ui.card().classes('w-full p-5 gap-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs'):
                    # 1. Executive Title & Export Action Suite
                    with ui.row().classes('w-full items-center justify-between no-wrap gap-4 border-b border-slate-100 pb-4'):
                        with ui.row().classes('items-center gap-3.5'):
                            with ui.element('div').classes('w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0'):
                                ui.icon('analytics').classes('text-2xl')
                            with ui.column().classes('gap-0.5'):
                                with ui.row().classes('items-center gap-2'):
                                    ui.label(_loc('rep_title')).classes('text-lg font-extrabold text-slate-900 tracking-tight')
                                    ui.label('PREMIUM EDITION').classes('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-2xs')
                                ui.label(_loc('rep_subtitle')).classes('text-xs text-slate-500 max-w-3xl leading-relaxed')

                        # Export & Print Actions Suite
                        with ui.row().classes('items-center gap-2 shrink-0'):
                            def _do_copy_briefing():
                                br_cnt = sum(1 for r in filtered_rows if r.get('avc_status') == 'breach')
                                wn_cnt = sum(1 for r in filtered_rows if r.get('avc_status') == 'warning')
                                summary_text = (
                                    f"--- COMPLEXE HOSPITALIER SHISONG // BUDGETARY BRIEFING 2026 ---\n"
                                    f"* Exercice Budgétaire : 2026 | Date : {datetime.date.today()}\n"
                                    f"* Périmètre : {len(filtered_rows)} lignes budgétaires analysées\n"
                                    f"* Dotation Votée Révisée : {w.money(filt_b, curr)} {curr}\n"
                                    f"* Engagements Juridiques (BC/DA) : {w.money(filt_c, curr)} {curr}\n"
                                    f"* Dépenses Comptables Réalisées : {w.money(filt_s, curr)} {curr}\n"
                                    f"* Total Consommé : {w.money(filt_cons, curr)} {curr} ({filt_pct}%)\n"
                                    f"* Crédits Disponibles Nets : {w.money(filt_rem, curr)} {curr}\n"
                                    f"* Statut de Conformité AVC : {len(filtered_rows) - br_cnt - wn_cnt} lignes conformes | {wn_cnt} sous surveillance | {br_cnt} en dépassement.\n"
                                    f"-----------------------------------------------------------"
                                )
                                ui.run_javascript(f'navigator.clipboard.writeText({repr(summary_text)})')
                                ui.notify(_loc('notify_copied_briefing'), type='positive', position='top')

                            ui.button(
                                _loc('btn_copy_summary'),
                                icon='content_copy',
                                on_click=_do_copy_briefing
                            ).props('outline color=slate-700 dense no-caps text-color=slate-700 size=sm')

                            def _do_export_csv():
                                import csv
                                import io
                                output = io.StringIO()
                                writer = csv.writer(output)
                                r_type = report_internal_state['type']

                                if r_type == 'statutory':
                                    writer.writerow(['Compte Code', 'Compte Intitule', 'Departement', 'Programme', 'Section', 'Budget Vote', 'Engage', 'Realise', 'Total Consomme', 'Disponible', 'Taux %', 'Statut AVC'])
                                    for r in filtered_rows:
                                        b_amt = float(r.get('budget_amount') or 0)
                                        c_amt = float(r.get('committed_amount') or 0)
                                        s_amt = float(r.get('actual_spent') or 0)
                                        writer.writerow([
                                            r.get('account_code'),
                                            r.get('account_name_en') if (not is_fr and r.get('account_name_en')) else r.get('account_name'),
                                            r.get('cost_center_name') or 'Direction Generale',
                                            r.get('program_name') or 'Fonds Propres',
                                            r.get('budget_type') or 'opex',
                                            b_amt, c_amt, s_amt, c_amt + s_amt,
                                            float(r.get('remaining_budget') or 0),
                                            r.get('pct_consumed') or 0,
                                            r.get('avc_status') or 'normal'
                                        ])
                                elif r_type == 'variance':
                                    writer.writerow(['Compte Code', 'Compte Intitule', 'Budget Annuel', 'T1', 'T2', 'T3', 'T4', 'Realise', 'Ecart Valeur', 'Ecart %', 'Statut'])
                                    for r in filtered_rows:
                                        b_amt = float(r.get('budget_amount') or 0)
                                        s_amt = float(r.get('actual_spent') or 0)
                                        q = b_amt / 4.0
                                        delta = b_amt - s_amt
                                        delta_pct = round(((b_amt - s_amt) / b_amt) * 100, 1) if b_amt > 0 else 0
                                        writer.writerow([r.get('account_code'), r.get('account_name'), b_amt, q, q, q, q, s_amt, delta, delta_pct, 'Favorable' if delta >= 0 else 'Defavorable'])
                                elif r_type == 'versions':
                                    writer.writerow(['Compte Code', 'Compte Intitule', 'Vote Initial (V0)', 'Reports N-1', 'Virements', 'Budget Revise (V1)', 'Pre-Engagements (DA)', 'Engagements Fermes (BC)', 'Depenses Realisees', 'Consomme V1', 'Disponible V1', 'Taux %', 'Statut AVC'])
                                    for r in filtered_rows:
                                        writer.writerow([
                                            r.get('account_code'), r.get('account_name'),
                                            r.get('initial_budget') or r.get('budget_amount'),
                                            0, 0, r.get('budget_amount'),
                                            0, r.get('committed_amount'), r.get('actual_spent'),
                                            float(r.get('committed_amount') or 0) + float(r.get('actual_spent') or 0),
                                            r.get('remaining_budget'), r.get('pct_consumed'), r.get('avc_status')
                                        ])
                                else:
                                    writer.writerow(['Etape', 'Reference', 'Objet / Description', 'Beneficiaire', 'Montant XAF', 'Statut'])
                                    for c in comms:
                                        writer.writerow(['2. Engagement', c.get('commitment_number'), c.get('description'), c.get('vendor_name') or 'N/A', c.get('amount'), c.get('status')])
                                    for m in orders:
                                        writer.writerow(['4. Ordonnancement', m.get('mandat_number'), m.get('object_description'), m.get('beneficiary_name'), m.get('net_amount'), m.get('status')])

                                csv_data = output.getvalue()
                                ui.download(csv_data.encode('utf-8'), f"Rapport_Budgetaire_{datetime.date.today().isoformat()}_{report_internal_state['type']}.csv")
                                ui.notify('Fichier CSV généré avec succès !' if is_fr else 'CSV Report exported successfully!', type='positive')

                            ui.button(
                                _loc('btn_export_csv'),
                                icon='file_download',
                                on_click=_do_export_csv
                            ).props('outline color=teal dense no-caps text-color=teal-8 size=sm')

                            ui.button(
                                _loc('btn_print_official'),
                                icon='print',
                                on_click=lambda: _open_official_print_modal(report_internal_state['type'], filtered_rows, filt_summary)
                            ).props('unelevated color=indigo-9 text-white dense no-caps size=sm shadow-xs')

                    # 2. Multi-Report Selector Bar & Multi-Axial Filters
                    with ui.row().classes('w-full items-center justify-between gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200'):
                        # Report Type Selector
                        rep_type_opts = {
                            'statutory': _loc('rep_type_execution'),
                            'variance': _loc('rep_type_variance'),
                            'versions': _loc('rep_type_versions'),
                            'pipeline': _loc('rep_type_pipeline'),
                        }
                        def _change_rep_type(e_val: str):
                            report_internal_state['type'] = e_val
                            _render_reports_tab.refresh()

                        sel_type = ui.select(
                            rep_type_opts,
                            value=report_internal_state['type'],
                            label='Sélectionner le Rapport' if is_fr else 'Select Report Mode',
                            on_change=lambda e: _change_rep_type(e.value),
                        ).props('outlined dense options-dense bg-white').classes('w-96 font-semibold')

                        # Filter Dimensions
                        dept_opts = {0: _loc('rep_all_depts')}
                        for c in cost_centers:
                            c_name = c.get('name_en') if (not is_fr and c.get('name_en')) else c.get('name')
                            dept_opts[c['id']] = f"{c['code']} - {c_name}"

                        def _change_dept(e_val: int):
                            report_internal_state['dept_id'] = e_val
                            _render_reports_tab.refresh()

                        ui.select(
                            dept_opts,
                            value=report_internal_state['dept_id'],
                            label=_loc('rep_filter_dept'),
                            on_change=lambda e: _change_dept(e.value),
                        ).props('outlined dense options-dense bg-white').classes('w-56')

                        nature_opts = {
                            'all': _loc('filter_all_types'),
                            'opex': _loc('type_opex'),
                            'capex': _loc('type_capex'),
                            'maintenance': _loc('type_maint'),
                            'revenue': _loc('type_rev'),
                        }
                        def _change_nature(e_val: str):
                            report_internal_state['nature'] = e_val
                            _render_reports_tab.refresh()

                        ui.select(
                            nature_opts,
                            value=report_internal_state['nature'],
                            label=_loc('rep_filter_nature'),
                            on_change=lambda e: _change_nature(e.value),
                        ).props('outlined dense options-dense bg-white').classes('w-48')

                        avc_opts = {
                            'all': _loc('rep_all_avc'),
                            'normal': _loc('rep_avc_safe'),
                            'warning': _loc('rep_avc_warning'),
                            'breach': _loc('rep_avc_breach'),
                        }
                        def _change_avc(e_val: str):
                            report_internal_state['avc'] = e_val
                            _render_reports_tab.refresh()

                        ui.select(
                            avc_opts,
                            value=report_internal_state['avc'],
                            label=_loc('rep_filter_avc'),
                            on_change=lambda e: _change_avc(e.value),
                        ).props('outlined dense options-dense bg-white').classes('w-44')

                        def _change_search(e_val: str):
                            report_internal_state['search'] = e_val
                            _render_reports_tab.refresh()

                        search_in = ui.input(placeholder=_loc('search_placeholder'), value=report_internal_state['search']).props('outlined dense clearable bg-white').classes('w-56')
                        search_in.on('keydown.enter', lambda e: _change_search(search_in.value or ''))

                    # 3. Executive KPI Cards Bar
                    with ui.grid(columns=5).classes('w-full gap-3 text-center'):
                        with ui.element('div').classes('p-3.5 rounded-xl bg-gradient-to-br from-white to-slate-50 border border-slate-200 shadow-2xs'):
                            ui.label(_loc('rep_stat_total_budget')).classes('text-[11px] uppercase font-bold text-slate-500')
                            ui.label(w.money(filt_b, curr)).classes('text-lg font-mono font-bold text-slate-900 truncate')
                            ui.label(f"{len(filtered_rows)} {_loc('rep_lines_count')}").classes('text-[10px] text-slate-400')

                        with ui.element('div').classes('p-3.5 rounded-xl bg-gradient-to-br from-white to-amber-50/40 border border-amber-200 shadow-2xs'):
                            ui.label(_loc('rep_stat_committed')).classes('text-[11px] uppercase font-bold text-amber-700')
                            ui.label(w.money(filt_c, curr)).classes('text-lg font-mono font-bold text-amber-900 truncate')
                            ui.label(f"{round((filt_c / filt_b)*100, 1) if filt_b > 0 else 0}% du budget").classes('text-[10px] text-amber-600')

                        with ui.element('div').classes('p-3.5 rounded-xl bg-gradient-to-br from-white to-indigo-50/40 border border-indigo-200 shadow-2xs'):
                            ui.label(_loc('rep_stat_spent')).classes('text-[11px] uppercase font-bold text-indigo-700')
                            ui.label(w.money(filt_s, curr)).classes('text-lg font-mono font-bold text-indigo-900 truncate')
                            ui.label(f"{round((filt_s / filt_b)*100, 1) if filt_b > 0 else 0}% imputé").classes('text-[10px] text-indigo-600')

                        avail_tone = 'emerald' if filt_rem >= 0 else 'rose'
                        with ui.element('div').classes(f"p-3.5 rounded-xl bg-gradient-to-br from-white to-{avail_tone}-50/40 border border-{avail_tone}-200 shadow-2xs"):
                            ui.label(_loc('rep_stat_available')).classes(f'text-[11px] uppercase font-bold text-{avail_tone}-700')
                            ui.label(w.money(filt_rem, curr)).classes(f'text-lg font-mono font-extrabold text-{avail_tone}-900 truncate')
                            ui.label('Solde libre net' if is_fr else 'Net free headroom').classes(f'text-[10px] text-{avail_tone}-600')

                        with ui.element('div').classes('p-3.5 rounded-xl bg-gradient-to-br from-white to-teal-50/40 border border-teal-200 shadow-2xs flex flex-col justify-between'):
                            ui.label(_loc('rep_stat_rate')).classes('text-[11px] uppercase font-bold text-teal-700')
                            ui.label(f"{filt_pct}%").classes('text-xl font-mono font-black text-teal-950')
                            p_color = 'negative' if filt_pct > 90 else ('warning' if filt_pct > 75 else 'teal')
                            ui.linear_progress(value=min(1.0, filt_pct / 100.0), size='6px').props(f'rounded color={p_color}').classes('w-full mt-1')

                    # 4. Executive Visual Breakdown Panels (Departmental, Nature, and AVC Radar)
                    with ui.grid(columns=3).classes('w-full gap-4'):
                        # Panel A: Departmental Share
                        with ui.element('div').classes('p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5 shadow-2xs'):
                            with ui.row().classes('items-center justify-between no-wrap'):
                                ui.label(_loc('rep_dept_breakdown_title')).classes('text-xs font-bold uppercase text-slate-700 tracking-wide')
                                ui.icon('apartment').classes('text-teal-700 text-sm')

                            # Aggregate by department
                            dept_totals: dict[str, float] = {}
                            for r in filtered_rows:
                                d_name = r.get('cost_center_name') or ('Direction Générale' if is_fr else 'General Management')
                                dept_totals[d_name] = dept_totals.get(d_name, 0) + (float(r.get('committed_amount') or 0) + float(r.get('actual_spent') or 0))

                            top_depts = sorted(dept_totals.items(), key=lambda x: x[1], reverse=True)[:4]
                            if top_depts:
                                for d_name, d_val in top_depts:
                                    d_share = round((d_val / filt_cons) * 100, 1) if filt_cons > 0 else 0
                                    with ui.column().classes('w-full gap-1'):
                                        with ui.row().classes('w-full justify-between items-center text-xs'):
                                            ui.label(d_name).classes('font-medium text-slate-700 truncate max-w-[180px]')
                                            ui.label(f"{w.money(d_val, curr)} ({d_share}%)").classes('font-mono font-bold text-slate-800 text-[11px]')
                                        ui.linear_progress(value=min(1.0, d_share / 100.0), size='5px').props('rounded color=teal').classes('w-full')
                            else:
                                ui.label('Aucune dépense enregistrée' if is_fr else 'No expenses recorded').classes('text-xs text-slate-400 italic py-2')

                        # Panel B: Nature Breakdown (OPEX vs CAPEX vs Maint)
                        with ui.element('div').classes('p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5 shadow-2xs'):
                            with ui.row().classes('items-center justify-between no-wrap'):
                                ui.label(_loc('rep_nature_breakdown_title')).classes('text-xs font-bold uppercase text-slate-700 tracking-wide')
                                ui.icon('pie_chart').classes('text-indigo-700 text-sm')

                            nature_totals: dict[str, float] = {'opex': 0, 'capex': 0, 'maintenance': 0}
                            for r in filtered_rows:
                                n_key = r.get('budget_type') or 'opex'
                                if n_key in nature_totals:
                                    nature_totals[n_key] += (float(r.get('committed_amount') or 0) + float(r.get('actual_spent') or 0))

                            nature_labels = {
                                'opex': ('Charges de Fonctionnement (Classe 6)' if is_fr else 'Operating (Opex)', 'indigo'),
                                'capex': ('Investissements & Actifs (Classe 2)' if is_fr else 'Capital (Capex)', 'amber'),
                                'maintenance': ('Maintenance & Entretien Biomédical' if is_fr else 'Maintenance', 'teal'),
                            }
                            for n_key, (n_lbl, n_col) in nature_labels.items():
                                n_val = nature_totals.get(n_key, 0)
                                n_share = round((n_val / filt_cons) * 100, 1) if filt_cons > 0 else 0
                                with ui.column().classes('w-full gap-1'):
                                    with ui.row().classes('w-full justify-between items-center text-xs'):
                                        ui.label(n_lbl).classes('font-medium text-slate-700 truncate max-w-[200px]')
                                        ui.label(f"{w.money(n_val, curr)} ({n_share}%)").classes('font-mono font-bold text-slate-800 text-[11px]')
                                    ui.linear_progress(value=min(1.0, n_share / 100.0), size='5px').props(f'rounded color={n_col}').classes('w-full')

                        # Panel C: AVC Statutory Compliance Radar
                        with ui.element('div').classes('p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5 shadow-2xs'):
                            with ui.row().classes('items-center justify-between no-wrap'):
                                ui.label(_loc('rep_avc_radar_title')).classes('text-xs font-bold uppercase text-slate-700 tracking-wide')
                                ui.icon('shield').classes('text-emerald-700 text-sm')

                            br_cnt = sum(1 for r in filtered_rows if r.get('avc_status') == 'breach')
                            wn_cnt = sum(1 for r in filtered_rows if r.get('avc_status') == 'warning')
                            ok_cnt = len(filtered_rows) - br_cnt - wn_cnt

                            with ui.column().classes('w-full gap-2 text-xs'):
                                with ui.row().classes('w-full justify-between items-center p-2 rounded-lg bg-emerald-50 border border-emerald-200'):
                                    with ui.row().classes('items-center gap-2'):
                                        ui.label('🟢').classes('text-xs')
                                        ui.label('Conformes (<80% de conso)' if is_fr else 'Safe (<80% consumed)').classes('font-bold text-emerald-900')
                                    ui.label(f"{ok_cnt} lignes").classes('font-mono font-bold text-emerald-800')

                                with ui.row().classes('w-full justify-between items-center p-2 rounded-lg bg-amber-50 border border-amber-200'):
                                    with ui.row().classes('items-center gap-2'):
                                        ui.label('🟡').classes('text-xs')
                                        ui.label('Sous Alerte (80–100%)' if is_fr else 'Warning (80–100%)').classes('font-bold text-amber-900')
                                    ui.label(f"{wn_cnt} lignes").classes('font-mono font-bold text-amber-800')

                                with ui.row().classes('w-full justify-between items-center p-2 rounded-lg bg-rose-50 border border-rose-200'):
                                    with ui.row().classes('items-center gap-2'):
                                        ui.label('🔴').classes('text-xs')
                                        ui.label('Dépassements / Bloqués' if is_fr else 'Breach / Overruns').classes('font-bold text-rose-900')
                                    ui.label(f"{br_cnt} lignes").classes('font-mono font-extrabold text-rose-800')

                    # 5. Dynamic Data Table Based on Active Report Mode
                    r_type = report_internal_state['type']

                    if r_type == 'statutory':
                        # Case 1: Statutory Budget Execution Statement
                        stat_rows = []
                        for r in filtered_rows:
                            b_amt = float(r.get('budget_amount') or 0)
                            c_amt = float(r.get('committed_amount') or 0)
                            s_amt = float(r.get('actual_spent') or 0)
                            cons_amt = c_amt + s_amt
                            rem_amt = float(r.get('remaining_budget') or 0)
                            pct_val = r.get('pct_consumed') or 0
                            avc_status = r.get('avc_status') or 'normal'
                            stat_rows.append({
                                'account': f"{r.get('account_code')} - {r.get('account_name')}",
                                'dept': r.get('cost_center_name') or ('Direction Générale' if is_fr else 'General Management'),
                                'prog': r.get('program_name') or ('Fonds Propres' if is_fr else 'Own Funds'),
                                'type': _tr_type(r.get('budget_type') or 'opex'),
                                'budget': w.money(b_amt, curr),
                                'committed': w.money(c_amt, curr),
                                'spent': w.money(s_amt, curr),
                                'consumed': w.money(cons_amt, curr),
                                'avail': w.money(rem_amt, curr),
                                'rate': f"{pct_val}%",
                                '_rate_raw': pct_val,
                                'avc': 'NORMAL' if avc_status == 'normal' else ('ALERTE' if avc_status == 'warning' else 'DÉPASSEMENT'),
                                '_avc_raw': avc_status,
                            })

                        stat_cols = [
                            {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                            {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left', 'sortable': True},
                            {'name': 'prog', 'label': _loc('col_program'), 'field': 'prog', 'align': 'left'},
                            {'name': 'type', 'label': _loc('col_type'), 'field': 'type', 'align': 'center'},
                            {'name': 'budget', 'label': _loc('col_budget'), 'field': 'budget', 'align': 'right', 'sortable': True},
                            {'name': 'committed', 'label': _loc('col_comm'), 'field': 'committed', 'align': 'right', 'sortable': True},
                            {'name': 'spent', 'label': _loc('col_spent'), 'field': 'spent', 'align': 'right', 'sortable': True},
                            {'name': 'consumed', 'label': _loc('col_consumed'), 'field': 'consumed', 'align': 'right', 'sortable': True},
                            {'name': 'avail', 'label': _loc('col_avail'), 'field': 'avail', 'align': 'right', 'sortable': True},
                            {'name': 'rate', 'label': _loc('col_rate'), 'field': 'rate', 'align': 'right', 'sortable': True},
                            {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center', 'sortable': True},
                        ]

                        tbl_stat = ui.table(columns=stat_cols, rows=stat_rows, pagination=15).classes('w-full lc-table')
                        tbl_stat.add_slot('body-cell-budget', '<q-td :props="props" class="font-mono font-bold">{{ props.value }}</q-td>')
                        tbl_stat.add_slot('body-cell-consumed', '<q-td :props="props" class="font-mono font-bold text-slate-800">{{ props.value }}</q-td>')
                        tbl_stat.add_slot('body-cell-avail', '<q-td :props="props" :class="props.row._avc_raw === \'breach\' ? \'text-red-700 font-bold font-mono\' : \'text-emerald-700 font-bold font-mono\'">{{ props.value }}</q-td>')
                        tbl_stat.add_slot('body-cell-avc', '''
                            <q-td :props="props">
                                <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                        :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                        class="text-weight-bold text-caption">
                                    {{ props.value }}
                                </q-chip>
                            </q-td>
                        ''')

                    elif r_type == 'variance':
                        # Case 2: Budget vs Actual Variance Analysis & Quarterly Phasing
                        var_rows = []
                        for r in filtered_rows:
                            b_amt = float(r.get('budget_amount') or 0)
                            s_amt = float(r.get('actual_spent') or 0)
                            q_amt = b_amt / 4.0
                            delta = b_amt - s_amt
                            delta_pct = round(((b_amt - s_amt) / b_amt) * 100, 1) if b_amt > 0 else 0
                            is_favorable = delta >= 0
                            var_rows.append({
                                'account': f"{r.get('account_code')} - {r.get('account_name')}",
                                'dept': r.get('cost_center_name') or 'Direction Générale',
                                'budget': w.money(b_amt, curr),
                                'q1': w.money(q_amt, curr),
                                'q2': w.money(q_amt, curr),
                                'q3': w.money(q_amt, curr),
                                'q4': w.money(q_amt, curr),
                                'spent': w.money(s_amt, curr),
                                'delta': w.money(delta, curr),
                                'delta_pct': f"{delta_pct}%",
                                'status': 'FAVORABLE (Économie)' if is_favorable else 'DÉFAVORABLE (Dépassement)',
                                '_is_fav': is_favorable,
                            })

                        var_cols = [
                            {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                            {'name': 'dept', 'label': _loc('col_dept'), 'field': 'dept', 'align': 'left'},
                            {'name': 'budget', 'label': _loc('col_budget'), 'field': 'budget', 'align': 'right', 'sortable': True},
                            {'name': 'q1', 'label': _loc('col_phasing_q1'), 'field': 'q1', 'align': 'right'},
                            {'name': 'q2', 'label': _loc('col_phasing_q2'), 'field': 'q2', 'align': 'right'},
                            {'name': 'q3', 'label': _loc('col_phasing_q3'), 'field': 'q3', 'align': 'right'},
                            {'name': 'q4', 'label': _loc('col_phasing_q4'), 'field': 'q4', 'align': 'right'},
                            {'name': 'spent', 'label': _loc('col_spent'), 'field': 'spent', 'align': 'right', 'sortable': True},
                            {'name': 'delta', 'label': _loc('col_variance_val'), 'field': 'delta', 'align': 'right', 'sortable': True},
                            {'name': 'delta_pct', 'label': _loc('col_variance_pct'), 'field': 'delta_pct', 'align': 'right', 'sortable': True},
                            {'name': 'status', 'label': _loc('col_variance_status'), 'field': 'status', 'align': 'center'},
                        ]

                        tbl_var = ui.table(columns=var_cols, rows=var_rows, pagination=15).classes('w-full lc-table')
                        tbl_var.add_slot('body-cell-delta', '<q-td :props="props" :class="props.row._is_fav ? \'text-emerald-700 font-bold font-mono\' : \'text-red-700 font-bold font-mono\'">{{ props.value }}</q-td>')
                        tbl_var.add_slot('body-cell-status', '''
                            <q-td :props="props">
                                <q-badge :color="props.row._is_fav ? 'green-1' : 'red-1'" :text-color="props.row._is_fav ? 'green-9' : 'red-9'" class="text-weight-bold">
                                    {{ props.value }}
                                </q-badge>
                            </q-td>
                        ''')

                    elif r_type == 'versions':
                        # Case 3: Multi-Version Comparative Analysis (V0 vs V1 vs Real)
                        comp_rows = []
                        for r in filtered_rows:
                            v0 = float(r.get('initial_budget') or r.get('budget_amount') or 0)
                            v1 = float(r.get('budget_amount') or 0)
                            delta = v1 - v0
                            comm_amt = float(r.get('committed_amount') or 0)
                            s_amt = float(r.get('actual_spent') or 0)
                            cons_amt = comm_amt + s_amt
                            rem_amt = float(r.get('remaining_budget') or 0)
                            pct_v1 = r.get('pct_consumed') or 0
                            comp_rows.append({
                                'account': f"{r.get('account_code')} - {r.get('account_name')}",
                                'v0': w.money(v0, curr),
                                'carried': w.money(0, curr),
                                'transfers': w.money(delta, curr),
                                'v1': w.money(v1, curr),
                                'delta': w.money(delta, curr),
                                'comm': w.money(comm_amt, curr),
                                'spent': w.money(s_amt, curr),
                                'consumed': w.money(cons_amt, curr),
                                'avail': w.money(rem_amt, curr),
                                'rate_v1': f"{pct_v1}%",
                                'avc': 'NORMAL' if r.get('avc_status') == 'normal' else ('ALERTE' if r.get('avc_status') == 'warning' else 'DÉPASSEMENT'),
                                '_avc_raw': r.get('avc_status') or 'normal',
                            })

                        comp_cols = [
                            {'name': 'account', 'label': _loc('col_account'), 'field': 'account', 'align': 'left', 'sortable': True},
                            {'name': 'v0', 'label': _loc('col_v0'), 'field': 'v0', 'align': 'right', 'sortable': True},
                            {'name': 'carried', 'label': _loc('col_carried'), 'field': 'carried', 'align': 'right'},
                            {'name': 'transfers', 'label': _loc('col_transfers'), 'field': 'transfers', 'align': 'right'},
                            {'name': 'v1', 'label': _loc('col_v1'), 'field': 'v1', 'align': 'right', 'sortable': True},
                            {'name': 'delta', 'label': _loc('col_delta'), 'field': 'delta', 'align': 'right'},
                            {'name': 'comm', 'label': _loc('col_comm'), 'field': 'comm', 'align': 'right'},
                            {'name': 'spent', 'label': _loc('col_spent'), 'field': 'spent', 'align': 'right'},
                            {'name': 'consumed', 'label': _loc('col_consumed'), 'field': 'consumed', 'align': 'right', 'sortable': True},
                            {'name': 'avail', 'label': _loc('col_avail'), 'field': 'avail', 'align': 'right', 'sortable': True},
                            {'name': 'rate_v1', 'label': _loc('col_exec_v1'), 'field': 'rate_v1', 'align': 'right', 'sortable': True},
                            {'name': 'avc', 'label': _loc('col_avc_status'), 'field': 'avc', 'align': 'center'},
                        ]

                        tbl_comp = ui.table(columns=comp_cols, rows=comp_rows, pagination=15).classes('w-full lc-table')
                        tbl_comp.add_slot('body-cell-v1', '<q-td :props="props" class="font-mono font-bold text-teal-800">{{ props.value }}</q-td>')
                        tbl_comp.add_slot('body-cell-avc', '''
                            <q-td :props="props">
                                <q-chip dense :color="props.row._avc_raw === 'breach' ? 'red-1' : (props.row._avc_raw === 'warning' ? 'amber-1' : 'green-1')"
                                        :text-color="props.row._avc_raw === 'breach' ? 'red-9' : (props.row._avc_raw === 'warning' ? 'amber-9' : 'green-9')"
                                        class="text-weight-bold">
                                    {{ props.value }}
                                </q-chip>
                            </q-td>
                        ''')

                    else:
                        # Case 4: 5-Stage Statutory Expenditure Pipeline & Bottlenecks
                        tot_mandat = sum(float(o.get('net_amount', 0)) for o in orders)
                        tot_paid = sum(float(o.get('paid_amount', 0)) for o in orders if o.get('status') == 'paid')
                        tot_cert = sum(float(c.get('certified_amount', 0)) for c in certs)

                        # Pipeline summary cards
                        with ui.grid(columns=3).classes('w-full gap-3 mb-2'):
                            pending_cert = max(0.0, filt_c - tot_cert)
                            with ui.element('div').classes('p-3 rounded-xl bg-amber-50 border border-amber-200'):
                                ui.label(_loc('pipe_pending_cert')).classes('text-[11px] font-bold text-amber-900 uppercase')
                                ui.label(w.money(pending_cert, curr)).classes('text-base font-mono font-bold text-amber-950')
                                ui.label(f"{len(comms)} engagements émis").classes('text-[10px] text-amber-700')

                            pending_mandat = max(0.0, tot_cert - tot_mandat)
                            with ui.element('div').classes('p-3 rounded-xl bg-purple-50 border border-purple-200'):
                                ui.label(_loc('pipe_pending_mandat')).classes('text-[11px] font-bold text-purple-900 uppercase')
                                ui.label(w.money(pending_mandat, curr)).classes('text-base font-mono font-bold text-purple-950')
                                ui.label(f"{len(certs)} PV de réception certifiés").classes('text-[10px] text-purple-700')

                            pending_pay = max(0.0, tot_mandat - tot_paid)
                            with ui.element('div').classes('p-3 rounded-xl bg-indigo-50 border border-indigo-200'):
                                ui.label(_loc('pipe_pending_pay')).classes('text-[11px] font-bold text-indigo-900 uppercase')
                                ui.label(w.money(pending_pay, curr)).classes('text-base font-mono font-bold text-indigo-950')
                                ui.label(f"{len(orders)} mandats de paiement émis").classes('text-[10px] text-indigo-700')

                        pipe_rows = []
                        for c in comms:
                            pipe_rows.append({
                                'stage': '2. Engagement (BC)',
                                'ref': c.get('commitment_number') or f"#{c.get('id')}",
                                'desc': c.get('description'),
                                'partner': c.get('vendor_name') or 'Fournisseur non spécifié',
                                'amount': w.money(c.get('amount', 0), curr),
                                'status': _tr_status(c.get('status')),
                                '_status_raw': c.get('status'),
                            })
                        for o in orders:
                            pipe_rows.append({
                                'stage': '4. Ordonnancement',
                                'ref': o.get('mandat_number'),
                                'desc': o.get('object_description'),
                                'partner': o.get('beneficiary_name'),
                                'amount': w.money(o.get('net_amount', 0), curr),
                                'status': _tr_status(o.get('status')),
                                '_status_raw': o.get('status'),
                            })

                        pipe_cols = [
                            {'name': 'stage', 'label': 'Étape du Flux' if is_fr else 'Pipeline Stage', 'field': 'stage', 'align': 'left', 'sortable': True},
                            {'name': 'ref', 'label': _loc('col_ref'), 'field': 'ref', 'align': 'left', 'sortable': True},
                            {'name': 'desc', 'label': _loc('col_desc'), 'field': 'desc', 'align': 'left'},
                            {'name': 'partner', 'label': _loc('col_vendor'), 'field': 'partner', 'align': 'left'},
                            {'name': 'amount', 'label': _loc('col_amount'), 'field': 'amount', 'align': 'right', 'sortable': True},
                            {'name': 'status', 'label': _loc('col_status'), 'field': 'status', 'align': 'center'},
                        ]

                        tbl_pipe = ui.table(columns=pipe_cols, rows=pipe_rows, pagination=15).classes('w-full lc-table')
                        tbl_pipe.add_slot('body-cell-ref', '<q-td :props="props" class="font-mono font-bold text-primary">{{ props.value }}</q-td>')
                        tbl_pipe.add_slot('body-cell-amount', '<q-td :props="props" class="font-mono font-bold text-slate-800">{{ props.value }}</q-td>')

            refreshers['reports'] = _render_reports_tab.refresh
            _render_reports_tab()

        # ---------------------------------------------------------------------
        # TAB 9: SAGE 100 / SAGE X3 & MULTI-BRANCH ERP GATEWAY
        # ---------------------------------------------------------------------
        with ui.tab_panel(t_sage).classes('p-0 gap-4 flex flex-col'):
            await render_sage_tab(state, refreshers, currency)


