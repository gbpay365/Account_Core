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
    journal_options = {None: t('je.all_journals'),
                       **{j['id']: f"{j['code']} — {account_label(j)}" for j in journals['rows']}}

    def actions() -> None:
        if api.can('journal.create'):
            ui.button(t('je.new'), icon='add',
                      on_click=lambda: _entry_form(journals['rows'], reload)).props('unelevated size=sm')

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
        _entry_form(journals['rows'], reload)


def _list(data: dict, currency: str, reload) -> None:
    rows = data.get('rows') or []
    total = data.get('total', len(rows))
    for row in rows:
        row['journal'] = f"{row['journal_code']}"
        row['framework_label'] = {'both': 'Both', 'ohada': 'OHADA', 'ifrs': 'IFRS'} \
            .get(row.get('framework'), row.get('framework'))
        row['amount'] = row.get('total_debit')

    drafts = sum(1 for r in rows if r.get('status') == 'draft')
    body = w.section(f'{w.number(total)} entries',
                     f'{w.number(drafts)} of the entries shown are still in draft and are not in '
                     'the trial balance' if drafts else 'All entries shown are posted')
    with body:
        if not rows:
            w.empty_state('No journal entry matches those filters.', icon='receipt_long',
                          hint='Adjust the filters, or capture a new entry.')
            return
        columns = [
            w.column('entry_no', 'Entry no.', classes='lc-num font-semibold'),
            w.date_column('entry_date', 'Date'),
            w.column('journal', 'Jnl'),
            w.column('description', 'Description'),
            w.column('reference', 'Reference'),
            w.column('period_code', 'Period'),
            w.column('framework_label', 'Framework'),
            w.money_column('amount', f'Amount ({currency})', currency=currency),
            w.column('status', 'Status'),
        ]
        table = w.table(columns, rows, on_row_click=lambda row: _entry_view(row['id'], reload),
                        pagination=25)
        w.add_badge_slot(table, 'status')
        w.add_badge_slot(table, 'framework_label',
                         tones={'both': 'teal', 'ohada': 'sky', 'ifrs': 'violet'})


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
                            label={'both': 'Both frameworks', 'ohada': 'OHADA only',
                                   'ifrs': 'IFRS only'}.get(entry['framework']))
                ui.label(entry['description']).classes('text-sm text-slate-600')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('p-5 gap-4 w-full lc-scroll').style('max-height: 70vh'):
            w.detail_grid([
                ('Date', w.as_date(entry['entry_date'])),
                ('Journal', f"{entry['journal_code']} — {account_label({'name': entry.get('journal_name'), 'name_en': entry.get('journal_name_en')})}"),
                ('Period', f"{entry['period_code']} ({w.humanise(entry['period_status'])})"),
                ('Reference', entry.get('reference')),
                ('Source', w.humanise(entry.get('source'))),
                ('Captured by', entry.get('created_by_name')),
                ('Posted by', entry.get('posted_by_name')),
                ('Posted at', w.as_datetime(entry.get('posted_at'))),
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

            ui.label('Lines').classes('text-[13px] font-bold uppercase tracking-wider text-slate-600 pt-1')
            w.statement_table(
                ['Account', f'Debit ({currency})', f'Credit ({currency})'],
                [{'code': line['account_code'],
                  'label': account_label({
                                'name': line.get('account_name'),
                                'name_en': line.get('account_name_en'),
                            })
                           + (f" · {line['description']}" if line.get('description') else '')
                           + (f" · {line['cost_center_code']}" if line.get('cost_center_code') else '')
                           + (f" · {line['asset_tag']}" if line.get('asset_tag') else ''),
                  'values': [line['debit'] or None, line['credit'] or None]}
                 for line in lines]
                + [{'label': 'Totals', 'kind': 'total',
                    'values': [entry['total_debit'], entry['total_credit']]}],
                currency,
            )
            balanced = abs(float(entry['total_debit']) - float(entry['total_credit'])) < 0.005
            w.check_banner([{'label': 'Debits less credits', 'balanced': balanced,
                             'difference': float(entry['total_debit']) - float(entry['total_credit'])}],
                           currency, subject='entry')

            attachments = data.get('attachments') or []
            if attachments:
                ui.label('Supporting documents').classes(
                    'text-[13px] font-bold uppercase tracking-wider text-slate-600 pt-1')
                for doc in attachments:
                    with ui.row().classes('items-center gap-2 py-1'):
                        ui.icon('attach_file').classes('text-slate-400 text-base')
                        ui.label(doc.get('title') or doc.get('file_name')).classes('text-sm')
                        ui.label(w.humanise(doc.get('doc_type'))).classes('text-xs text-slate-400')

        with ui.row().classes('w-full justify-end gap-2 px-5 py-3 border-t border-slate-200'):
            if entry['status'] == 'draft' and api.can('journal.create'):
                ui.button('Delete draft', icon='delete',
                          on_click=lambda: _delete(entry, dialog, reload)).props('flat color=red')
            if entry['status'] == 'draft' and api.can('journal.post'):
                ui.button('Post to ledger', icon='task_alt',
                          on_click=lambda: _post(entry, dialog, reload)).props('unelevated')
            if entry['status'] == 'posted' and api.can('journal.reverse') \
                    and not entry.get('reversed_by_entry_id'):
                ui.button('Reverse', icon='undo',
                          on_click=lambda: _reverse(entry, dialog, reload)).props('outline color=red')
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


def _empty_line() -> dict:
    return {
        'account': None, 'description': '', 'debit': 0.0, 'credit': 0.0,
        'cost_center': None, 'partner_type': 'none', 'partner_id': None,
        'origin': 'manual', 'proposal_source': None, 'proposal_rule_code': None,
        'proposal_reason': None,
    }


def _entry_form(journals: list[dict], reload) -> None:
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
    templates: dict[str | None, str] = {None: 'No template — infer the counterpart'}

    with ui.dialog().props('maximized persistent') as dialog, \
            ui.element('div').classes('bg-white w-full h-full flex flex-col'):
        with ui.row().classes('items-center justify-between w-full px-6 py-3 border-b border-slate-200 '
                              'shrink-0'):
            with ui.column().classes('gap-0'):
                ui.label('New journal entry').classes('text-base font-semibold')
                ui.label('Both sides must agree before the entry can be saved.'
                         ).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('flex-1 overflow-auto px-6 py-4 gap-4 w-full max-w-[1200px] mx-auto'):
            with ui.row().classes('w-full gap-3 flex-wrap'):
                journal = ui.select({j['code']: f"{j['code']} — {account_label(j)}" for j in journals},
                                    label='Journal',
                                    value=next((j['code'] for j in journals if j['code'] == 'OD'),
                                               journals[0]['code'] if journals else None)) \
                    .props('outlined dense').classes('w-64')
                date = ui.input('Entry date', value=w.today_iso()).props('outlined dense type=date') \
                    .classes('w-44')
                reference = ui.input('Reference').props('outlined dense') \
                    .classes('w-52').tooltip('Invoice number, voucher, bank statement line')
                view = current_framework()
                fw_options = ({'both': 'Both frameworks', 'ifrs': 'IFRS only'} if view == 'ifrs'
                              else {'both': 'Both frameworks', 'ohada': 'OHADA only'})
                fw_default = 'ifrs' if view == 'ifrs' else 'both'
                framework = ui.select(fw_options, value=fw_default, label='Framework') \
                    .props('outlined dense').classes('w-52')
                txn = ui.select(templates, value=None, label='Transaction type') \
                    .props('outlined dense options-dense').classes('w-72')
            description = ui.input('Description').props('outlined dense').classes('w-full')
            narration = ui.textarea('Narration (optional)').props('outlined dense rows=2').classes('w-full')

            framework_hint = ui.label(FRAMEWORKS[fw_default]).classes('text-xs text-slate-500 -mt-1')
            framework.on_value_change(
                lambda e: framework_hint.set_text(FRAMEWORKS.get(e.value, '')))

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
                            account.bind_value(lines[index], 'account')
                            note = ui.input(placeholder='Optional').props('outlined dense') \
                                .classes('flex-[2] min-w-0')
                            note.bind_value(lines[index], 'description')
                            centre = ui.select(cost_centers, value=line.get('cost_center')).props('outlined dense options-dense') \
                                .classes('w-36 shrink-0')
                            centre.bind_value(lines[index], 'cost_center')
                            party = ui.select(partners, value=line.get('partner_id')) \
                                .props('outlined dense options-dense').classes('w-40 shrink-0') \
                                .tooltip('Supplier / client when the account is collective')
                            party.bind_value(lines[index], 'partner_id')
                            if line.get('partner_id'):
                                lines[index]['partner_type'] = 'supplier'
                            debit = ui.number(value=line['debit'] or None, min=0, format='%.2f') \
                                .props('outlined dense input-class=text-right').classes('w-36 shrink-0')
                            debit.bind_value(lines[index], 'debit')
                            credit = ui.number(value=line['credit'] or None, min=0, format='%.2f') \
                                .props('outlined dense input-class=text-right').classes('w-36 shrink-0')
                            credit.bind_value(lines[index], 'credit')

                            # A line is one side or the other, never both.
                            debit.on_value_change(lambda e, i=index: _one_side(lines, i, 'debit',
                                                                               refresh_totals, draw_lines))
                            credit.on_value_change(lambda e, i=index: _one_side(lines, i, 'credit',
                                                                                refresh_totals, draw_lines))
                            if line.get('origin') == 'proposed':
                                ui.badge('Proposed').props('dense color=light-blue')
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

            async def propose() -> None:
                payload = []
                for line in lines:
                    if not line['account'] or (not line['debit'] and not line['credit']):
                        continue
                    payload.append({
                        'accountId': line['account'],
                        'debit': float(line['debit'] or 0),
                        'credit': float(line['credit'] or 0),
                        'partnerType': line.get('partner_type') or 'none',
                        'partnerId': line.get('partner_id'),
                    })
                if not payload:
                    ui.notify('Enter at least one complete line first.', type='warning', position='top')
                    return
                result = await api.safe(api.post('/entries/propose', {
                    'transactionType': txn.value, 'journalCode': journal.value, 'lines': payload,
                }))
                if not result:
                    return
                proposal_box.clear()
                if result.get('balanced'):
                    with proposal_box:
                        w.note('The entry is already balanced. No counterpart is needed.', icon='verified')
                    return
                proposals = result.get('proposals') or []
                if not proposals:
                    ui.notify('No counterpart could be proposed.', type='warning', position='top')
                    return
                with proposal_box:
                    for item in proposals:
                        w.note(
                            f"Proposed {item['accountCode']} · {item.get('proposalReason') or item.get('proposal_reason')}",
                            icon='auto_fix_high', tone='sky')
                for item in proposals:
                    target = next((line for line in lines if not line['account']
                                   and not line['debit'] and not line['credit']), None)
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
            if not description.value or not journal.value:
                ui.notify('A journal and a description are needed.', type='warning', position='top')
                return
            payload_lines = []
            for line in lines:
                if not line['account'] or (not line['debit'] and not line['credit']):
                    continue
                payload_lines.append({
                    'accountId': line['account'],
                    'description': line['description'] or None,
                    'costCenterId': line['cost_center'],
                    'debit': float(line['debit'] or 0),
                    'credit': float(line['credit'] or 0),
                    'partnerType': 'supplier' if line.get('partner_id') else (line.get('partner_type') or 'none'),
                    'partnerId': line.get('partner_id'),
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
                'reference': reference.value or None, 'framework': framework.value,
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
        data = await api.safe(api.get('/accounts', postableOnly=True, activeOnly=True, framework='ohada'))
        if data:
            accounts.update({a['id']: f"{a['code']} — {account_label(a)}" for a in data['rows']})
            account_meta.update({a['id']: a for a in data['rows']})
        centres = await api.safe(api.get('/cost-centers'), notify=False)
        if centres:
            cost_centers.update({c['id']: f"{c['code']} — {account_label(c)}" for c in centres['rows']})
        parties = await api.safe(api.get('/partners', type='supplier'), notify=False)
        if parties:
            partners.update({p['id']: f"{p['code']} — {p['name']}" for p in parties['rows']})
        tpls = await api.safe(api.get('/posting/templates'), notify=False)
        if tpls:
            templates.update({t['transaction_type']: t.get('name_en') or t['name'] for t in tpls['rows']})
            txn.options = templates
        draw_lines()

    ui.timer(0.01, load_lookups, once=True)


def _one_side(lines: list[dict], index: int, side: str, refresh, redraw) -> None:
    other = 'credit' if side == 'debit' else 'debit'
    if lines[index][side] and lines[index][other]:
        lines[index][other] = 0.0
        redraw()
        return
    refresh()
