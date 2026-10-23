"""
Journal entries: the list, the double-entry capture form, and the entry view
with posting and reversal.

Capture and posting are separate permissions, so the form shows a clerk a
"Save as draft" button and an approver "Save and post".
"""

from __future__ import annotations

from nicegui import ui

from .. import api
from ..i18n import account_label, framework as current_framework, t
from ..ui import chrome, widgets as w
from ..ui.shell import page

FRAMEWORKS = {
    'both': 'Both frameworks — a statutory posting that IFRS also recognises',
    'ohada': 'OHADA only — statutory treatment not recognised under IFRS',
    'ifrs': 'IFRS only — the difference between the two treatments',
}


@page('/journal', title='Journal entries', permissions=('journal.view',))
async def journal_page(new: str = '', status: str = '') -> None:
    currency = api.user().get('functional_currency', 'XAF')
    view = current_framework()
    state = {'search': '', 'status': status or None, 'journal': None,
             'from': None, 'to': None, 'page': 1}

    journals = await api.safe(api.get('/journals'), notify=False) or {'rows': []}
    templates_res = await api.safe(api.get('/posting/templates'), notify=False) or {'rows': []}
    journal_options = {None: t('je.all_journals'),
                       **{j['id']: f"{j['code']} — {account_label(j)}" for j in journals['rows']}}

    def actions() -> None:
        if api.can('budget.view'):
            ui.button(t('bud.btn_title'), icon='pie_chart',
                      on_click=_budget_check_dialog).props('outline size=sm')
        if api.can('journal.view'):
            ui.button(t('rec.btn_title'), icon='event_repeat',
                      on_click=lambda: _recurring_dialog(reload)).props('outline size=sm')
        if api.can('journal.create'):
            ui.button(t('je.new'), icon='add',
                      on_click=lambda: _entry_form(journals['rows'], reload, initial_templates=templates_res.get('rows', []))).props('unelevated size=sm')

    w.page_header(t('je.title'), t('je.sub_ifrs') if view == 'ifrs' else t('je.sub_ohada'),
                  actions=actions, emoji=chrome.PAGE['je.title'])

    async def reload() -> None:
        container.clear()
        data = await api.safe(api.get('/entries', search=state['search'] or None,
                                      status=state['status'], journalId=state['journal'],
                                      basis=view,
                                      **{'from': state['from'], 'to': state['to']},
                                      page=state['page'], pageSize=50))
        if not data:
            return
        with container:
            _list(data, currency, reload)

    with ui.element('div').classes('lc-card p-4 w-full lc-no-print'):
        with w.toolbar():
            search = ui.input(t('common.search'), placeholder=t('je.search')) \
                .props('outlined dense clearable debounce=350').classes('w-full sm:w-72')
            search.bind_value(state, 'search')
            status_sel = ui.select({None: t('common.any_status'), 'draft': t('status.draft'),
                                    'posted': t('status.posted'),
                                    'reversed': t('status.reversed')},
                                   value=state['status'], label=t('common.status')) \
                .props('outlined dense options-dense').classes('w-40')
            status_sel.bind_value(state, 'status')
            journal_sel = ui.select(journal_options, value=None, label=t('je.journal')) \
                .props('outlined dense options-dense').classes('w-56')
            journal_sel.bind_value(state, 'journal')
            date_from = ui.input(t('common.from')).props('outlined dense type=date').classes('w-40')
            date_from.bind_value(state, 'from')
            date_to = ui.input(t('common.to')).props('outlined dense type=date').classes('w-40')
            date_to.bind_value(state, 'to')
            for element in (search, status_sel, journal_sel, date_from, date_to):
                element.on_value_change(reload)

    container = ui.column().classes('w-full gap-5')
    await reload()

    if new:
        _entry_form(journals['rows'], reload, initial_templates=templates_res.get('rows', []))


def _list(data: dict, currency: str, reload) -> None:
    rows = data.get('rows') or []
    total = data.get('total', len(rows))
    for row in rows:
        row['journal'] = f"{row['journal_code']}"
        row['amount'] = row.get('total_debit')

    drafts = sum(1 for r in rows if r.get('status') == 'draft')
    body = w.section(t('gl.entries_count', n=w.number(total)),
                     t('je.drafts_hint', n=w.number(drafts)) if drafts else t('je.all_posted_hint'))
    with body:
        if not rows:
            w.empty_state(t('je.no_match'), icon='receipt_long',
                          hint=t('je.no_match_hint'))
            return
        columns = [
            w.column('entry_no', t('je.entry_no'), classes='lc-num font-semibold'),
            w.date_column('entry_date', t('je.date')),
            w.column('journal', t('je.col_jnl')),
            w.column('description', t('je.description')),
            w.column('reference', t('je.reference')),
            w.column('period_code', t('je.period')),
            w.money_column('amount', f"{t('je.amount')} ({currency})", currency=currency),
            w.column('status', t('common.status')),
        ]
        table = w.table(columns, rows, on_row_click=lambda row: _entry_view(row['id'], reload),
                        pagination=25)
        w.add_badge_slot(table, 'status')


