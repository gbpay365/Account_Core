"""
Electronic Invoicing & Inter-Branch Clearing (Facturation Normalisée DFE & Liaisons Inter-Établissements).
Implements CEMAC / DGI standardized tax invoices with 2D QR codes, legal stamp duties (6461 / 4474),
and reciprocal clearing for hospital network branches via account 18 (Compte de liaison).
"""

from __future__ import annotations
from typing import Any

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {'fr': 'Facturation Normalisée DFE & Liaisons Inter-Sites', 'en': 'DFE Electronic Invoicing & Inter-Branch Clearing'},
    'subtitle': {
        'fr': 'Factures certifiées DGI avec QR code de sécurité, timbres fiscaux légaux (Art. 6461/4474) et comptes de liaison (SYSCOHADA Art. 18).',
        'en': 'DGI certified tax invoices with security QR codes, legal stamp duties (Art. 6461/4474), and reciprocal branch accounts (SYSCOHADA Art. 18).',
    },
    'kpi_ttc': {'fr': 'Total Facturé TTC', 'en': 'Total Invoiced (Inc. Tax)'},
    'kpi_tva': {'fr': 'TVA Facturée (19.25%)', 'en': 'Total Invoiced VAT'},
    'kpi_stamp': {'fr': 'Timbres Fiscaux Collectés', 'en': 'Fiscal Stamp Duties'},
    'kpi_count': {'fr': 'Factures Certifiées DGI', 'en': 'Certified DFE Invoices'},
    'kpi_branches': {'fr': 'Réseau Établissements', 'en': 'Branch Network Sites'},
    'btn_issue': {'fr': 'Émettre une Facture DFE', 'en': 'Issue DFE Tax Invoice'},
    'btn_verify': {'fr': 'Vérifier un Jeton DFE', 'en': 'Verify DFE Token'},
    'btn_transfer': {'fr': 'Nouveau Virement Inter-Sites', 'en': 'New Inter-Branch Transfer'},
    'tab_dfe': {'fr': 'Factures Normalisées DFE', 'en': 'DFE Electronic Invoices'},
    'tab_interbranch': {'fr': 'Liaisons Inter-Établissements (Compte 18)', 'en': 'Inter-Branch Clearing (Account 18)'},
}


def _loc(key: str) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'fr'
    entry = _T.get(key)
    if isinstance(entry, dict):
        return entry.get(cur, entry.get('fr', ''))
    return t(key)


