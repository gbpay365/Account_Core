"""
Comprehensive Administration Module:
- Users & Profiles management (create, edit, roles, cost centers, passwords, status)
- User Groups & Roles (create, edit, granular module permissions assignment)
- Entity & System Setup (legal name, address, tax ID/NUI, VAT/TVA number, framework, tier)
- VAT, TVA & Tax Parameters Setup (tax codes, rates, input/output accounts, deductibility)
"""

from __future__ import annotations

from typing import Any
import datetime
from nicegui import app, ui

from .. import api
from ..i18n import t, framework
from ..ui import chrome, widgets as w
from ..ui.shell import page


@page('/admin', title='Admin Console & System Setup', permissions=('admin.users', 'admin.settings', 'coa.manage', 'admin.audit'))
async def admin_page() -> None:
    # Pre-fetch lookup data
    groups_res = await api.safe(api.get('/admin/groups'), notify=False) or {'rows': []}
    roles_list = groups_res.get('rows', [])
    role_options = {r['id']: f"{r['code']} — {r.get('name_en' if framework() == 'ifrs' else 'name') or r['name']}" for r in roles_list}

    cc_res = await api.safe(api.get('/cost-centers'), notify=False) or {'rows': []}
    cc_options = {c['id']: f"{c['code']} — {c.get('name_en' if framework() == 'ifrs' else 'name') or c['name']}" for c in cc_res.get('rows', [])}

    accts_res = await api.safe(api.get('/accounts', postableOnly=True, activeOnly=True), notify=False) or {'rows': []}
    acct_options = {a['id']: f"{a['code']} — {a.get('name_en' if framework() == 'ifrs' else 'name') or a['name']}" for a in accts_res.get('rows', [])}

    jnls_res = await api.safe(api.get('/journals'), notify=False) or {'rows': []}
    jnl_options = {j['id']: f"{j['code']} — {j['name']}" for j in jnls_res.get('rows', [])}

    perms_res = await api.safe(api.get('/admin/permissions'), notify=False) or {'rows': [], 'modules': {}}
    all_perms = perms_res.get('rows', [])
    perm_modules = perms_res.get('modules', {})

    w.page_header(
        t('admin.title'),
        t('admin.sub'),
        emoji='⚙️',
    )

    with ui.card().classes('w-full p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm'):
        with ui.tabs().classes('w-full bg-slate-50/70 border-b border-slate-200/80 text-slate-700 px-4') as tabs:
            tab_users = ui.tab('users', label=t('admin.tab_users'), icon='people')
            tab_groups = ui.tab('groups', label=t('admin.tab_groups'), icon='admin_panel_settings')
            tab_entity = ui.tab('entity', label=t('admin.tab_entity'), icon='business')
            tab_taxes = ui.tab('taxes', label=t('admin.tab_taxes'), icon='receipt_long')
            tab_integrations = ui.tab('integrations', label=t('admin.tab_integrations'), icon='hub')

        with ui.tab_panels(tabs, value='users').classes('w-full p-6 bg-white'):
            # TAB 1: USERS & PROFILES
            with ui.tab_panel('users').classes('p-0 gap-6'):
                await _render_users_tab(role_options, cc_options)

            # TAB 2: USER GROUPS & ROLES
            with ui.tab_panel('groups').classes('p-0 gap-6'):
                await _render_groups_tab(all_perms, perm_modules)

            # TAB 3: ENTITY SETUP
            with ui.tab_panel('entity').classes('p-0 gap-6'):
                await _render_entity_tab()

            # TAB 4: VAT, TVA & TAX PARAMETERS
            with ui.tab_panel('taxes').classes('p-0 gap-6'):
                await _render_taxes_tab(acct_options)

            # TAB 5: EXTERNAL SYSTEMS & APIS GATEWAY (BILLING, ERP, POS, BANKING)
            with ui.tab_panel('integrations').classes('p-0 gap-6'):
                await _render_integrations_tab(acct_options, cc_options, jnl_options)


# ==============================================================================
# TAB 1: USERS & PROFILES
# ==============================================================================

async def _render_users_tab(role_options: dict, cc_options: dict) -> None:
    users_state: dict[str, Any] = {'search': '', 'role_id': None, 'status': 'all', 'data': []}
    container = ui.column().classes('w-full gap-4')

    async def load_users():
        container.clear()
        with container:
            spinner = ui.spinner(size='lg').classes('self-center my-8')
        params = {}
        if users_state['search']:
            params['search'] = users_state['search']
        if users_state['role_id']:
            params['roleId'] = users_state['role_id']
        if users_state['status'] != 'all':
            params['status'] = users_state['status']

        res = await api.safe(api.get('/admin/users', **params)) or {'rows': [], 'total': 0}
        users_state['data'] = res.get('rows', [])
        container.clear()

        total_u = len(users_state['data'])
        active_u = sum(1 for u in users_state['data'] if u.get('is_active'))
        inactive_u = total_u - active_u
        techs_u = sum(1 for u in users_state['data'] if u.get('is_technician'))

        with container:
            # KPI Cards
            with ui.row().classes('w-full gap-4'):
                _kpi_card(t('admin.kpi_total_users'), str(total_u), 'people', 'teal')
                _kpi_card(t('admin.kpi_active_users'), str(active_u), 'check_circle', 'emerald')
                _kpi_card(t('admin.user_inactive'), str(inactive_u), 'pause_circle', 'slate')
                _kpi_card(t('admin.kpi_technicians'), str(techs_u), 'build', 'amber')

            # Search & Filter Toolbar
            with ui.row().classes('w-full justify-between items-center gap-3 mt-2'):
                with ui.row().classes('items-center gap-3 flex-1 flex-wrap'):
                    ui.input(placeholder=f"🔍 {t('common.search')}...",
                             value=users_state['search'],
                             on_change=lambda e: _on_search(e.value)) \
                        .props('outlined dense clearable debounce=400').classes('w-64')

                    status_opts = {'all': t('common.all'), 'active': t('admin.user_active'), 'inactive': t('admin.user_inactive')}
                    ui.select(status_opts, value=users_state['status'], label=t('common.status'),
                              on_change=lambda e: _on_status_change(e.value)) \
                        .props('outlined dense options-dense').classes('w-36')

                    role_filter_opts = {None: t('common.all'), **role_options}
                    ui.select(role_filter_opts, value=users_state['role_id'], label=t('admin.user_role'),
                              on_change=lambda e: _on_role_change(e.value)) \
                        .props('outlined dense options-dense').classes('w-64')

                ui.button(f"+ {t('admin.new_user')}", on_click=lambda: _user_modal(None, role_options, cc_options, load_users)) \
                    .props('unelevated color=primary icon=person_add no-caps').classes('rounded-xl px-4 py-2 font-semibold shadow-sm')

            # Table
            _render_users_table(users_state['data'], role_options, cc_options, load_users)

    def _on_search(val):
        users_state['search'] = val or ''
        ui.timer(0.1, load_users, once=True)

    def _on_status_change(val):
        users_state['status'] = val
        ui.timer(0.1, load_users, once=True)

    def _on_role_change(val):
        users_state['role_id'] = val
        ui.timer(0.1, load_users, once=True)

    await load_users()