async def _entry_view(entry_id: int, reload) -> None:
    data = await api.safe(api.get(f'/entries/{entry_id}'))
    if not data:
        return
    entry, lines = data['entry'], data['lines']
    currency = entry.get('currency') or api.user().get('functional_currency', 'XAF')

    with ui.dialog().props('maximized' if len(lines) > 12 else '') as dialog, \
            ui.element('div').classes('lc-card p-0 w-[900px] max-w-full'):
        with ui.row().classes('items-start justify-between w-full px-5 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-1'):
                with ui.row().classes('items-center gap-2'):
                    ui.label(entry['entry_no']).classes('lc-num text-base font-semibold')
                    w.badge(entry['status'])
                    w.badge(entry['framework'],
                            tone={'both': 'teal', 'ohada': 'sky', 'ifrs': 'violet'}.get(entry['framework']),
                            label={'both': t('je.both_fw'), 'ohada': t('je.ohada_only'),
                                   'ifrs': t('je.ifrs_only')}.get(entry['framework']))
                ui.label(entry['description']).classes('text-sm text-slate-600')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('p-5 gap-4 w-full lc-scroll').style('max-height: 70vh'):
            w.detail_grid([
                (t('je.date'), w.as_date(entry['entry_date'])),
                (t('je.journal'), f"{entry['journal_code']} — {account_label({'name': entry.get('journal_name'), 'name_en': entry.get('journal_name_en')})}"),
                (t('je.period'), f"{entry['period_code']} ({w.humanise(entry['period_status'])})"),
                (t('je.reference'), entry.get('reference')),
                (t('je.source'), w.humanise(entry.get('source'))),
                (t('je.captured_by'), entry.get('created_by_name')),
                (t('je.posted_by'), entry.get('posted_by_name')),
                (t('je.posted_at'), w.as_datetime(entry.get('posted_at'))),
            ])
            if entry.get('narration'):
                w.note(entry['narration'], icon='notes')
            if entry.get('closed_period_override'):
                w.note(f"Posted into a closed period. Reason given: {entry.get('override_reason')} "
                       f"(authorised by {entry.get('override_by_name')}).",
                       icon='gavel', tone='amber')
            if entry.get('reverses_entry_no'):
                w.note(f"This entry reverses {entry['reverses_entry_no']}.", icon='undo', tone='sky')
            if entry.get('reversed_by_entry_no'):
                w.note(f"This entry has been reversed by {entry['reversed_by_entry_no']}.",
                       icon='undo', tone='rose')
            if entry.get('auto_reverse_date'):
                w.note(t('rec.note_scheduled', date=w.as_date(entry['auto_reverse_date'])),
                       icon='schedule', tone='amber')
            if entry.get('is_recurring'):
                w.note(t('rec.note_generated'),
                       icon='event_repeat', tone='teal')
            if entry.get('is_sealed'):
                w.note(t('seal.entry_note', seq=entry.get('seal_sequence'), hash=entry.get('entry_hash')),
                       icon='verified', tone='teal')

            ui.label(t('je.lines_title')).classes('text-[13px] font-bold uppercase tracking-wider text-slate-600 pt-1')
            w.statement_table(
                [t('coa.name'), f"{t('coa.debit')} ({currency})", f"{t('coa.credit')} ({currency})"],
                [{'code': line['account_code'],
                  'label': account_label({
                                'name': line.get('account_name'),
                                'name_en': line.get('account_name_en'),
                            })
                           + (f" · {line['description']}" if line.get('description') else '')
                           + (f" · {t('gl.tab_sub_bal')}: {line['subledger_code']}" if line.get('subledger_code') else '')
                           + (f" · [{t('gl.matching')} {line['match_code']}]" if line.get('match_code') else '')
                           + (f" · {line['cost_center_code']}" if line.get('cost_center_code') else '')
                           + (f" · {line['asset_tag']}" if line.get('asset_tag') else ''),
                  'values': [line['debit'] or None, line['credit'] or None]}
                 for line in lines]
                + [{'label': t('gl.totals'), 'kind': 'total',
                    'values': [entry['total_debit'], entry['total_credit']]}],
                currency,
            )
            balanced = abs(float(entry['total_debit']) - float(entry['total_credit'])) < 0.005
            w.check_banner([{'label': t('gl.diff_mvt'), 'balanced': balanced,
                             'difference': float(entry['total_debit']) - float(entry['total_credit'])}],
                           currency, subject=t('je.subject_entry'))

            attachments = data.get('attachments') or []
            if attachments:
                ui.label(t('je.supporting_docs')).classes(
                    'text-[13px] font-bold uppercase tracking-wider text-slate-600 pt-1')
                for doc in attachments:
                    with ui.row().classes('items-center gap-2 py-1'):
                        ui.icon('attach_file').classes('text-slate-400 text-base')
                        ui.label(doc.get('title') or doc.get('file_name')).classes('text-sm')
                        ui.label(w.humanise(doc.get('doc_type'))).classes('text-xs text-slate-400')

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            if entry['status'] == 'draft' and api.can('journal.create'):
                ui.button(t('je.btn_delete_draft'), icon='delete',
                          on_click=lambda: _delete(entry, dialog, reload)).props('flat color=red')
            if entry['status'] == 'draft' and api.can('journal.post'):
                ui.button(t('je.btn_post_ledger'), icon='task_alt',
                          on_click=lambda: _post(entry, dialog, reload)).props('unelevated')
            if entry['status'] == 'posted' and not entry.get('reversed_by_entry_id'):
                if api.can('journal.create'):
                    ui.button(t('rec.btn_schedule_rev'), icon='schedule',
                              on_click=lambda: _schedule_reversal_dialog(entry, dialog, reload)).props('outline size=sm')
                if entry.get('auto_reverse_date') and api.can('journal.reverse'):
                    ui.button(t('rec.btn_reverse_now'), icon='bolt',
                              on_click=lambda: _execute_single_reversal(entry, dialog, reload)).props('outline color=teal size=sm')
                if api.can('journal.reverse'):
                    ui.button(t('je.btn_reverse'), icon='undo',
                              on_click=lambda: _reverse(entry, dialog, reload)).props('outline color=red size=sm')
    dialog.open()


async def _post(entry: dict, dialog, reload) -> None:
    result = await api.safe(api.post(f"/entries/{entry['id']}/post"))
    if result:
        ui.notify(f"{entry['entry_no']} posted to the ledger.", type='positive', position='top')
        dialog.close()
        await reload()


async def _delete(entry: dict, dialog, reload) -> None:
    result = await api.safe(api.delete(f"/entries/{entry['id']}"))
    if result:
        ui.notify(f"Draft {entry['entry_no']} deleted.", type='positive', position='top')
        dialog.close()
        await reload()


