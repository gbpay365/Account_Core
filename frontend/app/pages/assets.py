"""
The asset register and the asset lifecycle view.

`/assets` lists and filters; `/assets/{id}` shows one asset's whole life —
acquisition, capitalisation, commissioning, movements, maintenance,
calibration, safety testing, depreciation and disposal.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, framework, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

DOMAINS = {
    None: 'All domains',
    'biomedical': 'Biomedical equipment',
    'facility': 'Facility and infrastructure',
    'fleet': 'Vehicles and ambulances',
    'it_office': 'IT and office equipment',
}

STATUSES = {
    None: 'Any status', 'draft': 'Draft', 'in_stock': 'In stock', 'installing': 'Installing',
    'in_service': 'In service', 'under_maintenance': 'Under maintenance',
    'quarantined': 'Quarantined', 'calibration_overdue': 'Calibration overdue',
    'out_of_service': 'Out of service', 'pending_disposal': 'Pending disposal',
    'disposed': 'Disposed',
}

FUNDING = {
    'purchase': 'Purchased', 'donation': 'Donated', 'grant': 'Grant funded',
    'lease': 'Leased', 'transfer': 'Transferred in', 'own_construction': 'Built in house',
}

DISPOSAL_METHODS = {
    'sale': 'Sale', 'donation': 'Donation to another facility', 'scrap': 'Scrap',
    'biomedical_waste': 'Biomedical waste stream', 'trade_in': 'Trade in',
    'write_off': 'Write off', 'theft_loss': 'Theft or loss',
}


@page('/assets', title='Asset register', permissions=('asset.view',))
async def assets_page() -> None:
    currency = api.user().get('functional_currency', 'XAF')
    state = {'search': '', 'domain': None, 'status': None, 'costCenter': None, 'location': None,
             'restricted': False, 'due': False, 'uncapitalized': False, 'sort': 'asset_tag'}

    categories = await api.safe(api.get('/asset-categories'), notify=False) or {'rows': []}
    locations = await api.safe(api.get('/asset-locations'), notify=False) or {'rows': []}
    centres = await api.safe(api.get('/cost-centers'), notify=False) or {'rows': []}

    def actions() -> None:
        ui.button(t('ar.scan'), icon='qr_code_scanner', on_click=_scan_dialog).props('outline size=sm')
        if api.can('asset.view'):
            ui.button(t('nav.categories'), icon='category',
                      on_click=lambda: ui.navigate.to('/categories')).props('outline size=sm')
        if api.can('asset.create'):
            ui.button(t('ar.register'), icon='add',
                      on_click=lambda: _register_dialog(categories['rows'], locations['rows'],
                                                        centres['rows'], reload)
                      ).props('unelevated size=sm')

    w.page_header(t('ar.title'), t('ar.sub'), actions=actions, emoji=chrome.PAGE['ar.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/assets', search=state['search'] or None,
                                      domain=state['domain'], status=state['status'],
                                      costCenterId=state['costCenter'], locationId=state['location'],
                                      restrictedOnly=state['restricted'] or None,
                                      dueOnly=state['due'] or None,
                                      uncapitalizedOnly=state['uncapitalized'] or None,
                                      sort=state['sort'], pageSize=200))
        if not data:
            return
        with container:
            _summary(data.get('summary') or {}, currency)
            _register_table(data.get('rows') or [], data.get('total', 0), currency)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('ar.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            domain = ui.select({None: t('ar.all_domains'),
                                **{k: t(f'domain.{k}') for k in ('biomedical', 'facility', 'fleet', 'it_office')}},
                               value=None, label=t('common.domain')) \
                .props('outlined dense options-dense').classes('w-52')
            domain.bind_value(state, 'domain')
            status = ui.select({None: t('common.any_status'),
                                **{k: t(f'status.{k}') for k in (
                                    'draft', 'in_stock', 'installing', 'in_service',
                                    'under_maintenance', 'quarantined', 'calibration_overdue',
                                    'out_of_service', 'pending_disposal', 'disposed')}},
                               value=None, label=t('common.status')) \
                .props('outlined dense options-dense').classes('w-44')
            status.bind_value(state, 'status')
            centre = ui.select({None: t('ar.all_cc'),
                                **{c['id']: f"{c['code']} — {c['name']}" for c in centres['rows']}},
                               value=None, label=t('ar.cost_centre')) \
                .props('outlined dense options-dense').classes('w-52')
            centre.bind_value(state, 'costCenter')
            location = ui.select({None: t('ar.all_loc'),
                                  **{l['id']: l['name'] for l in locations['rows']}},
                                 value=None, label=t('ar.location')) \
                .props('outlined dense options-dense').classes('w-48')
            location.bind_value(state, 'location')
            elements = [search, domain, status, centre, location]

        with ui.row().classes('w-full gap-5 pt-2 flex-wrap'):
            restricted = ui.switch(t('ar.restricted_only')).props('dense')
            restricted.bind_value(state, 'restricted')
            due = ui.switch(t('ar.due_only')).props('dense')
            due.bind_value(state, 'due')
            uncapitalized = ui.switch(t('ar.uncap_only')).props('dense')
            uncapitalized.bind_value(state, 'uncapitalized')
            elements += [restricted, due, uncapitalized]

        for element in elements:
            element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _summary(summary: dict, currency: str) -> None:
    with w.kpi_row():
        w.kpi('Assets shown', w.number(summary.get('count')),
              hint='Matching the current filters', icon='inventory_2', tone='slate')
        if framework() == 'ifrs':
            w.kpi('Gross cost', w.money(summary.get('ifrs_cost'), currency),
                  hint='IFRS basis', icon='request_quote', tone='sky')
            w.kpi('Net book value (IFRS)', w.money(summary.get('ifrs_nbv'), currency),
                  hint='After component depreciation and impairment', icon='balance', tone='violet')
        else:
            w.kpi('Gross cost', w.money(summary.get('ohada_cost'), currency),
                  hint='Statutory basis', icon='request_quote', tone='sky')
            w.kpi('Net book value (OHADA)', w.money(summary.get('ohada_nbv'), currency),
                  hint='Cost less accumulated depreciation', icon='account_balance', tone='teal')
        w.kpi('Maintenance spent', w.money(summary.get('maintenance_cost'), currency),
              hint='Life to date on these assets', icon='build', tone='amber')


def _register_table(rows: list[dict], total: int, currency: str) -> None:
    for row in rows:
        row['domain_label'] = DOMAINS.get(row.get('domain'), row.get('domain'))
        row['category_label'] = account_label({
            'name': row.get('category_name'), 'name_en': row.get('category_name_en'),
        })
        row['compliance'] = ('Restricted' if row.get('use_restricted')
                             else 'Due' if _is_due(row) else 'Current')

    body = w.section(f'{w.number(total)} assets',
                     'Click an asset to open its full lifecycle')
    with body:
        if not rows:
            w.empty_state('No asset matches those filters.', icon='inventory_2')
            return
        columns = [
            w.column('asset_tag', 'Tag', classes='lc-num font-semibold'),
            w.column('name', 'Asset'),
            w.column('category_label', 'Category'),
            w.column('domain_label', 'Domain'),
            w.column('cost_center_name', 'Cost centre'),
            w.column('location_name', 'Location'),
            w.column('status', 'Status'),
            w.column('compliance', 'Compliance'),
            w.date_column('next_calibration_date', 'Calibration due'),
            w.date_column('next_pm_date', 'Service due'),
            w.money_column('ifrs_nbv' if framework() == 'ifrs' else 'ohada_nbv',
                           f'NBV ({currency})', currency=currency),
        ]
        table = w.table(columns, rows, height='64vh', pagination=0,
                        on_row_click=lambda row: ui.navigate.to(f"/assets/{row['id']}"))
        w.add_badge_slot(table, 'status')
        w.add_badge_slot(table, 'compliance',
                         tones={'restricted': 'rose', 'due': 'amber', 'current': 'emerald'})


def _is_due(row: dict) -> bool:
    today = w.today_iso()
    return any(str(row.get(field) or '9999')[:10] < today
               for field in ('next_calibration_date', 'next_safety_test_date', 'next_pm_date'))


# --- asset detail -----------------------------------------------------------


@page('/assets/{asset_id}', title='Asset', permissions=('asset.view',))
async def asset_detail(asset_id: int) -> None:
    currency = api.user().get('functional_currency', 'XAF')
    container = ui.column().classes('w-full gap-5')

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get(f'/assets/{asset_id}'))
        if not data:
            return
        with container:
            _draw_asset(data, currency, reload)

    await reload()


def _draw_asset(data: dict, currency: str, reload) -> None:
    asset = data['asset']

    def actions() -> None:
        ui.button('Back to register', icon='arrow_back',
                  on_click=lambda: ui.navigate.to('/assets')).props('flat size=sm color=grey-8')
        ui.button('Tag', icon='qr_code',
                  on_click=lambda: _tag_dialog(asset)).props('outline size=sm')
        if not asset.get('is_capitalized') and api.can('asset.capitalize'):
            ui.button('Capitalise', icon='post_add',
                      on_click=lambda: _capitalize_dialog(asset, reload)).props('unelevated size=sm')
        if asset.get('status') in ('in_stock', 'installing') and api.can('asset.commission'):
            ui.button('Commission', icon='play_circle',
                      on_click=lambda: _commission_dialog(asset, reload)).props('unelevated size=sm')
        if api.can('asset.move'):
            ui.button('Move', icon='swap_horiz',
                      on_click=lambda: _move_dialog(asset, reload)).props('outline size=sm')
        if api.can('wo.request'):
            ui.button('Work order', icon='build',
                      on_click=lambda: ui.navigate.to(f"/maintenance?asset={asset['id']}&new=1")
                      ).props('outline size=sm')
        if asset.get('status') != 'disposed' and api.can('asset.dispose_request'):
            ui.button('Dispose', icon='delete_sweep',
                      on_click=lambda: _disposal_dialog(asset, reload)).props('outline size=sm color=red')

    w.page_header(f"{asset['asset_tag']} — {asset['name']}",
                  f"{account_label({'name': asset.get('category_name'), 'name_en': asset.get('category_name_en')})} · {asset.get('manufacturer') or ''} "
                  f"{asset.get('model') or ''} · serial {asset.get('serial_number') or '—'}",
                  actions=actions, emoji='🏷️')

    with ui.row().classes('w-full gap-2 flex-wrap'):
        w.badge(asset['status'])
        w.badge(asset.get('criticality'), label=f"{w.humanise(asset.get('criticality'))} criticality")
        w.badge(asset.get('domain'), tone='sky', label=DOMAINS.get(asset.get('domain'), ''))
        if asset.get('use_restricted'):
            w.badge('restricted', tone='rose', label='Restricted from use')
        if not asset.get('is_capitalized'):
            w.badge('uncapitalized', tone='amber', label='Not yet capitalised')
        if asset.get('funding_source') and asset['funding_source'] != 'purchase':
            w.badge(asset['funding_source'], tone='violet',
                    label=FUNDING.get(asset['funding_source'], ''))

    if asset.get('use_restricted'):
        w.note(f"This asset is restricted from clinical use: {asset.get('restriction_reason')}. "
               'It becomes available again when the outstanding calibration or safety test passes.',
               icon='gpp_bad', tone='rose')

    _valuation(asset, currency)

    with ui.tabs().classes('w-full lc-no-print').props('align=left dense') as tabs:
        for label in ['Overview', 'Maintenance', 'Compliance', 'Depreciation', 'Movements', 'Disposal']:
            ui.tab(label)
    with ui.tab_panels(tabs, value='Overview').classes('w-full bg-transparent'):
        with ui.tab_panel('Overview').classes('p-0'):
            _overview(asset, data, currency)
        with ui.tab_panel('Maintenance').classes('p-0'):
            _maintenance_tab(data, currency)
        with ui.tab_panel('Compliance').classes('p-0'):
            _compliance_tab(asset, data)
        with ui.tab_panel('Depreciation').classes('p-0'):
            _depreciation_tab(asset, data, currency)
        with ui.tab_panel('Movements').classes('p-0'):
            _movements_tab(data)
        with ui.tab_panel('Disposal').classes('p-0'):
            _disposal_tab(data, currency, reload)


def _valuation(asset: dict, currency: str) -> None:
    with w.kpi_row():
        if framework() == 'ifrs':
            w.kpi('Cost', w.money(asset.get('ifrs_cost'), currency),
                  hint=f"Acquired {w.as_date(asset.get('acquisition_date'))}",
                  icon='request_quote', tone='slate')
            w.kpi('Net book value (IFRS)', w.money(asset.get('ifrs_nbv'), currency),
                  hint=f"{w.humanise(asset.get('ifrs_method'))} over "
                       f"{_years(asset.get('ifrs_useful_life_months'))}",
                  icon='balance', tone='violet')
        else:
            w.kpi('Cost', w.money(asset.get('ohada_cost'), currency),
                  hint=f"Acquired {w.as_date(asset.get('acquisition_date'))}",
                  icon='request_quote', tone='slate')
            w.kpi('Net book value (OHADA)', w.money(asset.get('ohada_nbv'), currency),
                  hint=f"{w.humanise(asset.get('ohada_method'))} over "
                       f"{_years(asset.get('ohada_useful_life_months'))}",
                  icon='account_balance', tone='teal')
        w.kpi('Cost of ownership', w.money(asset.get('total_cost_of_ownership'), currency),
              hint=f"Including {w.money(asset.get('total_maintenance_cost'), currency)} maintenance",
              icon='savings', tone='amber')


def _years(months) -> str:
    if not months:
        return 'no depreciation'
    months = int(months)
    return f'{months // 12} years' + (f' {months % 12} months' if months % 12 else '')


def _overview(asset: dict, data: dict, currency: str) -> None:
    left, right = w.two_column()
    with left:
        body = w.section('Identification and custody')
        with body:
            w.detail_grid([
                ('Asset tag', asset.get('asset_tag')),
                ('Barcode', asset.get('barcode_value')),
                ('RFID tag', asset.get('rfid_tag')),
                ('Serial number', asset.get('serial_number')),
                ('Manufacturer', asset.get('manufacturer')),
                ('Model', asset.get('model')),
                ('Year of manufacture', asset.get('year_of_manufacture')),
                ('Category', f"{asset.get('category_code')} — {account_label({'name': asset.get('category_name'), 'name_en': asset.get('category_name_en')})}"),
                ('Taxonomy', f"{asset.get('taxonomy_system') or ''} {asset.get('taxonomy_code') or ''}".strip()),
                ('Condition', w.humanise(asset.get('asset_condition'))),
                ('Cost centre', f"{asset.get('cost_center_code') or ''} {asset.get('cost_center_name') or ''}".strip()),
                ('Location', f"{asset.get('location_name') or ''} "
                             f"({w.humanise(asset.get('location_type'))})".strip()),
                ('Custodian', asset.get('custodian_name')),
                ('Parent asset', asset.get('parent_asset_tag')),
                ('Mobile', 'Yes' if asset.get('is_mobile') else 'Fixed in place'),
            ])

        body = w.section('Acquisition and funding')
        with body:
            w.detail_grid([
                ('Funding source', FUNDING.get(asset.get('funding_source'), asset.get('funding_source'))),
                ('Funding reference', asset.get('funding_reference')),
                ('Donor', asset.get('donor_name')),
                ('Supplier', asset.get('supplier_name')),
                ('Acquisition date', w.as_date(asset.get('acquisition_date'))),
                ('Acquisition cost', w.money(asset.get('acquisition_cost'), currency)),
                ('Incidental costs', w.money(asset.get('incidental_costs'), currency)),
                ('Capitalised', w.as_date(asset.get('capitalization_date')) or 'Not yet capitalised'),
                ('In service from', w.as_date(asset.get('in_service_date'))),
                ('Warranty', f"{w.as_date(asset.get('warranty_start'))} to "
                             f"{w.as_date(asset.get('warranty_end'))}"
                 if asset.get('warranty_end') else None),
            ])
            if asset.get('funding_source') in ('donation', 'grant'):
                w.note('Donated and grant-funded equipment is recognised at fair value with a '
                       'deferred income credit released over the asset’s life, in line with IAS 20.',
                       icon='volunteer_activism', tone='sky')

        components = data.get('components') or []
        if components:
            body = w.section('Components', 'Parts depreciated separately under IAS 16')
            with body:
                w.table([w.column('asset_tag', 'Tag', classes='lc-num'),
                         w.column('name', 'Component'),
                         w.money_column('ifrs_nbv' if framework() == 'ifrs' else 'ohada_nbv',
                                        f'NBV ({currency})', currency=currency)],
                        components, pagination=0)

    with right:
        body = w.section('Service contracts')
        contracts = data.get('service_contracts') or []
        with body:
            if not contracts:
                ui.label('No service contract covers this asset.').classes('text-xs text-slate-500')
            for contract in contracts:
                with ui.column().classes('w-full gap-0.5 pb-2 mb-2 border-b border-slate-100 last:border-0'):
                    with ui.row().classes('items-center justify-between w-full no-wrap'):
                        ui.label(contract.get('title') or contract.get('contract_no')
                                 ).classes('text-sm font-medium truncate')
                        w.badge(contract.get('status'))
                    ui.label(f"Ends {w.as_date(contract.get('end_date'))} · "
                             f"{w.money(contract.get('asset_annual_cost'), currency)} a year"
                             ).classes('text-[11px] text-slate-500')

        if asset.get('notes'):
            body = w.section('Notes')
            with body:
                ui.label(asset['notes']).classes('text-xs text-slate-600 leading-relaxed')


def _maintenance_tab(data: dict, currency: str) -> None:
    plans = data.get('plans') or []
    orders = data.get('work_orders') or []

    body = w.section('Maintenance plans', 'Generated from the category when the asset was registered')
    with body:
        if not plans:
            w.empty_state('No maintenance plan applies to this asset.', icon='event_repeat')
        else:
            for plan in plans:
                plan['interval'] = f"Every {plan.get('interval_months')} months" \
                    if plan.get('interval_months') else 'By meter reading'
            w.table([w.column('plan_type', 'Plan'), w.column('name', 'Task'),
                     w.column('interval', 'Frequency'),
                     w.column('interval_source', 'Interval from'),
                     w.date_column('next_due_date', 'Next due'),
                     w.column('priority', 'Priority')],
                    plans, pagination=0)

    body = w.section('Work order history',
                     f"{w.number(len(orders))} work orders recorded against this asset")
    with body:
        if not orders:
            w.empty_state('No work order has been raised for this asset.', icon='build')
            return
        table = w.table([w.column('wo_no', 'WO no.', classes='lc-num'),
                         w.column('wo_type', 'Type'), w.column('title', 'Work'),
                         w.column('priority', 'Priority'), w.column('status', 'Status'),
                         w.date_column('scheduled_date', 'Scheduled'),
                         w.column('assigned_to_name', 'Technician'),
                         w.money_column('total_cost', f'Cost ({currency})', currency=currency),
                         w.int_column('downtime_hours', 'Downtime (h)')],
                        orders, pagination=15)
        w.add_badge_slot(table, 'status')
        w.add_badge_slot(table, 'priority')


def _compliance_tab(asset: dict, data: dict) -> None:
    with w.kpi_row():
        w.kpi('Calibration due', w.as_date(asset.get('next_calibration_date')) or '—',
              hint='Required by the category' if asset.get('requires_calibration')
                   else 'Not required for this category',
              icon='straighten',
              tone='rose' if _overdue(asset.get('next_calibration_date')) else 'teal')
        w.kpi('Safety test due', w.as_date(asset.get('next_safety_test_date')) or '—',
              hint=asset.get('safety_test_standard') or 'Not required',
              icon='electrical_services',
              tone='rose' if _overdue(asset.get('next_safety_test_date')) else 'teal')
        w.kpi('Preventive service due', w.as_date(asset.get('next_pm_date')) or '—',
              hint='From the maintenance plan', icon='event_repeat',
              tone='amber' if _overdue(asset.get('next_pm_date')) else 'teal')

    calibrations = data.get('calibrations') or []
    body = w.section('Calibration certificates',
                     'A failed calibration quarantines the device and schedules a re-test',
                     actions=lambda: (api.can('calibration.record') and asset.get('requires_calibration')
                                      and ui.button('Record calibration', icon='add',
                                                    on_click=lambda: ui.navigate.to(
                                                        f"/compliance?asset={asset['id']}")
                                                    ).props('flat dense size=sm')))
    with body:
        if not calibrations:
            w.empty_state('No calibration has been recorded.', icon='straighten')
        else:
            for record in calibrations:
                record['performed_by'] = (record.get('provider_name')
                                          or w.humanise(record.get('performed_by_type')))
            table = w.table([w.date_column('calibration_date', 'Date'),
                             w.column('certificate_no', 'Certificate'),
                             w.column('performed_by', 'Performed by'),
                             w.column('result', 'Result'),
                             w.date_column('next_due_date', 'Next due'),
                             w.column('standard_reference', 'Standard')],
                            calibrations, pagination=10)
            w.add_badge_slot(table, 'result')

    tests = data.get('safety_tests') or []
    body = w.section('Electrical safety tests', 'IEC 60601 leakage current and earth continuity')
    with body:
        if not tests:
            w.empty_state('No safety test has been recorded.', icon='electrical_services')
        else:
            table = w.table([w.date_column('test_date', 'Date'),
                             w.column('test_standard', 'Standard'),
                             w.column('applied_part_type', 'Applied part'),
                             w.column('result', 'Result'),
                             w.date_column('next_due_date', 'Next due'),
                             w.column('tester_name', 'Tested by')],
                            tests, pagination=10)
            w.add_badge_slot(table, 'result')


def _overdue(value) -> bool:
    return bool(value) and str(value)[:10] < w.today_iso()


def _depreciation_tab(asset: dict, data: dict, currency: str) -> None:
    with w.kpi_row():
        w.kpi('OHADA accumulated', w.money(asset.get('ohada_accum_depr'), currency),
              hint=f"{w.humanise(asset.get('ohada_method'))} · "
                   f"{_years(asset.get('ohada_useful_life_months'))}",
              icon='trending_down', tone='sky')
        w.kpi('IFRS accumulated', w.money(asset.get('ifrs_accum_depr'), currency),
              hint=f"{w.humanise(asset.get('ifrs_method'))} · "
                   f"{_years(asset.get('ifrs_useful_life_months'))}",
              icon='trending_down', tone='violet')
        w.kpi('IFRS impairment', w.money(asset.get('ifrs_accum_impairment'), currency),
              hint='IAS 36 accumulated losses', icon='south', tone='rose')
        w.kpi('Revaluation surplus', w.money(asset.get('ifrs_revaluation_surplus'), currency),
              hint='IAS 16 revaluation model, held in OCI', icon='north', tone='teal')

    lines = data.get('depreciation') or []
    body = w.section('Posted depreciation', 'Both bases, most recent period first',
                     actions=lambda: (api.can('depr.view') and ui.button(
                         'Full schedule', icon='table_chart',
                         on_click=lambda: _schedule_dialog(asset, currency)).props('flat dense size=sm')))
    with body:
        if not lines:
            w.empty_state('No depreciation has been posted for this asset yet.', icon='trending_down',
                          hint='Depreciation is charged from the month the asset enters service.')
            return
        w.table([w.column('period_code', 'Period'), w.column('basis', 'Basis'),
                 w.money_column('opening_nbv', 'Opening NBV', currency=currency),
                 w.money_column('depreciation_amount', 'Charge', currency=currency),
                 w.money_column('closing_nbv', 'Closing NBV', currency=currency),
                 w.column('method', 'Method')],
                [{**line, 'id': f"{line['period_code']}-{line['basis']}"} for line in lines],
                row_key='id', pagination=24)


async def _schedule_dialog(asset: dict, currency: str) -> None:
    data = await api.safe(api.get(f"/assets/{asset['id']}/depreciation-schedule"))
    if not data:
        return
    with ui.dialog().props('maximized') as dialog, \
            ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        with ui.row().classes('items-center justify-between w-full px-6 py-3 border-b border-slate-200'):
            ui.label(f"Depreciation schedule · {asset['asset_tag']}").classes('text-base font-semibold')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')
        with ui.column().classes('flex-1 overflow-auto p-6 gap-5 w-full max-w-[1200px] mx-auto'):
            if data.get('message'):
                w.note(data['message'], icon='info', tone='amber')
            basis_info = data.get('asset') or {}
            for basis in ('ohada', 'ifrs'):
                schedule = data.get(basis) or []
                if not schedule:
                    continue
                info = basis_info.get(basis) or {}
                body = w.section(
                    f"{basis.upper()} basis",
                    f"{w.humanise(info.get('method'))} over "
                    f"{_years(info.get('useful_life_months'))} from "
                    f"{w.as_date(basis_info.get('depr_start_date'))}")
                with body:
                    w.table([w.date_column('periodEnd', 'Period end'),
                             w.money_column('openingNbv', 'Opening NBV', currency=currency),
                             w.money_column('amount', 'Charge', currency=currency),
                             w.money_column('closingAccumDepr', 'Accumulated', currency=currency),
                             w.money_column('closingNbv', 'Closing NBV', currency=currency),
                             w.column('monthsCharged', 'Months', align='right', classes='lc-num')],
                            [{**row, 'id': row['periodEnd']} for row in schedule],
                            pagination=0, height='40vh')
    dialog.open()


def _movements_tab(data: dict) -> None:
    movements = data.get('movements') or []
    body = w.section('Movement and custody history',
                     'Every transfer between wards, custodians and locations')
    with body:
        if not movements:
            w.empty_state('This asset has not moved since it was registered.', icon='swap_horiz')
            return
        for move in movements:
            move['from'] = ' · '.join(filter(None, [move.get('from_location'),
                                                    move.get('from_cost_center'),
                                                    move.get('from_custodian')])) or '—'
            move['to'] = ' · '.join(filter(None, [move.get('to_location'),
                                                  move.get('to_cost_center'),
                                                  move.get('to_custodian')])) or '—'
        table = w.table([w.date_column('movement_date', 'Date'),
                         w.column('movement_type', 'Type'),
                         w.column('from', 'From'), w.column('to', 'To'),
                         w.column('reason', 'Reason'),
                         w.column('recorded_by_name', 'Recorded by')],
                        movements, pagination=20)
        w.add_badge_slot(table, 'movement_type',
                         tones={'transfer': 'sky', 'loan': 'violet', 'return': 'teal',
                                'status_change': 'amber', 'stocktake': 'slate'})


def _disposal_tab(data: dict, currency: str, reload) -> None:
    disposal = data.get('disposal')
    asset = data['asset']
    body = w.section('Disposal')
    with body:
        if not disposal:
            w.empty_state('No disposal has been requested for this asset.', icon='delete_sweep',
                          hint='A disposal request must be approved before the asset leaves the '
                               'register and the gain or loss is posted.')
            return
        w.detail_grid([
            ('Disposal number', disposal.get('disposal_no')),
            ('Status', w.humanise(disposal.get('status'))),
            ('Method', DISPOSAL_METHODS.get(disposal.get('method'), disposal.get('method'))),
            ('Reason', disposal.get('reason')),
            ('Requested by', disposal.get('requested_by_name')),
            ('Requested on', w.as_date(disposal.get('request_date'))),
            ('Approved by', disposal.get('approved_by_name')),
            ('Disposal date', w.as_date(disposal.get('disposal_date'))),
            ('Proceeds', w.money(disposal.get('proceeds'), currency)),
            ('Costs of disposal', w.money(disposal.get('disposal_costs'), currency)),
            ('Net book value at disposal', w.money(disposal.get('ohada_nbv_at_disposal'), currency)),
            ('Gain or loss (OHADA)', w.money(disposal.get('ohada_gain_loss'), currency)),
            ('Decontaminated', 'Yes' if disposal.get('decontamination_done') else 'No'),
            ('Data wiped', 'Yes' if disposal.get('data_wiped') else 'No'),
            ('Certificate', disposal.get('certificate_no')),
        ])
        if disposal.get('status') == 'requested' and api.can('asset.dispose_approve'):
            with ui.row().classes('w-full gap-2 pt-3'):
                ui.button('Approve', icon='check',
                          on_click=lambda: _decide(disposal, True, reload)).props('unelevated')
                ui.button('Reject', icon='close',
                          on_click=lambda: _decide(disposal, False, reload)).props('outline color=red')
        if disposal.get('status') == 'approved' and api.can('asset.dispose_approve'):
            w.note('Completing the disposal removes the asset from the register and posts the gain '
                   'or loss on disposal to the ledger.', icon='post_add', tone='amber')
            ui.button('Complete the disposal', icon='task_alt',
                      on_click=lambda: _complete(disposal, reload)).props('unelevated')


async def _decide(disposal: dict, approve: bool, reload) -> None:
    result = await api.safe(api.post(f"/disposals/{disposal['id']}/decide",
                                     {'approve': approve, 'reason': None}))
    if result:
        ui.notify(f"Disposal {result['disposal']['status']}.", type='positive', position='top')
        await reload()


async def _complete(disposal: dict, reload) -> None:
    result = await api.safe(api.post(f"/disposals/{disposal['id']}/complete", {}))
    if result:
        ui.notify('Disposal completed and posted to the ledger.', type='positive', position='top')
        await reload()


# --- dialogs ----------------------------------------------------------------


def _scan_dialog() -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[420px] max-w-full'):
        ui.label('Find an asset by its tag').classes('text-base font-semibold')
        ui.label('Scan the QR or barcode with a handheld reader, or type the tag.'
                 ).classes('text-xs text-slate-500 mb-3')
        code = ui.input('Scanned code').props('outlined dense autofocus').classes('w-full')

        async def submit() -> None:
            if not code.value:
                return
            result = await api.safe(api.get(f'/assets/scan/{code.value.strip()}'))
            if result:
                dialog.close()
                ui.navigate.to(f"/assets/{result['asset']['id']}")

        code.on('keyup.enter', submit)
        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Find', icon='search', on_click=submit).props('unelevated')
    dialog.open()


async def _tag_dialog(asset: dict) -> None:
    data = await api.safe(api.get(f"/assets/{asset['id']}/tag", format='png'))
    if not data:
        return
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-6 w-[400px] max-w-full items-center'):
        with ui.column().classes('items-center gap-2 w-full border border-slate-300 rounded-xl p-5'):
            ui.label(api.user().get('org_name', '')).classes('text-[10px] uppercase tracking-wider '
                                                             'text-slate-500')
            ui.image(data['qr_data_url']).classes('w-44 h-44')
            ui.label(data['asset_tag']).classes('lc-num text-lg font-bold')
            ui.label(data['name']).classes('text-xs text-center text-slate-700')
            ui.label(f"{data.get('cost_center_name') or ''} · {data.get('location_name') or ''}"
                     ).classes('text-[10px] text-slate-500 text-center')
            if data.get('serial_number'):
                ui.label(f"S/N {data['serial_number']}").classes('lc-num text-[10px] text-slate-500')
        with ui.row().classes('w-full justify-end gap-2 mt-4 lc-no-print'):
            ui.button('Close', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Print', icon='print',
                      on_click=lambda: ui.run_javascript('window.print()')).props('unelevated')
    dialog.open()


def _capitalize_dialog(asset: dict, reload) -> None:
    currency = api.user().get('functional_currency', 'XAF')
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label(f"Capitalise {asset['asset_tag']}").classes('text-base font-semibold')
        ui.label('This posts the asset into class 2 and recognises the liability or payment. '
                 'The register and the ledger move together.').classes('text-xs text-slate-500 mb-3')
        w.detail_grid([
            ('Acquisition cost', w.money(asset.get('acquisition_cost'), currency)),
            ('Incidental costs', w.money(asset.get('incidental_costs'), currency)),
            ('Amount to capitalise',
             w.money(float(asset.get('acquisition_cost') or 0)
                     + float(asset.get('incidental_costs') or 0), currency)),
        ], columns=1)
        date = ui.input('Capitalisation date', value=str(asset.get('acquisition_date') or
                                                         w.today_iso())[:10]) \
            .props('outlined dense type=date').classes('w-full')
        vat = ui.number('Recoverable VAT', value=0, min=0, format='%.2f') \
            .props('outlined dense').classes('w-full')
        credit = ui.input('Credit account code', placeholder='Defaults to the supplier payable') \
            .props('outlined dense').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f"/assets/{asset['id']}/capitalize", {
                'date': date.value, 'recoverableVat': vat.value or 0,
                'creditAccountCode': credit.value or None,
            }))
            if result:
                ui.notify(f"Capitalised with entry {result['entry']['entry_no']}.",
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Capitalise', icon='post_add', on_click=submit).props('unelevated')
    dialog.open()


def _commission_dialog(asset: dict, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[480px] max-w-full'):
        ui.label(f"Commission {asset['asset_tag']}").classes('text-base font-semibold')
        ui.label('Depreciation starts from the in-service date, and the compliance clock starts '
                 'with it.').classes('text-xs text-slate-500 mb-3')
        in_service = ui.input('In service from', value=w.today_iso()) \
            .props('outlined dense type=date').classes('w-full')
        commissioned = ui.input('Commissioning date', value=w.today_iso()) \
            .props('outlined dense type=date').classes('w-full')
        calibration = ui.switch('Initial calibration completed').props('dense')
        safety = ui.switch('Electrical safety check completed').props('dense')
        notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f"/assets/{asset['id']}/commission", {
                'inServiceDate': in_service.value, 'commissioningDate': commissioned.value,
                'initialCalibrationDone': calibration.value, 'safetyCheckDone': safety.value,
                'notes': notes.value or None,
            }))
            if result:
                ui.notify('Asset commissioned and now in service.', type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Commission', icon='play_circle', on_click=submit).props('unelevated')
    dialog.open()


def _move_dialog(asset: dict, reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label(f"Move {asset['asset_tag']}").classes('text-base font-semibold')
        ui.label(f"Currently in {asset.get('location_name') or 'no location'}, held by "
                 f"{asset.get('custodian_name') or 'nobody in particular'}."
                 ).classes('text-xs text-slate-500 mb-3')
        kind = ui.select({'transfer': 'Permanent transfer', 'loan': 'Loan to another ward',
                          'return': 'Return from loan', 'stocktake': 'Stocktake confirmation'},
                         value='transfer', label='Movement type') \
            .props('outlined dense').classes('w-full')
        date = ui.input('Date', value=w.today_iso()).props('outlined dense type=date').classes('w-full')
        location = ui.select({}, label='To location', with_input=True) \
            .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
        centre = ui.select({}, label='To cost centre', with_input=True) \
            .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
        expected = ui.input('Expected return (loans)').props('outlined dense type=date').classes('w-full')
        reason = ui.input('Reason').props('outlined dense').classes('w-full')

        async def submit() -> None:
            if not (location.value or centre.value):
                ui.notify('Give a destination location or cost centre.', type='warning', position='top')
                return
            result = await api.safe(api.post(f"/assets/{asset['id']}/move", {
                'movementType': kind.value, 'movementDate': date.value,
                'toLocationId': location.value, 'toCostCenterId': centre.value,
                'expectedReturnDate': expected.value or None, 'reason': reason.value or None,
            }))
            if result:
                ui.notify('Movement recorded.', type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Record the movement', on_click=submit).props('unelevated')

    async def load() -> None:
        locations = await api.safe(api.get('/asset-locations'), notify=False)
        if locations:
            location.set_options({l['id']: f"{l['code']} — {l['name']}" for l in locations['rows']})
        centres = await api.safe(api.get('/cost-centers'), notify=False)
        if centres:
            centre.set_options({c['id']: f"{c['code']} — {c['name']}" for c in centres['rows']})

    dialog.open()
    ui.timer(0.01, load, once=True)


def _disposal_dialog(asset: dict, reload) -> None:
    biomedical = asset.get('domain') == 'biomedical'
    it_equipment = asset.get('domain') == 'it_office'
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[560px] max-w-full lc-scroll') \
            .style('max-height: 88vh'):
        ui.label(f"Request disposal of {asset['asset_tag']}").classes('text-base font-semibold')
        ui.label('The request must be approved before the asset leaves the register.'
                 ).classes('text-xs text-slate-500 mb-3')
        method = ui.select(DISPOSAL_METHODS,
                           value='biomedical_waste' if biomedical else 'scrap',
                           label='Method').props('outlined dense').classes('w-full')
        reason = ui.textarea('Reason for disposal').props('outlined dense rows=2').classes('w-full')
        with ui.row().classes('w-full gap-3 no-wrap'):
            proceeds = ui.number('Expected proceeds', value=0, min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1')
            costs = ui.number('Costs of disposal', value=0, min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1')
        recipient = ui.input('Buyer, recipient or waste handler').props('outlined dense').classes('w-full')
        certificate = ui.input('Certificate number').props('outlined dense').classes('w-full')
        decontaminated = ui.switch('Decontaminated').props('dense')
        wiped = ui.switch('Data wiped').props('dense')
        notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

        if biomedical:
            w.note('Biomedical equipment cannot be disposed of until decontamination is recorded.',
                   icon='sanitizer', tone='amber')
        if it_equipment:
            w.note('IT equipment cannot be disposed of until the data wipe is recorded.',
                   icon='delete_forever', tone='amber')

        async def submit() -> None:
            if len((reason.value or '').strip()) < 5:
                ui.notify('Give a reason of at least five characters.', type='warning', position='top')
                return
            result = await api.safe(api.post(f"/assets/{asset['id']}/disposal", {
                'method': method.value, 'reason': reason.value.strip(),
                'proceeds': proceeds.value or 0, 'disposalCosts': costs.value or 0,
                'buyerName': recipient.value or None if method.value == 'sale' else None,
                'recipientName': recipient.value or None if method.value == 'donation' else None,
                'wasteHandler': recipient.value or None
                if method.value in ('scrap', 'biomedical_waste') else None,
                'decontaminationDone': decontaminated.value, 'dataWiped': wiped.value,
                'certificateNo': certificate.value or None, 'notes': notes.value or None,
            }))
            if result:
                ui.notify(f"Disposal {result['disposal']['disposal_no']} requested.",
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Request disposal', on_click=submit).props('unelevated color=red')
    dialog.open()


def _register_dialog(categories: list[dict], locations: list[dict], centres: list[dict],
                     reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[720px] max-w-full'):
        ui.label('Register an asset').classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 70vh'):
            w.note('The category decides the depreciation accounts, the useful lives on both bases, '
                   'and whether calibration and safety testing are required. Maintenance plans are '
                   'created automatically from it.', icon='category')
            name = ui.input('Asset name').props('outlined dense').classes('w-full')
            category = ui.select({c['id']: f"{c['code']} — {account_label(c)}" for c in categories},
                                 label='Category', with_input=True) \
                .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                manufacturer = ui.input('Manufacturer').props('outlined dense').classes('flex-1')
                model = ui.input('Model').props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                serial = ui.input('Serial number').props('outlined dense').classes('flex-1')
                year = ui.number('Year of manufacture', format='%d', min=1900, max=2100) \
                    .props('outlined dense').classes('w-44')
            with ui.row().classes('w-full gap-3 no-wrap'):
                centre = ui.select({c['id']: f"{c['code']} — {c['name']}" for c in centres},
                                   label='Cost centre').props('outlined dense').classes('flex-1')
                location = ui.select({l['id']: f"{l['code']} — {l['name']}" for l in locations},
                                     label='Location').props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                criticality = ui.select({'low': 'Low', 'medium': 'Medium', 'high': 'High',
                                         'critical': 'Critical — patient care depends on it'},
                                        value='medium', label='Criticality') \
                    .props('outlined dense').classes('flex-1')
                condition = ui.select({'new': 'New', 'good': 'Good', 'fair': 'Fair', 'poor': 'Poor'},
                                      value='new', label='Condition') \
                    .props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                funding = ui.select(FUNDING, value='purchase', label='Funding source') \
                    .props('outlined dense').classes('flex-1')
                acquired = ui.input('Acquisition date', value=w.today_iso()) \
                    .props('outlined dense type=date').classes('flex-1')
            donor = ui.input('Donor or grant reference').props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                cost = ui.number('Acquisition cost', value=0, min=0, format='%.2f') \
                    .props('outlined dense').classes('flex-1')
                incidental = ui.number('Incidental costs', value=0, min=0, format='%.2f') \
                    .props('outlined dense').classes('flex-1').tooltip(
                        'Delivery, installation and commissioning — part of cost under IAS 16')
            notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

        async def submit() -> None:
            if not name.value or not category.value:
                ui.notify('A name and a category are required.', type='warning', position='top')
                return
            result = await api.safe(api.post('/assets', {
                'name': name.value, 'categoryId': category.value,
                'manufacturer': manufacturer.value or None, 'model': model.value or None,
                'serialNumber': serial.value or None,
                'yearOfManufacture': int(year.value) if year.value else None,
                'costCenterId': centre.value, 'locationId': location.value,
                'criticality': criticality.value, 'condition': condition.value,
                'fundingSource': funding.value, 'acquisitionDate': acquired.value,
                'donorName': donor.value or None,
                'acquisitionCost': cost.value or 0, 'incidentalCosts': incidental.value or 0,
                'notes': notes.value or None,
            }))
            if result:
                ui.notify(f"Registered as {result['asset']['asset_tag']}.",
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Register asset', icon='add', on_click=submit).props('unelevated')
    dialog.open()