def _render_users_table(users: list[dict], role_options: dict, cc_options: dict, refresh_callback) -> None:
    if not users:
        with ui.column().classes('w-full items-center justify-center p-12 text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl mt-4'):
            ui.icon('group_off', size='48px').classes('text-slate-300')
            ui.label('No users found matching current filters.').classes('text-sm font-medium')
        return

    columns = [
        {'name': 'user', 'label': t('admin.user_name'), 'field': 'full_name', 'align': 'left', 'sortable': True},
        {'name': 'role', 'label': t('admin.user_role'), 'field': 'role_name', 'align': 'left', 'sortable': True},
        {'name': 'dept', 'label': t('admin.user_dept'), 'field': 'cost_center_code', 'align': 'left'},
        {'name': 'contact', 'label': t('admin.user_phone'), 'field': 'phone', 'align': 'left'},
        {'name': 'tech', 'label': t('admin.user_tech'), 'field': 'is_technician', 'align': 'center'},
        {'name': 'status', 'label': t('common.status'), 'field': 'is_active', 'align': 'center'},
        {'name': 'actions', 'label': t('common.actions'), 'field': 'id', 'align': 'right'},
    ]

    with ui.table(columns=columns, rows=users, row_key='id').classes('w-full border border-slate-100 rounded-xl mt-4 shadow-none') as table:
        table.add_slot('body-cell-user', '''
            <q-td :props="props">
                <div class="row items-center no-wrap gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs shrink-0">
                        {{ (props.row.full_name || '?').charAt(0).toUpperCase() }}
                    </div>
                    <div class="column">
                        <span class="font-semibold text-slate-900 leading-tight text-xs">{{ props.row.full_name }}</span>
                        <span class="text-[11px] text-slate-400 leading-tight">{{ props.row.email }}</span>
                    </div>
                </div>
            </q-td>
        ''')
        table.add_slot('body-cell-role', '''
            <q-td :props="props">
                <q-chip dense outline color="primary" class="text-[11px] font-medium q-my-none">
                    {{ props.row.role_name_en || props.row.role_name || props.row.role_code || '—' }}
                </q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-dept', '''
            <q-td :props="props">
                <span class="text-xs text-slate-700 font-mono" v-if="props.row.cost_center_code">
                    {{ props.row.cost_center_code }} · {{ props.row.cost_center_name || '' }}
                </span>
                <span class="text-xs text-slate-400" v-else>—</span>
            </q-td>
        ''')
        table.add_slot('body-cell-contact', '''
            <q-td :props="props">
                <div class="column">
                    <span class="text-xs text-slate-700">{{ props.row.job_title || '—' }}</span>
                    <span class="text-[11px] text-slate-400 font-mono">{{ props.row.phone || '' }}</span>
                </div>
            </q-td>
        ''')
        table.add_slot('body-cell-tech', '''
            <q-td :props="props">
                <q-chip v-if="props.row.is_technician" dense color="amber-1" text-color="amber-9" icon="build" class="text-[10.5px] font-semibold">
                    Tech ({{ props.row.hourly_rate || 0 }} /hr)
                </q-chip>
                <span v-else class="text-slate-300">—</span>
            </q-td>
        ''')
        table.add_slot('body-cell-status', '''
            <q-td :props="props">
                <q-chip v-if="props.row.is_active" dense color="positive" text-color="white" icon="check" class="text-[11px] font-semibold">
                    Active
                </q-chip>
                <q-chip v-else dense color="grey-4" text-color="grey-8" icon="block" class="text-[11px]">
                    Inactive
                </q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-actions', '''
            <q-td :props="props">
                <div class="row items-center justify-end no-wrap gap-1">
                    <q-btn flat round dense size="sm" icon="edit" color="primary" @click="$parent.$emit('edit', props.row.id)">
                        <q-tooltip>Edit Profile</q-tooltip>
                    </q-btn>
                    <q-btn flat round dense size="sm" icon="lock_reset" color="amber-9" @click="$parent.$emit('reset_pw', props.row.id)">
                        <q-tooltip>Reset Password</q-tooltip>
                    </q-btn>
                    <q-btn flat round dense size="sm" :icon="props.row.is_active ? 'toggle_on' : 'toggle_off'" :color="props.row.is_active ? 'positive' : 'grey'" @click="$parent.$emit('toggle', props.row.id)">
                        <q-tooltip>{{ props.row.is_active ? 'Deactivate User' : 'Activate User' }}</q-tooltip>
                    </q-btn>
                </div>
            </q-td>
        ''')

        def _get_user_from_arg(arg):
            if isinstance(arg, dict):
                return arg
            uid = None
            if isinstance(arg, (int, str)):
                try:
                    uid = int(arg)
                except (ValueError, TypeError):
                    pass
            elif hasattr(arg, 'args'):
                if isinstance(arg.args, dict):
                    return arg.args
                try:
                    uid = int(arg.args)
                except (ValueError, TypeError):
                    pass
            if uid is not None:
                return next((u for u in users if u['id'] == uid), None)
            return None

        def _handle_edit(msg):
            u = _get_user_from_arg(msg)
            if u:
                _user_modal(u, role_options, cc_options, refresh_callback)

        def _handle_reset_pw(msg):
            u = _get_user_from_arg(msg)
            if u:
                _reset_password_modal(u)

        def _handle_toggle(msg):
            u = _get_user_from_arg(msg)
            if u:
                ui.timer(0.01, lambda: _toggle_user_status(u, refresh_callback), once=True)

        table.on('edit', _handle_edit)
        table.on('reset_pw', _handle_reset_pw)
        table.on('toggle', _handle_toggle)


async def _toggle_user_status(user: dict, refresh_callback) -> None:
    res = await api.safe(api.post(f"/admin/users/{user['id']}/toggle-status"))
    if res:
        action = 'activated' if res.get('is_active') else 'deactivated'
        ui.notify(f"User {user.get('full_name')} {action} successfully.", type='positive', position='top')
        await refresh_callback()


def _reset_password_modal(user: dict) -> None:
    with ui.dialog() as dialog, ui.card().classes('p-6 w-[440px] max-w-full rounded-2xl shadow-xl'):
        with ui.row().classes('w-full justify-between items-center mb-2'):
            ui.label(f"🔑 {t('admin.reset_pw')}").classes('text-base font-bold text-slate-900')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        ui.label(f"Resetting credentials for {user.get('full_name')} ({user.get('email')})").classes('text-xs text-slate-500 mb-3')

        pw_input = ui.input(t('auth.password'), password=True, password_toggle_button=True) \
            .props('outlined dense').classes('w-full mb-4')

        async def _do_reset():
            pw = (pw_input.value or '').strip()
            if len(pw) < 6:
                ui.notify('Password must be at least 6 characters long.', type='warning')
                return
            res = await api.safe(api.post(f"/admin/users/{user['id']}/reset-password", {'password': pw}))
            if res:
                ui.notify(f"Password updated for {user.get('full_name')}.", type='positive', position='top')
                dialog.close()

        with ui.row().classes('w-full justify-end gap-2'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_do_reset).props('unelevated color=primary no-caps')

        dialog.open()


def _user_modal(user: dict | None, role_options: dict, cc_options: dict, refresh_callback) -> None:
    is_edit = user is not None
    title = t('admin.edit_user') if is_edit else t('admin.new_user')

    with ui.dialog() as dialog, ui.card().classes('p-6 w-[620px] max-w-full rounded-2xl shadow-xl'):
        with ui.row().classes('w-full justify-between items-center mb-2'):
            ui.label(f"👤 {title}").classes('text-lg font-bold text-slate-900')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        with ui.column().classes('w-full gap-3 mt-1'):
            with ui.row().classes('w-full gap-3'):
                name_in = ui.input(t('admin.user_name'), value=user.get('full_name', '') if is_edit else '') \
                    .props('outlined dense').classes('flex-1')
                email_in = ui.input(t('admin.user_email'), value=user.get('email', '') if is_edit else '') \
                    .props('outlined dense').classes('flex-1')

            if not is_edit:
                pw_in = ui.input(t('auth.password'), password=True, password_toggle_button=True) \
                    .props('outlined dense').classes('w-full')

            with ui.row().classes('w-full gap-3'):
                role_val = user.get('role_id') if is_edit else (list(role_options.keys())[0] if role_options else None)
                role_sel = ui.select(role_options, value=role_val, label=t('admin.user_role')) \
                    .props('outlined dense options-dense').classes('flex-1')

                cc_val = user.get('cost_center_id') if is_edit else None
                cc_opts = {None: '— None / General —', **cc_options}
                cc_sel = ui.select(cc_opts, value=cc_val, label=t('admin.user_dept')) \
                    .props('outlined dense options-dense').classes('flex-1')

            with ui.row().classes('w-full gap-3'):
                title_in = ui.input(t('admin.user_title'), value=user.get('job_title', '') if is_edit else '') \
                    .props('outlined dense').classes('flex-1')
                phone_in = ui.input(t('admin.user_phone'), value=user.get('phone', '') if is_edit else '') \
                    .props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3 items-center'):
                locale_opts = {'fr': 'Français', 'en': 'English'}
                locale_sel = ui.select(locale_opts, value=user.get('locale', 'fr') if is_edit else 'fr', label=t('admin.user_locale')) \
                    .props('outlined dense options-dense').classes('w-40')

                tech_chk = ui.checkbox(t('admin.user_tech'), value=bool(user.get('is_technician')) if is_edit else False) \
                    .classes('text-xs font-semibold text-slate-700')

                hourly_in = ui.number(t('admin.user_hourly'), value=float(user.get('hourly_rate', 0) or 0) if is_edit else 0, min=0) \
                    .props('outlined dense').classes('w-36')

            must_pw_chk = ui.checkbox(t('admin.user_must_change_pw'), value=bool(user.get('must_change_pw')) if is_edit else True) \
                .classes('text-xs text-slate-600')

        async def _save():
            if not (name_in.value or '').strip():
                ui.notify('Full name is required.', type='warning')
                return
            if not (email_in.value or '').strip():
                ui.notify('Email address is required.', type='warning')
                return
            if not role_sel.value:
                ui.notify('Role is required.', type='warning')
                return

            payload = {
                'fullName': name_in.value.strip(),
                'email': email_in.value.strip(),
                'roleId': int(role_sel.value),
                'costCenterId': int(cc_sel.value) if cc_sel.value else None,
                'jobTitle': (title_in.value or '').strip() or None,
                'phone': (phone_in.value or '').strip() or None,
                'locale': locale_sel.value,
                'isTechnician': bool(tech_chk.value),
                'hourlyRate': float(hourly_in.value or 0),
                'mustChangePw': bool(must_pw_chk.value),
            }

            if not is_edit:
                pw = (pw_in.value or '').strip()
                if len(pw) < 6:
                    ui.notify('Password must be at least 6 characters.', type='warning')
                    return
                payload['password'] = pw
                res = await api.safe(api.post('/admin/users', payload))
            else:
                res = await api.safe(api.put(f"/admin/users/{user['id']}", payload))

            if res:
                ui.notify(f"User {payload['fullName']} saved successfully.", type='positive', position='top')
                dialog.close()
                await refresh_callback()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_save).props('unelevated color=primary no-caps')

        dialog.open()


# ==============================================================================
# TAB 2: USER GROUPS & ROLES
# ==============================================================================

async def _render_groups_tab(all_perms: list[dict], perm_modules: dict) -> None:
    container = ui.column().classes('w-full gap-4')

    async def load_groups():
        container.clear()
        res = await api.safe(api.get('/admin/groups')) or {'rows': []}
        roles = res.get('rows', [])

        total_r = len(roles)
        system_r = sum(1 for r in roles if r.get('is_system'))
        custom_r = total_r - system_r
        total_p = len(all_perms)

        with container:
            with ui.row().classes('w-full gap-4'):
                _kpi_card(t('admin.groups_title'), str(total_r), 'admin_panel_settings', 'teal')
                _kpi_card(t('admin.system_role'), str(system_r), 'security', 'indigo')
                _kpi_card(t('admin.custom_role'), str(custom_r), 'engineering', 'emerald')
                _kpi_card(t('admin.group_perms'), f"{total_p} Total", 'key', 'amber')

            with ui.row().classes('w-full justify-between items-center gap-3 mt-2'):
                ui.label(t('admin.groups_sub')).classes('text-xs text-slate-500 font-medium')
                ui.button(f"+ {t('admin.new_group')}", on_click=lambda: _group_modal(None, all_perms, perm_modules, load_groups)) \
                    .props('unelevated color=primary icon=add_moderator no-caps').classes('rounded-xl px-4 py-2 font-semibold shadow-sm')

            # Roles Table
            _render_groups_table(roles, all_perms, perm_modules, load_groups)

    await load_groups()


def _render_groups_table(roles: list[dict], all_perms: list[dict], perm_modules: dict, refresh_callback) -> None:
    columns = [
        {'name': 'name', 'label': t('admin.group_name'), 'field': 'name', 'align': 'left', 'sortable': True},
        {'name': 'type', 'label': 'Type', 'field': 'is_system', 'align': 'center'},
        {'name': 'members', 'label': t('admin.group_members'), 'field': 'member_count', 'align': 'center', 'sortable': True},
        {'name': 'perms', 'label': t('admin.group_perms'), 'field': 'permission_count', 'align': 'center', 'sortable': True},
        {'name': 'actions', 'label': t('common.actions'), 'field': 'id', 'align': 'right'},
    ]

    with ui.table(columns=columns, rows=roles, row_key='id').classes('w-full border border-slate-100 rounded-xl mt-3') as table:
        table.add_slot('body-cell-name', '''
            <q-td :props="props">
                <div class="column">
                    <div class="row items-center gap-2">
                        <span class="font-bold text-slate-900 text-xs">{{ props.row.name_en || props.row.name }}</span>
                        <code class="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">{{ props.row.code }}</code>
                    </div>
                    <span class="text-[11px] text-slate-400 leading-tight mt-0.5">{{ props.row.description || 'No description provided.' }}</span>
                </div>
            </q-td>
        ''')
        table.add_slot('body-cell-type', '''
            <q-td :props="props">
                <q-chip v-if="props.row.is_system" dense color="indigo-1" text-color="indigo-9" icon="shield" class="text-[10.5px] font-semibold">
                    System Built-in
                </q-chip>
                <q-chip v-else dense color="emerald-1" text-color="emerald-9" icon="tune" class="text-[10.5px] font-semibold">
                    Custom Group
                </q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-members', '''
            <q-td :props="props">
                <q-badge color="teal-8" class="text-xs px-2 py-1 font-semibold rounded-lg">
                    {{ props.row.member_count }} users
                </q-badge>
            </q-td>
        ''')
        table.add_slot('body-cell-perms', '''
            <q-td :props="props">
                <span class="text-xs font-semibold text-slate-700 font-mono">{{ props.row.permission_count }} grants</span>
            </q-td>
        ''')
        table.add_slot('body-cell-actions', '''
            <q-td :props="props">
                <div class="row items-center justify-end no-wrap gap-1">
                    <q-btn flat dense no-caps size="sm" icon="vpn_key" color="primary" label="Permissions & Edit" @click="$parent.$emit('edit', props.row.id)" class="rounded-lg">
                    </q-btn>
                    <q-btn v-if="!props.row.is_system && props.row.member_count === 0" flat round dense size="sm" icon="delete" color="negative" @click="$parent.$emit('delete', props.row.id)">
                        <q-tooltip>Delete Group</q-tooltip>
                    </q-btn>
                </div>
            </q-td>
        ''')

        def _get_role_from_arg(arg):
            if isinstance(arg, dict):
                return arg
            rid = None
            if isinstance(arg, (int, str)):
                try:
                    rid = int(arg)
                except (ValueError, TypeError):
                    pass
            elif hasattr(arg, 'args'):
                if isinstance(arg.args, dict):
                    return arg.args
                try:
                    rid = int(arg.args)
                except (ValueError, TypeError):
                    pass
            if rid is not None:
                return next((r for r in roles if r['id'] == rid), None)
            return None

        def _handle_edit_role(msg):
            r = _get_role_from_arg(msg)
            if r:
                _edit_group_modal(r['id'], all_perms, perm_modules, refresh_callback)

        def _handle_delete_role(msg):
            r = _get_role_from_arg(msg)
            if r:
                _delete_group(r, refresh_callback)

        table.on('edit', _handle_edit_role)
        table.on('delete', _handle_delete_role)


async def _delete_group(role: dict, refresh_callback) -> None:
    res = await api.safe(api.delete(f"/admin/groups/{role['id']}"))
    if res:
        ui.notify(f"Group {role['name']} deleted.", type='positive', position='top')
        await refresh_callback()


def _group_modal(role: dict | None, all_perms: list[dict], perm_modules: dict, refresh_callback) -> None:
    with ui.dialog() as dialog, ui.card().classes('p-6 w-[520px] max-w-full rounded-2xl shadow-xl'):
        with ui.row().classes('w-full justify-between items-center mb-2'):
            ui.label(f"🛡️ {t('admin.new_group')}").classes('text-lg font-bold text-slate-900')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        with ui.column().classes('w-full gap-3 mt-1'):
            code_in = ui.input(t('admin.group_code'), placeholder='e.g., billing_clerk') \
                .props('outlined dense').classes('w-full')
            name_in = ui.input(t('admin.group_name'), placeholder='e.g., Agent de Facturation') \
                .props('outlined dense').classes('w-full')
            name_en_in = ui.input(t('admin.group_name_en'), placeholder='e.g., Billing Clerk') \
                .props('outlined dense').classes('w-full')
            desc_in = ui.textarea(t('admin.group_desc'), placeholder='Role scope and operational duties...') \
                .props('outlined dense rows=2').classes('w-full')

        async def _create():
            code = (code_in.value or '').strip()
            name = (name_in.value or '').strip()
            if not code or not name:
                ui.notify('Group code and name are required.', type='warning')
                return
            res = await api.safe(api.post('/admin/groups', {
                'code': code,
                'name': name,
                'nameEn': (name_en_in.value or '').strip() or None,
                'description': (desc_in.value or '').strip() or None,
                'permissionIds': [],
            }))
            if res:
                ui.notify(f"Group {name} created successfully.", type='positive', position='top')
                dialog.close()
                await refresh_callback()
                # Open permissions editor right away for the new role
                new_rid = res.get('id') or (res.get('role') or {}).get('id')
                if new_rid:
                    _edit_group_modal(new_rid, all_perms, perm_modules, refresh_callback)

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_create).props('unelevated color=primary no-caps')

        dialog.open()


async def _edit_group_modal(role_id: int, all_perms: list[dict], perm_modules: dict, refresh_callback) -> None:
    res = await api.safe(api.get(f'/admin/groups/{role_id}'))
    if not res:
        return
    role = res.get('role', {})
    current_perm_ids = set(p['id'] for p in res.get('permissions', []))
    perm_checkboxes: dict[int, ui.checkbox] = {}

    with ui.dialog() as dialog, ui.card().classes('p-6 w-[860px] max-w-full rounded-2xl shadow-2xl max-h-[90vh] flex flex-col'):
        with ui.row().classes('w-full justify-between items-start mb-2 shrink-0'):
            with ui.column().classes('gap-0'):
                ui.label(f"🛡️ {t('admin.edit_group')}: {role.get('name')}").classes('text-lg font-bold text-slate-900')
                ui.label(f"Code: {role.get('code')} · {len(current_perm_ids)} current permissions").classes('text-xs text-slate-500 font-mono')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        with ui.column().classes('w-full gap-3 overflow-y-auto flex-1 pr-2'):
            # Basic info
            with ui.row().classes('w-full gap-3'):
                name_in = ui.input(t('admin.group_name'), value=role.get('name', '')).props('outlined dense').classes('flex-1')
                name_en_in = ui.input(t('admin.group_name_en'), value=role.get('name_en', '')).props('outlined dense').classes('flex-1')
            desc_in = ui.input(t('admin.group_desc'), value=role.get('description', '')).props('outlined dense').classes('w-full')

            ui.separator().classes('my-2')
            ui.label('Granular Permissions Matrix by Application Module').classes('text-xs uppercase font-bold text-slate-500 tracking-wider')

            # Group permissions by module
            for mod_name, m_perms in sorted(perm_modules.items()):
                with ui.card().classes('w-full p-4 border border-slate-200/80 rounded-xl bg-slate-50/40 gap-2'):
                    with ui.row().classes('w-full justify-between items-center mb-1'):
                        ui.label(f"📦 Module: {mod_name.upper()}").classes('font-bold text-xs text-slate-800')
                        with ui.row().classes('gap-2'):
                            def _toggle_module(m_perms=m_perms, select=True):
                                for p in m_perms:
                                    if p['id'] in perm_checkboxes:
                                        perm_checkboxes[p['id']].value = select

                            ui.button('Select All', on_click=lambda m=m_perms: _toggle_module(m, True)) \
                                .props('flat dense size=xs color=primary no-caps')
                            ui.button('Clear', on_click=lambda m=m_perms: _toggle_module(m, False)) \
                                .props('flat dense size=xs color=grey-7 no-caps')

                    with ui.grid().classes('grid-cols-1 md:grid-cols-2 gap-2 w-full'):
                        for p in m_perms:
                            p_id = p['id']
                            chk = ui.checkbox(
                                f"{p['code']} — {p.get('description') or ''}",
                                value=(p_id in current_perm_ids)
                            ).classes('text-xs text-slate-700 leading-tight')
                            perm_checkboxes[p_id] = chk

        async def _save():
            selected_ids = [pid for pid, chk in perm_checkboxes.items() if chk.value]
            payload = {
                'name': (name_in.value or '').strip(),
                'nameEn': (name_en_in.value or '').strip() or None,
                'description': (desc_in.value or '').strip() or None,
                'permissionIds': selected_ids,
            }
            res = await api.safe(api.put(f'/admin/groups/{role_id}', payload))
            if res:
                ui.notify(f"Group updated with {len(selected_ids)} permissions.", type='positive', position='top')
                dialog.close()
                await refresh_callback()

        with ui.row().classes('w-full justify-between items-center pt-3 border-t shrink-0'):
            ui.label(f"Assigned: {sum(1 for chk in perm_checkboxes.values() if chk.value)} / {len(all_perms)}").classes('text-xs font-semibold text-slate-500')
            with ui.row().classes('gap-2'):
                ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
                ui.button(t('common.save'), on_click=_save).props('unelevated color=primary no-caps')

        dialog.open()


# ==============================================================================
# TAB 3: ENTITY & SYSTEM SETUP
# ==============================================================================

async def _render_entity_tab() -> None:
    container = ui.column().classes('w-full gap-6')

    async def load_entity():
        container.clear()
        org = await api.safe(api.get('/admin/organization')) or {}
        if not org:
            with container:
                ui.label('Failed to load organization settings.').classes('text-red-500')
            return

        with container:
            with ui.row().classes('w-full p-4 rounded-xl bg-teal-50/70 border border-teal-200/80 items-center justify-between'):
                with ui.row().classes('items-center gap-3'):
                    ui.label('🏥').classes('text-3xl')
                    with ui.column().classes('gap-0'):
                        ui.label(org.get('name', 'Hospital Organization')).classes('text-base font-bold text-teal-950')
                        ui.label(f"Code: {org.get('code', 'ORG')} · Country: {org.get('country_code', 'CM')} · Functional Currency: {org.get('functional_currency', 'XAF')}").classes('text-xs text-teal-800')
                with ui.row().classes('gap-2'):
                    current_fw = str(org.get('frameworks') or 'ohada').upper()
                    ui.chip(f"Framework: {current_fw}", color='teal').props('dense text-color=white')
                    ui.chip(f"Tier: {str(org.get('reporting_tier', 'normal')).upper()}", color='teal-8').props('dense text-color=white')

            # Form Sections
            with ui.column().classes('w-full gap-5'):
                # Section 1: Official Identification & NUI / TVA
                with ui.card().classes('w-full p-5 border border-slate-200/80 rounded-2xl gap-3 shadow-none'):
                    ui.label('🏛️ Legal Registration & Tax Identifiers').classes('font-bold text-slate-900 text-sm')
                    with ui.row().classes('w-full gap-4'):
                        name_in = ui.input(t('admin.org_name'), value=org.get('name', '')).props('outlined dense').classes('flex-1')
                        legal_name_in = ui.input(t('admin.org_legal_name'), value=org.get('legal_name', '')).props('outlined dense').classes('flex-1')
                    with ui.row().classes('w-full gap-4'):
                        code_in = ui.input(t('admin.org_code'), value=org.get('code', '')).props('outlined dense').classes('w-48')
                        org_type_in = ui.input(t('admin.org_type'), value=org.get('org_type', 'Hospital')).props('outlined dense').classes('flex-1')
                        country_in = ui.input(t('admin.org_country'), value=org.get('country_code', 'CM')).props('outlined dense').classes('w-32')

                    with ui.row().classes('w-full gap-4'):
                        tax_id_in = ui.input(t('admin.org_tax_id'), value=org.get('tax_id', ''), placeholder='e.g., M019800012345P') \
                            .props('outlined dense').classes('flex-1')
                        vat_num_in = ui.input(t('admin.org_vat_num'), value=org.get('vat_number', ''), placeholder='e.g., TVA-CMR-2024-00129') \
                            .props('outlined dense').classes('flex-1')

                # Section 2: Address & Official Contacts
                with ui.card().classes('w-full p-5 border border-slate-200/80 rounded-2xl gap-3 shadow-none'):
                    ui.label('📍 Physical Location & Contacts').classes('font-bold text-slate-900 text-sm')
                    with ui.row().classes('w-full gap-4'):
                        address_in = ui.input(t('admin.org_address'), value=org.get('address', '')).props('outlined dense').classes('flex-1')
                        city_in = ui.input(t('admin.org_city'), value=org.get('city', '')).props('outlined dense').classes('w-64')

                    with ui.row().classes('w-full gap-4'):
                        phone_in = ui.input(t('admin.org_phone'), value=org.get('phone', '')).props('outlined dense').classes('flex-1')
                        email_in = ui.input(t('admin.org_email'), value=org.get('email', '')).props('outlined dense').classes('flex-1')
                        website_in = ui.input(t('admin.org_website'), value=org.get('website', '')).props('outlined dense').classes('flex-1')

                # Section 3: Regulatory Accounting Framework & Reporting Currency
                with ui.card().classes('w-full p-5 border border-slate-200/80 rounded-2xl gap-3 shadow-none'):
                    ui.label('📐 Regulatory Accounting & Financial Framework').classes('font-bold text-slate-900 text-sm')

                    fw_val = str(org.get('frameworks') or 'ohada').lower()
                    if fw_val not in ('ohada', 'ifrs', 'both'):
                        fw_val = 'ohada'

                    fw_opts = {
                        'ohada': t('admin.fw_ohada_opt'),
                        'ifrs': t('admin.fw_ifrs_opt'),
                        'both': t('admin.fw_both_opt'),
                    }
                    fw_sel = ui.select(fw_opts, value=fw_val, label=t('admin.org_framework')) \
                        .props('outlined dense options-dense').classes('w-full')

                    tier_val = str(org.get('reporting_tier') or 'normal').lower()
                    tier_opts = {
                        'normal': t('admin.tier_normal'),
                        'allege': t('admin.tier_allege'),
                        'smt': t('admin.tier_smt'),
                    }
                    tier_sel = ui.select(tier_opts, value=tier_val, label=t('admin.org_tier')) \
                        .props('outlined dense options-dense').classes('w-full')

                    with ui.row().classes('w-full gap-4'):
                        curr_in = ui.input(t('admin.org_currency'), value=org.get('functional_currency', 'XAF')) \
                            .props('outlined dense').classes('w-48')
                        pres_curr_in = ui.input('Presentation Currency', value=org.get('presentation_currency', 'XAF')) \
                            .props('outlined dense').classes('w-48')

                # Save Button
                async def _save_entity():
                    payload = {
                        'name': (name_in.value or '').strip(),
                        'legalName': (legal_name_in.value or '').strip() or None,
                        'code': (code_in.value or '').strip(),
                        'orgType': (org_type_in.value or '').strip() or 'Hospital',
                        'country': (country_in.value or 'CM').strip().upper()[:2],
                        'taxId': (tax_id_in.value or '').strip() or None,
                        'vatNumber': (vat_num_in.value or '').strip() or None,
                        'address': (address_in.value or '').strip() or None,
                        'city': (city_in.value or '').strip() or None,
                        'phone': (phone_in.value or '').strip() or None,
                        'email': (email_in.value or '').strip() or None,
                        'website': (website_in.value or '').strip() or None,
                        'frameworks': fw_sel.value,
                        'reportingTier': tier_sel.value,
                        'currency': (curr_in.value or 'XAF').strip().upper()[:3],
                    }
                    res = await api.safe(api.put('/admin/organization', payload))
                    if res:
                        # Refresh active session so user sees the new framework/org name immediately
                        await api.refresh_session()
                        ui.notify('Organization details and framework updated successfully!', type='positive', position='top')
                        await load_entity()

                with ui.row().classes('w-full justify-end mt-2'):
                    ui.button(f"💾 {t('common.save')}", on_click=_save_entity) \
                        .props('unelevated color=primary icon=save no-caps').classes('rounded-xl px-6 py-2.5 font-bold shadow-md')

    await load_entity()


# ==============================================================================
# TAB 4: VAT, TVA & TAX RULES
# ==============================================================================

async def _render_taxes_tab(acct_options: dict) -> None:
    container = ui.column().classes('w-full gap-4')

    async def load_taxes():
        container.clear()
        res = await api.safe(api.get('/admin/taxes')) or {'rows': []}
        taxes = res.get('rows', [])

        total_t = len(taxes)
        vat_t = sum(1 for t in taxes if t.get('tax_type') == 'vat' and t.get('is_active'))
        rec_t = sum(1 for t in taxes if t.get('is_recoverable') and t.get('is_active'))
        wht_t = sum(1 for t in taxes if t.get('tax_type') in ('air', 'withholding') and t.get('is_active'))

        with container:
            with ui.row().classes('w-full gap-4'):
                _kpi_card(t('admin.taxes_title'), str(total_t), 'receipt_long', 'teal')
                _kpi_card('Active VAT/TVA Rules', str(vat_t), 'percent', 'indigo')
                _kpi_card('Recoverable Taxes', str(rec_t), 'verified', 'emerald')
                _kpi_card('Withholding & AIR Rules', str(wht_t), 'account_balance', 'amber')

            with ui.row().classes('w-full justify-between items-center gap-3 mt-2'):
                ui.label(t('admin.taxes_sub')).classes('text-xs text-slate-500 font-medium')
                ui.button(f"+ {t('admin.new_tax')}", on_click=lambda: _tax_modal(None, acct_options, load_taxes)) \
                    .props('unelevated color=primary icon=add no-caps').classes('rounded-xl px-4 py-2 font-semibold shadow-sm')

            _render_taxes_table(taxes, acct_options, load_taxes)

    await load_taxes()


def _render_taxes_table(taxes: list[dict], acct_options: dict, refresh_callback) -> None:
    columns = [
        {'name': 'code', 'label': t('admin.tax_code'), 'field': 'code', 'align': 'left', 'sortable': True},
        {'name': 'type', 'label': t('admin.tax_type'), 'field': 'tax_type', 'align': 'center'},
        {'name': 'rate', 'label': t('admin.tax_rate'), 'field': 'rate', 'align': 'right', 'sortable': True},
        {'name': 'recoverable', 'label': t('admin.tax_recoverable'), 'field': 'is_recoverable', 'align': 'center'},
        {'name': 'applies', 'label': t('admin.tax_applies'), 'field': 'applies_to', 'align': 'center'},
        {'name': 'accounts', 'label': 'Input / Output Account', 'field': 'input_account_code', 'align': 'left'},
        {'name': 'box', 'label': t('admin.tax_declaration_box'), 'field': 'declaration_box', 'align': 'center'},
        {'name': 'status', 'label': t('common.status'), 'field': 'is_active', 'align': 'center'},
        {'name': 'actions', 'label': t('common.actions'), 'field': 'id', 'align': 'right'},
    ]

    with ui.table(columns=columns, rows=taxes, row_key='id').classes('w-full border border-slate-100 rounded-xl mt-3') as table:
        table.add_slot('body-cell-code', '''
            <q-td :props="props">
                <div class="column">
                    <span class="font-bold text-slate-900 font-mono text-xs">{{ props.row.code }}</span>
                    <span class="text-[11px] text-slate-500">{{ props.row.name }}</span>
                </div>
            </q-td>
        ''')
        table.add_slot('body-cell-type', '''
            <q-td :props="props">
                <q-chip dense :color="props.row.tax_type === 'vat' ? 'teal-1' : 'purple-1'" :text-color="props.row.tax_type === 'vat' ? 'teal-9' : 'purple-9'" class="text-[10.5px] font-bold uppercase">
                    {{ props.row.tax_type }}
                </q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-rate', '''
            <q-td :props="props">
                <span class="font-bold font-mono text-xs text-slate-800">{{ props.row.rate }}%</span>
            </q-td>
        ''')
        table.add_slot('body-cell-recoverable', '''
            <q-td :props="props">
                <q-icon v-if="props.row.is_recoverable" name="check_circle" color="positive" size="18px"/>
                <span v-else class="text-slate-300">—</span>
            </q-td>
        ''')
        table.add_slot('body-cell-applies', '''
            <q-td :props="props">
                <span class="text-[11px] uppercase font-semibold text-slate-600">{{ props.row.applies_to || 'both' }}</span>
            </q-td>
        ''')
        table.add_slot('body-cell-accounts', '''
            <q-td :props="props">
                <div class="column text-[11px] font-mono">
                    <span v-if="props.row.input_account_code" class="text-teal-700">In: {{ props.row.input_account_code }}</span>
                    <span v-if="props.row.output_account_code" class="text-indigo-700">Out: {{ props.row.output_account_code }}</span>
                </div>
            </q-td>
        ''')
        table.add_slot('body-cell-box', '''
            <q-td :props="props">
                <code v-if="props.row.declaration_box" class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10.5px] font-mono">{{ props.row.declaration_box }}</code>
                <span v-else class="text-slate-300">—</span>
            </q-td>
        ''')
        table.add_slot('body-cell-status', '''
            <q-td :props="props">
                <q-chip v-if="props.row.is_active" dense color="positive" text-color="white" icon="check" class="text-[10px] font-semibold">Active</q-chip>
                <q-chip v-else dense color="grey-3" text-color="grey-7" class="text-[10px]">Inactive</q-chip>
            </q-td>
        ''')
        table.add_slot('body-cell-actions', '''
            <q-td :props="props">
                <div class="row items-center justify-end no-wrap gap-1">
                    <q-btn flat round dense size="sm" icon="edit" color="primary" @click="$parent.$emit('edit', props.row.id)">
                        <q-tooltip>Edit Tax Rule</q-tooltip>
                    </q-btn>
                    <q-btn flat round dense size="sm" :icon="props.row.is_active ? 'toggle_on' : 'toggle_off'" :color="props.row.is_active ? 'positive' : 'grey'" @click="$parent.$emit('toggle', props.row.id)">
                        <q-tooltip>{{ props.row.is_active ? 'Disable' : 'Enable' }}</q-tooltip>
                    </q-btn>
                </div>
            </q-td>
        ''')

        def _get_tax_from_arg(arg):
            if isinstance(arg, dict):
                return arg
            tid = None
            if isinstance(arg, (int, str)):
                try:
                    tid = int(arg)
                except (ValueError, TypeError):
                    pass
            elif hasattr(arg, 'args'):
                if isinstance(arg.args, dict):
                    return arg.args
                try:
                    tid = int(arg.args)
                except (ValueError, TypeError):
                    pass
            if tid is not None:
                return next((t for t in taxes if t['id'] == tid), None)
            return None

        def _handle_edit_tax(msg):
            t = _get_tax_from_arg(msg)
            if t:
                _tax_modal(t, acct_options, refresh_callback)

        def _handle_toggle_tax(msg):
            t = _get_tax_from_arg(msg)
            if t:
                ui.timer(0.01, lambda: _toggle_tax(t, refresh_callback), once=True)

        table.on('edit', _handle_edit_tax)
        table.on('toggle', _handle_toggle_tax)


async def _toggle_tax(tax: dict, refresh_callback) -> None:
    res = await api.safe(api.post(f"/admin/taxes/{tax['id']}/toggle"))
    if res:
        ui.notify(f"Tax code {tax['code']} status updated.", type='positive', position='top')
        await refresh_callback()


def _tax_modal(tax: dict | None, acct_options: dict, refresh_callback) -> None:
    is_edit = tax is not None
    title = t('admin.edit_tax') if is_edit else t('admin.new_tax')

    with ui.dialog() as dialog, ui.card().classes('p-6 w-[560px] max-w-full rounded-2xl shadow-xl'):
        with ui.row().classes('w-full justify-between items-center mb-2'):
            ui.label(f"🧾 {title}").classes('text-lg font-bold text-slate-900')
            ui.button(icon='close', on_click=dialog.close).props('flat round dense size=sm')

        with ui.column().classes('w-full gap-3 mt-1'):
            with ui.row().classes('w-full gap-3'):
                code_in = ui.input(t('admin.tax_code'), value=tax.get('code', '') if is_edit else '', placeholder='e.g., TVA_STD') \
                    .props(f"outlined dense {'disable' if is_edit else ''}").classes('w-44')
                name_in = ui.input(t('admin.tax_name'), value=tax.get('name', '') if is_edit else '', placeholder='e.g., TVA Standard 19.25%') \
                    .props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3'):
                type_opts = {'vat': 'VAT / TVA', 'air': 'AIR / Acompte IS', 'withholding': 'Withholding Tax / TSR', 'customs': 'Customs Duty', 'other': 'Other'}
                type_sel = ui.select(type_opts, value=tax.get('tax_type', 'vat') if is_edit else 'vat', label=t('admin.tax_type')) \
                    .props('outlined dense options-dense').classes('flex-1')

                rate_in = ui.number(t('admin.tax_rate'), value=float(tax.get('rate', 19.25) if is_edit else 19.25), min=0, max=100, step=0.25) \
                    .props('outlined dense').classes('w-36')

            with ui.row().classes('w-full gap-3 items-center'):
                applies_opts = {'purchase': 'Purchase', 'sale': 'Sale', 'both': 'Both (Purchase & Sale)'}
                applies_sel = ui.select(applies_opts, value=tax.get('applies_to', 'both') if is_edit else 'both', label=t('admin.tax_applies')) \
                    .props('outlined dense options-dense').classes('flex-1')

                rec_chk = ui.checkbox(t('admin.tax_recoverable'), value=bool(tax.get('is_recoverable', True)) if is_edit else True) \
                    .classes('text-xs text-slate-700 font-semibold')

            with ui.row().classes('w-full gap-3'):
                box_in = ui.input(t('admin.tax_declaration_box'), value=tax.get('declaration_box', '') if is_edit else '', placeholder='e.g., L01') \
                    .props('outlined dense').classes('w-36')

            acct_choices = {None: '— None —', **acct_options}
            in_acct_sel = ui.select(acct_choices, value=tax.get('input_account_id') if is_edit else None, label=t('admin.tax_input_acct')) \
                .props('outlined dense options-dense').classes('w-full')
            out_acct_sel = ui.select(acct_choices, value=tax.get('output_account_id') if is_edit else None, label=t('admin.tax_output_acct')) \
                .props('outlined dense options-dense').classes('w-full')

        async def _save():
            name = (name_in.value or '').strip()
            if not name:
                ui.notify('Tax name is required.', type='warning')
                return

            payload = {
                'name': name,
                'taxType': type_sel.value,
                'rate': float(rate_in.value or 0),
                'isRecoverable': bool(rec_chk.value),
                'appliesTo': applies_sel.value,
                'declarationBox': (box_in.value or '').strip() or None,
                'inputAccountId': in_acct_sel.value if in_acct_sel.value else None,
                'outputAccountId': out_acct_sel.value if out_acct_sel.value else None,
            }

            if not is_edit:
                code = (code_in.value or '').strip()
                if not code:
                    ui.notify('Tax code is required.', type='warning')
                    return
                payload['code'] = code
                res = await api.safe(api.post('/admin/taxes', payload))
            else:
                res = await api.safe(api.put(f"/admin/taxes/{tax['id']}", payload))

            if res:
                ui.notify(f"Tax rule saved successfully.", type='positive', position='top')
                dialog.close()
                await refresh_callback()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_save).props('unelevated color=primary no-caps')

        dialog.open()


# ==============================================================================
# TAB 5: EXTERNAL SYSTEMS & APIS GATEWAY (BILLING, ERP, POS, BANKING)
# ==============================================================================

async def _render_integrations_tab(acct_options: dict, cc_options: dict, jnl_options: dict) -> None:
    container = ui.column().classes('w-full gap-5')

    async def reload_all():
        container.clear()
        with container:
            spinner = ui.spinner(size='lg').classes('self-center my-8')

        clients_res = await api.safe(api.get('/admin/integrations/clients')) or {'rows': [], 'total': 0}
        mappings_res = await api.safe(api.get('/admin/integrations/mappings')) or {'rows': [], 'total': 0}
        logs_res = await api.safe(api.get('/admin/integrations/logs', limit=50)) or {'rows': [], 'total': 0}

        clients = clients_res.get('rows', [])
        mappings = mappings_res.get('rows', [])
        logs = logs_res.get('rows', [])

        active_clients = sum(1 for c in clients if c.get('is_active'))
        active_mappings = sum(1 for m in mappings if m.get('is_active'))
        pending_drafts = sum(1 for l in logs if l.get('status') == 'draft_created' and l.get('journal_entry_status') == 'draft')

        client_options = {c['id']: f"{c['name']} ({c['client_code']})" for c in clients}

        container.clear()
        with container:
            # Executive Banner
            with ui.card().classes('w-full p-5 rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white shadow-md'):
                with ui.row().classes('w-full items-center justify-between no-wrap'):
                    with ui.column().classes('gap-1 max-w-2xl'):
                        with ui.row().classes('items-center gap-2'):
                            ui.icon('hub', size='24px').classes('text-teal-400')
                            ui.label(t('admin.integ_title')).classes('text-lg font-bold tracking-tight text-white')
                            ui.badge('API v1 Active', color='teal').props('dense')
                        ui.label(t('admin.integ_sub')).classes('text-xs text-slate-300 leading-relaxed')
                    with ui.row().classes('gap-2 items-center'):
                        ui.button(t('admin.integ_btn_simulator'), icon='play_arrow',
                                  on_click=lambda: _simulator_dialog(reload_all, client_options, cc_options)
                                  ).props('unelevated color=teal-6 text-color=white no-caps').classes('font-bold shadow-sm')

            # Quick KPIs
            with ui.row().classes('w-full gap-4'):
                _kpi_card(t('admin.integ_kpi_clients'), str(active_clients), 'devices', 'sky')
                _kpi_card(t('admin.integ_kpi_mappings'), str(active_mappings), 'alt_route', 'indigo')
                _kpi_card(t('admin.integ_kpi_ingested'), str(len(logs)), 'receipt_long', 'violet')
                _kpi_card(t('admin.integ_kpi_pending'), str(pending_drafts), 'hourglass_top', 'amber')

            # Sub-tab Navigation
            with ui.card().classes('w-full p-0 rounded-2xl border border-slate-200 shadow-sm overflow-hidden'):
                with ui.tabs().classes('w-full bg-slate-50 border-b border-slate-200 text-slate-700 px-4') as sub_tabs:
                    sub_tab_clients = ui.tab('clients', label='API Clients & Keys', icon='key')
                    sub_tab_mappings = ui.tab('mappings', label='Event Mapping Rules', icon='sync_alt')
                    sub_tab_logs = ui.tab('logs', label='Ingestion Ledger & Logs', icon='history')
                    sub_tab_docs = ui.tab('docs', label='Developer API Spec', icon='code')

                with ui.tab_panels(sub_tabs, value='clients').classes('w-full p-5 bg-white'):
                    # SUB-TAB 1: API CLIENTS
                    with ui.tab_panel('clients').classes('p-0 gap-4'):
                        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
                            with ui.column().classes('gap-0'):
                                ui.label('Registered External Systems (Billing, ERP, POS, Banking)').classes('text-base font-bold text-slate-800')
                                ui.label('Manage API credentials and default journal rules for each external application').classes('text-xs text-slate-500')
                            ui.button(t('admin.integ_btn_new_client'), icon='add',
                                      on_click=lambda: _client_dialog(reload_all, jnl_options)
                                      ).props('unelevated color=primary no-caps')

                        if not clients:
                            w.empty_state('No external systems registered yet.', icon='hub', hint='Click the button above to register an external system.')
                        else:
                            for c in clients:
                                with ui.card().classes('w-full p-4 rounded-xl border border-slate-200/90 bg-white hover:border-teal-400 transition-all shadow-none'):
                                    with ui.row().classes('w-full items-center justify-between no-wrap'):
                                        with ui.column().classes('gap-1 flex-1'):
                                            with ui.row().classes('items-center gap-2'):
                                                ui.label(c['name']).classes('text-base font-bold text-slate-900')
                                                ui.badge(c['client_code'], color='slate-7').props('dense outline')
                                                status_color = 'positive' if c['is_active'] else 'grey'
                                                status_txt = 'Active' if c['is_active'] else 'Inactive'
                                                ui.badge(status_txt, color=status_color).props('dense')
                                                mode_txt = t('admin.integ_mode_draft') if c['default_status'] == 'draft' else t('admin.integ_mode_posted')
                                                ui.badge(mode_txt, color='teal' if c['default_status'] == 'draft' else 'purple').props('dense')

                                            if c.get('description'):
                                                ui.label(c['description']).classes('text-xs text-slate-500')

                                            with ui.row().classes('items-center gap-4 mt-2 text-xs text-slate-600'):
                                                with ui.row().classes('items-center gap-1'):
                                                    ui.icon('book', size='14px').classes('text-slate-400')
                                                    ui.label(f"Target Journal: {c.get('journal_code', 'VTE')} ({c.get('journal_name', 'Ventes')})")
                                                with ui.row().classes('items-center gap-1'):
                                                    ui.icon('alt_route', size='14px').classes('text-slate-400')
                                                    ui.label(f"Mappings: {c.get('mapping_count', 0)} active")
                                                with ui.row().classes('items-center gap-1'):
                                                    ui.icon('receipt_long', size='14px').classes('text-slate-400')
                                                    ui.label(f"Ingested entries: {c.get('log_count', 0)}")

                                            # API Key display with copy
                                            api_key = c.get('api_key', '')
                                            with ui.row().classes('items-center gap-2 mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 w-full max-w-xl'):
                                                ui.icon('key', size='16px').classes('text-amber-600')
                                                key_lbl = ui.label(f"{api_key[:12]}••••••••••••••••{api_key[-6:]}").classes('font-mono text-xs text-slate-700 flex-1')
                                                show_key = {'shown': False}

                                                def _toggle_key(lbl=key_lbl, k=api_key, state=show_key):
                                                    state['shown'] = not state['shown']
                                                    lbl.text = k if state['shown'] else f"{k[:12]}••••••••••••••••{k[-6:]}"

                                                ui.button(icon='visibility', on_click=_toggle_key).props('flat dense round size=xs text-color=slate-600')
                                                ui.button(icon='content_copy', on_click=lambda k=api_key: (
                                                    ui.run_javascript(f'navigator.clipboard.writeText("{k}")'),
                                                    ui.notify('API key copied to clipboard!', type='positive', position='top')
                                                )).props('flat dense round size=xs color=primary')

                                        with ui.row().classes('items-center gap-1 shrink-0'):
                                            async def _regen(cid=c['id']):
                                                res = await api.safe(api.post(f'/admin/integrations/clients/{cid}/regenerate-key'))
                                                if res:
                                                    ui.notify('New API key generated successfully.', type='positive')
                                                    await reload_all()

                                            ui.button(icon='refresh', on_click=_regen).props('flat dense round text-color=amber-8').tooltip(t('admin.integ_btn_regen_key'))
                                            ui.button(icon='edit', on_click=lambda cl=c: _client_dialog(reload_all, jnl_options, client=cl)).props('flat dense round text-color=primary')
                                            async def _toggle_active(cid=c['id'], cur=c['is_active']):
                                                await api.safe(api.put(f'/admin/integrations/clients/{cid}', {'isActive': not cur}))
                                                await reload_all()
                                            ui.button(icon='power_settings_new', on_click=_toggle_active).props('flat dense round ' + ('text-color=positive' if c['is_active'] else 'text-color=grey-5')).tooltip('Enable / Disable')

                    # SUB-TAB 2: EVENT MAPPINGS
                    with ui.tab_panel('mappings').classes('p-0 gap-4'):
                        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
                            with ui.column().classes('gap-0'):
                                ui.label('Accounting & Cost Center Mapping Rules').classes('text-base font-bold text-slate-800')
                                ui.label('Map incoming event types (e.g. SALES_INVOICE, SERVICE_BILLING, PAYMENT_COLLECTION, VENDOR_EXPENSE) to specific debit/credit accounts and cost centers').classes('text-xs text-slate-500')
                            ui.button(t('admin.integ_btn_new_mapping'), icon='add',
                                      on_click=lambda: _mapping_dialog(reload_all, client_options, acct_options, cc_options, jnl_options)
                                      ).props('unelevated color=primary no-caps')

                        if not mappings:
                            w.empty_state('No event mappings configured yet.', icon='sync_alt', hint='Add mapping rules so incoming transactions map to the right accounts.')
                        else:
                            columns = [
                                w.column('event_code', t('admin.integ_event_code'), classes='font-mono font-bold text-teal-900'),
                                w.column('name', t('admin.integ_event_name')),
                                w.column('client_name', 'Applied Client'),
                                w.column('debit_display', t('admin.integ_debit_acct'), classes='font-mono text-xs'),
                                w.column('credit_display', t('admin.integ_credit_acct'), classes='font-mono text-xs'),
                                w.column('cost_center_name', t('admin.integ_cost_center'), classes='text-xs'),
                                w.column('journal_code', 'Journal', classes='font-bold'),
                                w.column('actions', '', classes='w-20 text-right'),
                            ]

                            map_rows = []
                            for m in mappings:
                                map_rows.append({
                                    **m,
                                    'client_name': m.get('client_name') or 'All Systems (Global)',
                                    'debit_display': f"{m.get('debit_account_code', '')} — {m.get('debit_account_name', '')[:20]}",
                                    'credit_display': f"{m.get('credit_account_code', '')} — {m.get('credit_account_name', '')[:20]}",
                                    'cost_center_name': f"{m.get('cost_center_code', '')} — {m.get('cost_center_name', '')}" if m.get('cost_center_code') else '—',
                                    'journal_code': m.get('journal_code', 'VTE'),
                                })

                            table = w.table(columns, map_rows, pagination=15)
                            table.add_slot('body-cell-actions', '''
                                <q-td :props="props">
                                    <q-btn flat round dense size="sm" icon="edit" color="primary" @click="$parent.$emit('edit_map', props.row)" />
                                    <q-btn flat round dense size="sm" icon="delete" color="negative" @click="$parent.$emit('del_map', props.row)" />
                                </q-td>
                            ''')

                            table.on('edit_map', lambda e: _mapping_dialog(reload_all, client_options, acct_options, cc_options, jnl_options, mapping=e.args))
                            async def _del_map(e):
                                mid = e.args.get('id')
                                if mid:
                                    res = await api.safe(api.delete(f'/admin/integrations/mappings/{mid}'))
                                    if res:
                                        ui.notify('Mapping deleted successfully.', type='positive')
                                        await reload_all()
                            table.on('del_map', _del_map)

                    # SUB-TAB 3: INGESTION LOGS & AUDIT LEDGER
                    with ui.tab_panel('logs').classes('p-0 gap-4'):
                        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
                            with ui.column().classes('gap-0'):
                                ui.label(t('admin.integ_logs_title')).classes('text-base font-bold text-slate-800')
                                ui.label(t('admin.integ_logs_sub')).classes('text-xs text-slate-500')
                            ui.button('Refresh Logs', icon='refresh', on_click=reload_all).props('flat dense no-caps text-color=slate-700')

                        if not logs:
                            w.empty_state('No API ingestion logs recorded yet.', icon='history', hint='Incoming transactions from connected external systems will appear here in real-time.')
                        else:
                            log_columns = [
                                w.column('created_at', 'Timestamp', classes='text-xs text-slate-500 font-mono'),
                                w.column('client_name', 'Source System', classes='font-medium'),
                                w.column('event_code', 'Event Type', classes='font-mono text-xs font-bold'),
                                w.column('external_reference', 'Transaction Ref', classes='font-mono font-semibold text-slate-800'),
                                w.column('amount_display', 'Amount', classes='font-mono font-bold text-slate-900'),
                                w.column('entry_no', 'Journal Entry #', classes='font-mono font-bold text-teal-800'),
                                w.column('status_badge', 'Ingestion Status'),
                                w.column('actions', '', classes='w-24 text-right'),
                            ]

                            log_rows = []
                            for l in logs:
                                status = l.get('status', '')
                                log_rows.append({
                                    **l,
                                    'created_at': str(l.get('created_at', ''))[:19].replace('T', ' '),
                                    'client_name': l.get('client_name') or 'External API',
                                    'event_code': l.get('event_code') or 'Direct Lines',
                                    'amount_display': w.money(l.get('total_amount', 0), l.get('currency', 'XAF')),
                                    'entry_no': l.get('entry_no') or '—',
                                    'status_badge': status,
                                })

                            log_table = w.table(log_columns, log_rows, pagination=20)
                            log_table.add_slot('body-cell-status_badge', '''
                                <q-td :props="props">
                                    <q-badge v-if="props.value === 'draft_created'" color="teal" text-color="white" label="Draft Created (Pending Review)" />
                                    <q-badge v-else-if="props.value === 'auto_posted'" color="positive" text-color="white" label="Auto-Posted" />
                                    <q-badge v-else-if="props.value === 'duplicate'" color="amber-8" text-color="white" label="Duplicate Ignored" />
                                    <q-badge v-else color="negative" text-color="white" :label="'Rejected: ' + (props.row.error_message || 'Error')" />
                                </q-td>
                            ''')
                            log_table.add_slot('body-cell-entry_no', '''
                                <q-td :props="props">
                                    <span v-if="props.value !== '—'" class="px-2 py-0.5 rounded font-mono font-bold text-xs bg-teal-50 text-teal-900 border border-teal-200">
                                        {{ props.value }}
                                    </span>
                                    <span v-else class="text-slate-400">—</span>
                                </q-td>
                            ''')
                            log_table.add_slot('body-cell-actions', '''
                                <q-td :props="props">
                                    <q-btn flat round dense size="sm" icon="data_object" color="slate-7" @click="$parent.$emit('view_payload', props.row)" title="View JSON Payload" />
                                </q-td>
                            ''')
                            log_table.on('view_payload', lambda e: _payload_dialog(e.args.get('payload')))

                    # SUB-TAB 4: DEVELOPER API SPECIFICATION & INTEGRATION GUIDE
                    with ui.tab_panel('docs').classes('p-0 gap-4'):
                        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
                            with ui.column().classes('gap-0'):
                                ui.label('External Financial Systems API Specification & Integration Guide').classes('text-base font-bold text-slate-800')
                                ui.label('Technical reference for connecting Invoicing, Billing, POS, ERP, Banking, and commercial systems to ingest financial transactions').classes('text-xs text-slate-500')
                            ui.button('Test Ingestion Simulator', icon='play_arrow',
                                      on_click=lambda: _simulator_dialog(reload_all, client_options, cc_options)
                                      ).props('unelevated color=teal no-caps')

                        with ui.column().classes('w-full gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200'):
                            ui.label('Endpoint URL & Authentication').classes('font-bold text-sm text-slate-800')
                            with ui.row().classes('items-center gap-2 font-mono text-xs bg-slate-900 text-teal-300 p-3 rounded-lg w-full'):
                                ui.label('POST').classes('text-amber-400 font-bold')
                                ui.label('https://<your-domain>/api/integrations/entries')
                            with ui.row().classes('items-center gap-2 font-mono text-xs bg-slate-900 text-slate-200 p-3 rounded-lg w-full'):
                                ui.label('Headers:').classes('text-slate-400')
                                ui.label('X-API-Key: lch_live_ext_finance_•••••••••••••••••••••')
                                ui.label('| Content-Type: application/json')

                            ui.label('Format 1: Universal Financial Business Event (Sales Invoicing, Services, Collections)').classes('font-bold text-sm text-slate-800 mt-2')
                            ui.markdown('''```json
{
  "event_type": "SALES_INVOICE",
  "reference": "INV-2026-00441",
  "date": "2026-10-23",
  "amount": 250000,
  "currency": "XAF",
  "payment_method": "BANK",
  "department_code": "ADM",
  "customer_name": "AfricTech Solutions SARL",
  "customer_id": "CLI-8821",
  "notes": "Commercial invoice for annual software & service delivery"
}
```''').classes('w-full text-xs')

                            ui.label('Format 2: Customer Payment & Receipt Collection Event').classes('font-bold text-sm text-slate-800 mt-2')
                            ui.markdown('''```json
{
  "event_type": "PAYMENT_COLLECTION",
  "reference": "REC-2026-00812",
  "date": "2026-10-23",
  "amount": 75000,
  "currency": "XAF",
  "payment_method": "CASH",
  "department_code": "ADM",
  "customer_name": "Société Générale de Distribution",
  "notes": "Cash settlement on commercial trade balance"
}
```''').classes('w-full text-xs')

                            ui.label('Format 3: Pre-Balanced Multi-Line Direct Journal Entry').classes('font-bold text-sm text-slate-800 mt-2')
                            ui.markdown('''```json
{
  "journal_code": "VTE",
  "reference": "POS-COMM-2026-0812",
  "date": "2026-10-23",
  "description": "Daily Commercial POS Counter Sales & Operations",
  "currency": "XAF",
  "lines": [
    { "account_code": "5711", "debit": 150000, "credit": 0, "cost_center_code": "ADM", "description": "Cash collected" },
    { "account_code": "7011", "debit": 0, "credit": 150000, "cost_center_code": "ADM", "description": "Merchandise sales revenue" }
  ]
}
```''').classes('w-full text-xs')

    await reload_all()


# ==============================================================================
# INTEGRATION DIALOGS & SIMULATOR
# ==============================================================================

def _client_dialog(refresh_fn, jnl_options: dict, client: dict | None = None) -> None:
    is_edit = client is not None
    title = 'Edit External System Client' if is_edit else t('admin.integ_btn_new_client')

    with ui.dialog() as dialog, ui.card().classes('w-[560px] max-w-full p-6 rounded-2xl'):
        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('hub', size='22px').classes('text-teal-600')
                ui.label(title).classes('text-base font-bold text-slate-800')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('w-full gap-3 mt-2'):
            name_in = ui.input(t('admin.integ_client_name'), value=client.get('name', '') if is_edit else '').props('outlined dense').classes('w-full')
            code_in = ui.input(t('admin.integ_client_code'), value=client.get('client_code', '') if is_edit else '').props('outlined dense').classes('w-full')
            if is_edit:
                code_in.disable()

            jnl_in = ui.select(jnl_options, value=client.get('default_journal_id') if is_edit else list(jnl_options.keys())[0] if jnl_options else None,
                               label=t('admin.integ_default_journal')).props('outlined dense options-dense').classes('w-full')

            status_options = {'draft': t('admin.integ_mode_draft'), 'posted': t('admin.integ_mode_posted')}
            status_in = ui.select(status_options, value=client.get('default_status', 'draft') if is_edit else 'draft',
                                  label=t('admin.integ_default_status')).props('outlined dense options-dense').classes('w-full')

            ip_in = ui.input('IP Whitelist (Optional, comma-separated e.g. 192.168.1.50)', value=client.get('ip_whitelist', '') if is_edit else '').props('outlined dense').classes('w-full')
            desc_in = ui.input('Description / Notes', value=client.get('description', '') if is_edit else '').props('outlined dense').classes('w-full')

        async def _save():
            if not name_in.value or not name_in.value.strip():
                ui.notify('System name is required.', type='warning')
                return
            if not is_edit and (not code_in.value or not code_in.value.strip()):
                ui.notify('System code is required.', type='warning')
                return

            payload = {
                'name': name_in.value.strip(),
                'defaultJournalId': jnl_in.value,
                'defaultStatus': status_in.value,
                'ipWhitelist': (ip_in.value or '').strip() or None,
                'description': (desc_in.value or '').strip() or None,
            }

            if not is_edit:
                payload['clientCode'] = code_in.value.strip()
                res = await api.safe(api.post('/admin/integrations/clients', payload))
            else:
                res = await api.safe(api.put(f"/admin/integrations/clients/{client['id']}", payload))

            if res:
                ui.notify('Integration client saved successfully.', type='positive')
                dialog.close()
                await refresh_fn()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_save).props('unelevated color=primary no-caps')

    dialog.open()


def _mapping_dialog(refresh_fn, client_options: dict, acct_options: dict, cc_options: dict, jnl_options: dict, mapping: dict | None = None) -> None:
    is_edit = mapping is not None
    title = 'Edit Event Mapping Rule' if is_edit else t('admin.integ_btn_new_mapping')

    with ui.dialog() as dialog, ui.card().classes('w-[620px] max-w-full p-6 rounded-2xl'):
        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('sync_alt', size='22px').classes('text-teal-600')
                ui.label(title).classes('text-base font-bold text-slate-800')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        with ui.column().classes('w-full gap-3 mt-2'):
            c_opts = {None: 'All Connected Systems (Global)', **client_options}
            client_in = ui.select(c_opts, value=mapping.get('client_id') if is_edit else None,
                                  label='Apply to External System').props('outlined dense options-dense').classes('w-full')

            event_code_in = ui.input(t('admin.integ_event_code'), value=mapping.get('event_code', '') if is_edit else '',
                                     placeholder='e.g. SALES_INVOICE, SERVICE_BILLING, PAYMENT_COLLECTION, VENDOR_EXPENSE').props('outlined dense').classes('w-full')
            if is_edit:
                event_code_in.disable()

            name_in = ui.input(t('admin.integ_event_name'), value=mapping.get('name', '') if is_edit else '',
                               placeholder='e.g. Customer Sales Invoicing & Commercial Products').props('outlined dense').classes('w-full')

            jnl_in = ui.select(jnl_options, value=mapping.get('default_journal_id') if is_edit else list(jnl_options.keys())[0] if jnl_options else None,
                               label=t('admin.integ_default_journal')).props('outlined dense options-dense').classes('w-full')

            debit_in = ui.select(acct_options, value=mapping.get('debit_account_id') if is_edit else None,
                                 label=t('admin.integ_debit_acct'), with_input=True).props('outlined dense options-dense use-input').classes('w-full')

            credit_in = ui.select(acct_options, value=mapping.get('credit_account_id') if is_edit else None,
                                  label=t('admin.integ_credit_acct'), with_input=True).props('outlined dense options-dense use-input').classes('w-full')

            cc_opts = {None: 'No Default Cost Center (Resolve from Department Code)', **cc_options}
            cc_in = ui.select(cc_opts, value=mapping.get('default_cost_center_id') if is_edit else None,
                              label=t('admin.integ_cost_center'), with_input=True).props('outlined dense options-dense use-input').classes('w-full')

            tmpl_in = ui.input(t('admin.integ_tmpl'), value=mapping.get('description_template', '') if is_edit else '',
                               placeholder='e.g. Sales invoice — {customer_name} ({reference})').props('outlined dense').classes('w-full')

        async def _save():
            if not is_edit and (not event_code_in.value or not event_code_in.value.strip()):
                ui.notify('Event code is required.', type='warning')
                return
            if not name_in.value or not name_in.value.strip():
                ui.notify('Event name is required.', type='warning')
                return
            if not debit_in.value:
                ui.notify('Debit account is required.', type='warning')
                return
            if not credit_in.value:
                ui.notify('Credit account is required.', type='warning')
                return

            payload = {
                'clientId': client_in.value,
                'name': name_in.value.strip(),
                'defaultJournalId': jnl_in.value,
                'debitAccountId': debit_in.value,
                'creditAccountId': credit_in.value,
                'defaultCostCenterId': cc_in.value,
                'descriptionTemplate': (tmpl_in.value or '').strip() or None,
            }

            if not is_edit:
                payload['eventCode'] = event_code_in.value.strip().upper()
                res = await api.safe(api.post('/admin/integrations/mappings', payload))
            else:
                res = await api.safe(api.put(f"/admin/integrations/mappings/{mapping['id']}", payload))

            if res:
                ui.notify('Event mapping saved successfully.', type='positive')
                dialog.close()
                await refresh_fn()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('common.save'), on_click=_save).props('unelevated color=primary no-caps')

    dialog.open()


def _simulator_dialog(refresh_fn, client_options: dict, cc_options: dict) -> None:
    import time
    with ui.dialog() as dialog, ui.card().classes('w-[680px] max-w-full p-6 rounded-2xl'):
        with ui.row().classes('w-full items-center justify-between pb-3 border-b border-slate-100'):
            with ui.row().classes('items-center gap-2'):
                ui.icon('science', size='22px').classes('text-teal-600')
                ui.label(t('admin.integ_sim_title')).classes('text-base font-bold text-slate-800')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        ui.label(t('admin.integ_sim_desc')).classes('text-xs text-slate-500 mb-2')

        with ui.row().classes('w-full items-center gap-2 mb-3'):
            ui.label('Financial Transaction Presets:').classes('text-xs font-bold text-slate-600')

        with ui.column().classes('w-full gap-3'):
            c_val = list(client_options.keys())[0] if client_options else None
            client_sel = ui.select(client_options, value=c_val, label='External System Client').props('outlined dense options-dense').classes('w-full')

            with ui.row().classes('w-full gap-3'):
                event_sel = ui.select({
                    'SALES_INVOICE': 'Customer Sales Invoicing (SALES_INVOICE)',
                    'SERVICE_BILLING': 'Professional Services & Fees (SERVICE_BILLING)',
                    'PAYMENT_COLLECTION': 'Customer Payment & Cash/Bank Receipt (PAYMENT_COLLECTION)',
                    'VENDOR_EXPENSE': 'Supplier Bill & Operating Expense (VENDOR_EXPENSE)',
                    'CUSTOMER_DEPOSIT': 'Customer Advance & Caution Deposit (CUSTOMER_DEPOSIT)',
                }, value='SALES_INVOICE', label='Financial Event Type').props('outlined dense options-dense').classes('flex-1')

                ref_in = ui.input('External Reference #', value=f"EXT-TRX-{int(time.time())}").props('outlined dense').classes('flex-1')

            with ui.row().classes('w-full gap-3'):
                amount_in = ui.number('Amount (XAF)', value=250000, min=100).props('outlined dense').classes('w-44')
                payment_sel = ui.select({'BANK': 'BANK (Virement/Banque)', 'CASH': 'CASH (Caisse)', 'MOMO': 'Mobile Money'}, value='BANK', label='Payment Method').props('outlined dense options-dense').classes('flex-1')

            with ui.row().classes('w-full gap-3'):
                party_in = ui.input('Customer / Vendor / Beneficiary Name', value='AfricTech Solutions SARL').props('outlined dense').classes('flex-1')
                party_id_in = ui.input('Third-Party Code / ID', value='CLI-8821').props('outlined dense').classes('w-40')

            with ui.row().classes('w-full gap-3'):
                dept_sel = ui.select({
                    'ADM': 'General Administration (ADM)',
                    'FIN': 'Finance & Accounting (FIN)',
                    'COM': 'Commercial & Sales (COM)',
                    'OPS': 'Operations & Production (OPS)',
                }, value='ADM', label='Cost Center / Department').props('outlined dense options-dense').classes('flex-1')

            notes_in = ui.input('Transaction Description / Notes', value='Simulated external financial transaction for automated draft ingestion').props('outlined dense').classes('w-full')

        result_box = ui.column().classes('w-full mt-3')

        async def _execute_simulation():
            result_box.clear()
            payload = {
                'event_type': event_sel.value,
                'reference': ref_in.value.strip(),
                'date': datetime.date.today().isoformat(),
                'amount': amount_in.value,
                'currency': 'XAF',
                'payment_method': payment_sel.value,
                'department_code': dept_sel.value,
                'customer_name': party_in.value.strip(),
                'customer_id': party_id_in.value.strip(),
                'vendor_name': party_in.value.strip(),
                'notes': notes_in.value.strip(),
            }

            res = await api.safe(api.post('/admin/integrations/test-ingest', {
                'clientId': client_sel.value,
                'payload': payload,
            }))

            if res:
                entry_no = res.get('entry_no')
                entry_status = res.get('entry_status')
                with result_box:
                    with ui.card().classes('w-full p-4 rounded-xl bg-teal-50 border border-teal-300 gap-2'):
                        with ui.row().classes('items-center gap-2'):
                            ui.icon('verified', size='22px').classes('text-teal-700')
                            ui.label(t('admin.integ_sim_success', entry=entry_no)).classes('text-sm font-bold text-teal-950')
                        ui.label(res.get('message', '')).classes('text-xs text-teal-800')

                        with ui.row().classes('items-center gap-3 mt-1'):
                            ui.badge(f"Status: {entry_status.upper()}", color='teal').props('dense font-bold')
                            ui.badge(f"Ref: {ref_in.value}", color='slate-7').props('dense outline')
                            ui.button(t('admin.integ_view_entry'), icon='launch',
                                      on_click=lambda: ui.navigate.to('/journal')
                                      ).props('unelevated size=sm color=teal-8 no-caps').classes('font-bold')

                ui.notify(f"Draft {entry_no} created successfully in Journal!", type='positive', position='top')
                await refresh_fn()

        with ui.row().classes('w-full justify-end gap-2 mt-4'):
            ui.button(t('common.cancel'), on_click=dialog.close).props('flat no-caps')
            ui.button(t('admin.integ_sim_send'), icon='bolt', on_click=_execute_simulation).props('unelevated color=teal-8 no-caps').classes('font-bold')

    dialog.open()


def _payload_dialog(payload) -> None:
    import json
    with ui.dialog() as dialog, ui.card().classes('w-[580px] max-w-full p-5 rounded-2xl'):
        with ui.row().classes('w-full items-center justify-between pb-2 border-b border-slate-100'):
            ui.label('Raw JSON Payload from External System').classes('text-sm font-bold text-slate-800')
            ui.button(icon='close', on_click=dialog.close).props('flat dense round')

        formatted = json.dumps(payload, indent=2) if isinstance(payload, (dict, list)) else str(payload)
        with ui.column().classes('w-full p-3 bg-slate-900 rounded-xl text-teal-300 font-mono text-xs overflow-x-auto max-h-96'):
            ui.label(formatted).classes('whitespace-pre')

    dialog.open()


# ==============================================================================
# UI HELPERS
# ==============================================================================

def _kpi_card(title: str, value: str, icon: str, color: str) -> None:
    with ui.card().classes('flex-1 min-w-[200px] p-4 rounded-2xl border border-slate-200/80 bg-white shadow-none items-center'):
        with ui.row().classes('w-full items-center justify-between no-wrap'):
            with ui.column().classes('gap-0.5'):
                ui.label(title).classes('text-[11px] uppercase font-bold text-slate-400 tracking-wider')
                ui.label(value).classes('text-2xl font-black text-slate-800 leading-tight')
            with ui.element('div').classes(f'w-10 h-10 rounded-xl bg-{color}-50 text-{color}-700 flex items-center justify-center shrink-0'):
                ui.icon(icon, size='22px')