@page('/dfe-invoicing', title='Facturation DFE & Sites', permissions=('journal.view',))
async def dfe_invoicing_page() -> None:
    # State
    state: dict[str, Any] = {
        'invoices': [],
        'branches': [],
        'transfers': [],
        'recon': None,
    }

    async def _fetch_all():
        inv_res = await api.safe(api.get('/dfe/invoices'), notify=False) or {}
        state['invoices'] = inv_res.get('rows', []) if isinstance(inv_res, dict) else (inv_res if isinstance(inv_res, list) else [])

        br_res = await api.safe(api.get('/interbranch/branches'), notify=False) or {}
        state['branches'] = br_res.get('rows', []) if isinstance(br_res, dict) else (br_res if isinstance(br_res, list) else [])

        tr_res = await api.safe(api.get('/interbranch/transfers'), notify=False) or {}
        state['transfers'] = tr_res.get('rows', []) if isinstance(tr_res, dict) else (tr_res if isinstance(tr_res, list) else [])

        recon_res = await api.safe(api.get('/interbranch/reconciliation'), notify=False)
        state['recon'] = recon_res if isinstance(recon_res, dict) else {}

    await _fetch_all()

    content_area = ui.column().classes('w-full gap-5')

    async def reload_all():
        await _fetch_all()
        await render_content()

    async def render_content():
        content_area.clear()
        with content_area:
            invoices = state['invoices']
            branches = state['branches']
            transfers = state['transfers']
            recon = state['recon'] if isinstance(state['recon'], dict) else {}

            # 1. Header with Actions
            def _head_actions():
                ui.button(
                    _loc('btn_issue'),
                    icon='add_circle',
                    on_click=lambda: _issue_dfe_modal(reload_all)
                ).props('unelevated color=primary size=sm').classes('font-medium')

                ui.button(
                    _loc('btn_verify'),
                    icon='verified',
                    on_click=lambda: _verify_token_modal()
                ).props('outline color=teal size=sm').classes('font-medium')

                ui.button(
                    _loc('btn_transfer'),
                    icon='swap_horiz',
                    on_click=lambda: _interbranch_transfer_modal(branches, reload_all)
                ).props('outline color=primary size=sm').classes('font-medium')

            w.page_header(
                _loc('title'),
                _loc('subtitle'),
                emoji='⚡',
                actions=_head_actions,
            )

            # 2. KPI Cards
            total_ttc = sum(float(i.get('total_ttc', 0)) for i in invoices)
            total_tva = sum(float(i.get('total_tva', 0)) for i in invoices)
            total_stamp = sum(float(i.get('fiscal_stamp_duty', 0)) for i in invoices)
            recon_summary = recon.get('summary', {}) if isinstance(recon.get('summary'), dict) else {}
            total_transferred = recon_summary.get('total_transferred', 0)

            with ui.row().classes('w-full grid grid-cols-2 md:grid-cols-5 gap-3 mb-2'):
                w.kpi(_loc('kpi_ttc'), f'{w.money(total_ttc)} XAF', tone='teal', icon='receipt_long')
                w.kpi(_loc('kpi_tva'), f'{w.money(total_tva)} XAF', tone='sky', icon='percent')
                w.kpi(_loc('kpi_stamp'), f'{w.money(total_stamp)} XAF', tone='amber', icon='confirmation_number')
                w.kpi(_loc('kpi_count'), str(len(invoices)), tone='violet', icon='qr_code_2')
                w.kpi(_loc('kpi_branches'), f"{len(branches)} sites", hint=f"{w.money(total_transferred)} XAF virés" if lang() == 'fr' else f"{w.money(total_transferred)} XAF cleared", tone='slate', icon='hub')

            # 3. Tabs
            with ui.tabs().classes('w-full border-b border-slate-200 text-slate-600') as tabs:
                t1 = ui.tab('tab_dfe', label=_loc('tab_dfe'), icon='receipt')
                t2 = ui.tab('tab_interbranch', label=_loc('tab_interbranch'), icon='alt_route')

            with ui.tab_panels(tabs, value=t1).classes('w-full bg-transparent p-0 pt-4'):
                # PANEL 1: DFE Invoices
                with ui.tab_panel(t1).classes('p-0 gap-4 flex flex-col'):
                    if not invoices:
                        w.empty_state(
                            'Aucune facture normalisée émise' if lang() == 'fr' else 'No DFE invoices issued',
                            hint='Cliquez sur "Émettre une Facture DFE" pour créer une facture normalisée avec QR code DGI.' if lang() == 'fr' else 'Click "Issue DFE Tax Invoice" to create a tax invoice with DGI QR code.',
                            emoji='🧾',
                        )
                    else:
                        cols = [
                            {'name': 'num', 'label': 'N° Facture DFE', 'field': 'invoice_number', 'align': 'left'},
                            {'name': 'date', 'label': 'Date', 'field': 'invoice_date', 'align': 'left'},
                            {'name': 'cust', 'label': 'Client / Organisme', 'field': 'customer_name', 'align': 'left'},
                            {'name': 'niu', 'label': 'NIU Client', 'field': 'customer_niu', 'align': 'left'},
                            {'name': 'ht', 'label': 'Montant HT', 'field': 'ht_fmt', 'align': 'right'},
                            {'name': 'tva', 'label': 'TVA (19.25%)', 'field': 'tva_fmt', 'align': 'right'},
                            {'name': 'stamp', 'label': 'Timbre Fiscal', 'field': 'stamp_fmt', 'align': 'right'},
                            {'name': 'ttc', 'label': 'Total TTC', 'field': 'ttc_fmt', 'align': 'right'},
                            {'name': 'status', 'label': 'Statut DGI', 'field': 'status_fmt', 'align': 'center'},
                            {'name': 'actions', 'label': 'Facture Normalisée', 'field': 'actions', 'align': 'center'},
                        ]

                        rows = [
                            {
                                'id': i['id'],
                                'invoice_number': i['invoice_number'],
                                'invoice_date': i['invoice_date'],
                                'customer_name': i.get('customer_name', '—'),
                                'customer_niu': i.get('customer_niu', '—'),
                                'ht_fmt': f"{w.money(i.get('total_ht', 0))} XAF",
                                'tva_fmt': f"{w.money(i.get('total_tva', 0))} XAF",
                                'stamp_fmt': f"{w.money(i.get('fiscal_stamp_duty', 0))} XAF",
                                'ttc_fmt': f"{w.money(i.get('total_ttc', 0))} XAF",
                                'status_fmt': 'Certifiée DGI',
                                '_raw': i,
                            }
                            for i in invoices
                        ]

                        tbl = w.table(
                            columns=cols,
                            rows=rows,
                            pagination=15,
                            title='Registre des Factures Électroniques Normalisées (DFE)'
                        )

                        tbl.add_slot('body-cell-ttc', '''
                            <q-td :props="props" class="font-bold text-teal-800">
                                {{ props.value }}
                            </q-td>
                        ''')

                        tbl.add_slot('body-cell-actions', '''
                            <q-td :props="props">
                                <q-btn flat round dense size="sm" icon="qr_code" color="primary" @click="$parent.$emit('view_dfe', props.row)" />
                            </q-td>
                        ''')
                        async def _on_view_dfe(e):
                            await _view_dfe_modal(e.args['_raw']['id'])
                        tbl.on('view_dfe', _on_view_dfe)

                # PANEL 2: Inter-Branch Reciprocal Clearing
                with ui.tab_panel(t2).classes('p-0 gap-4 flex flex-col'):
                    # Reciprocal Balance Banner
                    summary = recon.get('summary', {}) if isinstance(recon, dict) and isinstance(recon.get('summary'), dict) else {}
                    is_bal = summary.get('is_balanced', True)
                    variance = summary.get('variance', 0)

                    with ui.row().classes(
                        f"w-full items-center justify-between p-4 rounded-xl border { 'bg-emerald-50 border-emerald-300 text-emerald-950' if is_bal else 'bg-rose-50 border-rose-300 text-rose-950' }"
                    ):
                        with ui.row().classes('items-center gap-3'):
                            ui.label('🟢' if is_bal else '🔴').classes('text-2xl leading-none')
                            with ui.column().classes('gap-0'):
                                ui.label('Équilibre Réciproque des Comptes de Liaison (Art. 18 SYSCOHADA)' if is_bal else 'Écart Réciproque Détecté').classes('text-sm font-bold')
                                ui.label(
                                    f"Compte 1851 (Crédit Net): {w.money(summary.get('account_1851_net_credit', 0))} XAF | Compte 1852 (Débit Net): {w.money(summary.get('account_1852_net_debit', 0))} XAF | Écart: {w.money(variance)} XAF"
                                ).classes('text-xs opacity-90')

                        w.badge('Conforme (Écart Zéro)' if is_bal else 'Écart à Régulariser', tone='emerald' if is_bal else 'rose')

                    # Branch Establishments Grid
                    ui.label('Réseau des Établissements & Centres Médicaux').classes('text-sm font-bold text-slate-800 mt-2')
                    with ui.row().classes('w-full grid grid-cols-1 md:grid-cols-4 gap-3'):
                        for b in branches:
                            is_hq = b.get('branch_type') == 'headquarters'
                            with ui.card().classes('p-4 border border-slate-200 bg-white rounded-xl shadow-xs gap-1'):
                                with ui.row().classes('items-center justify-between w-full'):
                                    ui.label(b['code']).classes('text-xs font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded')
                                    w.badge('Siège Central' if is_hq else 'Centre Médical', tone='teal' if is_hq else 'slate')
                                ui.label(b['name']).classes('text-sm font-semibold text-slate-900 leading-tight mt-1')
                                ui.label(f"Ville: {b.get('city', '')} | Cpte liaison: {b.get('liaison_account_code', '1851')}").classes('text-xs text-slate-500')
                                ui.label(f"Virements traités: {b.get('transfer_count', 0)}").classes('text-xs text-slate-400 mt-2')

                    # Transfers Table
                    tr_cols = [
                        {'name': 'num', 'label': 'N° Virement', 'field': 'transfer_number', 'align': 'left'},
                        {'name': 'date', 'label': 'Date', 'field': 'transfer_date', 'align': 'left'},
                        {'name': 'src', 'label': 'Établissement Émetteur', 'field': 'source_branch_name', 'align': 'left'},
                        {'name': 'dst', 'label': 'Établissement Récepteur', 'field': 'dest_branch_name', 'align': 'left'},
                        {'name': 'amt', 'label': 'Montant Transféré', 'field': 'amount_fmt', 'align': 'right'},
                        {'name': 'desc', 'label': 'Objet du Virement', 'field': 'description', 'align': 'left'},
                        {'name': 'src_je', 'label': 'Écriture Émetteur', 'field': 'source_entry_number', 'align': 'left'},
                        {'name': 'dst_je', 'label': 'Écriture Récepteur', 'field': 'dest_entry_number', 'align': 'left'},
                        {'name': 'status', 'label': 'Statut', 'field': 'status_fmt', 'align': 'center'},
                    ]
                    tr_rows = [
                        {
                            'id': t['id'],
                            'transfer_number': t['transfer_number'],
                            'transfer_date': t['transfer_date'],
                            'source_branch_name': t.get('source_branch_name', '—'),
                            'dest_branch_name': t.get('dest_branch_name', '—'),
                            'amount_fmt': f"{w.money(t.get('amount', 0))} XAF",
                            'description': t.get('description', '—'),
                            'source_entry_number': t.get('source_entry_number') or '—',
                            'dest_entry_number': t.get('dest_entry_number') or '—',
                            'status_fmt': 'Réconcilié (1851/1852)',
                        }
                        for t in transfers
                    ]
                    w.table(columns=tr_cols, rows=tr_rows, pagination=15, title='Historique des Virements et Mouvements Inter-Sites')

    # --- Modals --------------------------------------------------------------

    def _issue_dfe_modal(on_done):
        d = ui.dialog().props('persistent')
        with d, ui.card().classes('w-full max-w-lg p-6 gap-3'):
            w.modal_header('Émettre une Facture Normalisée DFE', emoji='🧾')
            ui.label('Génère une facture fiscale normalisée avec signature électronique SHA-256, QR code officiel et calcul automatique du timbre fiscal (Compte 6461).').classes('text-xs text-slate-500')

            inv_no_in = ui.input('N° Facture (ex: DFE-2026-0003)', value='DFE-2026-0003').props('outlined dense')
            cust_name_in = ui.input('Nom du Client / Établissement').props('outlined dense')
            cust_niu_in = ui.input('N° Identifiant Unique (NIU Client)', value='M019200088888T').props('outlined dense')
            cust_email_in = ui.input('Email Client (Optionnel)').props('outlined dense')
            date_in = ui.input('Date Facture (YYYY-MM-DD)', value='2026-10-15').props('outlined dense')
            ht_in = ui.number('Montant Total Hors Taxes (HT - XAF)', value=2500000).props('outlined dense')
            tva_in = ui.number('Taux TVA (%)', value=19.25).props('outlined dense')
            stamp_in = ui.number('Droit de Timbre Fiscal (XAF)', value=1000).props('outlined dense')

            async def _submit():
                if not inv_no_in.value or not cust_name_in.value or not ht_in.value or not date_in.value:
                    ui.notify('Veuillez remplir tous les champs obligatoires' if lang() == 'fr' else 'Please fill in all required fields', type='warning')
                    return
                try:
                    res = await api.post('/dfe/invoices', {
                        'invoice_number': inv_no_in.value.strip(),
                        'customer_name': cust_name_in.value.strip(),
                        'customer_niu': cust_niu_in.value.strip(),
                        'customer_email': cust_email_in.value.strip() or None,
                        'invoice_date': date_in.value.strip(),
                        'total_ht': float(ht_in.value),
                        'tva_rate': float(tva_in.value),
                        'fiscal_stamp_duty': float(stamp_in.value),
                    })
                    ui.notify(
                        f"Facture DFE {res.get('invoice_number')} certifiée avec succès !" if lang() == 'fr' else f"DFE invoice {res.get('invoice_number')} certified successfully!",
                        type='positive'
                    )
                    d.close()
                    await on_done()
                except Exception as err:
                    ui.notify(f"Erreur d'émission DFE: {err}" if lang() == 'fr' else f"DFE issue error: {err}", type='negative')

            with ui.row().classes('w-full justify-end gap-2 mt-4'):
                ui.button('Annuler' if lang() == 'fr' else 'Cancel', on_click=d.close).props('flat color=grey')
                ui.button('Certifier & Émettre' if lang() == 'fr' else 'Certify & Issue', on_click=_submit).props('unelevated color=primary')
        d.open()

    def _verify_token_modal():
        d = ui.dialog()
        with d, ui.card().classes('w-full max-w-md p-6 gap-3'):
            w.modal_header('Vérification Fiscale de Jeton DFE' if lang() == 'fr' else 'DFE Security Token Verification', emoji='🔍')
            ui.label(
                'Saisissez le jeton cryptographique SHA-256 pour vérifier la conformité auprès du serveur DGI.'
                if lang() == 'fr' else 'Enter the SHA-256 cryptographic token to verify conformity against the DGI server.'
            ).classes('text-xs text-slate-500')

            token_in = ui.input('Jeton de Sécurité / Signature DFE' if lang() == 'fr' else 'DFE Security Token / Signature').props('outlined dense').classes('w-full font-mono text-xs')
            result_area = ui.column().classes('w-full gap-2')

            async def _check():
                result_area.clear()
                if not token_in.value:
                    ui.notify('Jeton requis' if lang() == 'fr' else 'Token required', type='warning')
                    return
                try:
                    v = await api.get(f"/dfe/verify/{token_in.value.strip()}")
                    with result_area:
                        if v.get('verified'):
                            with ui.card().classes('w-full p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs gap-1'):
                                with ui.row().classes('items-center gap-2 text-emerald-900 font-bold'):
                                    ui.label('✅ FACTURE AUTHENTIQUE & ENREGISTRÉE DGI' if lang() == 'fr' else '✅ AUTHENTIC INVOICE REGISTERED WITH DGI')
                                inv = v.get('invoice', {})
                                ui.label(f"Facture N°: {inv.get('number')} du {inv.get('date')}")
                                ui.label(f"Émetteur: {v.get('issuer', {}).get('name')}")
                                ui.label(f"Client: {inv.get('customer')} (NIU: {inv.get('customer_niu')})")
                                ui.label(f"Total TTC: {w.money(inv.get('total_ttc', 0))} XAF").classes('font-bold text-sm text-emerald-900')
                        else:
                            with ui.card().classes('w-full p-3 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-900'):
                                ui.label('❌ JETON INVALIDE OU NON RÉPERTORIÉ DGI' if lang() == 'fr' else '❌ INVALID TOKEN OR NOT FOUND ON DGI SERVER').classes('font-bold')
                except Exception as err:
                    ui.notify(f"Erreur vérification: {err}", type='negative')

            with ui.row().classes('w-full justify-between items-center mt-2'):
                ui.button('Fermer' if lang() == 'fr' else 'Close', on_click=d.close).props('flat color=grey')
                ui.button('Interroger le Serveur' if lang() == 'fr' else 'Query Server', on_click=_check).props('unelevated color=teal size=sm')
        d.open()

    def _interbranch_transfer_modal(branches_list: list, on_done):
        d = ui.dialog().props('persistent')
        with d, ui.card().classes('w-full max-w-md p-6 gap-3'):
            w.modal_header('Virement Inter-Établissements (Compte 18)' if lang() == 'fr' else 'Inter-Branch Transfer (Account 18)', emoji='💸')
            ui.label(
                'Génère automatiquement les écritures réciproques (Débit 1852 Émetteur / Crédit 1851 Récepteur) assurant un équilibre zéro strict.'
                if lang() == 'fr' else 'Generates reciprocal journal entries (Debit 1852 Source / Credit 1851 Destination) guaranteeing zero variance.'
            ).classes('text-xs text-slate-500')

            b_opts = {b['id']: f"{b['code']} — {b['name']}" for b in branches_list}

            tr_num_in = ui.input('N° Virement (ex: TR-2026-003)' if lang() == 'fr' else 'Transfer No. (e.g. TR-2026-003)', value='TR-2026-003').props('outlined dense')
            src_in = ui.select(b_opts, value=branches_list[0]['id'] if branches_list else None, label='Établissement Source' if lang() == 'fr' else 'Source Branch').props('outlined dense')

            def _open_new_branch_dialog():
                dlg_br = ui.dialog()
                with dlg_br, ui.card().classes('w-full max-w-sm p-5 gap-3'):
                    w.modal_header('Nouvel Établissement' if lang() == 'fr' else 'New Branch / Establishment', emoji='🏥')
                    b_code = ui.input('Code (ex: KUMBA-CARE)', placeholder='KUMBA-CARE').props('outlined dense uppercase')
                    b_name = ui.input('Nom de l’Établissement' if lang() == 'fr' else 'Branch Name', placeholder='Centre Médical de Kumba').props('outlined dense')
                    b_city = ui.input('Ville' if lang() == 'fr' else 'City', placeholder='Kumba').props('outlined dense')

                    async def _create_b():
                        if not b_code.value or not b_name.value:
                            ui.notify('Veuillez renseigner le code et le nom' if lang() == 'fr' else 'Code and name required', type='warning')
                            return
                        try:
                            new_b = await api.post('/interbranch/branches', {
                                'code': b_code.value.strip().upper(),
                                'name': b_name.value.strip(),
                                'city': b_city.value.strip() or 'Douala',
                                'branch_type': 'clinic',
                                'liaison_account_code': '1851',
                            })
                            b_opts[new_b['id']] = f"{new_b['code']} — {new_b['name']}"
                            dst_in.options = b_opts
                            dst_in.set_value(new_b['id'])
                            ui.notify(f"Établissement {new_b.get('name')} créé !" if lang() == 'fr' else f"Branch {new_b.get('name')} created!", type='positive')
                            dlg_br.close()
                        except Exception as ex:
                            ui.notify(f"Erreur: {ex}", type='negative')

                    with ui.row().classes('w-full justify-end gap-2 mt-2'):
                        ui.button('Annuler' if lang() == 'fr' else 'Cancel', on_click=dlg_br.close).props('flat color=grey')
                        ui.button('Créer' if lang() == 'fr' else 'Create', on_click=_create_b).props('unelevated color=teal size=sm')
                dlg_br.open()

            with ui.row().classes('w-full items-center justify-between no-wrap'):
                ui.label('Établissement Destinataire' if lang() == 'fr' else 'Destination Branch').classes('text-xs font-semibold text-slate-700')
                ui.button('+ Nouveau' if lang() == 'fr' else '+ New Branch', icon='add_business', on_click=_open_new_branch_dialog).props('flat dense size=sm color=teal-8 no-caps class="text-xs font-bold"')

            dst_in = ui.select(b_opts, value=branches_list[1]['id'] if len(branches_list) > 1 else None).props('outlined dense')
            date_in = ui.input('Date Virement (YYYY-MM-DD)' if lang() == 'fr' else 'Transfer Date (YYYY-MM-DD)', value='2026-10-15').props('outlined dense')
            amt_in = ui.number('Montant Transféré (XAF)' if lang() == 'fr' else 'Transfer Amount (XAF)', value=1000000).props('outlined dense')
            desc_in = ui.input('Objet du Virement' if lang() == 'fr' else 'Transfer Description', value='Réassort trésorerie et pharmacie').props('outlined dense')

            async def _submit():
                if not tr_num_in.value or not src_in.value or not dst_in.value or not amt_in.value:
                    ui.notify('Veuillez renseigner tous les champs' if lang() == 'fr' else 'Please fill in all fields', type='warning')
                    return
                try:
                    res = await api.post('/interbranch/transfers', {
                        'transfer_number': tr_num_in.value.strip(),
                        'source_branch_id': src_in.value,
                        'dest_branch_id': dst_in.value,
                        'transfer_date': date_in.value.strip(),
                        'amount': float(amt_in.value),
                        'description': desc_in.value.strip(),
                    })
                    ui.notify(
                        f"Virement {res.get('transfer_number')} traité et réconcilié !" if lang() == 'fr' else f"Transfer {res.get('transfer_number')} completed and reconciled!",
                        type='positive'
                    )
                    d.close()
                    await on_done()
                except Exception as err:
                    ui.notify(f"Erreur virement: {err}", type='negative')

            with ui.row().classes('w-full justify-end gap-2 mt-4'):
                ui.button('Annuler' if lang() == 'fr' else 'Cancel', on_click=d.close).props('flat color=grey')
                ui.button('Valider le Virement' if lang() == 'fr' else 'Confirm Transfer', on_click=_submit).props('unelevated color=primary')
        d.open()

    async def _view_dfe_modal(invoice_id: int):
        try:
            inv = await api.get(f'/dfe/invoices/{invoice_id}')
            if not isinstance(inv, dict):
                ui.notify('Facture non trouvée' if lang() == 'fr' else 'Invoice not found', type='negative')
                return
            d = ui.dialog()
            with d, ui.card().classes('w-full max-w-2xl p-8 gap-4 bg-white border border-slate-300 shadow-xl rounded-2xl'):
                # Invoice Header
                with ui.row().classes('w-full items-start justify-between border-b-2 border-slate-900 pb-4'):
                    with ui.column().classes('gap-0.5'):
                        ui.label('TERTIARY SISTERS OF ST. FRANCIS').classes('text-xs font-bold text-slate-500 uppercase')
                        ui.label('HÔPITAL GÉNÉRAL DE SHISONG').classes('text-lg font-black text-slate-900')
                        ui.label('Centre Cardiaque Régional | B.P. 8 Kumbo, Cameroun').classes('text-xs text-slate-500')
                        ui.label('N° Contribuable (NIU): M019200012345T | Registre DGI: DFE-2026-CERT').classes('text-xs font-mono text-slate-600')
                    with ui.column().classes('items-end gap-1'):
                        ui.label('FACTURE NORMALISÉE DFE').classes('text-sm font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-300')
                        ui.label(f"N°: {inv.get('invoice_number')}").classes('text-base font-black font-mono')
                        ui.label(f"Date: {inv.get('invoice_date')}").classes('text-xs text-slate-500')

                # Client & QR Section
                with ui.row().classes('w-full justify-between items-center gap-4 p-4 bg-slate-50 rounded-xl'):
                    with ui.column().classes('gap-1 text-xs'):
                        ui.label('FACTURÉ À / CLIENT:').classes('font-bold text-slate-500 uppercase tracking-wider')
                        ui.label(inv.get('customer_name', '')).classes('text-sm font-bold text-slate-900')
                        ui.label(f"NIU: {inv.get('customer_niu', '—')}").classes('font-mono font-semibold')
                        if inv.get('customer_email'):
                            ui.label(f"Email: {inv.get('customer_email')}")
                        ui.label('Statut Fiscal: CERTIFIÉ CONFORME DGI').classes('text-emerald-700 font-bold mt-1')

                    # 2D QR Code image
                    if inv.get('qr_data_url'):
                        with ui.column().classes('items-center gap-1'):
                            ui.image(inv['qr_data_url']).classes('w-32 h-32 rounded-lg border border-slate-300 shadow-xs')
                            ui.label('Scanner pour Vérification DGI').classes('text-[10px] text-slate-400')

                # Invoice Line Items Breakdown
                with ui.column().classes('w-full gap-2 border border-slate-200 rounded-lg overflow-hidden text-xs'):
                    with ui.row().classes('w-full bg-slate-100 font-bold p-2 justify-between border-b border-slate-200'):
                        ui.label('Désignation des Prestations et Actes')
                        ui.label('Base HT (XAF)')

                    with ui.row().classes('w-full p-2 justify-between border-b border-slate-100'):
                        ui.label('Actes médicaux, explorations cardiologiques et soins spécialisés')
                        ui.label(f"{w.money(inv.get('total_ht', 0))} XAF").classes('font-mono font-semibold')

                    with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-slate-700'):
                        ui.label(f"TVA Collectée ({inv.get('tva_rate', 19.25)}% - Compte 4431)")
                        ui.label(f"{w.money(inv.get('total_tva', 0))} XAF").classes('font-mono')

                    with ui.row().classes('w-full p-2 justify-between border-b border-slate-100 text-slate-700'):
                        ui.label('Droit de Timbre Fiscal Légal CEMAC (Compte 6461 / 4474)')
                        ui.label(f"{w.money(inv.get('fiscal_stamp_duty', 0))} XAF").classes('font-mono')

                    # Total TTC
                    with ui.row().classes('w-full p-3 bg-teal-50 font-black text-sm justify-between text-teal-900'):
                        ui.label('TOTAL GÉNÉRAL TTC À RÉGLER')
                        ui.label(f"{w.money(inv.get('total_ttc', 0))} XAF").classes('font-mono text-base')

                # Security Token & Digital Signature
                with ui.column().classes('w-full gap-1 p-2 bg-slate-100 rounded text-[10px] font-mono text-slate-600'):
                    ui.label('SIGNATURE ÉLECTRONIQUE DE SÉCURITÉ DGI (SHA-256):').classes('font-bold')
                    ui.label(inv.get('dfe_security_token', '—')).classes('break-all')

                with ui.row().classes('w-full justify-end mt-2'):
                    ui.button('Imprimer / Fermer', on_click=d.close).props('unelevated color=primary size=sm')

            d.open()
        except Exception as err:
            ui.notify(f"Erreur chargement facture DFE: {err}", type='negative')

    await render_content()
