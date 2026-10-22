"""
The application shell: a dark navigation rail, a header carrying the
organisation and period context, and a `page` decorator that refuses to render
anything before the visitor is signed in and entitled to be there.
"""

from __future__ import annotations

import functools
from typing import Callable, Iterable

from nicegui import app, ui

from .. import api, config
from ..i18n import framework, lang, set_framework, set_lang, t
from ..theme import ACCENT, NAVY, NAVY_SOFT, apply as apply_theme
from . import chrome

#: Navigation is declared once and filtered by permission, so a role only ever
#: sees the parts of the system it can actually use.
def get_nav() -> list[tuple[str, list[tuple[str, str, str, tuple[str, ...]]]]]:
    is_ifrs = framework() == 'ifrs'

    if is_ifrs:
        # IFRS Core Accounting Application sidebar items
        acct_items = [
            ('/accounts', 'nav.accounts', 'account_tree', ('coa.view',)),
            ('/journal', 'nav.journal', 'receipt_long', ('journal.view',)),
            ('/ledger', 'nav.ledger', 'menu_book', ('journal.view',)),
            ('/periods', 'nav.periods', 'event_available', ('period.view', 'close.view')),
            ('/bank-reconciliation', 'nav.bank_reconciliation', 'account_balance', ('journal.view',)),
            ('/budgeting', 'nav.budgeting', 'account_balance_wallet', ('budget.view', 'coa.view')),
        ]
        # IFRS Assets Management Application sidebar items
        asset_items = [
            ('/assets', 'nav.register', 'inventory_2', ('asset.view',)),
            ('/categories', 'nav.categories', 'category', ('asset.view',)),
            ('/depreciation', 'nav.depreciation', 'trending_down', ('depr.view',)),
            ('/leases', 'nav.leases', 'real_estate_agent', ('asset.view',)),
        ]
        reporting_items = [
            ('/reports', 'nav.statements', 'assessment', ('report.financial',)),
            ('/asset-reports', 'nav.asset_reports', 'summarize', ('report.asset',)),
            ('/audit', 'nav.audit', 'history', ('admin.audit',)),
        ]
    else:
        # OHADA SYSCOHADA & Regional CEMAC Accounting Application sidebar items
        acct_items = [
            ('/accounts', 'nav.accounts', 'account_tree', ('coa.view',)),
            ('/journal', 'nav.journal', 'receipt_long', ('journal.view',)),
            ('/ledger', 'nav.ledger', 'menu_book', ('journal.view',)),
            ('/periods', 'nav.periods', 'event_available', ('period.view', 'close.view')),
            ('/bank-reconciliation', 'nav.bank_reconciliation', 'account_balance', ('journal.view',)),
            ('/budgeting', 'nav.budgeting', 'account_balance_wallet', ('budget.view', 'coa.view')),
            ('/withholding-tax', 'nav.withholding_tax', 'request_quote', ('journal.view',)),
            ('/cash-registers', 'nav.cash_registers', 'point_of_sale', ('journal.view',)),
            ('/donor-projects', 'nav.donor_projects', 'handshake', ('journal.view',)),
            ('/payroll', 'nav.payroll', 'badge', ('journal.view',)),
            ('/dfe-invoicing', 'nav.dfe_invoicing', 'receipt', ('journal.view',)),
        ]
        # OHADA Fixed Assets & Barcode Inventory sidebar items
        asset_items = [
            ('/assets', 'nav.register', 'inventory_2', ('asset.view',)),
            ('/categories', 'nav.categories', 'category', ('asset.view',)),
            ('/depreciation', 'nav.depreciation', 'trending_down', ('depr.view',)),
            ('/fiscal-depreciation', 'nav.fiscal_depreciation', 'calculate', ('depr.view',)),
            ('/asset-inventory', 'nav.asset_inventory', 'qr_code_scanner', ('asset.view',)),
        ]
        reporting_items = [
            ('/reports', 'nav.statements', 'assessment', ('report.financial',)),
            ('/dsf', 'nav.dsf', 'table_chart', ('report.financial',)),
            ('/asset-reports', 'nav.asset_reports', 'summarize', ('report.asset',)),
            ('/audit', 'nav.audit', 'history', ('admin.audit',)),
        ]

    return [
        ('nav.overview', [
            ('/', 'nav.dashboard', 'space_dashboard', ('coa.view', 'asset.view', 'wo.view', 'errand.view')),
        ]),
        ('nav.accounting', acct_items),
        ('nav.assets', asset_items),
        ('nav.maintenance', [
            ('/maintenance', 'nav.work_orders', 'build', ('wo.view',)),
            ('/plans', 'nav.plans', 'event_repeat', ('maint.plan.view',)),
            ('/compliance', 'nav.compliance', 'verified_user', ('calibration.view',)),
            ('/worklist', 'nav.worklist', 'assignment_ind', ('wo.execute', 'wo.request', 'errand.execute')),
        ]),
        ('nav.services', [
            ('/errands', 'nav.errands', 'directions_run', ('errand.view',)),
            ('/shopping', 'nav.shopping', 'shopping_cart', ('shop.view',)),
        ]),
        ('nav.reporting', reporting_items),
        ('nav.administration', [
            ('/admin', 'nav.admin_console', 'admin_panel_settings', ('admin.users', 'admin.settings', 'coa.manage', 'admin.audit')),
            ('/user-guide', 'nav.user_guide', 'menu_book', ('coa.view', 'asset.view', 'wo.view', 'errand.view')),
        ]),
    ]


