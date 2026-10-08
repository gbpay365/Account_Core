"""
General-services errands and shopping lists.

These are pick-up / buy / run-an-errand jobs, not work orders against the
asset register and not purchase orders. Capital buying still goes through
procurement.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import bilingual, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

ERRAND_KINDS = {
    'purchase_run': 'errand.kind.purchase_run',
    'fleet': 'errand.kind.fleet',
    'it_hardware': 'errand.kind.it_hardware',
    'electrical': 'errand.kind.electrical',
    'network': 'errand.kind.network',
    'general': 'errand.kind.general',
}

NEW_KIND = '__new__'

PRIORITIES = {
    'low': 'status.low',
    'normal': 'status.normal',
    'high': 'status.high',
    'urgent': 'status.urgent',
}

ERRAND_ACTIONS = [
    ('assign', 'errand.act.assign', 'person_add', 'errand.assign', 'outline',
     {'requested', 'assigned'}),
    ('start', 'errand.act.start', 'play_arrow', 'errand.execute', 'unelevated',
     {'requested', 'assigned'}),
    ('complete', 'errand.act.complete', 'task_alt', 'errand.execute', 'unelevated',
     {'assigned', 'in_progress'}),
    ('cancel', 'errand.act.cancel', 'block', 'errand.create', 'flat color=red',
     {'requested', 'assigned', 'in_progress'}),
]

SHOP_ACTIONS = [
    ('start', 'shop.act.start', 'shopping_cart', 'shop.buy', 'unelevated', {'open'}),
    ('receive', 'shop.act.receive', 'inventory', 'shop.buy', 'unelevated', {'shopping'}),
    ('assign', 'shop.act.assign', 'person_add', 'errand.assign', 'outline', {'open', 'shopping'}),
    ('cancel', 'shop.act.cancel', 'block', 'shop.create', 'flat color=red', {'open', 'shopping'}),
]


def _kind_label(kind: str | None, row: dict | None = None) -> str:
    if row and (row.get('kind_name') or row.get('kind_name_en') or row.get('name') or row.get('name_en')):
        return bilingual({
            'name': row.get('kind_name') or row.get('name'),
            'name_en': row.get('kind_name_en') or row.get('name_en'),
        }) or (kind or '')
    key = ERRAND_KINDS.get(kind or '')
    return t(key) if key else (kind or '').replace('_', ' ')


def _kind_options(rows: list[dict], *, add_new: bool = False) -> dict:
    options = {row['code']: _kind_label(row.get('code'), row) for row in rows}
    if add_new and api.can('errand.create'):
        options[NEW_KIND] = t('errand.kind_new')
    return options


def _priority_label(value: str | None) -> str:
    key = PRIORITIES.get(value or '')
    return t(key) if key else (value or '')


@page('/errands', title='Errands', permissions=('errand.view',))
async def errands_page() -> None:
    state = {'search': '', 'status': None, 'kind': None, 'priority': None,
             'open': True, 'pastDue': False, 'mine': False}

    def actions() -> None:
        if api.can('errand.create'):
            ui.button(t('errand.raise'), icon='add',
                      on_click=lambda: _errand_create(reload)).props('unelevated size=sm')

    w.page_header(t('errand.title'), t('errand.sub'), actions=actions,
                  emoji=chrome.PAGE['er.title'])

    overview_box = ui.column().classes('w-full gap-4')

    async def reload() -> None:
        overview_box.clear()
        container.clear()
        overview = await api.safe(api.get('/services/overview'), notify=False)
        if overview:
            with overview_box:
                _errand_kpis(overview, state, reload)
        data = await api.safe(api.get(
            '/errands',
            search=state['search'] or None,
            status=state['status'],
            kind=state['kind'],
            priority=state['priority'],
            openOnly=state['open'] or None,
            pastDueOnly=state['pastDue'] or None,
            mine=state['mine'] or None,
            pageSize=200,
        ))
        if not data:
            return
        with container:
            _errand_table(data, reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('errand.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            kind = ui.select({None: t('errand.any_kind')}, value=None, label=t('errand.kind')) \
                .props('outlined dense options-dense').classes('w-52')
            kind.bind_value(state, 'kind')
            priority = ui.select(
                {None: t('wo.any_priority'), **{k: t(v) for k, v in PRIORITIES.items()}},
                value=None, label=t('wo.priority'),
            ).props('outlined dense options-dense').classes('w-44')
            priority.bind_value(state, 'priority')
            elements = [search, kind, priority]
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

    async def load_kinds() -> None:
        data = await api.safe(api.get('/errand-kinds'), notify=False)
        rows = (data or {}).get('rows') or []
        kind.set_options({None: t('errand.any_kind'), **_kind_options(rows)}, value=state['kind'])

    container = ui.column().classes('w-full gap-5')
    await load_kinds()
    await reload()


@page('/shopping', title='Shopping list', permissions=('shop.view',))
async def shopping_page() -> None:
    state = {'search': '', 'status': None, 'open': True, 'mine': False}

    def actions() -> None:
        if api.can('shop.create'):
            ui.button(t('shop.raise'), icon='add',
                      on_click=lambda: _shop_create(reload)).props('unelevated size=sm')

    w.page_header(t('shop.title'), t('shop.sub'), actions=actions,
                  emoji=chrome.PAGE['sl.title'])

    overview_box = ui.column().classes('w-full gap-4')

    async def reload() -> None:
        overview_box.clear()
        container.clear()
        overview = await api.safe(api.get('/services/overview'), notify=False)
        if overview:
            with overview_box:
                _shop_kpis(overview)
        data = await api.safe(api.get(
            '/shopping-lists',
            search=state['search'] or None,
            status=state['status'],
            openOnly=state['open'] or None,
            mine=state['mine'] or None,
            pageSize=200,
        ))
        if not data:
            return
        with container:
            _shop_table(data, reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('shop.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            elements = [search]
        with ui.row().classes('w-full gap-5 pt-2 flex-wrap'):
            open_only = ui.switch(t('wo.open_only'), value=True).props('dense')
            open_only.bind_value(state, 'open')
            mine = ui.switch(t('wo.mine')).props('dense')
            mine.bind_value(state, 'mine')
            elements += [open_only, mine]
        for element in elements:
            element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _errand_kpis(overview: dict, state: dict, reload) -> None:
    stats = overview.get('errands') or {}

    def jump(status: str | None, past_due: bool = False) -> None:
        state.update(status=status, pastDue=past_due, open=status is None)
        ui.timer(0.01, reload, once=True)

    with w.kpi_row():
        w.kpi(t('status.requested'), w.number(stats.get('requested')),
              icon='pending_actions', tone='amber',
              on_click=lambda: jump('requested'))
        w.kpi(t('status.assigned'), w.number(stats.get('assigned')),
              icon='assignment_ind', tone='sky',
              on_click=lambda: jump('assigned'))
        w.kpi(t('status.in_progress'), w.number(stats.get('in_progress')),
              icon='directions_run', tone='violet',
              on_click=lambda: jump('in_progress'))
        w.kpi(t('status.overdue'), w.number(stats.get('past_due')),
              icon='schedule',
              tone='rose' if int(stats.get('past_due') or 0) else 'slate',
              on_click=lambda: jump(None, True))


def _shop_kpis(overview: dict) -> None:
    lists = overview.get('lists') or {}
    items = overview.get('items') or {}
    with w.kpi_row():
        w.kpi(t('status.open'), w.number(lists.get('open_lists')), icon='list_alt', tone='sky')
        w.kpi(t('status.shopping'), w.number(lists.get('shopping')), icon='shopping_cart', tone='violet')
        w.kpi(t('status.needed'), w.number(items.get('needed')), icon='radio_button_unchecked', tone='amber')
        w.kpi(t('status.bought'), w.number(items.get('bought')), icon='check_circle', tone='emerald')


def _errand_table(data: dict, reload) -> None:
    rows = data.get('rows') or []
    for row in rows:
        row['kind_label'] = _kind_label(row.get('kind'), row)
        row['where'] = row.get('location_note') or row.get('vehicle_note') or ''
    body = w.section(f"{w.number(data.get('total', len(rows)))} {t('errand.title').lower()}",
                     t('errand.click'))
    with body:
        if not rows:
            w.empty_state(t('errand.empty'), icon='directions_run')
            return
        columns = [
            w.column('errand_no', t('errand.no'), classes='lc-num font-semibold'),
            w.column('priority', t('wo.priority')),
            w.column('title', t('errand.work')),
            w.column('kind_label', t('errand.kind')),
            w.column('assigned_to_name', t('errand.technician')),
            w.column('where', t('errand.where')),
            w.date_column('due_date', t('errand.due')),
            w.column('status', t('common.status')),
        ]
        table = w.table(columns, rows, height='60vh', pagination=0,
                        on_row_click=lambda row: _errand_dialog(row['id'], reload))
        w.add_badge_slot(table, 'status')
        w.add_badge_slot(table, 'priority')


def _shop_table(data: dict, reload) -> None:
    rows = data.get('rows') or []
    for row in rows:
        row['progress'] = f"{int(row.get('bought_count') or 0)} / {int(row.get('item_count') or 0)}"
    body = w.section(f"{w.number(data.get('total', len(rows)))} {t('shop.title').lower()}",
                     t('shop.click'))
    with body:
        if not rows:
            w.empty_state(t('shop.empty'), icon='shopping_cart')
            return
        columns = [
            w.column('list_no', t('shop.no'), classes='lc-num font-semibold'),
            w.column('title', t('shop.list')),
            w.column('destination', t('shop.destination')),
            w.column('assigned_to_name', t('errand.technician')),
            w.column('progress', t('shop.progress')),
            w.date_column('needed_by', t('shop.needed_by')),
            w.column('status', t('common.status')),
        ]
        table = w.table(columns, rows, height='60vh', pagination=0,
                        on_row_click=lambda row: _shop_dialog(row['id'], reload))
        w.add_badge_slot(table, 'status')


async def _errand_dialog(errand_id: int, reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[640px] max-w-full'):
        content = ui.column().classes('w-full')

    async def draw() -> None:
        data = await api.safe(api.get(f'/errands/{errand_id}'))
        if not data:
            return
        errand = data['errand']
        content.clear()
        with content:
            with ui.row().classes('items-start justify-between w-full px-5 py-3 border-b border-slate-200'):
                with ui.column().classes('gap-0.5 min-w-0'):
                    ui.label(errand.get('title', '')).classes('text-base font-semibold')
                    ui.label(f"{errand.get('errand_no')} · {_kind_label(errand.get('kind'), errand)}"
                             ).classes('text-xs text-slate-500')
                with ui.row().classes('gap-2 items-center'):
                    w.badge(errand.get('priority'))
                    w.badge(errand.get('status'))
                    ui.button(icon='close', on_click=dialog.close).props('flat round dense')

            with ui.column().classes('p-5 gap-3 w-full'):
                if errand.get('description'):
                    ui.label(errand['description']).classes('text-sm text-slate-700')
                meta = [
                    (t('errand.technician'), errand.get('assigned_to_name') or '—'),
                    (t('errand.where'), errand.get('location_note') or '—'),
                    (t('errand.vehicle'), errand.get('vehicle_note') or '—'),
                    (t('errand.due'), w.as_date(errand.get('due_date')) or '—'),
                    (t('errand.requested_by'), errand.get('requested_by_name') or '—'),
                ]
                if errand.get('shopping_list_no'):
                    meta.append((t('shop.no'), f"{errand['shopping_list_no']} — {errand.get('shopping_list_title') or ''}"))
                for label, value in meta:
                    with ui.row().classes('w-full gap-3 no-wrap'):
                        ui.label(label).classes('text-xs text-slate-500 w-36 shrink-0')
                        ui.label(str(value)).classes('text-sm text-slate-800')
                if errand.get('completion_note'):
                    w.note(errand['completion_note'], icon='notes', tone='slate')

                with ui.row().classes('w-full gap-2 flex-wrap pt-2'):
                    for action, label_key, icon, perm, props, allowed in ERRAND_ACTIONS:
                        if errand.get('status') not in allowed or not api.can(perm):
                            continue
                        ui.button(t(label_key), icon=icon,
                                  on_click=lambda a=action: _errand_action(errand, a, draw, reload)
                                  ).props(props + ' size=sm')

    await draw()
    dialog.open()


async def _shop_dialog(list_id: int, reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[720px] max-w-full'):
        content = ui.column().classes('w-full')

    async def draw() -> None:
        data = await api.safe(api.get(f'/shopping-lists/{list_id}'))
        if not data:
            return
        lst = data['list']
        items = lst.get('items') or []
        content.clear()
        with content:
            with ui.row().classes('items-start justify-between w-full px-5 py-3 border-b border-slate-200'):
                with ui.column().classes('gap-0.5 min-w-0'):
                    ui.label(lst.get('title', '')).classes('text-base font-semibold')
                    dest = lst.get('destination') or ''
                    ui.label(f"{lst.get('list_no')}{(' · ' + dest) if dest else ''}"
                             ).classes('text-xs text-slate-500')
                with ui.row().classes('gap-2 items-center'):
                    w.badge(lst.get('status'))
                    ui.button(icon='close', on_click=dialog.close).props('flat round dense')

            with ui.column().classes('p-5 gap-3 w-full').style('max-height: 70vh; overflow:auto'):
                if lst.get('notes'):
                    ui.label(lst['notes']).classes('text-sm text-slate-700')
                with ui.row().classes('w-full gap-4 text-xs text-slate-500'):
                    ui.label(f"{t('errand.technician')}: {lst.get('assigned_to_name') or '—'}")
                    if lst.get('needed_by'):
                        ui.label(f"{t('shop.needed_by')}: {w.as_date(lst['needed_by'])}")
                    if lst.get('errand_no'):
                        ui.label(f"{t('errand.no')}: {lst['errand_no']}")

                if not items:
                    w.empty_state(t('shop.no_items'), icon='shopping_basket')
                for item in items:
                    _shop_item_row(lst, item, draw)

                with ui.row().classes('w-full gap-2 flex-wrap pt-2'):
                    if api.can('shop.create') and lst.get('status') in ('open', 'shopping'):
                        ui.button(t('shop.add_item'), icon='add',
                                  on_click=lambda: _add_item_dialog(lst, draw)
                                  ).props('outline size=sm')
                    if api.can('errand.create') and not lst.get('errand_id') and lst.get('is_open'):
                        ui.button(t('shop.make_errand'), icon='directions_run',
                                  on_click=lambda: _errand_from_list(lst, draw, reload)
                                  ).props('outline size=sm')
                    for action, label_key, icon, perm, props, allowed in SHOP_ACTIONS:
                        if lst.get('status') not in allowed or not api.can(perm):
                            continue
                        ui.button(t(label_key), icon=icon,
                                  on_click=lambda a=action: _shop_action(lst, a, draw, reload)
                                  ).props(props + ' size=sm')

    await draw()
    dialog.open()


def _shop_item_row(lst: dict, item: dict, redraw) -> None:
    with ui.element('div').classes('w-full rounded-lg border border-slate-200 px-3 py-2'):
        with ui.row().classes('w-full items-center gap-2 no-wrap'):
            ui.label(f"{item.get('quantity')} {item.get('unit') or 'ea'}"
                     ).classes('lc-num text-xs text-slate-500 w-16 shrink-0')
            with ui.column().classes('gap-0 min-w-0 flex-1'):
                ui.label(item.get('description', '')).classes('text-sm text-slate-800')
                extra = ' · '.join(p for p in [item.get('vendor_note'), item.get('notes')] if p)
                if extra:
                    ui.label(extra).classes('text-[11px] text-slate-500')
            w.badge(item.get('status'))
            if api.can('shop.buy') and lst.get('status') in ('open', 'shopping') and item.get('status') == 'needed':
                ui.button(t('shop.bought'), icon='check',
                          on_click=lambda: _mark_item(lst, item, 'bought', redraw)
                          ).props('flat dense size=sm color=teal')
                ui.button(t('shop.unavailable'), icon='block',
                          on_click=lambda: _mark_item(lst, item, 'unavailable', redraw)
                          ).props('flat dense size=sm color=grey-8')


async def _mark_item(lst: dict, item: dict, status: str, redraw) -> None:
    payload = await api.safe(api.patch(
        f"/shopping-lists/{lst['id']}/items/{item['id']}", {'status': status}
    ))
    if payload:
        await redraw()


def _errand_create(reload, shopping_list_id: int | None = None) -> None:
    kinds_box = {'rows': [], 'selected': 'general'}
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[520px] max-w-full'):
        ui.label(t('errand.raise')).classes('text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full'):
            title = ui.input(t('errand.work')).props('outlined dense').classes('w-full')
            kind = ui.select({}, value='general', label=t('errand.kind')) \
                .props('outlined dense').classes('w-full')
            if api.can('errand.create'):
                ui.button(t('errand.kind_new'), icon='add',
                          on_click=lambda: _new_kind_dialog(kind, kinds_box)
                          ).props('flat dense no-caps').classes('self-start -mt-2')
            priority = ui.select({k: t(v) for k, v in PRIORITIES.items()},
                                 value='normal', label=t('wo.priority')) \
                .props('outlined dense').classes('w-full')
            due = ui.input(t('errand.due')).props('outlined dense type=date').classes('w-full')
            where = ui.input(t('errand.where')).props('outlined dense').classes('w-full')
            vehicle = ui.input(t('errand.vehicle')).props('outlined dense').classes('w-full')
            description = ui.textarea(t('errand.notes')).props('outlined dense rows=2').classes('w-full')
            assignee = ui.select({}, label=t('errand.technician')).props('outlined dense').classes('w-full')
            if not api.can('errand.assign'):
                assignee.set_visibility(False)

        async def submit() -> None:
            if not title.value:
                ui.notify(t('errand.need_title'), type='warning', position='top')
                return
            if not kind.value or kind.value == NEW_KIND:
                ui.notify(t('errand.need_kind'), type='warning', position='top')
                return
            payload = await api.safe(api.post('/errands', {
                'title': title.value,
                'kind': kind.value,
                'priority': priority.value,
                'dueDate': due.value or None,
                'locationNote': where.value or None,
                'vehicleNote': vehicle.value or None,
                'description': description.value or None,
                'assignedTo': assignee.value if api.can('errand.assign') else None,
                'shoppingListId': shopping_list_id,
            }))
            if payload:
                ui.notify(t('errand.raised', no=payload['errand']['errand_no']),
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('errand.raise'), on_click=submit).props('unelevated')

    def apply_kinds(selected: str | None = None) -> None:
        chosen = selected or kinds_box['selected'] or 'general'
        kinds_box['selected'] = chosen
        kind.set_options(_kind_options(kinds_box['rows'], add_new=True), value=chosen)

    def on_kind_change(e) -> None:
        if e.value == NEW_KIND:
            apply_kinds(kinds_box['selected'])
            _new_kind_dialog(kind, kinds_box)
            return
        kinds_box['selected'] = e.value

    kind.on_value_change(on_kind_change)

    async def load() -> None:
        data = await api.safe(api.get('/errand-kinds'), notify=False)
        kinds_box['rows'] = (data or {}).get('rows') or []
        apply_kinds('general')
        if not api.can('errand.assign'):
            return
        techs = await api.safe(api.get('/services/technicians'), notify=False)
        if techs:
            assignee.set_options({row['id']: row['full_name'] for row in techs.get('rows') or []})

    dialog.open()
    ui.timer(0.01, load, once=True)


def _new_kind_dialog(kind_select, kinds_box: dict) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[400px] max-w-full'):
        ui.label(t('errand.kind_new')).classes('text-base font-semibold mb-3')
        name_en = ui.input(t('errand.kind_name')).props('outlined dense autofocus').classes('w-full')
        name_fr = ui.input(t('errand.kind_name_fr')).props('outlined dense').classes('w-full')

        async def submit() -> None:
            label = (name_en.value or name_fr.value or '').strip()
            if not label:
                ui.notify(t('errand.need_kind'), type='warning', position='top')
                return
            payload = await api.safe(api.post('/errand-kinds', {
                'nameEn': (name_en.value or label).strip(),
                'name': (name_fr.value or name_en.value or label).strip(),
            }))
            if not payload:
                return
            created = payload.get('kind') or {}
            rows = await api.safe(api.get('/errand-kinds'), notify=False)
            kinds_box['rows'] = (rows or {}).get('rows') or []
            kinds_box['selected'] = created.get('code') or 'general'
            kind_select.set_options(
                _kind_options(kinds_box['rows'], add_new=True),
                value=kinds_box['selected'],
            )
            ui.notify(t('errand.kind_added', name=_kind_label(created.get('code'), created)),
                      type='positive', position='top')
            dialog.close()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('errand.kind_new'), on_click=submit).props('unelevated')
    dialog.open()


def _shop_create(reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-0 w-[520px] max-w-full'):
        ui.label(t('shop.raise')).classes('text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')
        with ui.column().classes('p-5 gap-3 w-full'):
            title = ui.input(t('shop.list')).props('outlined dense').classes('w-full')
            dest = ui.input(t('shop.destination')).props('outlined dense').classes('w-full')
            needed = ui.input(t('shop.needed_by')).props('outlined dense type=date').classes('w-full')
            notes = ui.textarea(t('shop.notes')).props('outlined dense rows=2').classes('w-full')
            first = ui.input(t('shop.first_item')).props('outlined dense').classes('w-full')
            qty = ui.number(t('shop.qty'), value=1, min=0.01, format='%.2f') \
                .props('outlined dense').classes('w-full')

        async def submit() -> None:
            if not title.value:
                ui.notify(t('shop.need_title'), type='warning', position='top')
                return
            items = []
            if first.value:
                items.append({'description': first.value, 'quantity': qty.value or 1, 'unit': 'ea'})
            payload = await api.safe(api.post('/shopping-lists', {
                'title': title.value,
                'destination': dest.value or None,
                'neededBy': needed.value or None,
                'notes': notes.value or None,
                'items': items or None,
            }))
            if payload:
                ui.notify(t('shop.raised', no=payload['list']['list_no']),
                          type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('shop.raise'), on_click=submit).props('unelevated')
    dialog.open()


def _add_item_dialog(lst: dict, redraw) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[420px] max-w-full'):
        ui.label(t('shop.add_item')).classes('text-base font-semibold mb-3')
        desc = ui.input(t('shop.item')).props('outlined dense').classes('w-full')
        with ui.row().classes('w-full gap-3 no-wrap'):
            qty = ui.number(t('shop.qty'), value=1, min=0.01, format='%.2f') \
                .props('outlined dense').classes('flex-1')
            unit = ui.input(t('shop.unit'), value='ea').props('outlined dense').classes('flex-1')

        async def submit() -> None:
            if not desc.value:
                ui.notify(t('shop.need_item'), type='warning', position='top')
                return
            payload = await api.safe(api.post(f"/shopping-lists/{lst['id']}/items", {
                'description': desc.value, 'quantity': qty.value or 1, 'unit': unit.value or 'ea',
            }))
            if payload:
                dialog.close()
                await redraw()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('shop.add_item'), on_click=submit).props('unelevated')
    dialog.open()


def _errand_action(errand: dict, action: str, redraw, reload) -> None:
    if action == 'assign':
        _assign_dialog('errand', errand['id'], redraw)
        return
    if action == 'complete':
        _note_dialog(t('errand.act.complete'), t('errand.done_note'),
                     lambda note: api.post(f"/errands/{errand['id']}/complete",
                                           {'completionNote': note or None}),
                     redraw, reload)
        return

    async def run() -> None:
        payload = await api.safe(api.post(f"/errands/{errand['id']}/{action}", {}))
        if payload:
            ui.notify(t('errand.updated'), type='positive', position='top')
            await redraw()
            await reload()
    ui.timer(0.01, run, once=True)


def _shop_action(lst: dict, action: str, redraw, reload) -> None:
    if action == 'assign':
        _assign_dialog('shop', lst['id'], redraw)
        return

    async def run() -> None:
        payload = await api.safe(api.post(f"/shopping-lists/{lst['id']}/{action}", {}))
        if payload:
            ui.notify(t('shop.updated'), type='positive', position='top')
            await redraw()
            await reload()
    ui.timer(0.01, run, once=True)


def _assign_dialog(kind: str, entity_id: int, redraw) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[400px] max-w-full'):
        ui.label(t('errand.act.assign')).classes('text-base font-semibold mb-3')
        person = ui.select({}, label=t('errand.technician')).props('outlined dense').classes('w-full')

        async def submit() -> None:
            if not person.value:
                ui.notify(t('errand.need_tech'), type='warning', position='top')
                return
            path = f'/errands/{entity_id}/assign' if kind == 'errand' \
                else f'/shopping-lists/{entity_id}/assign'
            payload = await api.safe(api.post(path, {'assignedTo': person.value}))
            if payload:
                dialog.close()
                await redraw()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('errand.act.assign'), on_click=submit).props('unelevated')

    async def load() -> None:
        data = await api.safe(api.get('/services/technicians'), notify=False)
        if data:
            person.set_options({row['id']: row['full_name'] for row in data.get('rows') or []})

    dialog.open()
    ui.timer(0.01, load, once=True)


def _note_dialog(title: str, field: str, send, redraw, reload) -> None:
    dialog = ui.dialog()
    with dialog, ui.element('div').classes('lc-card p-5 w-[420px] max-w-full'):
        ui.label(title).classes('text-base font-semibold mb-3')
        note = ui.textarea(field).props('outlined dense rows=3').classes('w-full')

        async def submit() -> None:
            payload = await api.safe(send(note.value))
            if payload:
                ui.notify(t('errand.updated'), type='positive', position='top')
                dialog.close()
                await redraw()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(title, on_click=submit).props('unelevated')
    dialog.open()


async def _errand_from_list(lst: dict, redraw, reload) -> None:
    payload = await api.safe(api.post('/errands', {
        'title': lst.get('title'),
        'kind': 'purchase_run',
        'priority': 'normal',
        'locationNote': lst.get('destination'),
        'shoppingListId': lst['id'],
        'assignedTo': lst.get('assigned_to'),
    }))
    if payload:
        ui.notify(t('errand.raised', no=payload['errand']['errand_no']),
                  type='positive', position='top')
        await redraw()
        await reload()
