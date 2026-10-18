"""Sign-in. The only page outside the application shell."""

from __future__ import annotations

from nicegui import app, ui

from .. import api
from ..i18n import lang, set_lang, t
from ..theme import ACCENT, NAVY, apply as apply_theme
from ..ui import chrome
from ..ui.shell import first_allowed_route

#: The seeded roles, so an evaluator can see the permission model at work
#: without being handed a list of credentials separately.
DEMO_ACCOUNTS = [
    ('admin@ledgercore.health', 'role.admin'),
    ('grace.ntamack@hgy.cm', 'role.cfo'),
    ('amina.bakari@hgy.cm', 'role.clerk'),
    ('fatou.diallo@hgy.cm', 'role.asset_mgr'),
    ('samuel.eyenga@hgy.cm', 'role.tech'),
    ('derick.nji@hgy.cm', 'role.gst'),
    ('mensah.kouassi@hgy.cm', 'role.ward'),
]


@ui.page('/login')
async def login_page(next: str = '/') -> None:  # noqa: A002 - query parameter name
    apply_theme()
    if api.token() and app.storage.user.get('user'):
        ui.navigate.to(next or '/')
        return

    ui.query('body').style(f'background: {NAVY}')
    ui.add_css("""
      .lc-login-art::before {
        content: ''; position: absolute; inset: 0;
        background:
          radial-gradient(900px 500px at 12% 12%, rgba(13,148,136,.28), transparent 60%),
          radial-gradient(700px 420px at 88% 88%, rgba(2,132,199,.22), transparent 60%);
      }
    """)

    with ui.row().classes('w-screen h-screen no-wrap items-stretch gap-0'):
        # Left: the pitch, so the product explains itself before sign-in.
        with ui.column().classes('lc-desktop-only flex-1 relative overflow-hidden justify-center '
                                 'px-16 gap-8 lc-login-art').style(f'background: {NAVY}'):
            with ui.column().classes('relative z-10 gap-8 max-w-xl'):
                with ui.row().classes('items-center gap-3 no-wrap'):
                    with ui.element('div').classes('rounded-2xl p-2.5').style(f'background: {ACCENT}'):
                        ui.label('🏥').classes('text-[26px] leading-none')
                    with ui.column().classes('gap-0'):
                        ui.label(f"📒 {t('app.product')}").classes('text-white text-2xl font-bold leading-tight')
                        ui.label(t('app.tagline_long')).classes('text-sm text-slate-400')

                ui.label(t('auth.headline')).classes(
                    'text-white text-[34px] font-semibold leading-[1.15]')
                ui.label(t('auth.pitch')).classes('text-slate-300 text-[15px] leading-relaxed')

                for emoji, title, body in [
                    ('⚖️', t('auth.feat1_t'), t('auth.feat1_b')),
                    ('🩺', t('auth.feat2_t'), t('auth.feat2_b')),
                    ('📉', t('auth.feat3_t'), t('auth.feat3_b')),
                ]:
                    with ui.row().classes('items-start gap-3 no-wrap'):
                        ui.label(emoji).classes('text-[20px] leading-none mt-0.5 shrink-0')
                        with ui.column().classes('gap-0.5'):
                            ui.label(title).classes('text-white text-sm font-semibold')
                            ui.label(body).classes('text-slate-400 text-[12.5px] leading-relaxed')

        # Right: the form.
        with ui.column().classes('w-full lg:w-[480px] shrink-0 bg-white items-center justify-center px-8 gap-0'):
            with ui.column().classes('w-full max-w-[360px] gap-5'):
                with ui.row().classes('w-full justify-end'):
                    picker = ui.toggle({'en': '🇬🇧 EN', 'fr': '🇫🇷 FR'}, value=lang()) \
                        .props('dense unelevated no-caps').classes('lc-seg rounded-lg text-xs')
                    picker.on_value_change(lambda e: (set_lang(e.value), ui.navigate.reload()))

                with ui.column().classes('gap-1 lc-mobile-only'):
                    ui.label(t('app.product')).classes('text-xl font-bold text-slate-900')
                with ui.column().classes('gap-1'):
                    ui.label(f"🔐 {t('auth.signin')}").classes('text-[26px] font-semibold text-slate-900 leading-tight')
                    ui.label(t('auth.use_account')).classes('text-sm text-slate-500')

                email = ui.input(t('auth.email')).props('outlined dense autofocus autocomplete=username prepend-icon=mail') \
                    .classes('w-full')
                password = ui.input(t('auth.password'), password=True, password_toggle_button=True) \
                    .props('outlined dense autocomplete=current-password prepend-icon=lock').classes('w-full')
                message = ui.label('').classes('text-xs text-rose-600 min-h-[16px]')

                async def submit() -> None:
                    message.text = ''
                    if not email.value or not password.value:
                        message.text = t('auth.need_both')
                        return
                    button.props('loading')
                    try:
                        user = await api.login(email.value.strip(), password.value)
                        org_fw = user.get('frameworks')
                        is_ifrs = (org_fw == 'ifrs' or org_fw == ['ifrs'] or str(org_fw).lower() == 'ifrs')
                        chosen_lang = 'en' if is_ifrs else lang()
                        set_lang(chosen_lang)
                        await api.safe(api.patch('/auth/locale', {'locale': chosen_lang}), notify=False)
                        user_name = (user.get('full_name') or 'User').split()[0]
                        ui.notify(t('auth.welcome', name=user_name), type='positive', position='top')
                        target = next if next and next != '/login' else '/'
                        ui.navigate.to(target if target != '/' else first_allowed_route())
                    except api.ApiError as exc:
                        message.text = exc.message
                    except Exception as exc:
                        message.text = f'Login error: {exc}'
                    finally:
                        button.props(remove='loading')

                button = ui.button(t('auth.submit'), icon='login', on_click=submit).props('unelevated size=md').classes('w-full')
                password.on('keyup.enter', submit)
                email.on('keyup.enter', submit)

                with ui.expansion(f"👥 {t('auth.demo')}", icon='groups') \
                        .props('dense').classes('w-full border border-slate-200 rounded-xl'):
                    ui.label(t('auth.demo_hint')).classes('text-[11.5px] text-slate-500 pb-2')
                    for address, role_key in DEMO_ACCOUNTS:
                        row = ui.row().classes('w-full items-center justify-between gap-2 py-1 px-2 no-wrap '
                                               'rounded-lg hover:bg-slate-50 cursor-pointer')
                        row.on('click', lambda a=address: _fill(email, password, a))
                        with row:
                            ui.label(chrome.ROLE_MARK.get(role_key, '')).classes('text-base leading-none shrink-0')
                            with ui.column().classes('gap-0 min-w-0 flex-1'):
                                ui.label(t(role_key)).classes('text-xs font-medium text-slate-700 truncate')
                                ui.label(address).classes('text-[11px] text-slate-400 truncate')
                            ui.icon('login').classes('text-slate-400 text-sm shrink-0')


def _fill(email, password, address: str) -> None:
    email.value = address
    password.value = 'Ledger@2026'
    ui.notify(t('auth.filled', email=address), position='top')