def visible_nav() -> Iterable[tuple[str, list[tuple[str, str, str, tuple[str, ...]]]]]:
    for group, items in get_nav():
        allowed = [item for item in items if api.can(*item[3])]
        if allowed:
            yield group, allowed


def first_allowed_route() -> str:
    for _, items in visible_nav():
        return items[0][0]
    return '/login'


def page(route: str, *, title: str, permissions: tuple[str, ...] = (), shell: bool = True):
    """
    Registers a page behind the shell.

    The decorated function receives no arguments and draws into the content
    area; path parameters are declared by the caller through `route`.
    """
    def decorator(render: Callable):
        @ui.page(route, title=f'{title} · {config.UI_TITLE}')
        @functools.wraps(render)
        async def wrapper(*args, **kwargs):
            apply_theme()
            if not api.token():
                ui.navigate.to(f'/login?next={route}')
                return
            # Re-read the session so a renamed organisation, a changed role
            # or a deactivated account takes effect on the next page view.
            if await api.refresh_session() is None:
                ui.navigate.to('/login')
                return
            if not app.storage.user.get('lang') and api.user().get('locale'):
                set_lang(str(api.user().get('locale')))
            if permissions and not api.can(*permissions):
                _forbidden(title)
                return
            if not shell:
                await _maybe_await(render(*args, **kwargs))
                return
            with _frame(route):
                await _maybe_await(render(*args, **kwargs))
        return wrapper
    return decorator


async def _maybe_await(value):
    if hasattr(value, '__await__'):
        return await value
    return value


def _forbidden(title: str) -> None:
    with _frame(''):
        with ui.column().classes('w-full items-center justify-center py-24 gap-3'):
            ui.icon('lock').classes('text-6xl text-slate-300')
            ui.label(t('auth.forbidden')).classes('text-lg font-semibold text-slate-700')
            ui.label(t('auth.forbidden_hint', title=title)).classes('text-sm text-slate-500')
            ui.button(t('auth.back'), icon='arrow_back',
                      on_click=lambda: ui.navigate.to(first_allowed_route())).props('unelevated')


def _frame(active: str):
    """Draws the rail and header, and returns the content container."""
    user = api.user()

    # Quasar's default behaviour docks the rail above its 1023px breakpoint and
    # turns it into an overlay below, which is the same line the header's
    # hamburger appears on. Forcing behavior=desktop would keep 248px of rail on
    # a phone, leaving a technician almost no room to read a job card.
    # Quasar's default behaviour docks the rail above its breakpoint and turns it
    # into an overlay below, which is the same line the header's hamburger
    # appears on. Forcing behavior=desktop would keep 248px of rail on a phone,
    # leaving a technician almost no room to read a job card. show-if-above
    # opens it on a desktop while leaving a phone to start with it closed.
    drawer = ui.left_drawer(value=False, fixed=True, bordered=False) \
        .props('width=310 breakpoint=1023 show-if-above') \
        .classes('p-0 lc-no-print').style(f'background: {NAVY}')
    with drawer:
        _brand(user)
        with ui.column().classes('w-full gap-1 px-3 pb-6 lc-scroll').style('flex: 1; overflow-y: auto'):
            for group, items in visible_nav():
                ui.label(f"{chrome.NAV_GROUP.get(group, '')} {t(group)}".strip()
                         ).classes('lc-nav-section px-2 pt-4 pb-1')
                for route, label_key, icon, _perms in items:
                    is_active = active == route or (route != '/' and active.startswith(route))
                    item = ui.row().classes(
                        'lc-nav-item items-center gap-3 px-3 py-2 w-full cursor-pointer no-wrap'
                        + (' lc-active' if is_active else '')
                    )
                    item.on('click', lambda r=route: ui.navigate.to(r))
                    with item:
                        ui.label(chrome.NAV_ITEM.get(route, '•')).classes('text-[16px] leading-none w-6 text-center shrink-0')
                        nav_text = t(label_key)
                        ui.label(nav_text).classes('text-[13px] font-medium truncate').props(f'title="{nav_text}"')
        _rail_footer(user)

    with ui.header(bordered=False).classes('bg-white border-b border-slate-200 px-6 py-0 lc-no-print') \
            .style('min-height: 58px'):
        _header(user, drawer, active)

    return ui.column().classes('w-full max-w-[1500px] mx-auto lc-page')