def _reverse(entry: dict, parent, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label(f"Reverse {entry['entry_no']}").classes('text-base font-semibold')
        ui.label('A contra entry will be created. The original stays in the record.'
                 ).classes('text-xs text-slate-500 mb-3')
        date = ui.input('Reversal date', value=str(entry['entry_date'])[:10]) \
            .props('outlined dense type=date').classes('w-full')
        reason = ui.textarea('Reason for the reversal') \
            .props('outlined dense rows=3').classes('w-full')

        async def submit() -> None:
            if len((reason.value or '').strip()) < 5:
                ui.notify('Give a reason of at least five characters.', type='warning', position='top')
                return
            result = await api.safe(api.post(f"/entries/{entry['id']}/reverse",
                                             {'date': date.value, 'reason': reason.value.strip()}))
            if result:
                ui.notify(f"Reversed by {result['reversal']['entry_no']}.",
                          type='positive', position='top')
                dialog.close()
                parent.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            ui.button('Reverse entry', on_click=submit).props('unelevated color=red')
    dialog.open()


def _schedule_reversal_dialog(entry: dict, parent_dialog, reload) -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[460px] max-w-full'):
        ui.label(t('rec.schedule_title', no=entry['entry_no'])).classes('text-base font-semibold')
        ui.label(t('rec.schedule_sub')).classes('text-xs text-slate-500 mb-3')
        current_rev = str(entry.get('auto_reverse_date') or '')[:10]
        date_input = ui.input(t('rec.auto_rev_date'), value=current_rev or w.today_iso()) \
            .props('outlined dense type=date').classes('w-full')

        async def submit() -> None:
            if not date_input.value:
                ui.notify(t('rec.prompt_date'), type='warning', position='top')
                return
            res = await api.safe(api.post(f"/entries/{entry['id']}/schedule-reversal", {
                'autoReverseDate': date_input.value,
            }))
            if res:
                ui.notify(t('rec.scheduled_notify', date=date_input.value), type='positive', position='top')
                dialog.close()
                parent_dialog.close()
                await reload()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('rec.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('rec.save'), icon='save', on_click=submit).props('unelevated')
    dialog.open()


async def _execute_single_reversal(entry: dict, parent_dialog, reload) -> None:
    res = await api.safe(api.post(f"/entries/{entry['id']}/reverse-accrual", {}))
    if res:
        ui.notify(t('rec.single_rev_success', no=res.get('reversal', {}).get('entry_no')),
                  type='positive', position='top')
        parent_dialog.close()
        await reload()


async def _recurring_dialog(reload) -> None:
    data = await api.safe(api.get('/templates/recurring'))
    templates = (data.get('rows') or []) if data else []

    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-0 w-[900px] max-w-full'):
        with ui.row().classes('items-start justify-between w-full px-5 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-1'):
                ui.label(t('rec.dialog_title')).classes('text-base font-semibold')
                ui.label(t('rec.dialog_sub', n=len(templates))).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('p-5 gap-3 w-full lc-scroll').style('max-height: 70vh'):
            w.note(t('rec.note'), icon='event_repeat', tone='teal')

            if not templates:
                w.empty_state(t('rec.empty'), icon='playlist_add')
            else:
                table_rows = []
                for t_item in templates:
                    table_rows.append({
                        'code': t_item.get('code'),
                        'name': t_item.get('name'),
                        'frequency': w.humanise(t_item.get('frequency')),
                        'day': t('rec.day_fmt', d=t_item.get('day_of_month') or 1),
                        'next_run': t_item.get('next_run_date'),
                        'auto_post': t('rec.mode_posted') if t_item.get('auto_post') else t('rec.mode_draft'),
                        'last_run': t_item.get('last_run_at'),
                    })

                columns = [
                    w.column('code', t('rec.col_code'), classes='lc-num font-semibold'),
                    w.column('name', t('rec.col_name')),
                    w.column('frequency', t('rec.col_freq')),
                    w.column('day', t('rec.col_day')),
                    w.date_column('next_run', t('rec.col_next')),
                    w.column('auto_post', t('rec.col_mode')),
                    w.date_column('last_run', t('rec.col_last')),
                ]
                w.table(columns, table_rows, pagination=10)

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            ui.button(t('rec.btn_close'), on_click=dialog.close).props('flat color=grey-8')
            if templates and api.can('journal.create'):
                async def generate_due() -> None:
                    res = await api.safe(api.post('/templates/recurring/process', {}))
                    if res:
                        ui.notify(
                            t('rec.success_count', n=res.get('processedCount', 0)),
                            type='positive', position='top'
                        )
                        dialog.close()
                        await reload()

                ui.button(t('rec.btn_generate_due'), icon='play_arrow', on_click=generate_due).props('unelevated color=teal')
    dialog.open()


def _empty_line() -> dict:
    return {
        'account': None, 'description': '', 'debit': 0.0, 'credit': 0.0,
        'cost_center': None, 'partner_type': 'none', 'partner_id': None,
        'origin': 'manual', 'proposal_source': None, 'proposal_rule_code': None,
        'proposal_reason': None,
    }


def _entry_form(journals: list[dict], reload, initial_templates: list[dict] | None = None) -> None:
    """
    Double-entry capture. The running totals and the out-of-balance figure are
    always on screen, because an entry that does not balance cannot be saved.
    """
    currency = api.user().get('functional_currency', 'XAF')
    lines: list[dict] = [_empty_line(), _empty_line()]
    accounts: dict[int, str] = {}
    account_meta: dict[int, dict] = {}
    cost_centers: dict[int | None, str] = {None: '—'}
    partners: dict[int | None, str] = {None: '—'}
    partner_meta: dict[int, dict] = {}

    # Automatically populate framework as per settings in the admin section
    user_info = api.user()
    admin_fw = str(user_info.get('frameworks') or '').lower().strip()
    if admin_fw in ('ifrs', 'ohada', 'both'):
        auto_framework = admin_fw
    else:
        auto_framework = current_framework() or 'both'

    templates: dict[str | None, str] = {None: 'No template — infer the counterpart'}
    tpl_by_type: dict[str, dict] = {}
    if initial_templates:
        for tpl in initial_templates:
            lbl = tpl.get('name_en') if auto_framework == 'ifrs' else (tpl.get('name') or tpl.get('name_en') or tpl.get('code'))
            templates[tpl['transaction_type']] = lbl
            tpl_by_type[tpl['transaction_type']] = tpl

    def build_journal_options() -> dict:
        opts = {j['code']: f"{j['code']} — {account_label(j)}" for j in journals}
        opts['__NEW_JOURNAL__'] = '➕ + Create new journal...'
        return opts

    def build_template_options() -> dict:
        opts = {None: 'No template — infer the counterpart'}
        for k, v in templates.items():
            if k is not None and k != '__NEW_TXN__':
                opts[k] = v
        opts['__NEW_TXN__'] = '➕ + Create new transaction type...'
        return opts

    journal_default_val = next((j['code'] for j in journals if j['code'] == 'OD'),
                               journals[0]['code'] if journals else None)
    last_journal_val = [journal_default_val]
    last_txn_val = [None]

    with ui.dialog().props('maximized persistent') as dialog, \
            ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        with ui.row().classes('items-center justify-between w-full px-6 py-3 border-b border-slate-200 '
                              'shrink-0'):
            with ui.column().classes('gap-0'):
                ui.label('New journal entry').classes('text-base font-semibold')
                ui.label('Both sides must agree before the entry can be saved.'
                         ).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        def _open_new_journal_dialog():
            with ui.dialog() as j_dialog, ui.card().classes('w-full max-w-[500px] p-6 gap-4'):
                with ui.row().classes('w-full items-center justify-between'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('book', size='sm').classes('text-teal-600')
                        ui.label('Create New Journal').classes('text-base font-bold text-slate-800')
                    ui.button(icon='close', on_click=j_dialog.close).props('flat dense round')

                j_code = ui.input('Journal Code *', placeholder='e.g. CS2, OD2, EXP') \
                    .props('outlined dense').classes('w-full')
                j_name = ui.input('Journal Name (Default) *', placeholder='e.g. Journal des caisses secondaires') \
                    .props('outlined dense').classes('w-full')
                j_name_en = ui.input('English Name (optional)', placeholder='e.g. Secondary Cash Journal') \
                    .props('outlined dense').classes('w-full')

                j_types = {
                    'general': 'General / Diverse (OD)',
                    'purchase': 'Purchases / Achats (HA)',
                    'sales': 'Sales / Ventes (VT)',
                    'bank': 'Bank / Banque (BQ)',
                    'cash': 'Cash / Caisse (CA)',
                    'payroll': 'Payroll / Paie',
                    'asset': 'Fixed Assets / Immobilisations',
                    'depreciation': 'Depreciation / Amortissements',
                    'closing': 'Closing / Clôture',
                    'fx': 'Foreign Exchange / Devises',
                }
                j_type = ui.select(j_types, value='general', label='Journal Type *') \
                    .props('outlined dense options-dense').classes('w-full')

                j_manual = ui.checkbox('Allow manual postings in this journal', value=True)

                async def _save_journal():
                    code = (j_code.value or '').strip().upper()
                    name = (j_name.value or '').strip()
                    name_en = (j_name_en.value or '').strip() or None
                    if not code or not name:
                        ui.notify('Please provide both a code and a name.', type='warning', position='top')
                        return
                    res = await api.safe(api.post('/journals', {
                        'code': code,
                        'name': name,
                        'nameEn': name_en,
                        'journalType': j_type.value,
                        'allowManual': j_manual.value,
                    }))
                    if res and 'journal' in res:
                        new_j = res['journal']
                        journals.append(new_j)
                        journal.options = build_journal_options()
                        journal.update()
                        journal.value = new_j['code']
                        last_journal_val[0] = new_j['code']
                        ui.notify(f"Journal {new_j['code']} created and selected!", type='positive', position='top')
                        j_dialog.close()

                with ui.row().classes('w-full justify-end gap-2 mt-2'):
                    ui.button('Cancel', on_click=j_dialog.close).props('flat color=grey-8')
                    ui.button('Save & Select', icon='check', on_click=_save_journal) \
                        .props('unelevated color=primary no-caps').classes('rounded-lg px-4')

            j_dialog.open()

        def _open_new_template_dialog():
            with ui.dialog() as t_dialog, ui.card().classes('w-full max-w-[560px] p-6 gap-4'):
                with ui.row().classes('w-full items-center justify-between'):
                    with ui.row().classes('items-center gap-2'):
                        ui.icon('auto_fix_high', size='sm').classes('text-teal-600')
                        ui.label('Create New Transaction Type / Template').classes('text-base font-bold text-slate-800')
                    ui.button(icon='close', on_click=t_dialog.close).props('flat dense round')

                ui.label('Define a standardized transaction type with optional balancing account rules.') \
                    .classes('text-xs text-slate-500 -mt-2')

                t_code = ui.input('Transaction Type Code *', placeholder='e.g. UTILITY_BILL, CONSULT_FEE') \
                    .props('outlined dense').classes('w-full')
                t_name = ui.input('Name (Default) *', placeholder='e.g. Factures électricité & eau') \
                    .props('outlined dense').classes('w-full')
                t_name_en = ui.input('English Name (optional)', placeholder='e.g. Utility Bills / Electricity & Water') \
                    .props('outlined dense').classes('w-full')

                j_opts = {None: '— None (infer from entry) —', **{j['code']: f"{j['code']} — {account_label(j)}" for j in journals}}
                t_journal = ui.select(j_opts, value=journal.value, label='Default Journal (optional)') \
                    .props('outlined dense options-dense').classes('w-full')

                acct_opts = {None: '— None (suspense / generic counterpart) —', **accounts}
                t_acct = ui.select(acct_opts, value=None, label='Balancing Counterpart Account (optional)') \
                    .props('outlined dense options-dense filter use-input').classes('w-full')

                t_side = ui.select({'credit': 'Credit (balances expense/asset debits)', 'debit': 'Debit (balances customer/revenue credits)'},
                                   value='credit', label='Counterpart Side') \
                    .props('outlined dense options-dense').classes('w-full')

                async def _save_template():
                    code = (t_code.value or '').strip().upper()
                    name = (t_name.value or '').strip()
                    name_en = (t_name_en.value or '').strip() or None
                    if not code or not name:
                        ui.notify('Please provide both a code and a name.', type='warning', position='top')
                        return
                    txn_type = code.lower().replace(' ', '_').replace('-', '_')
                    res = await api.safe(api.post('/posting/templates', {
                        'code': code,
                        'name': name,
                        'nameEn': name_en,
                        'transactionType': txn_type,
                        'journalCode': t_journal.value or None,
                        'counterpartAccountId': t_acct.value or None,
                        'side': t_side.value or 'credit',
                    }))
                    if res and 'template' in res:
                        new_tpl = res['template']
                        label = new_tpl.get('name_en') if auto_framework == 'ifrs' else (new_tpl.get('name') or new_tpl.get('name_en') or new_tpl['code'])
                        templates[new_tpl['transaction_type']] = label
                        tpl_by_type[new_tpl['transaction_type']] = new_tpl
                        txn.options = build_template_options()
                        txn.update()
                        txn.value = new_tpl['transaction_type']
                        last_txn_val[0] = new_tpl['transaction_type']
                        if new_tpl.get('journal_code') and new_tpl['journal_code'] in journal.options:
                            journal.value = new_tpl['journal_code']
                            last_journal_val[0] = new_tpl['journal_code']
                        if not description.value:
                            description.value = label
                        ui.notify(f"Transaction type {new_tpl['code']} created and selected!", type='positive', position='top')
                        t_dialog.close()

                with ui.row().classes('w-full justify-end gap-2 mt-2'):
                    ui.button('Cancel', on_click=t_dialog.close).props('flat color=grey-8')
                    ui.button('Save & Select', icon='check', on_click=_save_template) \
                        .props('unelevated color=primary no-caps').classes('rounded-lg px-4')

            t_dialog.open()

        with ui.column().classes('flex-1 overflow-auto px-6 py-4 gap-4 w-full max-w-[1200px] mx-auto'):
            with ui.row().classes('w-full gap-3 flex-wrap items-center'):
                with ui.row().classes('items-center gap-1'):
                    journal = ui.select(build_journal_options(),
                                        label='Journal',
                                        value=journal_default_val) \
                        .props('outlined dense options-dense').classes('w-64')
                    ui.button(icon='add', on_click=lambda: _open_new_journal_dialog()) \
                        .props('flat dense round color=primary size=sm').tooltip('Create new journal')

                date = ui.input('Entry date', value=w.today_iso()).props('outlined dense type=date') \
                    .classes('w-44')
                reference = ui.input('Reference *').props('outlined dense') \
                    .classes('w-52').tooltip('Mandatory supporting document / Pièce justificative (AUDCIF Art. 17)')

                with ui.row().classes('items-center gap-1 flex-1 min-w-[300px]'):
                    txn = ui.select(build_template_options(), value=None, label='Transaction type') \
                        .props('outlined dense options-dense').classes('flex-1')
                    ui.button(icon='add', on_click=lambda: _open_new_template_dialog()) \
                        .props('flat dense round color=primary size=sm').tooltip('Create new transaction type')

            def _on_journal_change(e):
                if e.value == '__NEW_JOURNAL__':
                    journal.value = last_journal_val[0]
                    _open_new_journal_dialog()
                else:
                    last_journal_val[0] = e.value
            journal.on_value_change(_on_journal_change)

            def _on_txn_change(e):
                if e.value == '__NEW_TXN__':
                    txn.value = last_txn_val[0]
                    _open_new_template_dialog()
                    return
                last_txn_val[0] = e.value
                val = e.value
                if val and val in tpl_by_type:
                    t_item = tpl_by_type[val]
                    if t_item.get('journal_code') and t_item['journal_code'] in journal.options:
                        journal.value = t_item['journal_code']
                        last_journal_val[0] = t_item['journal_code']
                    if not description.value and (t_item.get('name_en') or t_item.get('name')):
                        description.value = t_item.get('name_en') if auto_framework == 'ifrs' else (t_item.get('name') or t_item.get('name_en'))
            txn.on_value_change(_on_txn_change)

            description = ui.input('Description').props('outlined dense').classes('w-full')
            narration = ui.textarea('Narration (optional)').props('outlined dense rows=2').classes('w-full')

            ui.label('Lines').classes('text-[13px] font-bold uppercase tracking-wider text-slate-600')
            lines_box = ui.column().classes('w-full gap-2')
            totals_row = ui.row().classes('w-full items-center justify-end gap-6 pt-2 '
                                          'border-t border-slate-200')

            def totals() -> tuple[float, float]:
                debit = sum(float(line['debit'] or 0) for line in lines)
                credit = sum(float(line['credit'] or 0) for line in lines)
                return debit, credit

            def refresh_totals() -> None:
                debit, credit = totals()
                difference = round(debit - credit, 2)
                totals_row.clear()
                with totals_row:
                    for label, value in (('Total debit', debit), ('Total credit', credit)):
                        with ui.column().classes('gap-0 items-end'):
                            ui.label(label).classes('text-[11px] uppercase tracking-wider text-slate-500')
                            ui.label(w.money(value, currency)).classes('lc-num text-base font-semibold')
                    with ui.column().classes('gap-0 items-end'):
                        ui.label('Out of balance').classes('text-[11px] uppercase tracking-wider '
                                                           'text-slate-500')
                        ui.label(w.money(difference, currency) if difference else '—').classes(
                            'lc-num text-base font-semibold '
                            + ('text-rose-600' if difference else 'text-emerald-600'))
                    save_draft.set_enabled(difference == 0 and debit > 0)
                    save_post.set_enabled(difference == 0 and debit > 0)

            auto_propose_timer = [None]
            is_proposing = [False]

            def trigger_auto_propose() -> None:
                if not lines or len(lines) < 2 or is_proposing[0]:
                    return
                first = lines[0]
                if not first.get('account'):
                    return
                debit_val = float(first.get('debit') or 0)
                credit_val = float(first.get('credit') or 0)
                if debit_val <= 0 and credit_val <= 0:
                    return
                # If second line was manually edited by the user, do not auto-overwrite it
                if len(lines) > 1 and lines[1].get('origin') == 'edited':
                    return
                if auto_propose_timer[0]:
                    auto_propose_timer[0].cancel()
                auto_propose_timer[0] = ui.timer(0.35, lambda: _run_auto_propose(), once=True)

            async def _run_auto_propose() -> None:
                if is_proposing[0]:
                    return
                is_proposing[0] = True
                try:
                    await propose(is_auto=True)
                except Exception:
                    pass
                finally:
                    is_proposing[0] = False

            def draw_lines() -> None:
                lines_box.clear()
                with lines_box:
                    with ui.row().classes('w-full gap-2 px-1 no-wrap text-[10.5px] font-bold uppercase '
                                          'tracking-wider text-slate-500'):
                        ui.label('Account').classes('flex-[3] min-w-0')
                        ui.label('Line description').classes('flex-[2] min-w-0')
                        ui.label('Cost centre').classes('w-40 shrink-0')
                        ui.label('Debit').classes('w-36 shrink-0 text-right')
                        ui.label('Credit').classes('w-36 shrink-0 text-right')
                        ui.label('').classes('w-8 shrink-0')
                    for index, line in enumerate(lines):
                        with ui.row().classes('w-full gap-2 items-center no-wrap'):
                            account = ui.select(accounts, label=None, with_input=True,
                                                value=line['account']) \
                                .props('outlined dense options-dense use-input hide-selected '
                                       'input-debounce=200 placeholder="Type a code or name"') \
                                .classes('flex-[3] min-w-0')

                            def _on_acct_change(e, i=index):
                                old = lines[i].get('account')
                                lines[i]['account'] = e.value
                                if e.value != old:
                                    if i > 0 and lines[i].get('origin') == 'proposed':
                                        lines[i]['origin'] = 'edited'
                                    if i == 0:
                                        trigger_auto_propose()
                                    refresh_totals()
                            account.on_value_change(_on_acct_change)

                            note = ui.input(placeholder='Optional', value=line.get('description') or '') \
                                .props('outlined dense').classes('flex-[2] min-w-0')
                            def _on_note_change(e, i=index):
                                lines[i]['description'] = e.value
                                if i > 0 and lines[i].get('origin') == 'proposed':
                                    lines[i]['origin'] = 'edited'
                            note.on_value_change(_on_note_change)

                            centre = ui.select(cost_centers, value=line.get('cost_center')) \
                                .props('outlined dense options-dense').classes('w-36 shrink-0')
                            def _on_centre_change(e, i=index):
                                lines[i]['cost_center'] = e.value
                                if i > 0 and lines[i].get('origin') == 'proposed':
                                    lines[i]['origin'] = 'edited'
                            centre.on_value_change(_on_centre_change)

                            party = ui.select(partners, value=line.get('partner_id')) \
                                .props('outlined dense options-dense').classes('w-40 shrink-0') \
                                .tooltip('Supplier / client auxiliary under AUDCIF Art. 19')
                            def _on_party_change(e, i=index):
                                lines[i]['partner_id'] = e.value
                                if e.value and e.value in partner_meta:
                                    lines[i]['partner_type'] = partner_meta[e.value].get('partner_type') or 'supplier'
                                elif not e.value:
                                    lines[i]['partner_type'] = 'none'
                                if i > 0 and lines[i].get('origin') == 'proposed':
                                    lines[i]['origin'] = 'edited'
                            party.on_value_change(_on_party_change)

                            debit = ui.number(value=line['debit'] or None, min=0, format='%.2f') \
                                .props('outlined dense input-class=text-right debounce=250').classes('w-36 shrink-0')
                            def _on_debit_change(e, i=index):
                                old = float(lines[i].get('debit') or 0)
                                new_val = float(e.value or 0)
                                lines[i]['debit'] = new_val
                                _one_side(lines, i, 'debit', refresh_totals, draw_lines)
                                if new_val != old:
                                    if i > 0 and lines[i].get('origin') == 'proposed':
                                        lines[i]['origin'] = 'edited'
                                    if i == 0:
                                        trigger_auto_propose()
                            debit.on_value_change(_on_debit_change)

                            credit = ui.number(value=line['credit'] or None, min=0, format='%.2f') \
                                .props('outlined dense input-class=text-right debounce=250').classes('w-36 shrink-0')
                            def _on_credit_change(e, i=index):
                                old = float(lines[i].get('credit') or 0)
                                new_val = float(e.value or 0)
                                lines[i]['credit'] = new_val
                                _one_side(lines, i, 'credit', refresh_totals, draw_lines)
                                if new_val != old:
                                    if i > 0 and lines[i].get('origin') == 'proposed':
                                        lines[i]['origin'] = 'edited'
                                    if i == 0:
                                        trigger_auto_propose()
                            credit.on_value_change(_on_credit_change)

                            if line.get('origin') == 'proposed':
                                ui.badge('Proposed').props('dense color=light-blue').tooltip('Auto-proposed counterpart (you can edit to fit)')
                            elif line.get('origin') == 'edited':
                                ui.badge('Edited').props('dense color=amber-8').tooltip('Edited counterpart line')

                            ui.button(icon='close', on_click=lambda i=index: remove(i)) \
                                .props('flat dense round size=sm color=grey-6').classes('w-8 shrink-0') \
                                .set_enabled(len(lines) > 2)
                refresh_totals()

            def add_line() -> None:
                lines.append(_empty_line())
                draw_lines()

            def remove(index: int) -> None:
                if len(lines) > 2:
                    lines.pop(index)
                    draw_lines()

            def balance_line() -> None:
                """Fills the last empty line with whatever makes the entry agree."""
                debit, credit = totals()
                difference = round(debit - credit, 2)
                if not difference:
                    return
                target = next((line for line in lines
                               if not line['debit'] and not line['credit']), None)
                if target is None:
                    lines.append(_empty_line())
                    target = lines[-1]
                if difference > 0:
                    target['credit'] = difference
                else:
                    target['debit'] = -difference
                draw_lines()

            proposal_box = ui.column().classes('w-full gap-1')

            async def propose(is_auto: bool = False) -> None:
                payload = []
                for idx, line in enumerate(lines):
                    if not line['account'] or (not line['debit'] and not line['credit']):
                        continue
                    if is_auto and idx > 0 and line.get('origin') == 'proposed':
                        continue
                    payload.append({
                        'accountId': line['account'],
                        'debit': float(line['debit'] or 0),
                        'credit': float(line['credit'] or 0),
                        'partnerType': line.get('partner_type') or 'none',
                        'partnerId': line.get('partner_id'),
                    })
                if not payload:
                    if not is_auto:
                        ui.notify('Enter at least one complete line first.', type='warning', position='top')
                    return
                result = await api.safe(api.post('/entries/propose', {
                    'transactionType': txn.value, 'journalCode': journal.value, 'lines': payload,
                }))
                if not result:
                    return
                proposal_box.clear()
                if result.get('balanced'):
                    if not is_auto:
                        with proposal_box:
                            w.note('The entry is already balanced. No counterpart is needed.', icon='verified')
                    return
                proposals = result.get('proposals') or []
                if not proposals:
                    if not is_auto:
                        ui.notify('No counterpart could be proposed.', type='warning', position='top')
                    return
                with proposal_box:
                    for item in proposals:
                        w.note(
                            f"Proposed {item['accountCode']} · {item.get('proposalReason') or item.get('proposal_reason')}",
                            icon='auto_fix_high', tone='sky')
                for item in proposals:
                    target = next((line for idx, line in enumerate(lines) if idx > 0 and
                                   ((not line['account'] and not line['debit'] and not line['credit'])
                                    or line.get('origin') == 'proposed')), None)
                    if target is None:
                        lines.append(_empty_line())
                        target = lines[-1]
                    target['account'] = item.get('accountId')
                    target['debit'] = float(item.get('debit') or 0)
                    target['credit'] = float(item.get('credit') or 0)
                    target['origin'] = 'proposed'
                    target['proposal_source'] = item.get('proposalSource')
                    target['proposal_rule_code'] = item.get('proposalRuleCode')
                    target['proposal_reason'] = item.get('proposalReason')
                    target['partner_type'] = item.get('partnerType') or 'none'
                    target['partner_id'] = item.get('partnerId')
                draw_lines()
                if is_auto:
                    ui.notify('Counterpart automatically proposed — you can edit the line to fit.',
                              type='positive', position='top')
                else:
                    ui.notify('Counterpart proposed — accept it as shown, or edit the line before saving.',
                              type='positive', position='top')

            with ui.row().classes('w-full gap-2'):
                ui.button('Add line', icon='add', on_click=add_line).props('flat dense size=sm')
                ui.button('Propose counterpart', icon='auto_fix_high', on_click=propose) \
                    .props('unelevated dense size=sm') \
                    .tooltip('Suggests the balancing line from the template, a default, history or suspense')
                ui.button('Balance the entry', icon='balance', on_click=balance_line) \
                    .props('flat dense size=sm').tooltip('Puts the difference on the first empty line')

        with ui.row().classes('w-full justify-end gap-2 px-6 py-3 border-t border-slate-200 shrink-0'):
            ui.button('Cancel', on_click=dialog.close).props('flat color=grey-8')
            save_draft = ui.button('Save as draft', icon='save').props('outline')
            save_post = ui.button('Save and post', icon='task_alt').props('unelevated')
            if not api.can('journal.post'):
                save_post.set_visibility(False)

        async def save(auto_post: bool) -> None:
            ref_val = (reference.value or '').strip()
            if not ref_val:
                ui.notify(t('je.err_reference_required'), type='warning', position='top')
                return
            if not description.value or not journal.value:
                ui.notify('A journal and a description are needed.', type='warning', position='top')
                return

            payload_lines = []
            for line in lines:
                if not line['account'] or (not line['debit'] and not line['credit']):
                    continue
                acct = account_meta.get(line['account'])
                if acct:
                    if acct.get('requires_third_party') and not line.get('partner_id'):
                        ui.notify(t('je.err_partner_required', account=acct.get('code')), type='warning', position='top')
                        return
                    if acct.get('requires_cost_center') and not line.get('cost_center'):
                        ui.notify(t('je.err_cost_center_required', account=acct.get('code')), type='warning', position='top')
                        return

                pid = line.get('partner_id')
                ptype = 'none'
                if pid:
                    if pid in partner_meta:
                        ptype = partner_meta[pid].get('partner_type') or 'supplier'
                    elif acct and str(acct.get('code', '')).startswith('41'):
                        ptype = 'customer'
                    else:
                        ptype = 'supplier'

                payload_lines.append({
                    'accountId': line['account'],
                    'description': line['description'] or None,
                    'costCenterId': line['cost_center'],
                    'debit': float(line['debit'] or 0),
                    'credit': float(line['credit'] or 0),
                    'partnerType': ptype,
                    'partnerId': pid,
                    'origin': line.get('origin') or 'manual',
                    'proposalSource': line.get('proposal_source'),
                    'proposalRuleCode': line.get('proposal_rule_code'),
                    'proposalReason': line.get('proposal_reason'),
                })
            if len(payload_lines) < 2:
                ui.notify('An entry needs at least two complete lines.', type='warning', position='top')
                return
            result = await api.safe(api.post('/entries', {
                'journalCode': journal.value, 'date': date.value,
                'description': description.value, 'narration': narration.value or None,
                'reference': ref_val, 'framework': auto_framework,
                'autoPost': auto_post, 'lines': payload_lines,
            }))
            if result:
                entry = result['entry']
                ui.notify(f"{entry['entry_no']} "
                          + ('posted to the ledger.' if entry['status'] == 'posted' else 'saved as a draft.'),
                          type='positive', position='top')
                dialog.close()
                await reload()

        save_draft.on_click(lambda: save(False))
        save_post.on_click(lambda: save(True))

    dialog.open()

    async def load_lookups() -> None:
        active_fw = auto_framework if auto_framework in ('ohada', 'ifrs') else current_framework()
        data = await api.safe(api.get('/accounts', postableOnly=True, activeOnly=True, framework=active_fw))
        if data:
            accounts.update({a['id']: f"{a['code']} — {account_label(a)}" for a in data['rows']})
            account_meta.update({a['id']: a for a in data['rows']})
        centres = await api.safe(api.get('/cost-centers'), notify=False)
        if centres:
            cost_centers.update({c['id']: f"{c['code']} — {account_label(c)}" for c in centres['rows']})
        parties = await api.safe(api.get('/partners', type='all'), notify=False)
        if parties and 'rows' in parties:
            partner_meta.clear()
            partners.clear()
            partners[None] = '—'
            for p in parties['rows']:
                ptype = p.get('partner_type') or 'supplier'
                prefix = '[CLI]' if ptype == 'customer' else '[FRN]'
                partners[p['id']] = f"{prefix} {p['code']} — {p['name']}"
                partner_meta[p['id']] = p
        tpls = await api.safe(api.get('/posting/templates'), notify=False)
        if tpls and 'rows' in tpls:
            templates.clear()
            templates[None] = 'No template — infer the counterpart'
            tpl_by_type.clear()
            for tpl in tpls['rows']:
                lbl = tpl.get('name_en') if auto_framework == 'ifrs' else (tpl.get('name') or tpl.get('name_en') or tpl.get('code'))
                templates[tpl['transaction_type']] = lbl
                tpl_by_type[tpl['transaction_type']] = tpl
            txn.options = build_template_options()
            txn.update()
        draw_lines()

    ui.timer(0.01, load_lookups, once=True)


def _one_side(lines: list[dict], index: int, side: str, refresh, redraw) -> None:
    other = 'credit' if side == 'debit' else 'debit'
    if lines[index][side] and lines[index][other]:
        lines[index][other] = 0.0
        redraw()
        return
    refresh()


async def _budget_check_dialog() -> None:
    years_data = await api.safe(api.get('/fiscal-years')) or {'rows': []}
    years = years_data.get('rows') or []
    if not years:
        ui.notify(t('bud.no_fy'), type='warning', position='top')
        return

    fy_options = {y['id']: f"{y['code']} ({str(y['start_date'])[:10]} — {str(y['end_date'])[:10]})"
                  for y in years}
    state = {'fy_id': years[0]['id']}
    currency = api.user().get('functional_currency', 'XAF')

    with ui.dialog().props('maximized') as dialog, \
            ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        with ui.row().classes('items-center justify-between w-full px-6 py-3 border-b border-slate-200'):
            with ui.column().classes('gap-0'):
                ui.label(t('bud.dialog_title')).classes('text-base font-semibold')
                ui.label(t('bud.dialog_sub')).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('flex-1 overflow-auto p-6 gap-5 w-full max-w-[1200px] mx-auto'):
            with ui.element('div').classes('lc-card p-4 w-full'):
                with ui.row().classes('w-full items-center gap-4 flex-wrap'):
                    fy_sel = ui.select(fy_options, value=state['fy_id'], label=t('bud.fy_label')) \
                        .props('outlined dense options-dense').classes('w-80')
                    fy_sel.bind_value(state, 'fy_id')
                    ui.button(t('bud.btn_refresh'), icon='refresh', on_click=lambda: load_exec()).props('outline size=sm')

            w.note(t('bud.note'), icon='pie_chart', tone='teal')

            exec_container = ui.column().classes('w-full gap-4')

            async def load_exec() -> None:
                exec_container.clear()
                data = await api.safe(api.get('/budget/execution', fiscalYearId=state['fy_id']))
                if not data:
                    return

                with exec_container:
                    with w.kpi_row():
                        w.kpi(t('bud.kpi_allocated'), w.money(data.get('totalBudget'), currency),
                              hint=t('bud.kpi_allocated_hint'), icon='account_balance_wallet', tone='slate')
                        w.kpi(t('bud.kpi_spent'), w.money(data.get('totalSpent'), currency),
                              hint=t('bud.kpi_spent_hint'), icon='payments', tone='sky')
                        w.kpi(t('bud.kpi_remaining'), w.money(data.get('remainingBudget'), currency),
                              hint=t('bud.kpi_remaining_hint'), icon='savings', tone='teal')
                        w.kpi(t('bud.kpi_rate'), f"{data.get('overallPctConsumed', 0):.1f}%",
                              hint=t('bud.kpi_rate_hint'), icon='percent', tone='amber')

                    rows = data.get('rows') or []
                    if not rows:
                        w.empty_state(t('bud.empty'), icon='folder_off')
                        return

                    status_over = t('bud.status_overspent')
                    status_comp = t('bud.status_compliant')
                    table_rows = []
                    for r in rows:
                        table_rows.append({
                            'account': f"{r.get('account_code')} — {r.get('account_name')}",
                            'department': r.get('cost_center_name') or 'Hospital General',
                            'program': r.get('program_code') or 'General Funds',
                            'budget': r.get('budget_amount') or 0,
                            'spent': r.get('actual_spent') or 0,
                            'remaining': r.get('remaining_budget') or 0,
                            'rate': f"{float(r.get('pct_consumed') or 0):.1f}%",
                            'status': status_over if float(r.get('pct_consumed') or 0) > 100 else status_comp,
                        })

                    columns = [
                        w.column('account', t('bud.col_account')),
                        w.column('department', t('bud.col_dept')),
                        w.column('program', t('bud.col_program')),
                        w.money_column('budget', t('bud.col_budget', curr=currency), currency=currency),
                        w.money_column('spent', t('bud.col_spent', curr=currency), currency=currency),
                        w.money_column('remaining', t('bud.col_remaining', curr=currency), currency=currency),
                        w.column('rate', t('bud.col_rate'), align='right'),
                        w.column('status', t('bud.col_status')),
                    ]
                    t_exec = w.table(columns, table_rows, pagination=15)
                    w.add_badge_slot(t_exec, 'status', tones={status_comp.lower(): 'emerald', status_over.lower(): 'rose'})

            ui.timer(0.05, load_exec, once=True)

    dialog.open()
