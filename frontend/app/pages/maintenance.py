"""
Work orders and maintenance plans.

The work order drawer is where the status machine lives: request → approve →
assign → start → complete → verify, each guarded by its own permission, with
parts and labour recorded against the job as it runs.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import t
from ..ui import chrome, widgets as w
from ..ui.shell import page

WO_TYPES = {
    'preventive': 'Preventive service', 'corrective': 'Corrective repair',
    'calibration': 'Calibration', 'safety_test': 'Electrical safety test',
    'inspection': 'Inspection', 'installation': 'Installation',
    'vehicle_service': 'Vehicle service',
}

TEAMS = {'biomedical': 'Biomedical engineering', 'facilities': 'Facilities',
         'it': 'IT', 'fleet': 'Fleet workshop', 'external': 'External provider'}

PRIORITIES = {'low': 'Low', 'normal': 'Normal', 'high': 'High',
              'emergency': 'Emergency — patient care affected'}

#: Which transitions to offer, in the order a job actually moves through them.
ACTIONS = [
    ('approve', 'Approve', 'check_circle', 'wo.approve', 'unelevated'),
    ('reject', 'Reject', 'cancel', 'wo.approve', 'outline color=red'),
    ('assign', 'Assign', 'person_add', 'wo.assign', 'outline'),
    ('start', 'Start work', 'play_arrow', 'wo.execute', 'unelevated'),
    ('hold', 'Put on hold', 'pause', 'wo.execute', 'outline'),
    ('await_parts', 'Awaiting parts', 'inventory', 'wo.execute', 'outline'),
    ('complete', 'Complete', 'task_alt', 'wo.execute', 'unelevated'),
    ('verify', 'Verify', 'verified', 'wo.verify', 'unelevated'),
    ('cancel', 'Cancel', 'block', 'wo.approve', 'flat color=red'),
]

VALID_FROM = {
    'approve': {'requested'}, 'reject': {'requested'},
    'assign': {'requested', 'approved', 'on_hold', 'awaiting_parts'},
    'start': {'approved', 'assigned', 'on_hold', 'awaiting_parts'},
    'hold': {'assigned', 'in_progress'}, 'await_parts': {'assigned', 'in_progress'},
    'complete': {'in_progress', 'assigned'}, 'verify': {'completed'},
    'cancel': {'requested', 'approved', 'assigned', 'in_progress', 'on_hold', 'awaiting_parts'},
}


@page('/maintenance', title='Work orders', permissions=('wo.view',))
async def maintenance_page(new: str = '', asset: str = '') -> None:
    currency = api.user().get('functional_currency', 'XAF')
    state = {'search': '', 'status': None, 'priority': None, 'team': None, 'type': None,
             'open': True, 'pastDue': False, 'mine': False}

    def actions() -> None:
        if api.can('maint.plan.manage'):
            ui.button(t('wo.scheduler'), icon='event_repeat', on_click=lambda: _scheduler(reload)) \
                .props('outline size=sm')
        if api.can('wo.request'):
            ui.button(t('wo.raise'), icon='add',
                      on_click=lambda: _create_dialog(reload, int(asset) if asset else None)
                      ).props('unelevated size=sm')

    w.page_header(t('wo.title'), t('wo.sub'), actions=actions, emoji=chrome.PAGE['wo.title'])

    overview_box = ui.column().classes('w-full gap-4')

    async def reload() -> None:
        overview_box.clear()
        container.clear()
        overview = await api.safe(api.get('/maintenance/overview'), notify=False)
        if overview:
            with overview_box:
                _pipeline(overview, currency, state, reload)
        data = await api.safe(api.get('/work-orders', search=state['search'] or None,
                                      status=state['status'], priority=state['priority'],
                                      team=state['team'], type=state['type'],
                                      openOnly=state['open'] or None,
                                      pastDueOnly=state['pastDue'] or None,
                                      mine=state['mine'] or None,
                                      assetId=int(asset) if asset else None,
                                      pageSize=200))
        if not data:
            return
        with container:
            _wo_table(data, currency, reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('wo.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            priority = ui.select({None: t('wo.any_priority'), **PRIORITIES}, value=None,
                                 label=t('wo.priority')) \
                .props('outlined dense options-dense').classes('w-44')
            priority.bind_value(state, 'priority')
            team = ui.select({None: t('wo.all_teams'), **TEAMS}, value=None, label=t('wo.team')) \
                .props('outlined dense options-dense').classes('w-48')
            team.bind_value(state, 'team')
            kind = ui.select({None: t('wo.all_types'), **WO_TYPES}, value=None, label=t('wo.type')) \
                .props('outlined dense options-dense').classes('w-48')
            kind.bind_value(state, 'type')
            elements = [search, priority, team, kind]
        with ui.row().classes('w-full gap-5 pt-2 flex-wrap'):
            open_only = ui.switch(t('wo.open_only'), value=True).props('dense')
            open_only.bind_value(state, 'open')
            past_due = ui.switch(t('wo.past_due_only')).props('dense')
            past_due.bind_value(state, 'pastDue')
            mine = ui.switch(t('wo.mine')).props('dense')
            mine.bind_value(state, 'mine')
            elements += [open_only, past_due, mine]
        for element in elements:
            element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()

    if new:
        _create_dialog(reload, int(asset) if asset else None)


def _pipeline(overview: dict, currency: str, state: dict, reload) -> None:
    wo = overview.get('work_orders') or {}

    def jump(status: str | None, past_due: bool = False) -> None:
        state.update(status=status, pastDue=past_due, open=status is None)
        ui.timer(0.01, reload, once=True)

    with w.kpi_row():
        w.kpi('Awaiting approval', w.number(wo.get('awaiting_approval')),
              hint='Requests from the wards', icon='pending_actions', tone='amber',
              on_click=lambda: jump('requested'))
        w.kpi('Scheduled', w.number(wo.get('scheduled')),
              hint='Approved or assigned', icon='event', tone='sky',
              on_click=lambda: jump('approved,assigned'))
        w.kpi('In progress', w.number(wo.get('in_progress')),
              hint='Technicians on the job', icon='engineering', tone='violet',
              on_click=lambda: jump('in_progress'))
        w.kpi('Past due', w.number(wo.get('past_due')),
              hint='Overdue against the due date', icon='schedule',
              tone='rose' if int(wo.get('past_due') or 0) else 'slate',
              on_click=lambda: jump(None, True))
        w.kpi('Awaiting verification', w.number(wo.get('awaiting_verification')),
              hint='Completed, not yet signed off', icon='fact_check', tone='teal',
              on_click=lambda: jump('completed'))
        w.kpi('Closed cost', w.money(wo.get('closed_cost'), currency),
              hint='Life to date on closed jobs', icon='payments', tone='slate')


def _wo_table(data: dict, currency: str, reload) -> None:
    rows = data.get('rows') or []
    for row in rows:
        row['type_label'] = WO_TYPES.get(row.get('wo_type'), row.get('wo_type'))
        row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
        row['flag'] = ('Past due' if row.get('is_past_due') else
                       'Offline' if row.get('asset_took_offline') else '')

    body = w.section(f"{w.number(data.get('total', len(rows)))} work orders",
                     'Click a job to work it')
    with body:
        if not rows:
            w.empty_state('No work order matches those filters.', icon='build')
            return
        columns = [
            w.column('wo_no', 'WO no.', classes='lc-num font-semibold'),
            w.column('priority', 'Priority'),
            w.column('title', 'Work'),
            w.column('asset', 'Asset'),
            w.column('type_label', 'Type'),
            w.column('assigned_to_name', 'Technician'),
            w.column('location_name', 'Location'),
            w.date_column('due_date', 'Due'),
            w.column('status', 'Status'),
            w.money_column('total_cost', f'Cost ({currency})', currency=currency),
        ]
        table = w.table(columns, rows, height='60vh', pagination=0,
                        on_row_click=lambda row: _wo_dialog(row['id'], currency, reload))
        w.add_badge_slot(table, 'status')
        w.add_badge_slot(table, 'priority')


async def _wo_dialog(wo_id: int, currency: str, reload) -> None:
    dialog = ui.dialog().props('maximized')
    with dialog, ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        content = ui.column().classes('w-full h-full flex flex-col gap-0')

    async def draw() -> None:
        data = await api.safe(api.get(f'/work-orders/{wo_id}'))
        if not data:
            return
        wo = data['work_order']
        content.clear()
        with content:
            with ui.row().classes('items-start justify-between w-full px-6 py-3 '
                                  'border-b border-slate-200 shrink-0'):
                with ui.column().classes('gap-1 min-w-0'):
                    with ui.row().classes('items-center gap-2 flex-wrap'):
                        ui.label(wo['wo_no']).classes('lc-num text-base font-semibold')
                        w.badge(wo['status'])
                        w.badge(wo['priority'], label=PRIORITIES.get(wo['priority']))
                        if wo.get('asset_took_offline'):
                            w.badge('offline', tone='rose', label='Asset taken offline')
                        if wo.get('covered_by_warranty'):
                            w.badge('warranty', tone='teal', label='Under warranty')
                        if wo.get('covered_by_contract'):
                            w.badge('contract', tone='teal', label='Under service contract')
                    ui.label(wo['title']).classes('text-sm text-slate-700')
                ui.button(icon='close', on_click=dialog.close).props('flat dense round')

            with ui.column().classes('flex-1 overflow-auto px-6 py-4 gap-5 w-full '
                                     'max-w-[1300px] mx-auto'):
                left, right = w.two_column()
                with left:
                    _wo_details(wo, currency)
                    _wo_parts(data, wo, currency, draw)
                    _wo_labor(data, wo, currency, draw)
                with right:
                    _wo_costs(wo, currency)
                    _wo_timeline(wo)
                    _wo_compliance(data)

            with ui.row().classes('w-full items-center justify-between gap-2 px-6 py-3 '
                                  'border-t border-slate-200 shrink-0 flex-wrap'):
                with ui.row().classes('items-center gap-2'):
                    if wo.get('entry_no'):
                        ui.label(f"Cost posted as {wo['entry_no']}").classes('text-xs text-slate-500')
                    elif wo['status'] in ('completed', 'verified') and api.can('journal.post'):
                        ui.button('Post the cost', icon='post_add',
                                  on_click=lambda: _post_cost(wo, draw, reload)
                                  ).props('outline dense size=sm')
                with ui.row().classes('items-center gap-2 flex-wrap'):
                    ui.button('Close', on_click=dialog.close).props('flat color=grey-8')
                    for action, label, icon, permission, style in ACTIONS:
                        if wo['status'] in VALID_FROM[action] and api.can(permission):
                            ui.button(label, icon=icon,
                                      on_click=lambda a=action, l=label: _action_dialog(
                                          wo, a, l, draw, reload)).props(f'{style} dense')

    await draw()
    dialog.open()


def _wo_details(wo: dict, currency: str) -> None:
    body = w.section('The job')
    with body:
        w.detail_grid([
            ('Asset', f"{wo.get('asset_tag')} — {wo.get('asset_name')}"),
            ('Serial number', wo.get('serial_number')),
            ('Make and model', f"{wo.get('manufacturer') or ''} {wo.get('model') or ''}".strip()),
            ('Asset criticality', w.humanise(wo.get('criticality'))),
            ('Type', WO_TYPES.get(wo.get('wo_type'), wo.get('wo_type'))),
            ('From plan', wo.get('plan_code')),
            ('Cost centre', wo.get('cost_center_name')),
            ('Location', wo.get('location_name')),
            ('Team', TEAMS.get(wo.get('assigned_team'), wo.get('assigned_team'))),
            ('Technician', wo.get('assigned_to_name')),
            ('External provider', wo.get('service_provider_name')),
            ('Service contract', wo.get('contract_no')),
            ('Scheduled', w.as_date(wo.get('scheduled_date'))),
            ('Due', w.as_date(wo.get('due_date'))),
        ])
        if wo.get('problem_description'):
            ui.label('Problem reported').classes('text-[11px] font-bold uppercase tracking-wider '
                                                 'text-slate-500 pt-3')
            ui.label(wo['problem_description']).classes('text-xs text-slate-700 leading-relaxed')
        if wo.get('task_checklist'):
            ui.label('Task checklist').classes('text-[11px] font-bold uppercase tracking-wider '
                                               'text-slate-500 pt-3')
            for line in str(wo['task_checklist']).splitlines():
                if line.strip():
                    with ui.row().classes('items-start gap-2 no-wrap'):
                        ui.icon('check_box_outline_blank').classes('text-slate-400 text-sm mt-0.5')
                        ui.label(line.strip()).classes('text-xs text-slate-700')
        if wo.get('work_performed'):
            ui.label('Work performed').classes('text-[11px] font-bold uppercase tracking-wider '
                                               'text-slate-500 pt-3')
            ui.label(wo['work_performed']).classes('text-xs text-slate-700 leading-relaxed')
        if wo.get('root_cause'):
            w.note(f"Root cause: {wo['root_cause']}", icon='troubleshoot', tone='amber')
        if wo.get('closure_notes'):
            w.note(wo['closure_notes'], icon='notes')


def _wo_parts(data: dict, wo: dict, currency: str, redraw) -> None:
    parts = data.get('parts') or []
    open_job = wo['status'] in ('assigned', 'in_progress', 'on_hold', 'awaiting_parts', 'approved')
    body = w.section('Parts used', f"{w.number(len(parts))} lines",
                     actions=lambda: (open_job and api.can('wo.execute')
                                      and ui.button('Add a part', icon='add',
                                                    on_click=lambda: _part_dialog(wo, redraw)
                                                    ).props('flat dense size=sm')))
    with body:
        if not parts:
            ui.label('No parts have been recorded.').classes('text-xs text-slate-500')
            return
        w.table([w.column('part_name', 'Part'), w.column('part_number', 'Part no.'),
                 w.int_column('quantity', 'Qty'),
                 w.money_column('unit_cost', f'Unit ({currency})', currency=currency),
                 w.money_column('total_cost', f'Total ({currency})', currency=currency),
                 w.column('supplier_name', 'Supplier')],
                parts, pagination=0)


def _wo_labor(data: dict, wo: dict, currency: str, redraw) -> None:
    labor = data.get('labor') or []
    open_job = wo['status'] in ('assigned', 'in_progress', 'on_hold', 'awaiting_parts', 'approved')
    body = w.section('Labour', 'In-house hours are costed for management, but only external '
                               'labour is posted to the ledger',
                     actions=lambda: (open_job and api.can('wo.execute')
                                      and ui.button('Log time', icon='add',
                                                    on_click=lambda: _labor_dialog(wo, redraw)
                                                    ).props('flat dense size=sm')))
    with body:
        if not labor:
            ui.label('No time has been logged.').classes('text-xs text-slate-500')
            return
        for line in labor:
            line['who'] = line.get('technician_full_name') or line.get('technician_name')
            line['source'] = 'External' if line.get('is_external') else 'In house'
        table = w.table([w.date_column('work_date', 'Date'), w.column('who', 'Technician'),
                         w.column('source', 'Source'),
                         w.column('hours', 'Hours', align='right', classes='lc-num'),
                         w.money_column('hourly_rate', f'Rate ({currency})', currency=currency),
                         w.money_column('cost', f'Cost ({currency})', currency=currency)],
                        labor, pagination=0)
        w.add_badge_slot(table, 'source', tones={'external': 'violet', 'in house': 'slate'})


def _wo_costs(wo: dict, currency: str) -> None:
    body = w.section('Cost', 'What the job costs, and what reaches the ledger')
    with body:
        w.statement_table(
            ['', currency],
            [
                {'label': 'Parts', 'values': [wo.get('parts_cost')]},
                {'label': 'Labour', 'values': [wo.get('labor_cost')]},
                {'label': 'External services', 'values': [wo.get('external_cost')]},
                {'label': 'Total cost of the job', 'kind': 'total', 'values': [wo.get('total_cost')]},
            ],
            currency,
            blank_zero=False,
        )
        w.note('In-house technician time is already in payroll, so posting it again as maintenance '
               'would double-count it. Only parts and external cost reach the ledger.',
               icon='info')
        if wo.get('is_capitalizable'):
            w.note('Flagged as an improvement: the cost will be added to the asset’s carrying '
                   'amount under IAS 16.13 rather than expensed.', icon='trending_up', tone='sky')


def _wo_timeline(wo: dict) -> None:
    events = [
        ('Requested', wo.get('requested_at'), wo.get('requested_by_name'), 'add_circle'),
        ('Approved', wo.get('approved_at'), wo.get('approved_by_name'), 'check_circle'),
        ('Assigned', wo.get('assigned_at'), wo.get('assigned_to_name'), 'person_add'),
        ('Started', wo.get('started_at'), wo.get('assigned_to_name'), 'play_circle'),
        ('Completed', wo.get('completed_at'), wo.get('assigned_to_name'), 'task_alt'),
        ('Verified', wo.get('verified_at'), wo.get('verified_by_name'), 'verified'),
    ]
    body = w.section('Progress')
    with body:
        with ui.timeline(side='right').classes('w-full'):
            for label, when, who, icon in events:
                if not when:
                    continue
                ui.timeline_entry(
                    f"{who or 'system'}",
                    title=label,
                    subtitle=w.as_datetime(when),
                    icon=icon,
                ).props('color=teal')
        if wo.get('downtime_hours'):
            w.note(f"The asset was out of service for {w.number(wo['downtime_hours'], 1)} hours.",
                   icon='schedule', tone='amber')


def _wo_compliance(data: dict) -> None:
    calibrations = data.get('calibrations') or []
    tests = data.get('safety_tests') or []
    if not calibrations and not tests:
        return
    body = w.section('Certificates issued on this job')
    with body:
        for cal in calibrations:
            with ui.row().classes('w-full items-center justify-between py-1.5 no-wrap'):
                with ui.column().classes('gap-0'):
                    ui.label(f"Calibration {cal.get('certificate_no') or ''}"
                             ).classes('text-xs font-medium')
                    ui.label(f"{w.as_date(cal.get('calibration_date'))} · next "
                             f"{w.as_date(cal.get('next_due_date'))}"
                             ).classes('text-[11px] text-slate-500')
                w.badge(cal.get('result'))
        for test in tests:
            with ui.row().classes('w-full items-center justify-between py-1.5 no-wrap'):
                with ui.column().classes('gap-0'):
                    ui.label(f"Safety test {test.get('test_standard') or ''}").classes('text-xs font-medium')
                    ui.label(f"{w.as_date(test.get('test_date'))} · next "
                             f"{w.as_date(test.get('next_due_date'))}"
                             ).classes('text-[11px] text-slate-500')
                w.badge(test.get('result'))


# --- actions ----------------------------------------------------------------


def _action_dialog(wo: dict, action: str, label: str, redraw, reload) -> None:
    """One dialog for every transition; it asks only for what the action needs."""
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[560px] max-w-full '
                                                          'lc-scroll').style('max-height: 88vh'):
        ui.label(f"{label} · {wo['wo_no']}").classes('text-base font-semibold')
        ui.label(wo['title']).classes('text-xs text-slate-500 mb-3')
        fields: dict = {}

        if action == 'assign':
            fields['assignedTo'] = ui.select({}, label='Technician', with_input=True) \
                .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
            fields['team'] = ui.select(TEAMS, label='Team', value=wo.get('assigned_team')) \
                .props('outlined dense').classes('w-full')
            fields['scheduledDate'] = ui.input('Scheduled date', value=w.today_iso()) \
                .props('outlined dense type=date').classes('w-full')
            fields['dueDate'] = ui.input('Due date', value=str(wo.get('due_date') or '')[:10]) \
                .props('outlined dense type=date').classes('w-full')

        if action == 'start':
            fields['takeOffline'] = ui.switch(
                'Take the asset out of service while the work is done',
                value=bool(wo.get('asset_took_offline'))).props('dense')
            w.note('Taking equipment offline restricts its clinical use until the job is verified.',
                   icon='gpp_maybe', tone='amber')

        if action == 'complete':
            fields['workPerformed'] = ui.textarea('What was done') \
                .props('outlined dense rows=3').classes('w-full')
            fields['rootCause'] = ui.input('Root cause (repairs)').props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                fields['downtimeHours'] = ui.number('Downtime (hours)', value=0, min=0, format='%.1f') \
                    .props('outlined dense').classes('flex-1')
                fields['externalCost'] = ui.number('External cost', value=0, min=0, format='%.2f') \
                    .props('outlined dense').classes('flex-1')
            fields['coveredByWarranty'] = ui.switch('Covered by warranty').props('dense')
            fields['coveredByContract'] = ui.switch('Covered by a service contract').props('dense')
            fields['isCapitalizable'] = ui.switch(
                'This is an improvement, not a repair',
                value=bool(wo.get('is_capitalizable'))).props('dense')
            fields['returnToService'] = ui.switch('Return the asset to service', value=True).props('dense')
            fields['closureNotes'] = ui.textarea('Closure notes') \
                .props('outlined dense rows=2').classes('w-full')
            if not api.can('journal.post'):
                w.note('Closing the job prepares a draft journal entry for the cost. Someone with '
                       'posting authority commits it — the two are deliberately separate.',
                       icon='rule', tone='sky')
            else:
                fields['postCost'] = ui.switch('Post the cost to the ledger now', value=True) \
                    .props('dense')

        if action == 'verify':
            fields['closureNotes'] = ui.textarea('Verification notes') \
                .props('outlined dense rows=2').classes('w-full')
            w.note('Verifying releases the asset from any use restriction this job imposed, '
                   'provided nothing else holds it.', icon='verified', tone='emerald')

        if action in ('reject', 'cancel', 'hold', 'await_parts'):
            fields['reason'] = ui.textarea('Reason').props('outlined dense rows=3').classes('w-full')

        async def submit() -> None:
            payload = {}
            for key, element in fields.items():
                value = element.value
                if value in (None, ''):
                    continue
                payload[key] = value
            result = await api.safe(api.post(f"/work-orders/{wo['id']}/{action}", payload))
            if result:
                ui.notify(f"{wo['wo_no']} is now {w.humanise(result['work_order']['status']).lower()}.",
                          type='positive', position='top')
                dialog.close()
                await redraw()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button(label, on_click=submit).props('unelevated')

    if action == 'assign':
        async def load() -> None:
            data = await api.safe(api.get('/work-orders', pageSize=1), notify=False)
            # Technicians are not exposed by a dedicated endpoint; offer the
            # people already carrying work, which is who an assigner picks from.
            overview = await api.safe(api.get('/maintenance/overview'), notify=False)
            options = {}
            if overview:
                options = {t['id']: t['full_name'] for t in overview.get('technician_workload') or []}
            fields['assignedTo'].set_options(options or {})
        ui.timer(0.01, load, once=True)

    dialog.open()


def _part_dialog(wo: dict, redraw) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label('Add a part').classes('text-base font-semibold mb-3')
        name = ui.input('Part name').props('outlined dense').classes('w-full')
        number = ui.input('Part number').props('outlined dense').classes('w-full')
        with ui.row().classes('w-full gap-3 no-wrap'):
            quantity = ui.number('Quantity', value=1, min=0.01, format='%.2f') \
                .props('outlined dense').classes('flex-1')
            unit = ui.number('Unit cost', value=0, min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1')
        notes = ui.input('Notes').props('outlined dense').classes('w-full')

        async def submit() -> None:
            if not name.value:
                ui.notify('Give the part a name.', type='warning', position='top')
                return
            result = await api.safe(api.post(f"/work-orders/{wo['id']}/parts", {
                'partName': name.value, 'partNumber': number.value or None,
                'quantity': quantity.value, 'unitCost': unit.value or 0,
                'notes': notes.value or None,
            }))
            if result:
                ui.notify('Part recorded.', type='positive', position='top')
                dialog.close()
                await redraw()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Add part', on_click=submit).props('unelevated')
    dialog.open()


def _labor_dialog(wo: dict, redraw) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label('Log time').classes('text-base font-semibold mb-3')
        date = ui.input('Work date', value=w.today_iso()).props('outlined dense type=date') \
            .classes('w-full')
        with ui.row().classes('w-full gap-3 no-wrap'):
            hours = ui.number('Hours', value=1, min=0.25, format='%.2f') \
                .props('outlined dense').classes('flex-1')
            rate = ui.number('Hourly rate', value=0, min=0, format='%.2f') \
                .props('outlined dense').classes('flex-1')
        external = ui.switch('External contractor').props('dense')
        who = ui.input('Name (external contractors)').props('outlined dense').classes('w-full')
        notes = ui.input('Notes').props('outlined dense').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post(f"/work-orders/{wo['id']}/labor", {
                'workDate': date.value, 'hours': hours.value, 'hourlyRate': rate.value or 0,
                'isExternal': external.value,
                'technicianName': who.value or None,
                'technicianId': None if external.value else api.user().get('id'),
                'notes': notes.value or None,
            }))
            if result:
                ui.notify('Time logged.', type='positive', position='top')
                dialog.close()
                await redraw()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Log time', on_click=submit).props('unelevated')
    dialog.open()


def _post_cost(wo: dict, redraw, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[480px] max-w-full'):
        ui.label(f"Post the cost of {wo['wo_no']}").classes('text-base font-semibold')
        ui.label('Parts and external cost are posted; in-house labour is not, because it is '
                 'already in payroll.').classes('text-xs text-slate-500 mb-3')
        date = ui.input('Posting date', value=w.today_iso()).props('outlined dense type=date') \
            .classes('w-full')
        credit = ui.input('Credit account code', placeholder='Defaults to the supplier payable') \
            .props('outlined dense').classes('w-full')
        if wo.get('is_capitalizable'):
            w.note('This job is flagged as an improvement, so the cost is added to the asset’s '
                   'carrying amount instead of being expensed.', icon='trending_up', tone='sky')

        async def submit() -> None:
            result = await api.safe(api.post(f"/work-orders/{wo['id']}/post-cost", {
                'date': date.value, 'creditAccountCode': credit.value or None,
            }))
            if result:
                ui.notify(f"Posted as {result['entry']['entry_no']}.", type='positive', position='top')
                dialog.close()
                await redraw()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Post the cost', on_click=submit).props('unelevated')
    dialog.open()


def _create_dialog(reload, asset_id: int | None = None) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[640px] max-w-full'):
        ui.label('Raise a work order').classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 70vh'):
            if not api.can('wo.approve'):
                w.note('Your request goes to the maintenance supervisor for approval.',
                       icon='send', tone='sky')
            asset = ui.select({}, label='Asset', with_input=True, value=asset_id) \
                .props('outlined dense use-input hide-selected input-debounce=200').classes('w-full')
            title = ui.input('What needs doing').props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                kind = ui.select(WO_TYPES, value='corrective', label='Type') \
                    .props('outlined dense').classes('flex-1')
                priority = ui.select(PRIORITIES, value='normal', label='Priority') \
                    .props('outlined dense').classes('flex-1')
            problem = ui.textarea('Describe the problem').props('outlined dense rows=3').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                scheduled = ui.input('Preferred date').props('outlined dense type=date').classes('flex-1')
                due = ui.input('Needed by').props('outlined dense type=date').classes('flex-1')
            offline = ui.switch('The equipment is already unusable').props('dense')

        async def submit() -> None:
            if not asset.value or len((title.value or '').strip()) < 5:
                ui.notify('Choose an asset and describe the work in at least five characters.',
                          type='warning', position='top')
                return
            result = await api.safe(api.post('/work-orders', {
                'assetId': asset.value, 'type': kind.value, 'priority': priority.value,
                'title': title.value.strip(), 'problemDescription': problem.value or None,
                'scheduledDate': scheduled.value or None, 'dueDate': due.value or None,
                'takeOffline': offline.value,
            }))
            if result:
                ui.notify(f"Work order {result['work_order']['wo_no']} raised.",
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Raise the work order', on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/assets', pageSize=500), notify=False)
        if data:
            asset.set_options({a['id']: f"{a['asset_tag']} — {a['name']}" for a in data['rows']},
                              value=asset_id)

    dialog.open()
    ui.timer(0.01, load, once=True)


def _scheduler(reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label('Run the maintenance scheduler').classes('text-base font-semibold')
        ui.label('Every active plan falling due inside the horizon becomes an approved work order. '
                 'Plans that already have an open job are skipped, so running it twice changes '
                 'nothing.').classes('text-xs text-slate-500 mb-3')
        horizon = ui.number('Horizon (days)', value=30, min=0, max=365, format='%d') \
            .props('outlined dense').classes('w-full')

        async def submit() -> None:
            result = await api.safe(api.post('/maintenance-plans/run-scheduler',
                                             {'horizonDays': int(horizon.value or 30)}))
            if result:
                generated = result.get('generated', 0)
                ui.notify(f"{generated} work order{'s' if generated != 1 else ''} generated "
                          f"through {w.as_date(result.get('horizon_to'))}."
                          if generated else 'Nothing was due — no work orders generated.',
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Run the scheduler', icon='play_arrow', on_click=submit).props('unelevated')
    dialog.open()


# --- maintenance plans ------------------------------------------------------


@page('/plans', title='Maintenance plans', permissions=('maint.plan.view',))
async def plans_page() -> None:
    state = {'type': None, 'team': None, 'dueBefore': None}

    def actions() -> None:
        if api.can('maint.plan.manage'):
            ui.button(t('wo.scheduler'), icon='event_repeat',
                      on_click=lambda: _scheduler(reload)).props('unelevated size=sm')

    w.page_header(t('pl.title'), t('pl.sub'), actions=actions, emoji=chrome.PAGE['pl.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/maintenance-plans', planType=state['type'],
                                      team=state['team'], dueBefore=state['dueBefore'],
                                      pageSize=300))
        if not data:
            return
        rows = data.get('rows') or []
        today = w.today_iso()
        for row in rows:
            row['asset'] = f"{row.get('asset_tag')} — {row.get('asset_name')}"
            row['interval'] = (f"Every {row['interval_months']} months" if row.get('interval_months')
                               else f"Every {row['interval_hours']} hours" if row.get('interval_hours')
                               else f"Every {row['interval_km']} km" if row.get('interval_km')
                               else 'On condition')
            row['state'] = ('Open job' if int(row.get('open_work_orders') or 0)
                            else 'Overdue' if str(row.get('next_due_date') or '9999')[:10] < today
                            else 'Scheduled')
        with container:
            overdue = sum(1 for r in rows if r['state'] == 'Overdue')
            with w.kpi_row():
                w.kpi('Active plans', w.number(data.get('total')),
                      hint='Across every domain', icon='event_repeat', tone='slate')
                w.kpi('Overdue', w.number(overdue),
                      hint='Past due with no job open', icon='schedule',
                      tone='rose' if overdue else 'teal')
                w.kpi('With a job open', w.number(sum(1 for r in rows if r['state'] == 'Open job')),
                      hint='Already being dealt with', icon='build', tone='sky')

            body = w.section(f"{w.number(data.get('total'))} plans",
                             'Click a plan to change its interval or owner')
            with body:
                if not rows:
                    w.empty_state('No maintenance plan matches those filters.', icon='event_repeat')
                    return
                table = w.table([
                    w.column('code', 'Plan', classes='lc-num'),
                    w.column('asset', 'Asset'),
                    w.column('plan_type', 'Type'),
                    w.column('name', 'Task'),
                    w.column('interval', 'Frequency'),
                    w.column('interval_source', 'Interval from'),
                    w.column('assigned_team', 'Team'),
                    w.date_column('last_generated_date', 'Last raised'),
                    w.date_column('next_due_date', 'Next due'),
                    w.column('state', 'State'),
                ], rows, height='62vh', pagination=0,
                    on_row_click=lambda row: _plan_dialog(row, reload)
                    if api.can('maint.plan.manage') else None)
                w.add_badge_slot(table, 'state',
                                 tones={'overdue': 'rose', 'open job': 'sky', 'scheduled': 'emerald'})
                w.add_badge_slot(table, 'plan_type',
                                 tones={'preventive': 'teal', 'calibration': 'violet',
                                        'safety_test': 'amber', 'inspection': 'sky',
                                        'statutory': 'rose', 'vehicle_service': 'slate'})

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            kind = ui.select({None: 'All plan types', 'preventive': 'Preventive',
                              'calibration': 'Calibration', 'safety_test': 'Safety test',
                              'inspection': 'Inspection', 'statutory': 'Statutory',
                              'vehicle_service': 'Vehicle service'}, value=None, label='Type') \
                .props('outlined dense options-dense').classes('w-48')
            kind.bind_value(state, 'type')
            team = ui.select({None: 'All teams', **TEAMS}, value=None, label='Team') \
                .props('outlined dense options-dense').classes('w-48')
            team.bind_value(state, 'team')
            due = ui.input('Due on or before').props('outlined dense type=date clearable').classes('w-48')
            due.bind_value(state, 'dueBefore')
            for element in (kind, team, due):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _plan_dialog(plan: dict, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[520px] max-w-full'):
        ui.label(f"{plan['code']} · {plan.get('name')}").classes('text-base font-semibold')
        ui.label(f"{plan.get('asset_tag')} — {plan.get('asset_name')}"
                 ).classes('text-xs text-slate-500 mb-3')
        months = ui.number('Interval (months)', value=plan.get('interval_months'), min=1, max=600,
                           format='%d').props('outlined dense').classes('w-full')
        source = ui.select({'manufacturer': 'Manufacturer’s schedule',
                            'local_regulation': 'Local regulation',
                            'who_guideline': 'WHO guideline', 'internal': 'Internal policy'},
                           value=plan.get('interval_source'), label='Interval basis') \
            .props('outlined dense').classes('w-full')
        team = ui.select(TEAMS, value=plan.get('assigned_team'), label='Owning team') \
            .props('outlined dense').classes('w-full')
        priority = ui.select(PRIORITIES, value=plan.get('priority'), label='Priority') \
            .props('outlined dense').classes('w-full')
        lead = ui.number('Lead time (days)', value=plan.get('lead_time_days'), min=0, max=365,
                         format='%d').props('outlined dense').classes('w-full') \
            .tooltip('How far ahead of the due date the scheduler raises the job')
        next_due = ui.input('Next due', value=str(plan.get('next_due_date') or '')[:10]) \
            .props('outlined dense type=date').classes('w-full')
        active = ui.switch('Active', value=bool(plan.get('is_active'))).props('dense')

        async def submit() -> None:
            result = await api.safe(api.patch(f"/maintenance-plans/{plan['id']}", {
                'intervalMonths': int(months.value) if months.value else None,
                'intervalSource': source.value, 'assignedTeam': team.value,
                'priority': priority.value,
                'leadTimeDays': int(lead.value) if lead.value is not None else None,
                'nextDueDate': next_due.value or None, 'isActive': active.value,
            }))
            if result:
                ui.notify('Plan updated.', type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Save the plan', on_click=submit).props('unelevated')
    dialog.open()
