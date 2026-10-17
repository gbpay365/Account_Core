"""
CEMAC Withholding Tax Engine (WHT, Précompte sur Achats & TSR) & Official Tax Certificates.
Compliant with CEMAC Directives and Cameroon General Tax Code (CGI).
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'kpi_gross': {'fr': 'Total Brut Facturé (HT)', 'en': 'Total Gross Invoiced (excl. Tax)'},
    'kpi_gross_sub': {'fr': '{n} attestation(s) émise(s)', 'en': '{n} certificate(s) issued'},
    'kpi_tva_sub': {'fr': 'Compte 4472 (100% retenu à la source)', 'en': 'Account 4472 (100% withheld at source)'},
    'kpi_precompte_sub': {'fr': 'Compte 4471 (Acompte IS 2.2% / 5.5%)', 'en': 'Account 4471 (CIT advance 2.2% / 5.5%)'},
    'kpi_net_sub': {'fr': 'Net Fournisseurs : {net}', 'en': 'Net to Suppliers: {net}'},
    'table_title': {'fr': 'Registre des Attestations de Retenue à la Source (CEMAC)', 'en': 'Withholding Tax Certificates Register (CEMAC)'},
    'no_certs': {'fr': 'Aucune attestation de retenue émise pour le moment.', 'en': 'No withholding certificates issued yet.'},
    'col_date': {'fr': 'Date', 'en': 'Date'},
    'col_period': {'fr': 'Période', 'en': 'Tax Period'},
    'col_niu': {'fr': 'NIF / NIU', 'en': 'Tax ID (NIF/NIU)'},
    'col_actions': {'fr': 'Action', 'en': 'Action'},
    'tip_print_cert': {'fr': 'Imprimer l’attestation officielle', 'en': 'Print official certificate'},
    'status_declared': {'fr': 'Déclaré DGI', 'en': 'Declared DGI'},
    'status_issued': {'fr': 'Émis', 'en': 'Issued'},
    'no_suppliers': {'fr': 'Aucun fournisseur trouvé.', 'en': 'No suppliers found.'},
    'btn_close': {'fr': 'Fermer', 'en': 'Close'},
    'lbl_cert_date': {'fr': 'Date attestation', 'en': 'Certificate Date'},
    'lbl_tax_period': {'fr': 'Période fiscale (AAAA-MM)', 'en': 'Tax Period (YYYY-MM)'},
    'chk_tva': {'fr': 'TVA 19.25% avec retenue 100% à la source', 'en': '19.25% VAT with 100% withholding at source'},
    'lbl_rate_precompte': {'fr': 'Taux Précompte', 'en': 'Purchase WHT Rate'},
    'opt_reel': {'fr': 'Réel (2.2%)', 'en': 'Actual / Normal (2.2%)'},
    'opt_simplifie': {'fr': 'Simplifié (5.5%)', 'en': 'Simplified (5.5%)'},
    'opt_exemp': {'fr': 'Exonéré (0%)', 'en': 'Exempt (0%)'},
    'lbl_tsr': {'fr': 'TSR', 'en': 'TSR (Non-resident)'},
    'opt_no_tsr': {'fr': 'Sans TSR (0%)', 'en': 'No TSR (0%)'},
    'opt_tsr': {'fr': 'TSR Prestataire étranger (15%)', 'en': 'Foreign Provider TSR (15%)'},
    'calc_header': {'fr': 'DÉCOMPTE FISCAL CEMAC PRÉVISIONNEL :', 'en': 'ESTIMATED CEMAC TAX BREAKDOWN:'},
    'calc_gross': {'fr': 'Montant Brut Hors Taxes (HT) :', 'en': 'Gross Amount Excl. Tax (HT):'},
    'calc_tva': {'fr': '(+) TVA 19.25% facturée (Retenue à 100%) :', 'en': '(+) 19.25% Invoiced VAT (100% Withheld):'},
    'calc_precompte': {'fr': '(-) Précompte sur achats ({rate}%) :', 'en': '(-) Purchase WHT ({rate}%):'},
    'calc_tsr': {'fr': '(-) TSR Prestataire étranger ({rate}%) :', 'en': '(-) Foreign Provider TSR ({rate}%):'},
    'calc_tot_wht': {'fr': 'TOTAL RETENU À LA SOURCE (À reverser au Trésor) :', 'en': 'TOTAL TAX WITHHELD (Payable to Treasury):'},
    'calc_net': {'fr': 'NET À VERSER AU FOURNISSEUR :', 'en': 'NET PAYABLE TO SUPPLIER:'},
    'btn_issue': {'fr': 'Délivrer l’attestation', 'en': 'Issue Certificate'},
    'cert_rep': {'fr': 'RÉPUBLIQUE DU CAMEROUN', 'en': 'REPUBLIC OF CAMEROON'},
    'cert_motto': {'fr': 'Paix – Travail – Patrie', 'en': 'Peace – Work – Fatherland'},
    'cert_minfi': {'fr': 'MINISTÈRE DES FINANCES', 'en': 'MINISTRY OF FINANCE'},
    'cert_dgi': {'fr': 'DIRECTION GÉNÉRALE DES IMPÔTS', 'en': 'DIRECTORATE GENERAL OF TAXATION'},
    'cert_issue_date': {'fr': 'Date de délivrance : {d}', 'en': 'Issue Date: {d}'},
    'cert_period': {'fr': 'Période fiscale : {p}', 'en': 'Tax Period: {p}'},
    'cert_main_title': {'fr': 'ATTESTATION DE RETENUE À LA SOURCE', 'en': 'WITHHOLDING TAX CERTIFICATE'},
    'cert_main_sub': {'fr': 'TVA à 100% – Acompte d’Impôt sur le Revenu (Précompte sur Achats) – TSR', 'en': '100% VAT – Advance Income Tax (Purchase WHT) – TSR'},
    'cert_main_legal': {'fr': 'Délivrée en application des articles 149 et suivants du Code Général des Impôts (CGI) et des Directives CEMAC', 'en': 'Issued pursuant to Articles 149 et seq. of the General Tax Code and CEMAC Directives'},
    'cert_payer': {'fr': 'ORGANISME PAYEUR (ÉTABLISSEMENT)', 'en': 'PAYER ORGANIZATION (HOSPITAL / ENTITY)'},
    'cert_supplier': {'fr': 'BÉNÉFICIAIRE / FOURNISSEUR', 'en': 'BENEFICIARY / SUPPLIER'},
    'cert_breakdown_title': {'fr': 'DÉTAIL DES RETENUES FISCALES OPÉRÉES', 'en': 'DETAIL OF STATUTORY TAX WITHHOLDINGS'},
    'cert_col_wht': {'fr': 'Désignation de la retenue légale', 'en': 'Statutory Tax Designation'},
    'cert_col_rate': {'fr': 'Taux', 'en': 'Rate'},
    'cert_col_base': {'fr': 'Assiette (HT)', 'en': 'Tax Base (excl. Tax)'},
    'cert_col_amt': {'fr': 'Montant Retenu (XAF)', 'en': 'Withheld Amount (XAF)'},
    'cert_line_tva': {'fr': 'Taxe sur la Valeur Ajoutée (Retenue 100% à la source - Art. 149 CGI)', 'en': 'Value Added Tax (100% Withheld at Source - Art. 149 Tax Code)'},
    'cert_line_precompte': {'fr': 'Précompte sur Achats / Acompte IS', 'en': 'Purchase WHT / CIT Advance'},
    'cert_line_tsr': {'fr': 'Taxe Spéciale sur les Revenus - TSR (Prestataires étrangers)', 'en': 'Special Income Tax - TSR (Foreign service providers)'},
    'cert_tot_wht': {'fr': 'TOTAL DES RETENUES FISCALES OPÉRÉES', 'en': 'TOTAL STATUTORY TAXES WITHHELD'},
    'cert_net_paid': {'fr': 'NET EFFECTIVEMENT PAYÉ AU FOURNISSEUR', 'en': 'NET ACTUALLY PAID TO BENEFICIARY'},
    'cert_valoir': {'fr': 'La présente attestation est délivrée pour servir et valoir ce que de droit auprès de l\'Administration Fiscale.', 'en': 'This certificate is issued to serve as official evidence before the Tax Administration.'},
    'cert_sig_supp': {'fr': 'Le Fournisseur / Prestataire', 'en': 'Supplier / Service Provider'},
    'cert_sig_supp_sub': {'fr': '(Nom, date et signature pour accusé de réception)', 'en': '(Name, date, and receipt signature)'},
    'cert_sig_payer': {'fr': 'Pour l’Organisme Payeur — Le Chef Comptable / DAF', 'en': 'For the Paying Entity — CFO / Chief Accountant'},
    'cert_sig_payer_sub': {'fr': '(Cachet officiel, date et signature autorisée)', 'en': '(Official seal, date, and authorized signature)'},
    'cert_btn_print': {'fr': 'Imprimer l’Attestation', 'en': 'Print Certificate'},
    'btn_view_cert': {'fr': 'Visualiser l’attestation', 'en': 'View certificate'},
    'btn_print_cert': {'fr': 'Imprimer l’attestation', 'en': 'Print certificate'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        text = entry.get(cur, entry.get('en', ''))
    else:
        text = t(key)
    return text.format(**kwargs) if kwargs else text


@page('/withholding-tax', title='Withholding taxes (CEMAC)', permissions=('journal.view',))
async def withholding_tax_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    # Fetch initial certificates and suppliers
    certs_res = await api.safe(api.get('/withholding/certificates'), notify=False) or {'rows': []}
    certificates = certs_res.get('rows', [])

    suppliers_res = await api.safe(api.get('/withholding/suppliers'), notify=False) or {'rows': []}
    suppliers = suppliers_res.get('rows', [])

    content = ui.column().classes('w-full gap-4')

    def actions() -> None:
        ui.button(
            t('withholding.new_cert'),
            icon='post_add',
            on_click=lambda: _issue_modal(suppliers, currency, reload_all)
        ).props('unelevated size=sm')

    w.page_header(
        t('withholding.title'),
        t('withholding.subtitle'),
        actions=actions,
        emoji=chrome.PAGE.get('withholding.title', '🧾')
    )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        data = await api.safe(api.get('/withholding/certificates'), notify=False) or {'rows': []}
        rows = data.get('rows', [])

        # 1. Top Metrics Strip
        tot_gross = sum(float(r.get('gross_amount') or 0) for r in rows)
        tot_tva_withheld = sum(float(r.get('tva_withheld_amount') or 0) for r in rows)
        tot_precompte = sum(float(r.get('precompte_amount') or 0) for r in rows)
        tot_withheld = sum(float(r.get('total_withheld_amount') or 0) for r in rows)
        tot_net = sum(float(r.get('net_payable_amount') or 0) for r in rows)

        with ui.grid(columns=4).classes('w-full gap-4'):
            with ui.card().classes('p-4 border-l-4 border-indigo-500 shadow-sm'):
                ui.label(_loc('kpi_gross')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_gross, currency)} {currency}").classes('text-xl font-bold text-slate-800')
                ui.label(_loc('kpi_gross_sub', n=len(rows))).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-amber-500 shadow-sm'):
                ui.label(t('withholding.tva_withheld')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_tva_withheld, currency)} {currency}").classes('text-xl font-bold text-amber-700')
                ui.label(_loc('kpi_tva_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-teal-500 shadow-sm'):
                ui.label(t('withholding.precompte')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_precompte, currency)} {currency}").classes('text-xl font-bold text-teal-700')
                ui.label(_loc('kpi_precompte_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-emerald-500 shadow-sm'):
                ui.label(t('withholding.total_withheld')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_withheld, currency)} {currency}").classes('text-xl font-bold text-emerald-700')
                ui.label(_loc('kpi_net_sub', net=f"{w.money(tot_net, currency)} {currency}")).classes('text-xs text-slate-500 font-medium')

        # 2. Main Registry Table
        with ui.card().classes('w-full p-4 border border-slate-200 shadow-sm'):
            with ui.row().classes('w-full justify-between items-center mb-3'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('receipt_long', color='primary')
                    ui.label(_loc('table_title')).classes('text-base font-bold text-slate-800')
                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

            if not rows:
                ui.label(_loc('no_certs')).classes('text-slate-400 italic p-6')
            else:
                formatted_rows = [
                    {
                        **r,
                        'gross_formatted': w.money(r.get('gross_amount'), currency),
                        'tva_withheld_formatted': w.money(r.get('tva_withheld_amount'), currency),
                        'precompte_formatted': w.money(r.get('precompte_amount'), currency),
                        'total_withheld_formatted': w.money(r.get('total_withheld_amount'), currency),
                        'net_payable_formatted': w.money(r.get('net_payable_amount'), currency),
                    }
                    for r in rows
                ]

                columns = [
                    {'name': 'cert_no', 'label': t('withholding.cert_no'), 'field': 'certificate_no', 'align': 'left', 'sortable': True},
                    {'name': 'date', 'label': _loc('col_date'), 'field': 'certificate_date', 'align': 'left', 'sortable': True},
                    {'name': 'period', 'label': _loc('col_period'), 'field': 'tax_period', 'align': 'center'},
                    {'name': 'supplier', 'label': t('withholding.supplier'), 'field': 'supplier_name', 'align': 'left'},
                    {'name': 'niu', 'label': _loc('col_niu'), 'field': 'supplier_niu', 'align': 'center'},
                    {'name': 'invoice_ref', 'label': t('withholding.invoice_ref'), 'field': 'invoice_ref', 'align': 'left'},
                    {'name': 'gross', 'label': t('withholding.gross'), 'field': 'gross_formatted', 'align': 'right'},
                    {'name': 'tva_withheld', 'label': t('withholding.tva_withheld'), 'field': 'tva_withheld_formatted', 'align': 'right'},
                    {'name': 'precompte', 'label': t('withholding.precompte'), 'field': 'precompte_formatted', 'align': 'right'},
                    {'name': 'total_withheld', 'label': t('withholding.total_withheld'), 'field': 'total_withheld_formatted', 'align': 'right'},
                    {'name': 'net_payable', 'label': t('withholding.net_payable'), 'field': 'net_payable_formatted', 'align': 'right'},
                    {'name': 'status', 'label': t('withholding.status'), 'field': 'status', 'align': 'center'},
                    {'name': 'actions', 'label': _loc('col_actions'), 'field': 'id', 'align': 'center'},
                ]

                table = ui.table(columns=columns, rows=formatted_rows, row_key='id').props('flat dense bordered').classes('w-full')

                table.add_slot('body-cell-cert_no', '''
                    <q-td :props="props">
                        <span class="font-mono font-bold text-primary cursor-pointer hover:underline" @click="$parent.$emit('view_cert', props.row.id)" title="Click to view">
                            {{ props.value }}
                        </span>
                    </q-td>
                ''')

                table.add_slot('body-cell-status', '''
                    <q-td :props="props">
                        <q-chip dense size="xs" :color="props.value === 'declared' ? 'teal-1' : 'primary-1'" :text-color="props.value === 'declared' ? 'teal-9' : 'primary-9'">
                            {{ props.value === 'declared' ? 'Declared DGI' : 'Issued' }}
                        </q-chip>
                    </q-td>
                ''')

                table.add_slot('body-cell-actions', '''
                    <q-td :props="props" class="q-gutter-xs">
                        <q-btn flat round dense icon="visibility" color="teal" size="sm" @click="$parent.$emit('view_cert', props.value)">
                            <q-tooltip>''' + _loc('btn_view_cert') + '''</q-tooltip>
                        </q-btn>
                        <q-btn flat round dense icon="print" color="primary" size="sm" @click="$parent.$emit('print_cert', props.value)">
                            <q-tooltip>''' + _loc('btn_print_cert') + '''</q-tooltip>
                        </q-btn>
                    </q-td>
                ''')

                async def on_view_cert(e):
                    cert_id = e.args
                    cert_details = await api.safe(api.get(f'/withholding/certificates/{cert_id}'))
                    if cert_details:
                        _view_certificate_modal(cert_details, currency, auto_print=False)

                async def on_print_cert(e):
                    cert_id = e.args
                    cert_details = await api.safe(api.get(f'/withholding/certificates/{cert_id}'))
                    if cert_details:
                        _view_certificate_modal(cert_details, currency, auto_print=True)

                table.on('view_cert', on_view_cert)
                table.on('print_cert', on_print_cert)

    await render_view()


def _issue_modal(suppliers: list, currency: str, on_success: callable) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[680px] p-6 gap-4'):
        w.modal_header(t('withholding.new_cert'), emoji='📝')

        supplier_opts = {s['id']: f"{s['name']} ({s.get('tax_id', 'Sans NIF' if lang() == 'fr' else 'No Tax ID')}) - Régime: {s.get('tax_regime', 'reel').upper()}" for s in suppliers}
        if not supplier_opts:
            ui.label(_loc('no_suppliers')).classes('text-slate-500 italic')
            ui.button(_loc('btn_close'), on_click=dlg.close).props('flat')
            dlg.open()
            return

        def_sup_id = suppliers[0]['id']
        sup_select = ui.select(supplier_opts, value=def_sup_id, label=t('withholding.supplier')).props('outlined dense options-dense').classes('w-full')

        with ui.grid(columns=2).classes('w-full gap-3'):
            d_input = ui.input(label=_loc('lbl_cert_date'), value='2026-10-16').props('outlined dense')
            p_input = ui.input(label=_loc('lbl_tax_period'), value='2026-10').props('outlined dense')

        inv_ref = ui.input(label=t('withholding.invoice_ref'), value='FAC-2026-').props('outlined dense').classes('w-full')
        gross_amt = ui.number(label=t('withholding.gross'), value=10000000, format='%.0f').props('outlined dense').classes('w-full')

        with ui.row().classes('w-full items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200'):
            tva_check = ui.checkbox(_loc('chk_tva'), value=True)
            precompte_sel = ui.select(
                {2.2: _loc('opt_reel'), 5.5: _loc('opt_simplifie'), 0.0: _loc('opt_exemp')},
                value=2.2,
                label=_loc('lbl_rate_precompte')
            ).props('outlined dense').classes('w-44')
            tsr_sel = ui.select(
                {0.0: _loc('opt_no_tsr'), 15.0: _loc('opt_tsr')},
                value=0.0,
                label=_loc('lbl_tsr')
            ).props('outlined dense').classes('w-44')

        # Real-time preview card
        preview_box = ui.column().classes('w-full p-4 bg-slate-100 rounded-lg text-xs gap-1 border border-slate-200 font-mono')

        def update_preview():
            gross = float(gross_amt.value or 0)
            has_tva = tva_check.value
            tva_val = round(gross * 0.1925, 2) if has_tva else 0
            prec_rate = float(precompte_sel.value or 0)
            prec_val = round(gross * (prec_rate / 100), 2)
            tsr_rate = float(tsr_sel.value or 0)
            tsr_val = round(gross * (tsr_rate / 100), 2)
            tot_wht = tva_val + prec_val + tsr_val
            net = round(gross - prec_val - tsr_val, 2)

            preview_box.clear()
            with preview_box:
                ui.label(_loc('calc_header')).classes('font-bold text-slate-800 font-sans mb-1')
                with ui.row().classes('w-full justify-between'):
                    ui.label(_loc('calc_gross'))
                    ui.label(f"{gross:,.0f} {currency}").classes('font-bold')
                if has_tva:
                    with ui.row().classes('w-full justify-between text-amber-800'):
                        ui.label(_loc('calc_tva'))
                        ui.label(f"{tva_val:,.0f} {currency}")
                with ui.row().classes('w-full justify-between text-teal-800'):
                    ui.label(_loc('calc_precompte', rate=prec_rate))
                    ui.label(f"- {prec_val:,.0f} {currency}")
                if tsr_val > 0:
                    with ui.row().classes('w-full justify-between text-purple-800'):
                        ui.label(_loc('calc_tsr', rate=tsr_rate))
                        ui.label(f"- {tsr_val:,.0f} {currency}")
                with ui.row().classes('w-full justify-between font-bold text-slate-900 border-t border-slate-300 pt-1 mt-1'):
                    ui.label(_loc('calc_tot_wht'))
                    ui.label(f"{tot_wht:,.0f} {currency}").classes('text-rose-700')
                with ui.row().classes('w-full justify-between font-bold text-sm text-slate-900'):
                    ui.label(_loc('calc_net'))
                    ui.label(f"{net:,.0f} {currency}").classes('text-emerald-700')

        gross_amt.on_value_change(lambda _: update_preview())
        tva_check.on_value_change(lambda _: update_preview())
        precompte_sel.on_value_change(lambda _: update_preview())
        tsr_sel.on_value_change(lambda _: update_preview())
        update_preview()

        post_je_check = ui.checkbox(t('withholding.post_je'), value=False).tooltip(t('withholding.post_je_tip'))

        with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-100'):
            ui.button(t('common.cancel'), on_click=dlg.close).props('flat')

            async def do_issue():
                payload = {
                    'supplier_id': sup_select.value,
                    'certificate_date': d_input.value,
                    'tax_period': p_input.value,
                    'invoice_ref': inv_ref.value,
                    'gross_amount': gross_amt.value,
                    'has_tva': tva_check.value,
                    'tva_rate': 19.25,
                    'precompte_rate': precompte_sel.value,
                    'tsr_rate': tsr_sel.value,
                    'post_journal_entry': post_je_check.value,
                    'expense_account_code': '6011',
                }
                res = await api.safe(api.post('/withholding/certificates', payload))
                if res:
                    ui.notify(t('withholding.issued_success', cert=res.get('certificate_no')), type='positive')
                    dlg.close()
                    await on_success()

            ui.button(_loc('btn_issue'), icon='check_circle', on_click=do_issue).props('unelevated color=primary')

    dlg.open()


def _view_certificate_modal(cert: dict, currency: str, auto_print: bool = False) -> None:
    with ui.dialog() as dlg, ui.card().classes('w-[820px] max-w-4xl p-8 bg-white border border-slate-300 shadow-xl rounded-xl print:shadow-none print:border-none print:w-full'):
        # Official CEMAC Certificate Template
        with ui.column().classes('w-full gap-4'):
            # Header
            with ui.row().classes('w-full justify-between items-start border-b-2 border-slate-900 pb-4'):
                with ui.column().classes('gap-0.5 text-center flex-1'):
                    ui.label(_loc('cert_rep')).classes('font-black text-sm uppercase tracking-wide')
                    ui.label(_loc('cert_motto')).classes('text-xs italic text-slate-500')
                    ui.label(_loc('cert_minfi')).classes('font-bold text-xs uppercase mt-1')
                    ui.label(_loc('cert_dgi')).classes('text-xs uppercase text-slate-600')

                with ui.column().classes('items-end gap-0.5'):
                    ui.chip(f"N° {cert.get('certificate_no', '')}", color='slate-9', text_color='white').props('square font-mono text-sm font-bold')
                    ui.label(_loc('cert_issue_date', d=cert.get('certificate_date', ''))).classes('text-xs font-semibold text-slate-700 mt-1')
                    ui.label(_loc('cert_period', p=cert.get('tax_period', ''))).classes('text-xs text-slate-500 font-mono')

            # Official Title
            with ui.column().classes('w-full text-center my-2'):
                ui.label(_loc('cert_main_title')).classes('text-xl font-black tracking-tight text-slate-900 underline')
                ui.label(_loc('cert_main_sub')).classes('text-xs font-bold text-slate-700 uppercase')
                ui.label(_loc('cert_main_legal')).classes('text-xs text-slate-500 italic')

            # Organization (Payer) & Beneficiary (Supplier) Cards
            with ui.grid(columns=2).classes('w-full gap-4 my-2'):
                with ui.card().classes('p-3 border border-slate-300 bg-slate-50 rounded-lg text-xs gap-1'):
                    ui.label(_loc('cert_payer')).classes('font-bold text-slate-800 uppercase border-b border-slate-200 pb-1')
                    ui.label(f"Raison / Name: {cert.get('org_name', '')}").classes('font-bold')
                    ui.label(f"NIF / NIU : {cert.get('org_niu', 'M01980000001Z')}").classes('font-mono')
                    ui.label(f"RCCM : {cert.get('org_rccm', 'RC/DLA/2018/B/450')}").classes('font-mono')
                    ui.label(f"Address : {cert.get('org_address', 'Douala, Cameroun')}")

                with ui.card().classes('p-3 border border-slate-300 bg-slate-50 rounded-lg text-xs gap-1'):
                    ui.label(_loc('cert_supplier')).classes('font-bold text-slate-800 uppercase border-b border-slate-200 pb-1')
                    ui.label(f"Nom / Raison : {cert.get('supplier_name', '')}").classes('font-bold')
                    ui.label(f"NIF / NIU : {cert.get('supplier_niu', 'Non renseigné' if lang() == 'fr' else 'Not provided')}").classes('font-mono')
                    ui.label(f"Régime Fiscal : {str(cert.get('supplier_regime', 'reel')).upper()}").classes('font-semibold')
                    ui.label(f"Facture N° : {cert.get('invoice_ref', '')}").classes('font-mono font-bold text-primary')

            # Statutory Tax Breakdown Table
            ui.label(_loc('cert_breakdown_title')).classes('text-xs font-bold uppercase text-slate-700 mt-2')

            with ui.column().classes('w-full border border-slate-300 rounded-lg overflow-hidden'):
                with ui.row().classes('w-full bg-slate-800 text-white p-2 text-xs font-bold justify-between'):
                    ui.label(_loc('cert_col_wht')).classes('flex-1')
                    ui.label(_loc('cert_col_rate')).classes('w-24 text-center')
                    ui.label(_loc('cert_col_base')).classes('w-36 text-right')
                    ui.label(_loc('cert_col_amt')).classes('w-40 text-right')

                # Line 1: TVA Withholding
                with ui.row().classes('w-full p-2 text-xs justify-between items-center border-b border-slate-200'):
                    ui.label(_loc('cert_line_tva')).classes('flex-1 font-medium')
                    ui.label(f"{cert.get('tva_rate', 19.25)}%").classes('w-24 text-center font-mono')
                    ui.label(f"{w.money(cert.get('gross_amount'), currency)}").classes('w-36 text-right font-mono')
                    ui.label(f"{w.money(cert.get('tva_withheld_amount'), currency)}").classes('w-40 text-right font-mono font-bold text-amber-800')

                # Line 2: Précompte sur achats
                with ui.row().classes('w-full p-2 text-xs justify-between items-center border-b border-slate-200 bg-slate-50'):
                    regime_label = str(cert.get('supplier_regime', 'reel')).capitalize()
                    ui.label(f"{_loc('cert_line_precompte')} ({regime_label})").classes('flex-1 font-medium')
                    ui.label(f"{cert.get('precompte_rate', 2.2)}%").classes('w-24 text-center font-mono')
                    ui.label(f"{w.money(cert.get('gross_amount'), currency)}").classes('w-36 text-right font-mono')
                    ui.label(f"{w.money(cert.get('precompte_amount'), currency)}").classes('w-40 text-right font-mono font-bold text-teal-800')

                # Line 3: TSR if any
                if float(cert.get('tsr_amount') or 0) > 0:
                    with ui.row().classes('w-full p-2 text-xs justify-between items-center border-b border-slate-200'):
                        ui.label(_loc('cert_line_tsr')).classes('flex-1 font-medium')
                        ui.label(f"{cert.get('tsr_rate', 15.0)}%").classes('w-24 text-center font-mono')
                        ui.label(f"{w.money(cert.get('gross_amount'), currency)}").classes('w-36 text-right font-mono')
                        ui.label(f"{w.money(cert.get('tsr_amount'), currency)}").classes('w-40 text-right font-mono font-bold text-purple-800')

                # Line Total Withheld
                with ui.row().classes('w-full p-2 text-sm justify-between items-center bg-slate-200 font-bold'):
                    ui.label(_loc('cert_tot_wht')).classes('flex-1 uppercase text-slate-900')
                    ui.label('').classes('w-24')
                    ui.label('').classes('w-36')
                    ui.label(f"{w.money(cert.get('total_withheld_amount'), currency)} {currency}").classes('w-40 text-right font-mono text-rose-800')

                # Line Net Paid
                with ui.row().classes('w-full p-2.5 text-base justify-between items-center bg-emerald-50 border-t-2 border-emerald-600 font-black'):
                    ui.label(_loc('cert_net_paid')).classes('flex-1 uppercase text-emerald-900')
                    ui.label('').classes('w-24')
                    ui.label('').classes('w-36')
                    ui.label(f"{w.money(cert.get('net_payable_amount'), currency)} {currency}").classes('w-40 text-right font-mono text-emerald-800')

            # Amount in words notice
            ui.label(_loc('cert_valoir')).classes('text-xs italic text-slate-500 mt-2')

            # Signatures & Stamps
            with ui.grid(columns=2).classes('w-full gap-12 mt-6 pt-4 border-t border-slate-300 text-center text-xs'):
                with ui.column().classes('items-center gap-12'):
                    ui.label(_loc('cert_sig_supp')).classes('font-bold text-slate-700 uppercase')
                    ui.label(_loc('cert_sig_supp_sub')).classes('text-slate-400 italic')

                with ui.column().classes('items-center gap-12'):
                    ui.label(_loc('cert_sig_payer')).classes('font-bold text-slate-700 uppercase')
                    ui.label(_loc('cert_sig_payer_sub')).classes('text-slate-400 italic')

            # Modal footer actions
            with ui.row().classes('w-full justify-end gap-2 pt-4 border-t border-slate-200 print:hidden lc-no-print'):
                ui.button(_loc('btn_close'), on_click=dlg.close).props('flat')
                ui.button(_loc('cert_btn_print'), icon='print', on_click=lambda: ui.run_javascript('window.print()')).props('unelevated color=primary')

    dlg.open()
    if auto_print:
        ui.run_javascript('setTimeout(() => window.print(), 400)')
