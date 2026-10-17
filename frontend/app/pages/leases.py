"""
IFRS 16 Lease Management & Right-of-Use (ROU) Asset Register.
Compliant with IFRS 16 Leases: Lessee Accounting, Present Value calculation of
lease payments, Right-of-Use Asset Capitalization, and Dual Amortization Schedules
(Depreciation + Interest Expense on Lease Liability).
"""

from __future__ import annotations

import math
from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {'en': 'IFRS 16 Lease Management', 'fr': 'Gestion des contrats de location (IFRS 16)'},
    'sub': {
        'en': 'Lessee Right-of-Use (ROU) assets, lease liabilities and interest amortization schedules under IFRS 16.',
        'fr': 'Droits d’utilisation (ROU), passifs locatifs et tableaux d’amortissement financier selon IFRS 16.',
    },
    'new_lease': {'en': 'New Lease Contract', 'fr': 'Nouveau contrat de location'},
    'kpi_rou': {'en': 'Total Carrying ROU Assets', 'fr': 'Total Actifs Droits d’usage'},
    'kpi_liab': {'en': 'Total Carrying Lease Liabilities', 'fr': 'Total Dettes de location'},
    'kpi_monthly': {'en': 'Monthly Lease Commitments', 'fr': 'Engagements locatifs mensuels'},
    'kpi_active': {'en': 'Active Leases', 'fr': 'Contrats actifs'},
    'contract_ref': {'en': 'Contract Ref', 'fr': 'Réf. contrat'},
    'asset_name': {'en': 'Leased Asset / Equipment', 'fr': 'Bien / Équipement loué'},
    'lessor': {'en': 'Lessor / Partner', 'fr': 'Bailleur / Prestataire'},
    'start_date': {'en': 'Commencement', 'fr': 'Date de prise d’effet'},
    'term': {'en': 'Term', 'fr': 'Durée'},
    'term_unit': {'en': '{n} months', 'fr': '{n} mois'},
    'rate': {'en': 'Discount Rate', 'fr': 'Taux d’actualisation'},
    'payment': {'en': 'Monthly Payment', 'fr': 'Loyer mensuel'},
    'liability': {'en': 'Lease Liability', 'fr': 'Dette de location'},
    'rou_asset': {'en': 'ROU Asset Net', 'fr': 'Actif ROU net'},
    'status': {'en': 'Status', 'fr': 'Statut'},
    'schedule_btn': {'en': 'Amortization Schedule', 'fr': 'Tableau d’amortissement'},
    'modal_new_title': {'en': 'Register New IFRS 16 Lease Contract', 'fr': 'Enregistrer un contrat de location IFRS 16'},
    'modal_pv_preview': {'en': 'Initial Measurement (Present Value):', 'fr': 'Évaluation initiale (Valeur actualisée) :'},
    'save_btn': {'en': 'Create Lease Contract', 'fr': 'Créer le contrat'},
    'cancel_btn': {'en': 'Cancel', 'fr': 'Annuler'},
    'close_btn': {'en': 'Close', 'fr': 'Fermer'},
    'sched_title': {'en': 'IFRS 16 Amortization & Depreciation Schedule', 'fr': 'Tableau d’amortissement IFRS 16 (Dette & Amortissement)'},
    'col_period': {'en': 'Period', 'fr': 'Période'},
    'col_date': {'en': 'Date', 'fr': 'Date'},
    'col_open_liab': {'en': 'Opening Liability', 'fr': 'Dette début'},
    'col_pmt': {'en': 'Payment', 'fr': 'Règlement'},
    'col_int': {'en': 'Interest Expense (P&L)', 'fr': 'Charge d’intérêt (P&L)'},
    'col_prin': {'en': 'Principal Repayment', 'fr': 'Amortissement dette'},
    'col_close_liab': {'en': 'Closing Liability', 'fr': 'Dette fin'},
    'col_open_rou': {'en': 'Opening ROU', 'fr': 'ROU début'},
    'col_depr': {'en': 'Depreciation (P&L)', 'fr': 'Dotation ROU (P&L)'},
    'col_close_rou': {'en': 'Closing ROU', 'fr': 'ROU fin'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    val = _T.get(key, {})
    text = val.get(cur, val.get('en', key))
    return text.format(**kwargs) if kwargs else text


@page('/leases', title='IFRS 16 Leases', permissions=('asset.view',))
async def leases_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')
    state = {'search': '', 'status': None}

    def actions() -> None:
        if api.can('asset.manage'):
            ui.button(_loc('new_lease'), icon='add', on_click=lambda: _new_lease_dialog(reload, currency)) \
                .props('unelevated size=sm')

    w.page_header(_loc('title'), _loc('sub'), actions=actions, emoji='🏢')

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/leases'))
        if not data:
            return
        rows = data.get('rows') or []
        summary = data.get('summary') or {}

        if state['status']:
            rows = [r for r in rows if r.get('status') == state['status']]
        needle = (state['search'] or '').strip().lower()
        if needle:
            rows = [r for r in rows if needle in ' '.join([
                str(r.get('contract_ref') or ''),
                str(r.get('asset_name') or ''),
                str(r.get('lessor_name') or ''),
            ]).lower()]

        with container:
            with w.kpi_row():
                w.kpi(_loc('kpi_rou'), w.money(summary.get('total_carrying_rou_asset'), currency),
                      hint='IAS 16 / IFRS 16 Carrying Amount', icon='account_balance', tone='sky')
                w.kpi(_loc('kpi_liab'), w.money(summary.get('total_carrying_liability'), currency),
                      hint='Present value of future lease payments', icon='receipt_long', tone='rose')
                w.kpi(_loc('kpi_monthly'), w.money(summary.get('total_monthly_commitments'), currency),
                      hint='Monthly cash outflow', icon='payments', tone='violet')
                w.kpi(_loc('kpi_active'), w.number(summary.get('active_leases', 0)),
                      hint=f"Total: {w.number(summary.get('total_leases', 0))}", icon='assignment', tone='teal')

            body = w.section(_loc('title'), f"{w.number(len(rows))} {t('common.items').lower()}")
            with body:
                if not rows:
                    w.empty_state(t('common.no_records'), icon='assignment_late')
                    return

                for r in rows:
                    r['term_str'] = _loc('term_unit', n=r.get('term_months', 0))
                    r['rate_str'] = f"{float(r.get('discount_rate_pct') or 0):.2f}%"
                    r['pmt_str'] = w.money(r.get('monthly_payment'), currency)
                    r['liab_str'] = w.money(r.get('carrying_liability'), currency)
                    r['rou_str'] = w.money(r.get('carrying_rou_asset'), currency)

                columns = [
                    w.column('contract_ref', _loc('contract_ref'), classes='lc-num font-bold text-teal-800'),
                    w.column('asset_name', _loc('asset_name'), classes='font-medium'),
                    w.column('lessor_name', _loc('lessor')),
                    w.column('start_date', _loc('start_date')),
                    w.column('term_str', _loc('term')),
                    w.column('rate_str', _loc('rate')),
                    w.column('pmt_str', _loc('payment'), classes='lc-num font-semibold'),
                    w.column('liab_str', _loc('liability'), classes='lc-num font-semibold text-rose-700'),
                    w.column('rou_str', _loc('rou_asset'), classes='lc-num font-semibold text-sky-700'),
                    w.column('status', _loc('status')),
                ]
                w.table(columns, rows, on_row_click=lambda row: _schedule_dialog(row['id'], currency))

    with ui.element('div').classes('lc-card p-4 w-full mb-1 lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder='IFRS16-2025...') \
                .props('outlined dense clearable debounce=300').classes('w-72')
            search.bind_value(state, 'search')
            status_select = ui.select({None: t('common.all'), 'active': 'Active', 'terminated': 'Terminated'},
                                      value=None, label=_loc('status')) \
                .props('outlined dense options-dense').classes('w-44')
            status_select.bind_value(state, 'status')
            for el in (search, status_select):
                el.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


async def _schedule_dialog(lease_id: int, currency: str) -> None:
    data = await api.safe(api.get(f'/leases/{lease_id}'))
    if not data:
        return
    lease = data.get('lease') or {}
    schedule = data.get('schedule') or []

    dialog = ui.dialog().classes('w-full')
    with dialog, ui.card().classes('w-full max-w-5xl p-6 gap-4'):
        with ui.row().classes('w-full items-center justify-between pb-2 border-b'):
            with ui.column().classes('gap-0'):
                ui.label(f"IFRS 16 Schedule — {lease.get('contract_ref')}").classes('text-lg font-bold text-slate-800')
                ui.label(f"{lease.get('asset_name')} · {lease.get('lessor_name')}").classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense')

        with ui.row().classes('w-full gap-3 flex-wrap'):
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[140px]'):
                ui.label('Initial Liability (PV)').classes('text-[10px] font-bold uppercase text-slate-500')
                ui.label(w.money(lease.get('initial_liability'), currency)).classes('font-bold text-slate-800')
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[140px]'):
                ui.label('Initial ROU Asset').classes('text-[10px] font-bold uppercase text-slate-500')
                ui.label(w.money(lease.get('initial_rou_asset'), currency)).classes('font-bold text-slate-800')
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[140px]'):
                ui.label('Discount Rate').classes('text-[10px] font-bold uppercase text-slate-500')
                ui.label(f"{float(lease.get('discount_rate_pct') or 0):.2f}% p.a.").classes('font-bold text-slate-800')
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[140px]'):
                ui.label('Term (Months)').classes('text-[10px] font-bold uppercase text-slate-500')
                ui.label(str(lease.get('term_months'))).classes('font-bold text-slate-800')

        table_rows = []
        for s in schedule:
            table_rows.append({
                'period': s.get('period'),
                'date': s.get('date'),
                'open_liab': w.money(s.get('opening_liability'), currency),
                'payment': w.money(s.get('payment'), currency),
                'interest': w.money(s.get('interest_expense'), currency),
                'principal': w.money(s.get('principal_repayment'), currency),
                'close_liab': w.money(s.get('closing_liability'), currency),
                'open_rou': w.money(s.get('opening_rou'), currency),
                'depr': w.money(s.get('depreciation_expense'), currency),
                'close_rou': w.money(s.get('closing_rou'), currency),
            })

        columns = [
            w.column('period', 'M#', classes='lc-num font-mono'),
            w.column('date', _loc('col_date')),
            w.column('open_liab', _loc('col_open_liab'), classes='lc-num'),
            w.column('payment', _loc('col_pmt'), classes='lc-num font-semibold'),
            w.column('interest', _loc('col_int'), classes='lc-num text-rose-600'),
            w.column('principal', _loc('col_prin'), classes='lc-num text-teal-700'),
            w.column('close_liab', _loc('col_close_liab'), classes='lc-num font-semibold text-slate-900'),
            w.column('depr', _loc('col_depr'), classes='lc-num text-amber-700'),
            w.column('close_rou', _loc('col_close_rou'), classes='lc-num font-semibold text-sky-700'),
        ]

        with ui.scroll_area().classes('w-full h-96'):
            w.table(columns, table_rows)

        with ui.row().classes('w-full justify-end pt-2 border-t'):
            ui.button(_loc('close_btn'), on_click=dialog.close).props('outline')

    dialog.open()


def _new_lease_dialog(reload_fn, currency: str) -> None:
    dialog = ui.dialog().classes('w-full')
    form = {
        'contract_ref': f"IFRS16-{ui.state(2025)[0] if hasattr(ui, 'state') else 2025}-004",
        'asset_name': '',
        'lessor_name': '',
        'start_date': '2025-01-01',
        'term_months': 48,
        'monthly_payment': 1500000.0,
        'discount_rate_pct': 6.5,
        'currency': currency,
        'notes': '',
    }

    with dialog, ui.card().classes('w-full max-w-xl p-6 gap-4'):
        ui.label(_loc('modal_new_title')).classes('text-lg font-bold text-slate-800')

        with ui.grid(columns=2).classes('w-full gap-3'):
            ref_inp = ui.input(_loc('contract_ref'), value=form['contract_ref']).props('outlined dense')
            ref_inp.bind_value(form, 'contract_ref')

            asset_inp = ui.input(_loc('asset_name'), placeholder='e.g. Scanner CT Scan 64 coupes').props('outlined dense')
            asset_inp.bind_value(form, 'asset_name')

            lessor_inp = ui.input(_loc('lessor'), placeholder='e.g. Philips Healthcare').props('outlined dense')
            lessor_inp.bind_value(form, 'lessor_name')

            start_inp = ui.input(_loc('start_date'), value=form['start_date']).props('outlined dense type=date')
            start_inp.bind_value(form, 'start_date')

            term_inp = ui.number(_loc('term') + ' (mois)', value=form['term_months'], min=1, max=360).props('outlined dense')
            term_inp.bind_value(form, 'term_months')

            rate_inp = ui.number(_loc('rate') + ' (% an)', value=form['discount_rate_pct'], min=0.1, max=50, step=0.1).props('outlined dense')
            rate_inp.bind_value(form, 'discount_rate_pct')

            pmt_inp = ui.number(_loc('payment') + f' ({currency})', value=form['monthly_payment'], min=1).props('outlined dense').classes('col-span-2')
            pmt_inp.bind_value(form, 'monthly_payment')

        pv_preview_label = ui.label('').classes('text-sm font-bold text-teal-800')

        def update_pv() -> None:
            try:
                pmt = float(form['monthly_payment'] or 0)
                term = int(form['term_months'] or 1)
                r = (float(form['discount_rate_pct'] or 0) / 100) / 12
                if r <= 0:
                    pv = pmt * term
                else:
                    pv = pmt * (1 - math.pow(1 + r, -term)) / r
                pv_preview_label.text = f"{_loc('modal_pv_preview')} {w.money(pv, currency)}"
            except Exception:
                pv_preview_label.text = ''

        for inp in (pmt_inp, term_inp, rate_inp):
            inp.on_value_change(update_pv)
        update_pv()

        with ui.row().classes('w-full justify-end gap-2 pt-3 border-t'):
            ui.button(_loc('cancel_btn'), on_click=dialog.close).props('outline')

            async def submit() -> None:
                if not form['contract_ref'] or not form['asset_name'] or not form['lessor_name']:
                    ui.notify('Please fill in required fields.', type='warning')
                    return
                res = await api.safe(api.post('/leases', form))
                if res:
                    ui.notify('IFRS 16 Lease contract created.', type='positive')
                    dialog.close()
                    await reload_fn()

            ui.button(_loc('save_btn'), icon='check', on_click=submit).props('unelevated color=teal')

    dialog.open()
