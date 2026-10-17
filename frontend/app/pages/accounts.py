"""
Chart of accounts — the SYSCOHADA revised plan, classes 1 to 9, with the IFRS
presentation line each account maps to.
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, framework, lang, t
from ..ui import chrome, widgets as w
from ..ui.shell import page, admin_framework_dialog

CLASSES = list(range(1, 10))
IFRS_STATEMENTS = ('sofp', 'pl', 'oci', 'cf')


def _class_label(klass) -> str:
    return t(f'coa.class.{int(klass)}')


def _type_label(value) -> str:
    return t(f'coa.type.{value}') if value else ''


def _type_options() -> dict[str, str]:
    return {key: t(f'coa.type.{key}') for key in (
        'asset', 'liability', 'equity', 'revenue', 'expense', 'analytic', 'offbalance',
    )}


@page('/accounts', title='Chart of accounts', permissions=('coa.view',))
async def accounts_page() -> None:
    if framework() == 'ifrs':
        await _ifrs_chart()
        return
    await _ohada_chart()


async def _ohada_chart() -> None:
    state = {'search': '', 'class': None, 'postable': False, 'active': True}

    def actions() -> None:
        if api.can('coa.manage', 'admin.audit'):
            ui.button(
                t('admin.coa_settings_btn'),
                icon='settings',
                on_click=lambda: admin_framework_dialog(reload)
            ).props('outline size=sm color=slate-7')
        if api.can('coa.manage'):
            ui.button(t('coa.new'), icon='add', on_click=lambda: _account_dialog(reload)
                      ).props('unelevated size=sm')

    w.page_header(t('coa.title'), t('coa.sub'), actions=actions, emoji=chrome.PAGE['coa.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/accounts',
                                      framework='ohada',
                                      search=state['search'] or None,
                                      accountClass=state['class'],
                                      postableOnly=state['postable'] or None,
                                      activeOnly=state['active']))
        if not data:
            return
        rows = data.get('rows') or []
        with container:
            _summary(rows)
            _table(rows, reload)

    with ui.element('div').classes('lc-card p-4 w-full mb-1 lc-no-print'):
        with w.toolbar():
            search = ui.input(t('coa.search'), placeholder='2441') \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-80')
            search.bind_value(state, 'search')
            klass = ui.select({None: t('coa.all_classes'),
                               **{k: f"{t('coa.class')} {k} — {_class_label(k).split('—')[0].strip()}"
                                  for k in CLASSES}},
                              value=None, label=t('coa.class')) \
                .props('outlined dense options-dense').classes('w-44')
            klass.bind_value(state, 'class')
            postable = ui.switch(t('coa.postable')).props('dense').bind_value(state, 'postable')
            active = ui.switch(t('coa.active'), value=True).props('dense').bind_value(state, 'active')
            for element in (search, klass, postable, active):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


IFRS_CLASSES = {
    1: {'en': '1000 — Assets', 'fr': '1000 — Actifs'},
    2: {'en': '2000 — Liabilities', 'fr': '2000 — Passifs'},
    3: {'en': '3000 — Equity', 'fr': '3000 — Capitaux propres'},
    4: {'en': '4000 — Revenue', 'fr': '4000 — Produits'},
    5: {'en': '5000 — Cost of Sales', 'fr': '5000 — Coût des ventes / Médicaments'},
    6: {'en': '6000 — Operating Expenses', 'fr': '6000 — Charges d’exploitation'},
    7: {'en': '7000 — Finance & FX', 'fr': '7000 — Financier & Change'},
    8: {'en': '8000 — Income Tax', 'fr': '8000 — Impôt sur le résultat'},
    9: {'en': '9000 — OCI & Cash Flows', 'fr': '9000 — Autres éléments du résultat & Flux'},
}


async def _ifrs_chart() -> None:
    state = {'search': '', 'statement': None, 'class': None}

    def actions() -> None:
        if api.can('coa.manage', 'admin.audit'):
            ui.button(
                t('admin.coa_settings_btn'),
                icon='settings',
                on_click=lambda: admin_framework_dialog(reload)
            ).props('outline size=sm color=slate-7')

    w.page_header(t('coa.title'), t('coa.sub_ifrs'), actions=actions, emoji=chrome.PAGE['coa.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/accounts',
                                      framework='ifrs',
                                      search=state['search'] or None,
                                      statement=state['statement'],
                                      accountClass=state['class']))
        if not data:
            return
        rows = data.get('rows') or []
        with container:
            _ifrs_summary(rows)
            _ifrs_table(rows)

    cur_lang = lang() if lang() in ('fr', 'en') else 'en'
    class_opts = {None: t('coa.all_classes')}
    for k, v in IFRS_CLASSES.items():
        class_opts[k] = v.get(cur_lang, v['en'])

    with ui.element('div').classes('lc-card p-4 w-full mb-1 lc-no-print'):
        with w.toolbar():
            search = ui.input(t('coa.search'), placeholder='1100 or SOFP.PPE') \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            klass = ui.select(class_opts, value=None, label=t('coa.class')) \
                .props('outlined dense options-dense').classes('w-56')
            klass.bind_value(state, 'class')
            stmt = ui.select(
                {None: t('coa.all_statements'),
                 **{s: t(f'coa.stmt.{s}') for s in IFRS_STATEMENTS}},
                value=None, label=t('coa.statement'),
            ).props('outlined dense options-dense').classes('w-56')
            stmt.bind_value(state, 'statement')
            for element in (search, klass, stmt):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()


def _ifrs_summary(rows: list[dict]) -> None:
    counts: dict[str, int] = {}
    for row in rows:
        key = row.get('statement') or ''
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return
    with ui.row().classes('w-full gap-2 flex-wrap'):
        for stmt in IFRS_STATEMENTS:
            if stmt not in counts:
                continue
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[140px]'):
                ui.label(t(f'coa.stmt.{stmt}')).classes(
                    'text-[10.5px] font-bold uppercase tracking-wider text-slate-500')
                ui.label(w.number(counts[stmt])).classes('lc-num text-lg font-semibold text-slate-900')
                ui.label(stmt.upper()).classes('text-[11px] text-slate-500 truncate')


def _ifrs_table(rows: list[dict]) -> None:
    for row in rows:
        row['shown_name'] = account_label(row)
        row['other_name'] = (row.get('name') if lang() == 'en' else row.get('name_en')) or ''
        row['type_label'] = _type_label(row.get('account_type')) or row.get('account_type')
        row['statement_label'] = t(f"coa.stmt.{row.get('statement')}") if row.get('statement') in IFRS_STATEMENTS \
            else (row.get('statement') or '')
        row['section_label'] = w.humanise(row.get('section'))
        row['mapped_label'] = t('coa.mapped_n', n=w.number(row.get('mapped_accounts') or 0))
        row['ifrs_badge'] = row.get('ifrs_ref') or row.get('code')

    body = w.section(t('coa.count', n=w.number(len(rows))), t('coa.click_ifrs'))
    with body:
        if not rows:
            w.empty_state(t('coa.none'), icon='search_off')
            return
        columns = [
            w.column('code', t('coa.code'), classes='lc-num font-bold text-teal-800'),
            w.column('ifrs_badge', 'IFRS Ref', classes='font-mono text-xs text-slate-500'),
            w.column('shown_name', t('coa.name')),
            w.column('other_name', t('coa.name_other')),
            w.column('statement_label', t('coa.statement')),
            w.column('section_label', t('coa.section')),
            w.column('type_label', t('coa.type')),
            w.column('mapped_label', t('coa.mapped'), sortable=False),
        ]
        w.table(columns, rows, on_row_click=lambda row: _ifrs_detail(row['id']))


def _summary(rows: list[dict]) -> None:
    counts: dict[int, int] = {}
    for row in rows:
        counts[int(row['account_class'])] = counts.get(int(row['account_class']), 0) + 1
    if not counts:
        return
    with ui.row().classes('w-full gap-2 flex-wrap'):
        for klass in sorted(counts):
            with ui.element('div').classes('lc-card-flat px-3 py-2 min-w-[120px]'):
                ui.label(f"{chrome.CLASS_MARK.get(klass, '')} {t('coa.class')} {klass}").classes(
                    'text-[10.5px] font-bold uppercase tracking-wider text-slate-500')
                ui.label(w.number(counts[klass])).classes('lc-num text-lg font-semibold text-slate-900')
                ui.label(_class_label(klass).split('—')[0].strip()).classes('text-[11px] text-slate-500 truncate')


def _table(rows: list[dict], reload) -> None:
    for row in rows:
        row['shown_name'] = account_label(row)
        row['other_name'] = (row.get('name') if lang() == 'en' else row.get('name_en')) or ''
        row['type_label'] = _type_label(row.get('account_type')) or row.get('account_type')
        row['side'] = t('coa.debit') if row.get('normal_side') == 'debit' else t('coa.credit')
        row['kind'] = t('coa.posting') if row.get('is_postable') else t('coa.heading')
        row['flags'] = ' '.join(filter(None, [
            'CC' if row.get('requires_cost_center') else '',
            'Asset' if row.get('requires_asset') else '',
            'Rec' if row.get('is_reconcilable') else '',
        ])) or '—'

    body = w.section(t('coa.count', n=w.number(len(rows))), t('coa.click'))
    with body:
        if not rows:
            w.empty_state(t('coa.none'), icon='search_off')
            return
        columns = [
            w.column('code', t('coa.code'), classes='lc-num font-semibold'),
            w.column('shown_name', t('coa.name')),
            w.column('other_name', t('coa.name_other')),
            w.column('type_label', t('coa.type')),
            w.column('side', t('coa.normal_side')),
            w.column('kind', t('coa.kind')),
            w.column('flags', t('coa.requires'), sortable=False),
        ]
        table = w.table(columns, rows, on_row_click=lambda row: _detail_dialog(row['id'], reload))
        w.add_badge_slot(table, 'kind', tones={
            'posting': 'teal', 'heading': 'slate',
            'imputable': 'teal', 'collectif': 'slate',
        })


async def _detail_dialog(account_id: int, reload) -> None:
    data = await api.safe(api.get(f'/accounts/{account_id}'))
    if not data:
        return
    account = data['account']
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[720px] max-w-full'):
        with ui.row().classes('items-center justify-between w-full px-5 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-0'):
                ui.label(f"{account['code']} — {account_label(account)}").classes('text-base font-semibold')
                other = (account.get('name') if lang() == 'en' else account.get('name_en')) or ''
                ui.label(other).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('p-5 gap-4 w-full lc-scroll').style('max-height: 70vh'):
            w.detail_grid([
                (t('coa.class'), f"{account['account_class']} — {_class_label(account['account_class'])}"),
                (t('coa.type'), _type_label(account.get('account_type'))),
                (t('coa.normal_side'), t('coa.debit') if account.get('normal_side') == 'debit' else t('coa.credit')),
                (t('coa.parent'),
                 f"{account['parent_code']} {account_label({'name': account.get('parent_name'), 'name_en': account.get('parent_name_en')})}"
                 if account.get('parent_code') else t('coa.top_level')),
                (t('coa.accepts'), t('coa.yes') if account.get('is_postable') else t('coa.heading_note')),
                (t('coa.active_switch'), t('coa.yes') if account.get('is_active') else t('coa.no')),
                (t('coa.needs_cc'), t('coa.yes') if account.get('requires_cost_center') else t('coa.no')),
                (t('coa.needs_asset'), t('coa.yes') if account.get('requires_asset') else t('coa.no')),
                (t('coa.reconcilable'), t('coa.yes') if account.get('is_reconcilable') else t('coa.no')),
                (t('coa.fixed_asset'), t('coa.yes') if account.get('is_fixed_asset') else t('coa.no')),
                (t('coa.tier_normal'), t('coa.yes') if account.get('in_tier_normal') else t('coa.no')),
                (t('coa.tier_allege'), t('coa.yes') if account.get('in_tier_allege') else t('coa.no')),
            ])

            if account.get('is_system'):
                w.note(t('coa.system_note'), icon='lock')

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            if api.can('journal.view'):
                ui.button(t('coa.view_ledger'), icon='menu_book',
                          on_click=lambda: ui.navigate.to(f'/ledger?account={account["id"]}')
                          ).props('flat color=grey-8')
            if api.can('coa.manage'):
                if not account.get('is_postable') and str(account.get('code', '')).isdigit() \
                        and len(str(account.get('code', ''))) < 4:
                    ui.button('Create 4-character child', icon='subdirectory_arrow_right',
                              on_click=lambda: _make_default_child(account, dialog, reload)
                              ).props('outline')
                ui.button(t('coa.edit'), icon='edit',
                          on_click=lambda: (dialog.close(), _account_dialog(reload, account))
                          ).props('unelevated')
    dialog.open()


async def _make_default_child(account: dict, dialog, reload) -> None:
    result = await api.safe(api.post(f"/accounts/{account['id']}/default-child"))
    if result:
        child = result.get('account') or {}
        ui.notify(f"Created {child.get('code')} under {account['code']}.", type='positive', position='top')
        dialog.close()
        await reload()


async def _ifrs_detail(account_id: int) -> None:
    data = await api.safe(api.get(f'/ifrs-accounts/{account_id}'))
    if not data:
        return
    account = data['account']
    mapped = data.get('mapped_accounts') or []
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[720px] max-w-full'):
        with ui.row().classes('items-center justify-between w-full px-5 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-0'):
                ui.label(f"{account['code']} — {account_label(account)}").classes('text-base font-semibold')
                other = (account.get('name') if lang() == 'en' else account.get('name_en')) or ''
                ui.label(other).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('p-5 gap-4 w-full lc-scroll').style('max-height: 70vh'):
            stmt = account.get('statement')
            w.detail_grid([
                (t('coa.statement'), t(f'coa.stmt.{stmt}') if stmt in IFRS_STATEMENTS else stmt),
                (t('coa.section'), w.humanise(account.get('section'))),
                (t('coa.type'), _type_label(account.get('account_type'))),
                (t('coa.normal_side'), t('coa.debit') if account.get('normal_side') == 'debit' else t('coa.credit')),
                (t('coa.mapped'), t('coa.mapped_n', n=w.number(len(mapped)))),
            ])
            w.note(t('coa.ifrs_system'), icon='account_tree')
            ui.label(t('coa.mapped')).classes('text-[13px] font-bold uppercase tracking-wider '
                                              'text-slate-600 pt-2')
            if not mapped:
                w.note(t('coa.ifrs_none'), icon='info', tone='amber')
            else:
                for row in mapped:
                    with ui.row().classes('w-full items-center justify-between py-1.5 no-wrap '
                                          'border-b border-slate-100 last:border-0'):
                        with ui.column().classes('gap-0 min-w-0'):
                            ui.label(f"{row['code']} — {account_label(row)}"
                                     ).classes('text-sm text-slate-800 truncate')
                            ui.label(f"{t('coa.class')} {row.get('account_class')} · "
                                     f"{_type_label(row.get('account_type'))}"
                                     ).classes('text-[11px] text-slate-500')
                        ui.label(f"{float(row.get('allocation_pct') or 100):g}%"
                                 ).classes('lc-num text-sm font-semibold shrink-0')

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            if api.can('journal.view'):
                ui.button(t('coa.view_ledger'), icon='menu_book',
                          on_click=lambda: ui.navigate.to(f"/ledger?account={account['code']}")
                          ).props('unelevated')
    dialog.open()


def _account_dialog(reload, existing: dict | None = None) -> None:
    editing = existing is not None
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[640px] max-w-full'):
        ui.label(t('coa.edit_title') if editing else t('coa.new_title')).classes(
            'text-base font-semibold px-5 py-3 border-b border-slate-200 w-full')

        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 66vh'):
            if not editing:
                w.note(t('coa.code_hint'), icon='rule')
            with ui.row().classes('w-full gap-3 no-wrap'):
                code = ui.input(t('coa.code'), value=existing.get('code') if editing else '') \
                    .props('outlined dense' + (' readonly' if editing else '')).classes('flex-1')
                klass = ui.select({k: f"{t('coa.class')} {k}" for k in CLASSES},
                                  value=int(existing['account_class']) if editing else 2,
                                  label=t('coa.class')).props('outlined dense' + (' readonly' if editing else '')
                                                       ).classes('w-40')
            name = ui.input(t('coa.name_fr'), value=existing.get('name') if editing else '') \
                .props('outlined dense').classes('w-full')
            name_en = ui.input(t('coa.name_en'), value=(existing.get('name_en') or '') if editing else '') \
                .props('outlined dense').classes('w-full')
            with ui.row().classes('w-full gap-3 no-wrap'):
                kind = ui.select(_type_options(), value=existing.get('account_type') if editing else 'asset',
                                 label=t('coa.type')).props('outlined dense').classes('flex-1')
                side = ui.select({'debit': t('coa.debit'), 'credit': t('coa.credit')},
                                 value=existing.get('normal_side') if editing else 'debit',
                                 label=t('coa.normal_side')).props('outlined dense').classes('flex-1')
            postable = ui.switch(t('coa.accepts_switch'),
                                 value=bool(existing.get('is_postable')) if editing else True).props('dense')
            needs_cc = ui.switch(t('coa.requires_cc'),
                                 value=bool(existing.get('requires_cost_center')) if editing else False
                                 ).props('dense')
            needs_asset = ui.switch(t('coa.requires_asset'),
                                    value=bool(existing.get('requires_asset')) if editing else False
                                    ).props('dense')
            reconcilable = ui.switch(t('coa.reconcilable'),
                                     value=bool(existing.get('is_reconcilable')) if editing else False
                                     ).props('dense')
            active = ui.switch(t('coa.active_switch'), value=bool(existing.get('is_active')) if editing else True
                               ).props('dense')

        async def save() -> None:
            payload = {
                'name': name.value, 'name_en': name_en.value or None,
                'account_type': kind.value, 'normal_side': side.value,
                'is_postable': postable.value, 'requires_cost_center': needs_cc.value,
                'requires_asset': needs_asset.value, 'is_reconcilable': reconcilable.value,
            }
            if editing:
                payload['is_active'] = active.value
                result = await api.safe(api.patch(f"/accounts/{existing['id']}", payload))
            else:
                payload |= {'code': code.value.strip(), 'account_class': klass.value}
                result = await api.safe(api.post('/accounts', payload))
            if result:
                ui.notify(t('coa.saved'), type='positive', position='top')
                dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button(t('coa.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('coa.save'), on_click=save).props('unelevated')
    dialog.open()
