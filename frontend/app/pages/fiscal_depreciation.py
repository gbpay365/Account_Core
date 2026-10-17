"""
CEMAC Fiscal vs Economic Depreciation Engine (Amortissements Dérogatoires).
Compliant with CEMAC Directives, Cameroon CGI (Art. 7), and SYSCOHADA (Accounts 151, 851, 861).
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

_T = {
    'title': {
        'fr': 'Amortissements Dérogatoires (Fiscaux vs Économiques)',
        'en': 'Fiscal vs Economic Depreciation (Accelerated Depreciation)',
    },
    'subtitle': {
        'fr': 'Calcul du dégressif CEMAC (Art. 7 CGI) et génération automatique des écritures (Comptes 151 / 851 / 861)',
        'en': 'CEMAC declining-balance computation (Art. 7 CGI) and automated journal entries (Accounts 151 / 851 / 861)',
    },
    'lbl_fy': {'fr': 'Exercice Fiscal', 'en': 'Fiscal Year'},
    'btn_post': {'fr': 'Comptabiliser au Grand-Livre (Journal OD)', 'en': 'Post to General Ledger (OD Journal)'},
    'tip_post': {'fr': 'Génère l’écriture d’amortissement dérogatoire (Comptes 151 / 851 / 861)', 'en': 'Generates accelerated depreciation entry (Accounts 151 / 851 / 861)'},
    'chip_posted': {'fr': 'Amortissement Dérogatoire Comptabilisé', 'en': 'Accelerated Depreciation Posted'},
    'posted_success': {'fr': 'Écriture {entry} comptabilisée avec succès dans le journal OD !', 'en': 'Entry {entry} posted successfully to OD journal!'},
    'kpi_econ': {'fr': 'Amortissement Économique (Linéaire)', 'en': 'Economic Depreciation (Straight-line)'},
    'kpi_econ_sub': {'fr': 'Comptes 6813 / 28x (Comptabilité financière)', 'en': 'Accounts 6813 / 28x (Financial accounting)'},
    'kpi_fisc': {'fr': 'Amortissement Fiscal (Dégressif CEMAC)', 'en': 'Fiscal Depreciation (CEMAC Declining)'},
    'kpi_fisc_sub': {'fr': 'Base fiscale déductible (Art. 7 CGI)', 'en': 'Deductible tax base (Art. 7 CGI)'},
    'kpi_derog': {'fr': 'Amortissement Dérogatoire Net', 'en': 'Net Accelerated Depreciation'},
    'dotation': {'fr': 'Dotation (Compte 851)', 'en': 'Addition (Account 851)'},
    'reprise': {'fr': 'Reprise (Compte 861)', 'en': 'Reversal (Account 861)'},
    'kpi_status': {'fr': 'Statut de Clôture Fiscale', 'en': 'Tax Closing Status'},
    'status_posted': {'fr': 'Validé & Comptabilisé', 'en': 'Approved & Posted'},
    'status_sim': {'fr': 'Simulé (En attente)', 'en': 'Simulated (Pending)'},
    'assets_count': {'fr': '{n} immobilisations traitées', 'en': '{n} assets processed'},
    'schedule_title': {'fr': 'Tableau d’Amortissement Dérogatoire par Immobilisation — Exercice {year}', 'en': 'Accelerated Depreciation Schedule per Asset — Fiscal Year {year}'},
    'no_assets': {'fr': 'Aucune immobilisation amortissable trouvée.', 'en': 'No depreciable assets found.'},
    'col_tag': {'fr': 'Code Immo', 'en': 'Asset Tag'},
    'col_name': {'fr': 'Désignation de l’équipement', 'en': 'Equipment Description'},
    'col_cost': {'fr': 'Valeur d’Origine (HT)', 'en': 'Origin Cost (excl. Tax)'},
    'col_life': {'fr': 'Durée (ans)', 'en': 'Life (Yrs)'},
    'col_factor': {'fr': 'Coeff. Dégressif', 'en': 'Declining Factor'},
    'col_econ': {'fr': 'Amort. Économique', 'en': 'Economic Depr.'},
    'col_fisc': {'fr': 'Amort. Fiscal (Dégressif)', 'en': 'Fiscal Depr. (Declining)'},
    'col_derog': {'fr': 'Écart Dérogatoire', 'en': 'Accelerated Variance'},
    'col_action': {'fr': 'Écriture SYSCOHADA', 'en': 'SYSCOHADA Action'},
}


def _loc(key: str, **kwargs) -> str:
    cur = lang() if lang() in ('fr', 'en') else 'en'
    entry = _T.get(key)
    if isinstance(entry, dict):
        text = entry.get(cur, entry.get('en', ''))
    else:
        text = t(key)
    return text.format(**kwargs) if kwargs else text


@page('/fiscal-depreciation', title='Fiscal depreciation', permissions=('depr.view',))
async def fiscal_depreciation_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')

    state = {
        'year': 2026,
    }

    content = ui.column().classes('w-full gap-4')

    w.page_header(
        _loc('title'),
        _loc('subtitle'),
        emoji='📉'
    )

    async def reload_all() -> None:
        content.clear()
        with content:
            await render_view()

    async def render_view() -> None:
        curr_year = state['year']
        sim_data = await api.safe(api.get(f'/depreciation/fiscal/{curr_year}/simulate'), notify=False) or {}

        tot_econ = sim_data.get('total_economic_depreciation', 0)
        tot_fisc = sim_data.get('total_fiscal_depreciation', 0)
        net_derog = sim_data.get('net_derogatory_movement', 0)
        is_posted = sim_data.get('is_posted', False)
        schedules = sim_data.get('schedules', [])

        # 1. Top Controls Bar: Year Selector & Post Button
        with ui.row().classes('w-full items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm'):
            with ui.row().classes('items-center gap-4'):
                prefix = 'Exercice' if lang() == 'fr' else 'Fiscal Year'
                year_opts = {2026: f'{prefix} 2026', 2025: f'{prefix} 2025', 2024: f'{prefix} 2024'}
                def on_year_change(e):
                    state['year'] = e.value
                    reload_all()

                ui.select(year_opts, value=curr_year, on_change=on_year_change, label=_loc('lbl_fy')).props('outlined dense').classes('w-48')

            with ui.row().classes('items-center gap-3'):
                if not is_posted:
                    async def do_post():
                        res = await api.safe(api.post(f'/depreciation/fiscal/{curr_year}/post', {}))
                        if res:
                            ui.notify(_loc('posted_success', entry=res.get('entry_no')), type='positive')
                            await reload_all()

                    ui.button(
                        _loc('btn_post'),
                        icon='post_add',
                        on_click=do_post
                    ).props('unelevated color=primary size=sm').tooltip(_loc('tip_post'))
                else:
                    ui.chip(_loc('chip_posted'), icon='verified', color='emerald-1', text_color='emerald-9').props('dense font-bold')

                ui.button(icon='refresh', on_click=reload_all).props('flat round size=sm')

        # 2. Key Metrics Strip
        with ui.grid(columns=4).classes('w-full gap-4'):
            with ui.card().classes('p-4 border-l-4 border-blue-500 shadow-sm'):
                ui.label(_loc('kpi_econ')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_econ, currency)} {currency}").classes('text-xl font-bold text-slate-800')
                ui.label(_loc('kpi_econ_sub')).classes('text-xs text-slate-400')

            with ui.card().classes('p-4 border-l-4 border-indigo-500 shadow-sm'):
                ui.label(_loc('kpi_fisc')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(f"{w.money(tot_fisc, currency)} {currency}").classes('text-xl font-bold text-indigo-700')
                ui.label(_loc('kpi_fisc_sub')).classes('text-xs text-slate-400')

            derog_tone = 'border-teal-500 text-teal-800 bg-teal-50/20' if net_derog >= 0 else 'border-amber-500 text-amber-800 bg-amber-50/20'
            with ui.card().classes(f'p-4 border-l-4 {derog_tone} shadow-sm'):
                ui.label(_loc('kpi_derog')).classes('text-xs uppercase tracking-wider font-semibold')
                ui.label(f"{w.money(net_derog, currency)} {currency}").classes('text-xl font-bold')
                ui.label(_loc('dotation') if net_derog >= 0 else _loc('reprise')).classes('text-xs font-medium')

            with ui.card().classes('p-4 border-l-4 border-slate-500 shadow-sm'):
                ui.label(_loc('kpi_status')).classes('text-xs uppercase tracking-wider text-slate-500 font-semibold')
                ui.label(_loc('status_posted') if is_posted else _loc('status_sim')).classes('text-lg font-bold ' + ('text-emerald-700' if is_posted else 'text-slate-600'))
                ui.label(_loc('assets_count', n=len(schedules))).classes('text-xs text-slate-400')

        # 3. Detailed Schedule Table
        with ui.card().classes('w-full p-4 border border-slate-200 shadow-sm'):
            with ui.row().classes('w-full justify-between items-center mb-3'):
                with ui.row().classes('items-center gap-2'):
                    ui.icon('calculate', color='primary')
                    ui.label(_loc('schedule_title', year=curr_year)).classes('text-base font-bold text-slate-800')

            if not schedules:
                ui.label(_loc('no_assets')).classes('text-slate-400 italic p-6')
            else:
                formatted_schedules = [
                    {
                        **s,
                        'cost_formatted': w.money(s.get('cost', 0), currency),
                        'econ_formatted': w.money(s.get('economic_depreciation', 0), currency),
                        'fisc_formatted': w.money(s.get('fiscal_depreciation', 0), currency),
                        'derog_formatted': w.money(s.get('derogatory_amount', 0), currency),
                    }
                    for s in schedules
                ]

                columns = [
                    {'name': 'tag', 'label': _loc('col_tag'), 'field': 'asset_tag', 'align': 'left', 'sortable': True},
                    {'name': 'name', 'label': _loc('col_name'), 'field': 'asset_name', 'align': 'left'},
                    {'name': 'cost', 'label': _loc('col_cost'), 'field': 'cost_formatted', 'align': 'right'},
                    {'name': 'life', 'label': _loc('col_life'), 'field': 'life_years', 'align': 'center'},
                    {'name': 'factor', 'label': _loc('col_factor'), 'field': 'declining_factor', 'align': 'center'},
                    {'name': 'econ', 'label': _loc('col_econ'), 'field': 'econ_formatted', 'align': 'right'},
                    {'name': 'fisc', 'label': _loc('col_fisc'), 'field': 'fisc_formatted', 'align': 'right'},
                    {'name': 'derog', 'label': _loc('col_derog'), 'field': 'derog_formatted', 'align': 'right'},
                    {'name': 'action', 'label': _loc('col_action'), 'field': 'action', 'align': 'left'},
                ]

                table = ui.table(columns=columns, rows=formatted_schedules, row_key='asset_id').props('flat dense bordered').classes('w-full')

                table.add_slot('body-cell-tag', '''<q-td :props="props"><span class="font-mono font-bold text-primary">{{ props.value }}</span></q-td>''')
                table.add_slot('body-cell-derog', '''
                    <q-td :props="props">
                        <span :class="props.row.derogatory_amount >= 0 ? 'text-teal-800 font-bold font-mono' : 'text-amber-800 font-bold font-mono'">
                            {{ props.value }}
                        </span>
                    </q-td>
                ''')
                table.add_slot('body-cell-action', '''
                    <q-td :props="props">
                        <q-chip dense size="xs" :color="props.row.derogatory_amount >= 0 ? 'teal-1' : 'amber-1'" :text-color="props.row.derogatory_amount >= 0 ? 'teal-9' : 'amber-9'">
                            {{ props.value }}
                        </q-chip>
                    </q-td>
                ''')

    await render_view()
