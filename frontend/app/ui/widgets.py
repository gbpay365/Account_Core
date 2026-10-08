"""
The component vocabulary every page draws from: money formatting, status
badges, page headers, stat cards, data tables and the statement renderer.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Callable, Iterable, Sequence

from nicegui import ui

from ..config import ZERO_DECIMAL_CURRENCIES
from ..i18n import lang, status_label, t
from ..theme import MUTED, NAVY, STATUS_TONES, TONE_CLASSES
from . import chrome

# --- formatting -------------------------------------------------------------


def money(value: Any, currency: str = 'XAF', *, blank_zero: bool = False,
          parens_negative: bool = True) -> str:
    """
    Accounting presentation: thin spaces every three digits, no decimals for
    XAF, and negatives in brackets the way a statement shows them.
    """
    if value is None or value == '':
        return ''
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if blank_zero and abs(number) < 0.005:
        return ''

    decimals = 0 if currency.upper() in ZERO_DECIMAL_CURRENCIES else 2
    text = f'{abs(number):,.{decimals}f}'.replace(',', '\u202f')
    if number < 0:
        return f'({text})' if parens_negative else f'-{text}'
    return text


def number(value: Any, decimals: int = 0) -> str:
    if value is None or value == '':
        return ''
    try:
        return f'{float(value):,.{decimals}f}'.replace(',', '\u202f')
    except (TypeError, ValueError):
        return str(value)


def percent(value: Any, decimals: int = 1) -> str:
    if value is None or value == '':
        return '—'
    try:
        return f'{float(value):.{decimals}f}%'
    except (TypeError, ValueError):
        return str(value)


def humanise(value: Any) -> str:
    """`awaiting_parts` reads as the current-language status label."""
    return status_label(value)


def as_date(value: Any) -> str:
    if not value:
        return ''
    text = str(value)[:10]
    try:
        fmt = '%d %b %Y' if lang() == 'en' else '%d %b %Y'
        # French month names via locale-aware strftime is unreliable on Windows,
        # so keep the numeric day and a short English month; the surrounding
        # chrome is what switches language.
        return datetime.strptime(text, '%Y-%m-%d').strftime(fmt)
    except ValueError:
        return text


def as_datetime(value: Any) -> str:
    if not value:
        return ''
    text = str(value).replace('T', ' ')[:16]
    try:
        return datetime.strptime(text, '%Y-%m-%d %H:%M').strftime('%d %b %Y, %H:%M')
    except ValueError:
        return text


def today_iso() -> str:
    return date.today().isoformat()


# --- primitives -------------------------------------------------------------


def badge(value: Any, *, tone: str | None = None, label: str | None = None) -> ui.element:
    key = str(value or '').lower()
    resolved = tone or STATUS_TONES.get(key, 'slate')
    classes = TONE_CLASSES.get(resolved, TONE_CLASSES['slate'])
    shown = label if label is not None else status_label(value) or '—'
    shown = chrome.labelled(key, shown)
    element = ui.element('span').classes(f'lc-badge {classes}')
    with element:
        ui.html(shown)
    return element


def money_label(value: Any, currency: str = 'XAF', *, classes: str = '') -> ui.label:
    text = money(value, currency)
    tone = 'text-rose-600' if (value or 0) < 0 else ''
    return ui.label(text).classes(f'lc-num {tone} {classes}')


def kpi(title: str, value: str, *, hint: str | None = None, icon: str | None = None,
        tone: str = 'teal', on_click: Callable | None = None) -> ui.element:
    """A single headline figure. Deliberately restrained: one number, one hint."""
    tints = {
        'teal': ('bg-teal-50', 'text-teal-600'),
        'sky': ('bg-sky-50', 'text-sky-600'),
        'amber': ('bg-amber-50', 'text-amber-600'),
        'rose': ('bg-rose-50', 'text-rose-600'),
        'violet': ('bg-violet-50', 'text-violet-600'),
        'slate': ('bg-slate-100', 'text-slate-600'),
    }
    bg, fg = tints.get(tone, tints['teal'])
    card = ui.element('div').classes('lc-card p-4 flex-1 lc-kpi')
    if on_click:
        card.classes('cursor-pointer hover:-translate-y-px transition').on('click', on_click)
    with card:
        with ui.row().classes('items-start justify-between w-full no-wrap gap-3'):
            with ui.column().classes('gap-1 min-w-0'):
                ui.label(title).classes('text-[11px] font-bold uppercase tracking-wider text-slate-500')
                ui.label(value).classes('lc-num text-[26px] leading-8 font-semibold text-slate-900 truncate')
                if hint:
                    ui.label(hint).classes('text-xs text-slate-500 lc-clamp-2')
            if icon:
                with ui.element('div').classes(f'{bg} rounded-xl p-2 shrink-0'):
                    ui.icon(icon).classes(f'{fg} text-[22px]')
    return card


def page_header(title: str, subtitle: str | None = None, *,
                actions: Callable[[], None] | None = None,
                emoji: str | None = None, icon: str | None = None) -> None:
    with ui.row().classes('w-full items-end justify-between gap-4 mb-5 lc-head'):
        with ui.row().classes('items-start gap-3 min-w-0 no-wrap'):
            if emoji:
                ui.label(emoji).classes('text-[30px] leading-none shrink-0 mt-0.5')
            elif icon:
                with ui.element('div').classes('rounded-2xl bg-teal-50 p-2 shrink-0'):
                    ui.icon(icon).classes('text-teal-700 text-[22px]')
            with ui.column().classes('gap-1 min-w-0'):
                ui.label(title).classes('text-[22px] font-semibold text-slate-900 leading-tight')
                if subtitle:
                    ui.label(subtitle).classes('text-sm text-slate-500')
        if actions:
            with ui.row().classes('items-center gap-2 shrink-0 lc-no-print lc-head-actions'):
                actions()


def section(title: str, subtitle: str | None = None, *,
            actions: Callable[[], None] | None = None,
            emoji: str | None = None, icon: str | None = None) -> ui.element:
    """A titled panel. Returns the body container for the caller to fill."""
    card = ui.element('div').classes('lc-card w-full overflow-hidden')
    with card:
        with ui.row().classes('items-center justify-between w-full gap-3 px-4 py-3 '
                              'border-b border-slate-200 bg-slate-50/60 lc-head'):
            with ui.row().classes('items-center gap-2 min-w-0 no-wrap'):
                if emoji:
                    ui.label(emoji).classes('text-[16px] leading-none shrink-0')
                elif icon:
                    ui.icon(icon).classes('text-teal-600 text-[18px] shrink-0')
                with ui.column().classes('gap-0.5 min-w-0'):
                    ui.label(title).classes('text-[13px] font-bold uppercase tracking-wider text-slate-600')
                    if subtitle:
                        ui.label(subtitle).classes('text-xs text-slate-500')
            if actions:
                with ui.row().classes('items-center gap-2 shrink-0 lc-no-print lc-head-actions'):
                    actions()
        body = ui.column().classes('w-full gap-0 p-4')
    return body


def empty_state(message: str, *, icon: str = 'inbox', hint: str | None = None,
                emoji: str | None = None) -> None:
    with ui.column().classes('w-full items-center justify-center py-14 gap-2'):
        if emoji:
            ui.label(emoji).classes('text-5xl leading-none')
        else:
            ui.icon(icon).classes('text-5xl text-slate-300')
        ui.label(message).classes('text-sm font-medium text-slate-500')
        if hint:
            ui.label(hint).classes('text-xs text-slate-400 text-center max-w-md')


def field_row(label: str, value: Any, *, mono: bool = False) -> None:
    with ui.row().classes('w-full justify-between items-baseline gap-4 py-1.5 '
                          'border-b border-slate-100 last:border-0 no-wrap'):
        ui.label(label).classes('text-xs text-slate-500 shrink-0')
        classes = 'text-sm text-slate-900 text-right' + (' lc-num' if mono else '')
        if isinstance(value, ui.element):
            return
        ui.label('—' if value in (None, '') else str(value)).classes(classes)


def detail_grid(items: Sequence[tuple[str, Any]], columns: int = 2) -> None:
    with ui.element('div').classes(f'grid grid-cols-1 md:grid-cols-{columns} gap-x-8 w-full'):
        for label, value in items:
            field_row(label, value)


def toolbar() -> ui.row:
    return ui.row().classes('w-full items-end gap-3 flex-wrap lc-no-print')


# --- tables -----------------------------------------------------------------


def table(columns: list[dict], rows: list[dict], *, row_key: str = 'id',
          pagination: int | dict | None = 25, selection: str | None = None,
          on_row_click: Callable | None = None, title: str | None = None,
          height: str | None = None) -> ui.table:
    """
    One table configuration for the whole application: dense, sticky header,
    right-aligned figures, and a click handler that hands back the row.
    """
    element = ui.table(columns=columns, rows=rows, row_key=row_key, title=title,
                       pagination=pagination, selection=selection)
    element.props('dense flat bordered wrap-cells')
    element.classes('lc-table w-full rounded-xl overflow-hidden bg-white border border-slate-200')
    if height:
        element.style(f'max-height: {height}').props('virtual-scroll')
    if on_row_click:
        element.on('rowClick', lambda e: on_row_click(e.args[1]))
        element.classes('cursor-pointer')
    return element


def column(field: str, label: str, *, align: str = 'left', sortable: bool = True,
           fmt: str | None = None, classes: str | None = None) -> dict:
    spec: dict[str, Any] = {'name': field, 'label': label, 'field': field,
                            'align': align, 'sortable': sortable}
    if fmt:
        spec[':format'] = fmt
    if classes:
        spec['classes'] = classes
        spec['headerClasses'] = classes
    return spec


def money_column(field: str, label: str, *, currency: str = 'XAF') -> dict:
    """A figure column formatted in the browser so sorting stays numeric."""
    decimals = 0 if currency.upper() in ZERO_DECIMAL_CURRENCIES else 2
    fmt = (
        "value => value === null || value === undefined || value === '' ? '' : "
        "(Number(value) < 0 ? '(' : '') + "
        f"Math.abs(Number(value)).toLocaleString('fr-FR', {{minimumFractionDigits: {decimals}, "
        f"maximumFractionDigits: {decimals}}}) + "
        "(Number(value) < 0 ? ')' : '')"
    )
    return column(field, label, align='right', fmt=fmt, classes='lc-num')


def int_column(field: str, label: str) -> dict:
    return column(field, label, align='right', classes='lc-num')


def date_column(field: str, label: str) -> dict:
    fmt = ("value => !value ? '' : new Date(String(value).slice(0,10) + 'T00:00:00')"
           ".toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'})")
    return column(field, label, fmt=fmt)


def badge_column(field: str, label: str) -> dict:
    """Rendered through a slot by the caller; the column itself stays plain."""
    return column(field, label, align='left')


def add_badge_slot(element: ui.table, field: str, *, tones: dict[str, str] | None = None) -> None:
    """
    Replaces a cell with a coloured pill using the shared status vocabulary.

    A Quasar cell template can only reach `props`, so the tone class is resolved
    here and carried on the row itself rather than passed to the table element.
    """
    palette = {**STATUS_TONES, **(tones or {})}
    tone_field = f'_{field}_tone'
    mark_field = f'_{field}_mark'
    for row in element.rows:
        raw = str(row.get(field) or '').lower()
        tone = palette.get(raw, 'slate')
        row[tone_field] = TONE_CLASSES.get(tone, TONE_CLASSES['slate'])
        row[mark_field] = chrome.mark(raw)
    element.add_slot(f'body-cell-{field}', f'''
        <q-td :props="props">
          <span class="lc-badge" :class="props.row.{tone_field}">
            {{{{ props.row.{mark_field} ? props.row.{mark_field} + ' ' : '' }}}}{{{{ props.value ? String(props.value).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '—' }}}}
          </span>
        </q-td>
    ''')


# --- statement rendering ----------------------------------------------------


def statement_table(headers: Sequence[str], rows: Iterable[dict], currency: str = 'XAF', *,
                    blank_zero: bool = True) -> None:
    """
    Renders a financial statement.

    Each row is {label, values: [...], kind: detail|subtotal|total|header,
    note: str|None}. Subtotals and totals are styled by the stylesheet so the
    hierarchy of a Bilan or a Compte de resultat survives on screen.

    A nil detail line is left blank, which is how a statement is presented; a
    nil subtotal or total still prints, because a blank there reads as missing
    rather than as zero. Pass blank_zero=False for a breakdown where every line
    should carry a figure.
    """
    head = ''.join(f'<th>{h}</th>' for h in headers)
    body: list[str] = []
    for row in rows:
        kind = row.get('kind', 'detail')
        label = _escape(row.get('label', ''))
        note = row.get('note')
        code = row.get('code')
        prefix = f'<span class="lc-num text-slate-400 mr-2 text-[11px]">{_escape(code)}</span>' if code else ''
        suffix = f'<span class="text-slate-400 ml-2 text-[11px]">note {_escape(note)}</span>' if note else ''
        blank = blank_zero and kind == 'detail'
        cells = ''.join(
            f'<td class="lc-figure lc-num">{_escape(money(v, currency, blank_zero=blank))}</td>'
            for v in row.get('values', [])
        )
        body.append(f'<tr class="lc-{kind}"><td>{prefix}{label}{suffix}</td>{cells}</tr>')

    ui.html(f'''
      <div class="lc-scroll w-full">
        <table class="lc-stmt"><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>
      </div>
    ''').classes('w-full')


def check_banner(checks: Sequence[dict], currency: str = 'XAF', *,
                 subject: str = 'statement') -> None:
    """The articulation test, stated rather than assumed."""
    if not checks:
        return
    ok = all(c.get('balanced') for c in checks)
    tone = ('bg-emerald-50 border-emerald-200 text-emerald-800' if ok
            else 'bg-rose-50 border-rose-200 text-rose-800')
    icon = 'verified' if ok else 'report_problem'
    with ui.element('div').classes(f'w-full rounded-xl border px-4 py-3 {tone}'):
        with ui.row().classes('items-center gap-2 no-wrap'):
            ui.icon(icon).classes('text-lg')
            ui.label(t('st.articulates', subject=t('st.subject') if subject == 'statement' else subject) if ok
                     else t('st.does_not', subject=t('st.subject') if subject == 'statement' else subject)
                     ).classes('text-sm font-semibold')
        for check in checks:
            with ui.row().classes('items-baseline gap-2 pl-7 no-wrap'):
                ui.label(check.get('label', '')).classes('text-xs opacity-80')
                ui.label(money(check.get('difference', 0), currency) or '0'
                         ).classes('lc-num text-xs font-semibold')


def _escape(value: Any) -> str:
    return (str('' if value is None else value)
            .replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


# --- layout helpers ---------------------------------------------------------


def kpi_row() -> ui.row:
    return ui.row().classes('w-full gap-4 flex-wrap items-stretch')


def two_column() -> tuple[ui.column, ui.column]:
    with ui.row().classes('w-full gap-5 items-start lc-split'):
        left = ui.column().classes('gap-5 flex-1 min-w-[320px]')
        right = ui.column().classes('gap-5 w-full lg:w-[380px] shrink-0')
    return left, right


def divider() -> None:
    ui.element('div').classes('w-full border-t border-slate-200 my-1')


def note(text: str, *, icon: str = 'info', tone: str = 'slate') -> None:
    tints = {
        'slate': 'bg-slate-50 border-slate-200 text-slate-600',
        'amber': 'bg-amber-50 border-amber-200 text-amber-800',
        'rose': 'bg-rose-50 border-rose-200 text-rose-800',
        'emerald': 'bg-emerald-50 border-emerald-200 text-emerald-800',
        'sky': 'bg-sky-50 border-sky-200 text-sky-800',
    }
    with ui.element('div').classes(f'w-full rounded-lg border px-3 py-2 {tints.get(tone, tints["slate"])}'):
        with ui.row().classes('items-start gap-2 no-wrap'):
            ui.icon(icon).classes('text-base mt-0.5 shrink-0')
            ui.label(text).classes('text-xs leading-relaxed')


def heading(text: str) -> None:
    ui.label(text).classes(f'text-[13px] font-bold uppercase tracking-wider').style(f'color: {NAVY}')


def caption(text: str) -> None:
    ui.label(text).classes('text-xs').style(f'color: {MUTED}')