def _brand(user: dict) -> None:
    with ui.column().classes('w-full gap-0 px-4 pt-5 pb-3 border-b') \
            .style(f'border-color: {NAVY_SOFT}'):
        with ui.row().classes('items-center gap-2.5 no-wrap'):
            with ui.element('div').classes('rounded-xl p-2 shrink-0').style(f'background: {ACCENT}'):
                ui.label('🏥').classes('text-[20px] leading-none')
            with ui.column().classes('gap-0 min-w-0'):
                fw_badge = "🌐" if framework() == 'ifrs' else "📒"
                ui.label(f"{fw_badge} {t('app.product')}").classes('text-white text-[15px] font-bold leading-tight')
                ui.label(t('app.tagline')).classes('text-[10.5px] text-slate-400 leading-tight')
        ui.label(f"📍 {user.get('org_name', '')}").classes(
            'text-[11px] text-slate-400 mt-3 truncate w-full')


def _rail_footer(user: dict) -> None:
    with ui.column().classes('w-full gap-0 px-3 py-3 border-t').style(f'border-color: {NAVY_SOFT}'):
        row = ui.row().classes('lc-nav-item items-center gap-3 px-3 py-2 w-full cursor-pointer no-wrap')
        with row:
            with ui.element('div').classes('rounded-full w-8 h-8 flex items-center justify-center shrink-0') \
                    .style(f'background: {NAVY_SOFT}'):
                ui.label(_initials(user.get('full_name', '?'))).classes('text-[11px] font-bold text-white')
            with ui.column().classes('gap-0 min-w-0 flex-1'):
                ui.label(user.get('full_name', '')).classes('text-[12.5px] font-semibold text-white truncate')
                ui.label(user.get('role_name', '')).classes('text-[10.5px] text-slate-400 truncate')
            ui.icon('expand_more').classes('text-slate-400 text-base shrink-0')
        with ui.menu().props('anchor="top right" self="bottom right"').classes('rounded-xl min-w-[210px]'):
            with ui.column().classes('px-3 py-2 gap-0'):
                ui.label(user.get('full_name', '')).classes('text-sm font-semibold')
                ui.label(user.get('email', '')).classes('text-xs text-slate-500')
            ui.separator()
            if api.can('coa.manage', 'admin.audit', 'admin.users', 'admin.settings'):
                ui.menu_item(f"⚙️ {t('nav.admin_console')}", lambda: ui.navigate.to('/admin'))
                ui.separator()
            ui.menu_item(f"🔑 {t('auth.change_pw')}", lambda: _password_dialog())
            ui.separator()
            ui.menu_item(f"🚪 {t('auth.signout')}", api.logout)


