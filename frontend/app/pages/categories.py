"""
Asset category catalogue: the taxonomy that decides depreciation accounts,
useful lives and whether calibration, safety tests and PM plans are created.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, domain_label, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

DOMAINS = ('mining', 'production', 'biomedical', 'facility', 'fleet', 'it_office', 'services')

DOMAIN_DEFAULTS = {
    'mining': {'asset': '2411', 'accum': '2841', 'expense': '68131', 'maint': '6241'},
    'production': {'asset': '2411', 'accum': '2841', 'expense': '68131', 'maint': '6241'},
    'biomedical': {'asset': '2412', 'accum': '2842', 'expense': '68132', 'maint': '6243'},
    'facility': {'asset': '234', 'accum': '2834', 'expense': '68131', 'maint': '6244'},
    'fleet': {'asset': '2451', 'accum': '2845', 'expense': '68134', 'maint': '6245'},
    'it_office': {'asset': '2442', 'accum': '2844', 'expense': '68133', 'maint': '6246'},
    'services': {'asset': '2441', 'accum': '2844', 'expense': '68133', 'maint': '6248'},
}

SHARED_DEFAULTS = {'gain': '822', 'loss': '812', 'reval': '106', 'impair': '6941'}


@page('/categories', title='Asset categories', permissions=('asset.view',))
async def categories_page() -> None:
    state = {'search': '', 'domain': None}

    accounts_data = await api.safe(api.get('/accounts', postableOnly=True, activeOnly=True),
                                   notify=False) or {'rows': []}
    account_options = {
        a['code']: f"{a['code']} — {account_label(a)}" for a in accounts_data.get('rows') or []
    }
    catalogue: dict = {'rows': []}

    def actions() -> None:
        if api.can('category.manage'):
            ui.button(t('cat.new'), icon='add',
                      on_click=lambda: _category_dialog(reload, account_options, catalogue['rows'])
                      ).props('unelevated size=sm')

    w.page_header(t('cat.title'), t('cat.sub'), actions=actions, emoji=chrome.PAGE['cat.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/asset-categories'))
        if not data:
            return
        rows = data.get('rows') or []
        catalogue['rows'] = list(rows)
        if state['domain']:
            rows = [row for row in rows if row.get('domain') == state['domain']]
        needle = (state['search'] or '').strip().lower()
        if needle:
            rows = [row for row in rows if needle in ' '.join([
                str(row.get('code') or ''),
                str(row.get('name') or ''),
                str(row.get('name_en') or ''),
                str(row.get('parent_code') or ''),
            ]).lower()]
        with container:
            _summary(catalogue['rows'])
            _table(rows, account_options, catalogue['rows'], reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('cat.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-80')
            search.bind_value(state, 'search')
            domain = ui.select({None: t('ar.all_domains'),
                                **{key: t(f'domain.{key}') for key in DOMAINS}},
                               value=None, label=t('common.domain')) \
                .props('outlined dense options-dense').classes('w-64')
            domain.bind_value(state, 'domain')
            for element in (search, domain):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _summary(rows: list[dict]) -> None:
    counts = {key: 0 for key in DOMAINS}
    for row in rows:
        domain = row.get('domain')
        if domain in counts:
            counts[domain] += 1
    with w.kpi_row():
        w.kpi(t('cat.total'), w.number(len(rows)), hint=t('cat.total_hint'),
              icon='category', tone='slate')
        w.kpi(t('domain.mining'), w.number(counts['mining']),
              hint='Extraction, crushers, heavy mobile', icon='construction', tone='amber')
        w.kpi(t('domain.production'), w.number(counts['production']),
              hint='Processing, assembly, CNC, plant', icon='precision_manufacturing', tone='sky')
        w.kpi(t('domain.biomedical'), w.number(counts['biomedical']),
              hint=t('cat.kpi_bio'), icon='biotech', tone='teal')
        w.kpi(t('domain.facility'), w.number(counts['facility']),
              hint=t('cat.kpi_fac'), icon='apartment', tone='indigo')
        w.kpi(t('domain.fleet'), w.number(counts['fleet']),
              hint=t('cat.kpi_flt'), icon='local_shipping', tone='amber')


def _table(rows: list[dict], account_options: dict, all_rows: list[dict], reload) -> None:
    body = w.section(t('cat.list'), t('cat.list_sub'))
    with body:
        if not rows:
            w.empty_state(t('cat.empty'), icon='category')
            return
        for row in rows:
            row['label'] = account_label(row)
            row['domain_label'] = domain_label(row.get('domain'))
            row['parent_label'] = row.get('parent_code') or t('common.none')
            row['life_label'] = (f"{row.get('ohada_useful_life_months') or '—'} / "
                                 f"{row.get('ifrs_useful_life_months') or '—'}")
            flags = []
            if row.get('requires_calibration'):
                flags.append(t('cat.flag_cal'))
            if row.get('requires_safety_test'):
                flags.append(t('cat.flag_safety'))
            if row.get('pm_interval_months'):
                flags.append(t('cat.flag_pm'))
            row['rules'] = ', '.join(flags) if flags else t('common.none')
        columns = [
            w.column('code', t('cat.code'), classes='lc-num font-semibold'),
            w.column('label', t('cat.name')),
            w.column('domain_label', t('common.domain')),
            w.column('parent_label', t('cat.parent')),
            w.column('asset_account_code', t('cat.asset_account'), classes='lc-num'),
            w.column('life_label', t('cat.lives')),
            w.column('rules', t('cat.compliance')),
            w.int_column('asset_count', t('cat.assets')),
        ]
        can_edit = api.can('category.manage')
        w.table(columns, rows, height='64vh', pagination=0,
                on_row_click=(lambda row: _category_dialog(
                    reload, account_options, all_rows, row)) if can_edit else None)


def _account_code(row: dict | None, column: str) -> str | None:
    if not row:
        return None
    aliases = {
        'asset_account_id': 'asset_account_code',
        'accum_depr_account_id': 'accum_account_code',
        'depr_expense_account_id': 'expense_account_code',
        'disposal_gain_account_id': 'disposal_gain_account_code',
        'disposal_loss_account_id': 'disposal_loss_account_code',
        'maintenance_account_id': 'maintenance_account_code',
        'revaluation_surplus_account_id': 'revaluation_surplus_account_code',
        'impairment_account_id': 'impairment_account_code',
    }
    return row.get(aliases.get(column, '')) or None


def _category_dialog(reload, account_options: dict, all_rows: list[dict],
                     existing: dict | None = None) -> None:
    editing = existing is not None
    parent_source = [row for row in all_rows if not (existing and row['id'] == existing['id'])]

    def acct_select(label: str, value: str | None):
        if account_options:
            return ui.select({None: t('common.none'), **account_options},
                             value=value if value in account_options else None,
                             label=label, with_input=True) \
                .props('outlined dense options-dense').classes('flex-1')
        return ui.input(label, value=value or '').props('outlined dense').classes('flex-1')

    def read_account(widget) -> str | None:
        value = getattr(widget, 'value', None)
        if not value:
            return None
        return str(value).strip() or None

    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[880px] max-w-full'):
        ui.label(t('cat.edit_title') if editing else t('cat.new_title')).classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')

        with ui.column().classes('p-5 gap-4 w-full lc-scroll').style('max-height: 72vh'):
            if not editing:
                w.note(t('cat.hint'), icon='category')

            w.heading(t('cat.identity'))
            with ui.row().classes('w-full gap-3 no-wrap'):
                code = ui.input(t('cat.code'), value=existing.get('code') if editing else '') \
                    .props('outlined dense' + (' readonly' if editing else '')).classes('w-56')
                domain = ui.select({key: t(f'domain.{key}') for key in DOMAINS},
                                   value=existing.get('domain') if editing else 'production',
                                   label=t('common.domain')) \
                    .props('outlined dense').classes('flex-1')
            name = ui.input(t('cat.name_fr'), value=existing.get('name') if editing else '') \
                .props('outlined dense').classes('w-full')
            name_en = ui.input(t('cat.name_en'),
                               value=(existing.get('name_en') or '') if editing else '') \
                .props('outlined dense').classes('w-full')

            parent_options = {None: t('cat.no_parent'),
                              **{row['id']: f"{row['code']} — {account_label(row)}"
                                 for row in parent_source}}
            parent = ui.select(parent_options, value=existing.get('parent_id') if editing else None,
                               label=t('cat.parent'), with_input=True) \
                .props('outlined dense options-dense').classes('w-full')

            with ui.row().classes('w-full gap-3 no-wrap'):
                taxonomy = ui.select(
                    {key: t(f'cat.tax.{key}') for key in ('internal', 'iso14224', 'eclass', 'vmrs', 'umdns', 'gmdn', 'unspsc', 'none')},
                    value=(existing.get('taxonomy_system') if editing else 'internal') or 'internal',
                    label=t('cat.taxonomy')) \
                    .props('outlined dense').classes('flex-1')
                taxonomy_code = ui.input(t('cat.taxonomy_code'),
                                         value=(existing.get('taxonomy_code') or '') if editing else '') \
                    .props('outlined dense').classes('flex-1')

            w.heading(t('cat.accounts'))
            defaults = DOMAIN_DEFAULTS.get(
                (existing or {}).get('domain') or 'production', DOMAIN_DEFAULTS['production']
            )
            asset_acc = acct_select(t('cat.asset_account'),
                                    _account_code(existing, 'asset_account_id') or defaults['asset'])
            with ui.row().classes('w-full gap-3 no-wrap'):
                accum_acc = acct_select(t('cat.accum_account'),
                                        _account_code(existing, 'accum_depr_account_id') or defaults['accum'])
                expense_acc = acct_select(t('cat.expense_account'),
                                          _account_code(existing, 'depr_expense_account_id') or defaults['expense'])
            with ui.row().classes('w-full gap-3 no-wrap'):
                maint_acc = acct_select(t('cat.maint_account'),
                                        _account_code(existing, 'maintenance_account_id') or defaults['maint'])
                gain_acc = acct_select(t('cat.gain_account'),
                                       _account_code(existing, 'disposal_gain_account_id') or SHARED_DEFAULTS['gain'])
                loss_acc = acct_select(t('cat.loss_account'),
                                       _account_code(existing, 'disposal_loss_account_id') or SHARED_DEFAULTS['loss'])
            with ui.row().classes('w-full gap-3 no-wrap'):
                reval_acc = acct_select(t('cat.reval_account'),
                                        _account_code(existing, 'revaluation_surplus_account_id') or SHARED_DEFAULTS['reval'])
                impair_acc = acct_select(t('cat.impair_account'),
                                         _account_code(existing, 'impairment_account_id') or SHARED_DEFAULTS['impair'])

            w.heading(t('cat.lives'))
            methods = {
                'straight_line': t('cat.method.straight'),
                'declining_balance': t('cat.method.declining'),
            }
            ifrs_methods = {**methods, 'units_of_production': t('cat.method.units')}
            with ui.row().classes('w-full gap-3 no-wrap'):
                ohada_life = ui.number(t('cat.ohada_life'),
                                       value=(existing.get('ohada_useful_life_months') if editing else 60),
                                       format='%d', min=1, max=600) \
                    .props('outlined dense').classes('flex-1')
                ohada_method = ui.select(methods,
                                         value=(existing.get('ohada_method') if editing else 'straight_line'),
                                         label=t('cat.ohada_method')) \
                    .props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                ifrs_life = ui.number(t('cat.ifrs_life'),
                                      value=(existing.get('ifrs_useful_life_months') if editing else 60),
                                      format='%d', min=1, max=600) \
                    .props('outlined dense').classes('flex-1')
                ifrs_method = ui.select(ifrs_methods,
                                        value=(existing.get('ifrs_method') if editing else 'straight_line'),
                                        label=t('cat.ifrs_method')) \
                    .props('outlined dense').classes('flex-1')
                ifrs_residual = ui.number(t('cat.residual'),
                                          value=(existing.get('ifrs_residual_pct') if editing else 0),
                                          format='%.1f', min=0, max=100) \
                    .props('outlined dense').classes('w-40')

            w.heading(t('cat.compliance'))
            requires_cal = ui.switch(t('cat.requires_cal'),
                                     value=bool(existing.get('requires_calibration')) if editing else False
                                     ).props('dense')
            with ui.row().classes('w-full gap-3 no-wrap'):
                cal_interval = ui.number(t('cat.cal_interval'),
                                         value=existing.get('calibration_interval_months') if editing else None,
                                         format='%d', min=1, max=120) \
                    .props('outlined dense').classes('flex-1')
                safety_std = ui.input(t('cat.safety_std'),
                                      value=(existing.get('safety_test_standard') or '') if editing else '') \
                    .props('outlined dense').classes('flex-1')
            requires_safety = ui.switch(t('cat.requires_safety'),
                                        value=bool(existing.get('requires_safety_test')) if editing else False
                                        ).props('dense')
            with ui.row().classes('w-full gap-3 no-wrap'):
                safety_interval = ui.number(t('cat.safety_interval'),
                                            value=existing.get('safety_interval_months') if editing else None,
                                            format='%d', min=1, max=120) \
                    .props('outlined dense').classes('flex-1')
                pm_interval = ui.number(t('cat.pm_interval'),
                                        value=existing.get('pm_interval_months') if editing else None,
                                        format='%d', min=1, max=120) \
                    .props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                criticality = ui.select(
                    {key: t(f'status.{key}') for key in ('low', 'medium', 'high', 'critical')},
                    value=(existing.get('default_criticality') if editing else 'medium') or 'medium',
                    label=t('cat.criticality')) \
                    .props('outlined dense').classes('flex-1')
                threshold = ui.number(t('cat.threshold'),
                                      value=(existing.get('capitalization_threshold') if editing else 0),
                                      format='%.0f', min=0) \
                    .props('outlined dense').classes('flex-1')

        def apply_parent() -> None:
            chosen = next((row for row in parent_source if row['id'] == parent.value), None)
            if not chosen:
                return
            domain.set_value(chosen.get('domain'))
            if chosen.get('taxonomy_system'):
                taxonomy.set_value(chosen['taxonomy_system'])
            asset_acc.set_value(_account_code(chosen, 'asset_account_id') or asset_acc.value)
            accum_acc.set_value(_account_code(chosen, 'accum_depr_account_id') or accum_acc.value)
            expense_acc.set_value(_account_code(chosen, 'depr_expense_account_id') or expense_acc.value)
            maint_acc.set_value(_account_code(chosen, 'maintenance_account_id') or maint_acc.value)
            gain_acc.set_value(_account_code(chosen, 'disposal_gain_account_id') or gain_acc.value)
            loss_acc.set_value(_account_code(chosen, 'disposal_loss_account_id') or loss_acc.value)
            reval_acc.set_value(_account_code(chosen, 'revaluation_surplus_account_id') or reval_acc.value)
            impair_acc.set_value(_account_code(chosen, 'impairment_account_id') or impair_acc.value)
            if chosen.get('ohada_useful_life_months'):
                ohada_life.set_value(chosen['ohada_useful_life_months'])
            if chosen.get('ifrs_useful_life_months'):
                ifrs_life.set_value(chosen['ifrs_useful_life_months'])
            if chosen.get('ohada_method'):
                ohada_method.set_value(chosen['ohada_method'])
            if chosen.get('ifrs_method'):
                ifrs_method.set_value(chosen['ifrs_method'])

        def apply_domain() -> None:
            if parent.value or editing:
                return
            preset = DOMAIN_DEFAULTS.get(domain.value) or DOMAIN_DEFAULTS['production']
            asset_acc.set_value(preset['asset'])
            accum_acc.set_value(preset['accum'])
            expense_acc.set_value(preset['expense'])
            maint_acc.set_value(preset['maint'])

        parent.on_value_change(apply_parent)
        domain.on_value_change(apply_domain)

        async def save() -> None:
            if not (code.value or '').strip() or not (name.value or '').strip():
                ui.notify(t('cat.required'), type='warning', position='top')
                return
            payload = {
                'name': name.value.strip(),
                'nameEn': (name_en.value or '').strip() or None,
                'domain': domain.value,
                'parentId': parent.value,
                'taxonomySystem': taxonomy.value,
                'taxonomyCode': (taxonomy_code.value or '').strip() or None,
                'assetAccount': read_account(asset_acc),
                'accumDeprAccount': read_account(accum_acc),
                'deprExpenseAccount': read_account(expense_acc),
                'disposalGainAccount': read_account(gain_acc),
                'disposalLossAccount': read_account(loss_acc),
                'maintenanceAccount': read_account(maint_acc),
                'revaluationSurplusAccount': read_account(reval_acc),
                'impairmentAccount': read_account(impair_acc),
                'ohadaUsefulLifeMonths': int(ohada_life.value or 60),
                'ohadaMethod': ohada_method.value,
                'ifrsUsefulLifeMonths': int(ifrs_life.value or 60),
                'ifrsMethod': ifrs_method.value,
                'ifrsResidualPct': float(ifrs_residual.value or 0),
                'requiresCalibration': bool(requires_cal.value),
                'calibrationIntervalMonths': int(cal_interval.value) if cal_interval.value else None,
                'requiresSafetyTest': bool(requires_safety.value),
                'safetyTestStandard': (safety_std.value or '').strip() or None,
                'safetyIntervalMonths': int(safety_interval.value) if safety_interval.value else None,
                'pmIntervalMonths': int(pm_interval.value) if pm_interval.value else None,
                'capitalizationThreshold': float(threshold.value or 0),
                'defaultCriticality': criticality.value,
            }
            if editing:
                result = await api.safe(api.patch(f"/asset-categories/{existing['id']}", payload))
            else:
                payload['code'] = code.value.strip().upper()
                result = await api.safe(api.post('/asset-categories', payload))
            if result:
                ui.notify(t('cat.saved'), type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('common.save') if editing else t('cat.create'), on_click=save) \
                .props('unelevated')

    dialog.open()
