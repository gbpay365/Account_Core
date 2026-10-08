"""
Two screens for the people who actually touch the equipment.

`/compliance` is the calibration and electrical-safety register, with the forms
that issue a certificate. `/worklist` is a phone-shaped view of a technician's
own jobs — big targets, one column, no tables.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import t
from ..ui import chrome, widgets as w
from ..ui.shell import page

CAL_RESULTS = {'pass': 'Pass', 'pass_with_adjustment': 'Pass after adjustment',
               'fail': 'Fail', 'indeterminate': 'Indeterminate'}

TEST_RESULTS = {'pass': 'Pass', 'conditional': 'Conditional pass', 'fail': 'Fail'}

PERFORMED_BY = {'internal': 'In-house biomedical team', 'manufacturer': 'Manufacturer',
                'third_party': 'Third-party service company',
                'accredited_lab': 'Accredited calibration laboratory'}

APPLIED_PART = {'none': 'No applied part', 'B': 'Type B', 'BF': 'Type BF',
                'CF': 'Type CF (direct cardiac)'}


@page('/compliance', title='Calibration and safety', permissions=('calibration.view',))
async def compliance_page(asset: str = '') -> None:

    def actions() -> None:
        if api.can('calibration.record'):
            ui.button(t('cal.record'), icon='straighten',
                      on_click=lambda: _calibration_dialog(reload, int(asset) if asset else None)
                      ).props('unelevated size=sm')
        if api.can('safety.record'):
            ui.button(t('cal.record_safety'), icon='electrical_services',
                      on_click=lambda: _safety_dialog(reload, int(asset) if asset else None)
                      ).props('outline size=sm')

    w.page_header(t('cal.title'), t('cal.sub'), actions=actions, emoji=chrome.PAGE['cal.title'])

    async def reload() -> None:
        container.clear()
        overdue = await api.safe(api.get('/reports/compliance'), notify=False) \
            if api.can('report.asset') else None
        calibrations = await api.safe(api.get('/calibrations', pageSize=200))
        tests = await api.safe(api.get('/safety-tests', pageSize=200), notify=False)
        with container:
            if overdue:
                _compliance_summary(overdue)
            with ui.tabs().classes('w-full lc-no-print').props('align=left dense') as tabs:
                ui.tab(t('cal.tab_cal'))
                ui.tab(t('cal.tab_safety'))
                if overdue:
                    ui.tab(t('cal.tab_overdue'))
            with ui.tab_panels(tabs, value=t('cal.tab_cal')).classes('w-full bg-transparent'):
                with ui.tab_panel(t('cal.tab_cal')).classes('p-0'):
                    _calibration_table(calibrations)
                with ui.tab_panel(t('cal.tab_safety')).classes('p-0'):
                    _safety_table(tests)
                if overdue:
                    with ui.tab_panel(t('cal.tab_overdue')).classes('p-0'):
                        _overdue_table(overdue)

    container = ui.column().classes('w-full gap-5')
    await reload()

    if asset:
        _calibration_dialog(reload, int(asset))


def _compliance_summary(data: dict) -> None:
    coverage = data.get('calibration_coverage') or []
    requiring = sum(int(row.get('assets_requiring') or 0) for row in coverage)
    overdue_cal = sum(int(row.get('overdue') or 0) for row in coverage)
    never = sum(int(row.get('never_calibrated') or 0) for row in coverage)
    restricted = int(data.get('restricted') or 0)

    with w.kpi_row():
        w.kpi('Devices needing calibration', w.number(requiring),
              hint='Required by their category', icon='straighten', tone='slate')
        w.kpi('Calibration overdue', w.number(overdue_cal),
              hint='Certificate has lapsed', icon='event_busy',
              tone='rose' if overdue_cal else 'teal')
        w.kpi('Never calibrated', w.number(never),
              hint='No certificate has ever been issued', icon='help_outline',
              tone='amber' if never else 'teal')
        w.kpi('Restricted from use', w.number(restricted),
              hint='Cannot be used on patients', icon='gpp_bad',
              tone='rose' if restricted else 'teal')
        # The date matters: the same measure read at a later date picks up
        # certificates that lapse between now and then.
        w.kpi('Compliance rate', w.percent(data.get('overall_compliance_pct')),
              hint=f"Current certificates as at {w.as_date(data.get('as_of'))}",
              icon='verified_user',
              tone='teal' if float(data.get('overall_compliance_pct') or 0) >= 95 else 'amber')


def _calibration_table(data: dict | None) -> None:
    rows = (data or {}).get('rows') or []
    body = w.section('Calibration certificates',
                     'A failed calibration quarantines the device and books a re-test in 30 days')
    with body:
        if not rows:
            w.empty_state('No calibration has been recorded yet.', icon='straighten')
            return
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
            row['by'] = row.get('provider_name') or row.get('recorded_by_name')
        table = w.table([
            w.date_column('calibration_date', 'Date'),
            w.column('asset', 'Asset'),
            w.column('certificate_no', 'Certificate'),
            w.column('parameter_tested', 'Parameter'),
            w.column('measured_value', 'Measured'),
            w.column('nominal_value', 'Nominal'),
            w.column('tolerance', 'Tolerance'),
            w.column('result', 'Result'),
            w.date_column('next_due_date', 'Next due'),
            w.column('by', 'Performed by'),
        ], rows, height='58vh', pagination=0,
            on_row_click=lambda row: ui.navigate.to(f"/assets/{row['asset_id']}"))
        w.add_badge_slot(table, 'result')


def _safety_table(data: dict | None) -> None:
    rows = (data or {}).get('rows') or []
    body = w.section('Electrical safety tests',
                     'Earth continuity, insulation resistance and leakage currents to IEC 60601')
    with body:
        if not rows:
            w.empty_state('No safety test has been recorded yet.', icon='electrical_services')
            return
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
        table = w.table([
            w.date_column('test_date', 'Date'),
            w.column('asset', 'Asset'),
            w.column('test_standard', 'Standard'),
            w.column('applied_part_type', 'Applied part'),
            w.column('earth_continuity_ohm', 'Earth (Ω)', align='right', classes='lc-num'),
            w.column('insulation_resistance_mohm', 'Insulation (MΩ)', align='right', classes='lc-num'),
            w.column('earth_leakage_ua', 'Earth leakage (µA)', align='right', classes='lc-num'),
            w.column('patient_leakage_ua', 'Patient leakage (µA)', align='right', classes='lc-num'),
            w.column('result', 'Result'),
            w.date_column('next_due_date', 'Next due'),
        ], rows, height='58vh', pagination=0,
            on_row_click=lambda row: ui.navigate.to(f"/assets/{row['asset_id']}"))
        w.add_badge_slot(table, 'result')


def _overdue_table(data: dict) -> None:
    rows = data.get('overdue') or []
    body = w.section('Overdue and restricted equipment',
                     'What must be dealt with before these devices can be used again')
    with body:
        if not rows:
            w.empty_state('Nothing is overdue.', icon='verified',
                          hint='Every device holds a current certificate.')
            return
        today = w.today_iso()
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('name')}"
            row['domain_label'] = w.humanise(row.get('domain'))
            row['issue'] = ', '.join(
                label for label, field in (('Calibration', 'next_calibration_date'),
                                           ('Safety test', 'next_safety_test_date'),
                                           ('Preventive service', 'next_pm_date'))
                if row.get(field) and str(row[field])[:10] < today) or '—'
            row['state'] = 'Restricted' if row.get('use_restricted') else 'Overdue'
        table = w.table([
            w.column('asset', 'Asset'),
            w.column('domain_label', 'Domain'),
            w.column('issue', 'What is outstanding'),
            w.date_column('next_calibration_date', 'Calibration due'),
            w.date_column('next_safety_test_date', 'Safety test due'),
            w.date_column('next_pm_date', 'Service due'),
            w.column('state', 'State'),
            w.column('restriction_reason', 'Restriction'),
        ], rows, height='58vh', pagination=0,
            on_row_click=lambda row: ui.navigate.to(f"/assets/{row['id']}"))
        w.add_badge_slot(table, 'state', tones={'restricted': 'rose', 'overdue': 'amber'})


def _calibration_dialog(reload, asset_id: int | None = None) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[640px] max-w-full'):
        ui.label('Record a calibration').classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 70vh'):
            asset = ui.select({}, label='Device', with_input=True, value=asset_id) \
                .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                date = ui.input('Calibration date', value=w.today_iso()) \
                    .props('outlined dense type=date').classes('flex-1')
                interval = ui.number('Re-test interval (months)', value=12, min=1, max=120,
                                     format='%d').props('outlined dense').classes('flex-1')
            performed = ui.select(PERFORMED_BY, value='internal', label='Performed by') \
                .props('outlined dense').classes('w-full')
            provider = ui.input('Provider or laboratory name').props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                standard = ui.input('Standard reference', placeholder='e.g. ISO 17025') \
                    .props('outlined dense').classes('flex-1')
                reference = ui.input('Reference equipment used').props('outlined dense').classes('flex-1')
            parameter = ui.input('Parameter tested', placeholder='e.g. flow rate, SpO₂ accuracy') \
                .props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                measured = ui.input('Measured value').props('outlined dense').classes('flex-1')
                nominal = ui.input('Nominal value').props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                deviation = ui.number('Deviation', format='%.4f').props('outlined dense').classes('flex-1')
                tolerance = ui.input('Tolerance', placeholder='e.g. ±2%') \
                    .props('outlined dense').classes('flex-1')
            result = ui.select(CAL_RESULTS, value='pass', label='Result') \
                .props('outlined dense').classes('w-full')
            adjustment = ui.switch('An adjustment was made').props('dense')
            with ui.row().classes('w-full gap-3 no-wrap'):
                certificate = ui.input('Certificate number').props('outlined dense').classes('flex-1')
                cost = ui.number('Cost', value=0, min=0, format='%.2f') \
                    .props('outlined dense').classes('flex-1')
            notes = ui.textarea('Notes').props('outlined dense rows=2').classes('w-full')

            hint = ui.column().classes('w-full')

            def show_hint() -> None:
                hint.clear()
                with hint:
                    if result.value == 'fail':
                        w.note('A failed calibration quarantines the device immediately, restricts '
                               'its use, and schedules a re-test in thirty days.',
                               icon='gpp_bad', tone='rose')
                    elif result.value == 'pass':
                        w.note('A pass releases any restriction this certificate was holding, '
                               'unless another job still has the device offline.',
                               icon='verified', tone='emerald')
            result.on_value_change(show_hint)
            show_hint()

        async def submit() -> None:
            if not asset.value:
                ui.notify('Choose the device.', type='warning', position='top')
                return
            payload = await api.safe(api.post(f'/assets/{asset.value}/calibrations', {
                'calibrationDate': date.value, 'performedByType': performed.value,
                'providerName': provider.value or None,
                'standardReference': standard.value or None,
                'referenceEquipment': reference.value or None,
                'parameterTested': parameter.value or None,
                'measuredValue': measured.value or None, 'nominalValue': nominal.value or None,
                'deviation': deviation.value, 'tolerance': tolerance.value or None,
                'result': result.value, 'adjustmentMade': adjustment.value,
                'intervalMonths': int(interval.value) if interval.value else None,
                'certificateNo': certificate.value or None, 'cost': cost.value or 0,
                'notes': notes.value or None,
            }))
            if payload:
                ui.notify('Calibration recorded. Next due '
                          f"{w.as_date(payload.get('next_due_date'))}."
                          + (' The device is restricted from use.'
                             if payload.get('restricted') else ''),
                          type='warning' if payload.get('restricted') else 'positive',
                          position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Record the calibration', on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/assets', domain='biomedical', pageSize=500), notify=False)
        if data:
            asset.set_options({a['id']: f"{a['asset_tag']} — {a['name']}" for a in data['rows']},
                              value=asset_id)

    dialog.open()
    ui.timer(0.01, load, once=True)


def _safety_dialog(reload, asset_id: int | None = None) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[640px] max-w-full'):
        ui.label('Record an electrical safety test').classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 70vh'):
            w.note('IEC 60601-1 limits depend on the applied part type: earth leakage below '
                   '500 µA, and patient leakage below 10 µA for a type CF part.',
                   icon='bolt', tone='sky')
            asset = ui.select({}, label='Device', with_input=True, value=asset_id) \
                .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                date = ui.input('Test date', value=w.today_iso()) \
                    .props('outlined dense type=date').classes('flex-1')
                interval = ui.number('Re-test interval (months)', value=12, min=1, max=120,
                                     format='%d').props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                standard = ui.input('Standard', value='IEC 60601-1') \
                    .props('outlined dense').classes('flex-1')
                applied = ui.select(APPLIED_PART, value='none', label='Applied part type') \
                    .props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                earth = ui.number('Earth continuity (Ω)', min=0, format='%.3f') \
                    .props('outlined dense').classes('flex-1')
                insulation = ui.number('Insulation resistance (MΩ)', min=0, format='%.2f') \
                    .props('outlined dense').classes('flex-1')
            with ui.row().classes('w-full gap-3 no-wrap'):
                earth_leak = ui.number('Earth leakage (µA)', min=0, format='%.1f') \
                    .props('outlined dense').classes('flex-1')
                enclosure = ui.number('Enclosure leakage (µA)', min=0, format='%.1f') \
                    .props('outlined dense').classes('flex-1')
                patient = ui.number('Patient leakage (µA)', min=0, format='%.1f') \
                    .props('outlined dense').classes('flex-1')
            visual = ui.switch('Visual inspection passed', value=True).props('dense')
            functional = ui.switch('Functional test passed', value=True).props('dense')
            result = ui.select(TEST_RESULTS, value='pass', label='Result') \
                .props('outlined dense').classes('w-full')
            defects = ui.textarea('Defects found').props('outlined dense rows=2').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                tester = ui.input('Tester name').props('outlined dense').classes('flex-1')
                equipment = ui.input('Test equipment used').props('outlined dense').classes('flex-1')
            certificate = ui.input('Certificate number').props('outlined dense').classes('w-full')

            hint = ui.column().classes('w-full')

            def show_hint() -> None:
                hint.clear()
                with hint:
                    if result.value == 'fail':
                        w.note('A failed safety test takes the device out of service immediately. '
                               'It cannot be used on patients until it passes.',
                               icon='dangerous', tone='rose')
            result.on_value_change(show_hint)

        async def submit() -> None:
            if not asset.value:
                ui.notify('Choose the device.', type='warning', position='top')
                return
            payload = await api.safe(api.post(f'/assets/{asset.value}/safety-tests', {
                'testDate': date.value, 'testStandard': standard.value or None,
                'appliedPartType': applied.value,
                'earthContinuityOhm': earth.value, 'insulationResistanceMohm': insulation.value,
                'earthLeakageUa': earth_leak.value, 'enclosureLeakageUa': enclosure.value,
                'patientLeakageUa': patient.value,
                'visualInspectionOk': visual.value, 'functionalTestOk': functional.value,
                'result': result.value, 'defectsFound': defects.value or None,
                'testerName': tester.value or None, 'testEquipment': equipment.value or None,
                'certificateNo': certificate.value or None,
                'intervalMonths': int(interval.value) if interval.value else None,
            }))
            if payload:
                ui.notify('Safety test recorded. Next due '
                          f"{w.as_date(payload.get('next_due_date'))}."
                          + (' The device is out of service.' if payload.get('restricted') else ''),
                          type='warning' if payload.get('restricted') else 'positive',
                          position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Record the test', on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/assets', domain='biomedical', pageSize=500), notify=False)
        if data:
            asset.set_options({a['id']: f"{a['asset_tag']} — {a['name']}" for a in data['rows']},
                              value=asset_id)

    dialog.open()
    ui.timer(0.01, load, once=True)


# --- the technician's worklist ----------------------------------------------


@page('/worklist', title='My worklist', permissions=('wo.execute', 'wo.request', 'errand.execute', 'shop.buy'))
async def worklist_page() -> None:
    """
    Built for a phone held in one hand on a ward round: a single column, large
    targets, and only the jobs this person has to deal with.
    """
    user = api.user()
    w.page_header(t('wl.title'), t('wl.sub', name=user.get('full_name', '')),
                  emoji=chrome.PAGE['wl.title'])
    container = ui.column().classes('w-full max-w-[560px] mx-auto gap-4')

    async def reload() -> None:
        container.clear()
        wo = await api.safe(api.get('/work-orders', mine=True, openOnly=True, pageSize=100), notify=False) \
            if api.can('wo.view') else {'rows': []}
        errands = await api.safe(api.get('/errands', mine=True, openOnly=True, pageSize=100), notify=False) \
            if api.can('errand.view') else {'rows': []}
        lists = await api.safe(api.get('/shopping-lists', mine=True, openOnly=True, pageSize=50), notify=False) \
            if api.can('shop.view') else {'rows': []}
        rows = (wo or {}).get('rows') or []
        errand_rows = (errands or {}).get('rows') or []
        list_rows = (lists or {}).get('rows') or []
        today = w.today_iso()
        with container:
            with ui.row().classes('w-full gap-3'):
                w.kpi(t('wl.open'), w.number(len(rows) + len(errand_rows)), icon='build', tone='teal')
                w.kpi(t('wl.past_due'), w.number(
                    sum(1 for r in rows if r.get('is_past_due'))
                    + sum(1 for r in errand_rows if r.get('is_past_due'))
                ), icon='schedule',
                      tone='rose' if any(r.get('is_past_due') for r in rows + errand_rows) else 'slate')
                w.kpi(t('nav.shopping'), w.number(len(list_rows)), icon='shopping_cart',
                      tone='violet' if list_rows else 'slate')

            if api.can('asset.view'):
                ui.button('Scan an asset tag', icon='qr_code_scanner',
                          on_click=_scan).props('unelevated size=lg').classes('w-full')

            if not rows and not errand_rows and not list_rows:
                w.empty_state('Nothing is assigned to you.', icon='beach_access',
                              hint='New jobs will appear here as soon as they are assigned.')
                return

            for row in errand_rows:
                _errand_card(row, today, reload)
            for row in list_rows:
                _list_card(row, reload)
            for row in rows:
                _job_card(row, today, reload)

    await reload()


def _errand_card(job: dict, today: str, reload) -> None:
    urgent = job.get('priority') in ('urgent', 'high') or job.get('is_past_due')
    card = ui.element('div').classes(
        'lc-card p-4 w-full cursor-pointer active:scale-[0.99] transition'
        + (' border-l-4 border-l-rose-500' if urgent else ''))
    card.on('click', lambda jid=job['id']: _open_errand(jid, reload))
    with card:
        with ui.row().classes('w-full items-start justify-between gap-2 no-wrap'):
            with ui.column().classes('gap-0.5 min-w-0'):
                ui.label(job.get('title', '')).classes('text-[15px] font-semibold text-slate-900')
                ui.label(job.get('location_note') or job.get('vehicle_note') or t('nav.errands')
                         ).classes('text-xs text-slate-600 truncate')
            ui.label(job.get('errand_no', '')).classes('lc-num text-[11px] text-slate-400 shrink-0')
        with ui.row().classes('w-full items-center gap-2 pt-3 flex-wrap'):
            w.badge(job.get('kind'))
            w.badge(job.get('priority'))
            w.badge(job.get('status'))
            if job.get('due_date'):
                overdue = str(job['due_date'])[:10] < today
                w.badge('due', tone='rose' if overdue else 'slate',
                        label=('Overdue since ' if overdue else 'Due ')
                              + w.as_date(job['due_date']))


async def _open_errand(errand_id: int, reload) -> None:
    from .services import _errand_dialog
    await _errand_dialog(errand_id, reload)


async def _open_list(list_id: int, reload) -> None:
    from .services import _shop_dialog
    await _shop_dialog(list_id, reload)


def _list_card(lst: dict, reload) -> None:
    card = ui.element('div').classes('lc-card p-4 w-full cursor-pointer active:scale-[0.99] transition')
    card.on('click', lambda lid=lst['id']: _open_list(lid, reload))
    with card:
        with ui.row().classes('w-full items-start justify-between gap-2 no-wrap'):
            with ui.column().classes('gap-0.5 min-w-0'):
                ui.label(lst.get('title', '')).classes('text-[15px] font-semibold text-slate-900')
                ui.label(lst.get('destination') or t('nav.shopping')
                         ).classes('text-xs text-slate-600 truncate')
            ui.label(lst.get('list_no', '')).classes('lc-num text-[11px] text-slate-400 shrink-0')
        with ui.row().classes('w-full items-center gap-2 pt-3 flex-wrap'):
            w.badge(lst.get('status'))
            w.badge('items', tone='slate',
                    label=f"{int(lst.get('bought_count') or 0)} / {int(lst.get('item_count') or 0)}")


def _job_card(job: dict, today: str, reload) -> None:
    urgent = job.get('priority') == 'emergency' or job.get('is_past_due')
    card = ui.element('div').classes(
        'lc-card p-4 w-full cursor-pointer active:scale-[0.99] transition'
        + (' border-l-4 border-l-rose-500' if urgent else ''))
    card.on('click', lambda: _job_dialog(job, reload))
    with card:
        with ui.row().classes('w-full items-start justify-between gap-2 no-wrap'):
            with ui.column().classes('gap-0.5 min-w-0'):
                ui.label(job.get('title', '')).classes('text-[15px] font-semibold text-slate-900')
                ui.label(f"{job.get('asset_tag')} — {job.get('asset_name')}"
                         ).classes('text-xs text-slate-600 truncate')
                ui.label(f"{job.get('location_name') or 'no location'} · "
                         f"{job.get('cost_center_name') or ''}"
                         ).classes('text-[11px] text-slate-500 truncate')
            ui.label(job['wo_no']).classes('lc-num text-[11px] text-slate-400 shrink-0')

        with ui.row().classes('w-full items-center gap-2 pt-3 flex-wrap'):
            w.badge(job.get('priority'))
            w.badge(job.get('status'))
            if job.get('due_date'):
                overdue = str(job['due_date'])[:10] < today
                w.badge('due', tone='rose' if overdue else 'slate',
                        label=('Overdue since ' if overdue else 'Due ')
                              + w.as_date(job['due_date']))
            if job.get('asset_took_offline'):
                w.badge('offline', tone='rose', label='Equipment offline')


async def _job_dialog(job: dict, reload) -> None:
    from .maintenance import _wo_dialog
    currency = api.user().get('functional_currency', 'XAF')
    await _wo_dialog(job['id'], currency, reload)


def _scan() -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[400px] max-w-full'):
        ui.label('Scan an asset tag').classes('text-base font-semibold mb-3')
        code = ui.input('Tag or scanned code').props('outlined dense autofocus').classes('w-full')

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