def _header(user: dict, drawer, active: str = '') -> None:
    with ui.row().classes('w-full items-center justify-between gap-4 no-wrap h-[58px]'):
        with ui.row().classes('items-center gap-3 min-w-0 no-wrap'):
            ui.button(icon='menu', on_click=drawer.toggle) \
                .props('flat dense round color=grey-8').classes('lc-mobile-only')
            with ui.column().classes('gap-0 min-w-0'):
                ui.label(f"🏥 {user.get('org_name', '')}").classes(
                    'text-[13.5px] font-semibold text-slate-800 truncate leading-tight')
                fw_name = t('fw.ifrs') if framework() == 'ifrs' else t('fw.ohada')
                fw_tier_desc = "🌐 IFRS" if framework() == 'ifrs' else f"📒 OHADA {str(user.get('reporting_tier', '')).capitalize()}"
                ui.label(
                    f"🇨🇲 {user.get('country_code', '')} · {fw_tier_desc}"
                    f" · 💱 {user.get('functional_currency', '')}"
                    f" · {t('fw.viewing', fw=fw_name)}"
                ).classes('text-[11px] text-slate-500 leading-tight truncate lc-desktop-only')

        with ui.row().classes('items-center gap-2 shrink-0 no-wrap'):
            _framework_toggle(active)
            ui.element('div').classes('w-px h-6 bg-slate-200 mx-1 lc-desktop-only')
            _language_toggle()
            ui.button(icon='help_outline', on_click=lambda: ui.navigate.to('/user-guide')) \
                .props('flat dense round color=teal-7').tooltip(t('nav.user_guide'))
            ui.button(icon='print', on_click=lambda: ui.run_javascript('window.print()')) \
                .props('flat dense round color=grey-7').tooltip(t('common.print'))
            ui.button(icon='refresh', on_click=lambda: ui.navigate.reload()) \
                .props('flat dense round color=grey-7').tooltip(t('common.reload'))


def _framework_toggle(active: str) -> None:
    user = api.user()
    org_fw = user.get('frameworks')
    fw_list = []
    if isinstance(org_fw, (list, tuple)):
        fw_list = [str(f).lower().strip() for f in org_fw if f]
    elif isinstance(org_fw, str):
        fw_list = [f.strip().lower() for f in org_fw.split(',') if f.strip()]

    current = framework()

    def _open_admin():
        if api.can('coa.manage', 'admin.audit'):
            admin_framework_dialog()

    # 3) If the system is setup for OHADA then show only the OHADA button
    if current == 'ohada' or fw_list == ['ohada']:
        ui.button(f"🇨🇲 {t('fw.ohada')}", on_click=_open_admin) \
            .props('dense unelevated no-caps color=teal text-color=white size=sm') \
            .classes('rounded-lg px-3 font-semibold shadow-none cursor-pointer') \
            .tooltip(t('fw.ohada_tip'))
        return

    # 3) If system is setup to IFRS then show only the IFRS button
    if current == 'ifrs' or fw_list == ['ifrs']:
        ui.button(f"🌐 {t('fw.ifrs')}", on_click=_open_admin) \
            .props('dense unelevated no-caps color=sky-8 text-color=white size=sm') \
            .classes('rounded-lg px-3 font-semibold shadow-none cursor-pointer') \
            .tooltip(t('fw.ifrs_tip'))
        return


def admin_framework_dialog(on_saved=None) -> None:
    user = api.user()
    org_fw = user.get('frameworks')
    if isinstance(org_fw, (list, tuple)) and org_fw:
        current_fw = str(org_fw[0]).lower().strip()
    elif isinstance(org_fw, str) and org_fw:
        current_fw = org_fw.lower().strip()
    else:
        current_fw = framework()

    current_tier = str(user.get('reporting_tier') or 'normal').lower().strip()

    with ui.dialog() as dialog, ui.card().classes('p-6 w-[560px] max-w-full rounded-2xl shadow-xl'):
        with ui.row().classes('w-full justify-between items-start mb-2'):
            with ui.column().classes('gap-0'):
                ui.label(f"⚙️ {t('admin.dialog_title')}").classes('text-lg font-bold text-slate-900')
                ui.label(t('admin.dialog_sub')).classes('text-xs text-slate-500')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        with ui.column().classes('w-full gap-4 mt-2'):
            # Org info strip
            with ui.row().classes('w-full p-3 bg-slate-50 rounded-xl border border-slate-200 items-center justify-between text-xs'):
                with ui.column().classes('gap-0.5'):
                    ui.label(t('admin.current_org')).classes('text-[10.5px] uppercase font-bold text-slate-400')
                    ui.label(f"🏥 {user.get('org_name', '')}").classes('font-semibold text-slate-800')
                with ui.row().classes('gap-2 items-center'):
                    ui.chip(f"🇨🇲 {user.get('country_code', '')}", color='slate-2').props('dense text-color=slate-8')
                    ui.chip(f"💱 {user.get('functional_currency', '')}", color='slate-2').props('dense text-color=slate-8')

            # Framework options
            ui.label(t('admin.framework_choice')).classes('text-xs uppercase font-bold text-slate-500 tracking-wider')

            fw_radio = ui.radio(
                {
                    'ohada': t('admin.fw_ohada_opt'),
                    'ifrs': t('admin.fw_ifrs_opt'),
                },
                value='ifrs' if current_fw == 'ifrs' else 'ohada'
            ).props('dense color=primary').classes('gap-2 text-xs')

            # Context explanation box
            with ui.column().classes('w-full p-3.5 bg-teal-50/60 rounded-xl border border-teal-200 gap-1.5 text-xs text-teal-900'):
                ui.label(f"📌 {t('admin.impact_title')}").classes('font-bold')
                ui.label(t('admin.impact_ohada')).classes('leading-relaxed')
                ui.label(t('admin.impact_ifrs')).classes('leading-relaxed')

            # Reporting tier options
            tier_sel = ui.select(
                {
                    'normal': t('admin.tier_normal'),
                    'allege': t('admin.tier_allege'),
                    'smt': t('admin.tier_smt'),
                },
                value=current_tier if current_tier in ('normal', 'allege', 'smt') else 'normal',
                label=t('admin.tier_choice')
            ).props('outlined dense options-dense').classes('w-full text-xs')

            async def submit() -> None:
                selected_fw = fw_radio.value or 'ohada'
                selected_tier = tier_sel.value or 'normal'
                save_btn.props('loading')
                res = await api.safe(api.patch('/admin/organization', {
                    'frameworks': selected_fw,
                    'reporting_tier': selected_tier,
                }))
                if res:
                    await api.refresh_session()
                    if selected_fw in ('ohada', 'ifrs'):
                        set_framework(selected_fw)
                        if selected_fw == 'ifrs':
                            set_lang('en')
                            await api.safe(api.patch('/auth/locale', {'locale': 'en'}), notify=False)
                    dialog.close()
                    ui.notify(t('admin.save_success', fw=selected_fw.upper()), type='positive')
                    if callable(on_saved):
                        await on_saved()
                    else:
                        ui.navigate.reload()
                save_btn.props(remove='loading')

            with ui.row().classes('w-full justify-end gap-2 mt-2'):
                ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8 size=sm')
                save_btn = ui.button(t('admin.save_btn'), icon='save', on_click=submit).props('unelevated color=primary size=sm')

    dialog.open()



def _language_toggle() -> None:
    if framework() == 'ifrs':
        # IFRS framework is strictly English only
        ui.badge('🇬🇧 EN').props('color=slate-7 outline').classes('text-xs px-2.5 py-1 font-bold')
        return
    current = lang()
    toggle = ui.toggle({'en': '🇬🇧 EN', 'fr': '🇫🇷 FR'}, value=current) \
        .props('dense unelevated no-caps').classes('lc-seg rounded-lg text-xs')
    toggle.tooltip(t('lang.switch'))

    async def switch(event) -> None:
        code = event.value if hasattr(event, 'value') else current
        if code not in ('en', 'fr') or code == lang():
            return
        set_lang(code)
        if api.token():
            body = await api.safe(api.patch('/auth/locale', {'locale': code}), notify=False)
            if body and body.get('user'):
                app.storage.user['user'] = body['user']
        ui.navigate.reload()

    toggle.on_value_change(switch)


def _password_dialog() -> None:
    with ui.dialog() as dialog, ui.element('div').classes('lc-card p-5 w-[420px] max-w-full'):
        ui.label(t('auth.change_pw')).classes('text-base font-semibold mb-1')
        ui.label(t('auth.change_pw_hint')).classes('text-xs text-slate-500 mb-3')
        current = ui.input(t('auth.current_pw'), password=True).props('outlined dense').classes('w-full')
        fresh = ui.input(t('auth.new_pw'), password=True).props('outlined dense').classes('w-full')
        again = ui.input(t('auth.confirm_pw'), password=True).props('outlined dense').classes('w-full')

        async def submit() -> None:
            if fresh.value != again.value:
                ui.notify(t('auth.pw_mismatch'), type='warning', position='top')
                return
            result = await api.safe(api.post('/auth/change-password', {
                'currentPassword': current.value, 'newPassword': fresh.value,
            }))
            if result:
                ui.notify(t('auth.pw_changed'), type='positive', position='top')
                dialog.close()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat color=grey-8')
            ui.button(t('auth.change_pw'), on_click=submit).props('unelevated')
    dialog.open()


def _initials(name: str) -> str:
    parts = [p for p in str(name).split() if p]
    if not parts:
        return '?'
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else '')).upper()
