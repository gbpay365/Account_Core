"""Sign-in. The only page outside the application shell."""

from __future__ import annotations

import html

from nicegui import app, ui

from .. import api
from ..i18n import STRINGS, lang as _app_lang, set_lang
from ..theme import ACCENT, NAVY, apply as apply_theme
from ..ui import chrome
from ..ui.shell import first_allowed_route


def lang() -> str:
    """Language picked on this screen. Unlike the in-app helper it is not forced to
    English by an IFRS framework left over from an earlier session."""
    stored = app.storage.user.get('lang')
    return stored if stored in ('en', 'fr') else _app_lang()


def t(key: str, **kwargs) -> str:
    pack = STRINGS.get(lang()) or STRINGS['en']
    text = pack.get(key) or STRINGS['en'].get(key) or key
    return text.format(**kwargs) if kwargs else text


LOGIN_CSS = """
:root { --lc-teal: #14b8a6; --lc-teal-d: #0d9488; --lc-sky: #38bdf8; --lc-ink: #0b1220; }

/* ---------- Left art panel ---------- */
.lc-login-art {
  background:
    radial-gradient(1100px 600px at 10% 0%, rgba(20,184,166,.22), transparent 60%),
    radial-gradient(900px 600px at 100% 100%, rgba(56,189,248,.18), transparent 60%),
    linear-gradient(160deg, #060b16 0%, #0b1426 55%, #0a1a2b 100%) !important;
}
.lc-grid {
  position: absolute; inset: 0; opacity: .5; pointer-events: none;
  background-image:
    linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px);
  background-size: 44px 44px;
  -webkit-mask-image: radial-gradient(ellipse at 40% 45%, #000 20%, transparent 75%);
          mask-image: radial-gradient(ellipse at 40% 45%, #000 20%, transparent 75%);
  animation: lc-grid-pan 40s linear infinite;
}
@keyframes lc-grid-pan { to { background-position: 44px 44px, 44px 44px; } }

.lc-orb { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
.lc-orb.a { width: 380px; height: 380px; left: -90px; top: -60px;
  background: rgba(20,184,166,.35); animation: lc-float 14s ease-in-out infinite; }
.lc-orb.b { width: 320px; height: 320px; right: -60px; bottom: -40px;
  background: rgba(56,189,248,.30); animation: lc-float 18s ease-in-out infinite reverse; }
.lc-orb.c { width: 220px; height: 220px; left: 45%; top: 55%;
  background: rgba(99,102,241,.22); animation: lc-float 22s ease-in-out infinite; }
@keyframes lc-float {
  0%,100% { transform: translate(0,0) scale(1); }
  33% { transform: translate(40px,-30px) scale(1.08); }
  66% { transform: translate(-30px,40px) scale(.95); }
}

/* ---------- Entrance animations ---------- */
.lc-rise { opacity: 0; transform: translateY(18px); animation: lc-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
.lc-d1 { animation-delay: .05s } .lc-d2 { animation-delay: .15s } .lc-d3 { animation-delay: .25s }
.lc-d4 { animation-delay: .35s } .lc-d5 { animation-delay: .45s } .lc-d6 { animation-delay: .6s }
@keyframes lc-rise { to { opacity: 1; transform: none; } }

.lc-gradient-text {
  background: linear-gradient(100deg, #5eead4 0%, #38bdf8 50%, #a5b4fc 100%);
  background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; animation: lc-shine 6s linear infinite;
}
@keyframes lc-shine { to { background-position: 200% center; } }

/* ---------- Brand mark ---------- */
.lc-logo {
  background: linear-gradient(135deg, #14b8a6, #0ea5e9);
  box-shadow: 0 8px 24px rgba(20,184,166,.45), inset 0 1px 0 rgba(255,255,255,.35);
  position: relative;
}
.lc-logo::after { content: ''; position: absolute; inset: -4px; border-radius: 18px;
  border: 1px solid rgba(94,234,212,.45); animation: lc-pulse-ring 2.8s ease-out infinite; }
@keyframes lc-pulse-ring { 0% { transform: scale(.9); opacity: .9 } 100% { transform: scale(1.35); opacity: 0 } }

/* ---------- Feature cards ---------- */
.lc-feature {
  background: rgba(255,255,255,.04); border: 1px solid rgba(148,163,184,.14);
  backdrop-filter: blur(10px); border-radius: 14px; padding: 12px 14px;
  transition: transform .25s ease, border-color .25s ease, background .25s ease;
}
.lc-feature:hover { transform: translateX(6px); border-color: rgba(94,234,212,.5); background: rgba(20,184,166,.08); }
.lc-feature .lc-ficon {
  width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none;
  background: linear-gradient(135deg, rgba(20,184,166,.25), rgba(56,189,248,.2));
  color: #5eead4; border: 1px solid rgba(94,234,212,.3);
}

/* ---------- Live ledger preview card ---------- */
.lc-preview {
  background: rgba(15,23,42,.62); border: 1px solid rgba(148,163,184,.18);
  backdrop-filter: blur(14px); border-radius: 18px; padding: 16px 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,.45); animation: lc-bob 7s ease-in-out infinite;
}
@keyframes lc-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
.lc-bar { width: 100%; height: 6px; border-radius: 99px; background: rgba(148,163,184,.15); overflow: hidden; }
.lc-bar > i { display: block; height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, #14b8a6, #38bdf8); transform-origin: left;
  animation: lc-fill 2.2s cubic-bezier(.2,.7,.2,1) both; }
.lc-bar.b > i { background: linear-gradient(90deg, #818cf8, #38bdf8); animation-delay: .25s; }
@keyframes lc-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.lc-spark { display: flex; align-items: flex-end; gap: 4px; height: 36px; }
.lc-spark i { width: 7px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg,#5eead4,#0d9488);
  transform-origin: bottom; animation: lc-grow 1.6s cubic-bezier(.2,.7,.2,1) both, lc-breathe 4s ease-in-out infinite 1.6s; }
@keyframes lc-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes lc-breathe { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
.lc-live { width: 8px; height: 8px; border-radius: 50%; background: #34d399;
  box-shadow: 0 0 0 0 rgba(52,211,153,.7); animation: lc-live 2s infinite; }
@keyframes lc-live { 70% { box-shadow: 0 0 0 9px rgba(52,211,153,0) } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0) } }

.lc-chip { border: 1px solid rgba(148,163,184,.25); color: #cbd5e1; border-radius: 99px;
  padding: 3px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 5px;
  background: rgba(255,255,255,.04); }

/* ---------- Right form panel ---------- */
.lc-form-panel {
  background:
    radial-gradient(500px 300px at 100% 0%, rgba(20,184,166,.08), transparent 70%),
    radial-gradient(500px 300px at 0% 100%, rgba(56,189,248,.08), transparent 70%),
    #ffffff;
}
.lc-lock {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, #14b8a6, #0ea5e9);
  box-shadow: 0 10px 24px rgba(14,165,233,.35);
}
.lc-form-panel .q-field--outlined .q-field__control { border-radius: 12px; transition: box-shadow .2s ease; }
.lc-form-panel .q-field--focused .q-field__control { box-shadow: 0 0 0 4px rgba(20,184,166,.15); }
.lc-submit {
  border-radius: 12px !important; height: 46px; font-weight: 600; letter-spacing: .01em;
  background: linear-gradient(135deg, #0d9488, #0284c7) !important; color: #fff !important;
  box-shadow: 0 10px 24px rgba(13,148,136,.35); position: relative; overflow: hidden;
  transition: transform .2s ease, box-shadow .2s ease;
}
.lc-submit:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(13,148,136,.45); }
.lc-submit::after { content: ''; position: absolute; top: 0; left: -120%; width: 60%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent);
  transform: skewX(-20deg); animation: lc-sweep 3.6s ease-in-out infinite; }
@keyframes lc-sweep { 0% { left: -120% } 55%,100% { left: 160% } }
.lc-demo-row { transition: background .15s ease, transform .15s ease; }
.lc-demo-row:hover { transform: translateX(3px); }
.lc-shake { animation: lc-shake .4s; }
@keyframes lc-shake { 20%,60% { transform: translateX(-6px) } 40%,80% { transform: translateX(6px) } }

@media (prefers-reduced-motion: reduce) {
  .lc-grid, .lc-orb, .lc-rise, .lc-gradient-text, .lc-logo::after, .lc-preview,
  .lc-bar > i, .lc-spark i, .lc-live, .lc-submit::after { animation: none !important; }
  .lc-rise { opacity: 1; transform: none; }
}
"""


@ui.page('/login')
async def login_page(next: str = '/') -> None:  # noqa: A002 - query parameter name
    apply_theme()
    if api.token() and app.storage.user.get('user'):
        ui.navigate.to(next or '/')
        return

    ui.query('body').style(f'background: {NAVY}')
    ui.add_css(LOGIN_CSS)

    with ui.row().classes('w-screen h-screen no-wrap items-stretch gap-0'):
        # Left: the pitch, so the product explains itself before sign-in.
        with ui.column().classes('lc-desktop-only flex-1 relative overflow-hidden justify-center '
                                 'px-16 gap-8 lc-login-art'):
            ui.element('div').classes('lc-grid')
            ui.element('div').classes('lc-orb a')
            ui.element('div').classes('lc-orb b')
            ui.element('div').classes('lc-orb c')

            with ui.column().classes('relative z-10 gap-7 max-w-xl'):
                with ui.row().classes('items-center gap-3 no-wrap lc-rise lc-d1'):
                    with ui.element('div').classes('lc-logo rounded-2xl p-2.5 grid place-items-center'):
                        ui.icon('account_balance').classes('text-white text-[28px]')
                    with ui.column().classes('gap-0'):
                        ui.label(t('app.product')).classes('text-white text-2xl font-bold leading-tight')
                        ui.label(t('app.tagline_long')).classes('text-sm text-slate-400')

                with ui.row().classes('gap-2 lc-rise lc-d2'):
                    for icon, text in [('verified', 'SYSCOHADA'), ('public', 'IFRS'),
                                       ('biotech', 'IEC 60601'), ('lock', t('auth.chip_audit'))]:
                        with ui.element('span').classes('lc-chip'):
                            ui.icon(icon).classes('text-[13px] text-teal-300')
                            ui.label(text)

                with ui.element('div').classes('lc-rise lc-d3'):
                    ui.html(f'<span class="lc-gradient-text text-[38px] font-bold leading-[1.12]" '
                            f'style="display:inline-block">{html.escape(t("auth.headline"))}</span>')
                ui.label(t('auth.pitch')).classes(
                    'text-slate-300 text-[15px] leading-relaxed lc-rise lc-d3')

                with ui.column().classes('gap-3 w-full'):
                    for i, (icon, title, body) in enumerate([
                        ('balance', t('auth.feat1_t'), t('auth.feat1_b')),
                        ('health_and_safety', t('auth.feat2_t'), t('auth.feat2_b')),
                        ('trending_down', t('auth.feat3_t'), t('auth.feat3_b')),
                    ]):
                        with ui.row().classes(f'lc-feature items-start gap-3 no-wrap lc-rise lc-d{4 + i}'):
                            with ui.element('div').classes('lc-ficon'):
                                ui.icon(icon).classes('text-[20px]')
                            with ui.column().classes('gap-0.5'):
                                ui.label(title).classes('text-white text-sm font-semibold')
                                ui.label(body).classes('text-slate-400 text-[12.5px] leading-relaxed')

                # Live ledger preview: reassures that the books balance in real time.
                with ui.column().classes('lc-preview gap-3 w-full max-w-md lc-rise lc-d6'):
                    with ui.row().classes('items-center justify-between w-full no-wrap'):
                        with ui.row().classes('items-center gap-2 no-wrap'):
                            ui.element('div').classes('lc-live')
                            ui.label(t('auth.live_ledger')).classes('text-slate-200 text-xs font-semibold')
                        with ui.row().classes('items-center gap-1 no-wrap'):
                            ui.icon('check_circle').classes('text-emerald-400 text-[15px]')
                            ui.label(t('auth.balanced')).classes('text-emerald-300 text-[11px]')
                    with ui.row().classes('items-end justify-between w-full no-wrap'):
                        with ui.column().classes('gap-2 flex-1 pr-4'):
                            with ui.column().classes('gap-1 w-full'):
                                with ui.row().classes('justify-between w-full'):
                                    ui.label('OHADA').classes('text-slate-400 text-[11px]')
                                    ui.label('100%').classes('text-slate-300 text-[11px]')
                                ui.html('<div class="lc-bar"><i style="width:100%"></i></div>')
                            with ui.column().classes('gap-1 w-full'):
                                with ui.row().classes('justify-between w-full'):
                                    ui.label(t('auth.bridge')).classes('text-slate-400 text-[11px]')
                                    ui.label('100%').classes('text-slate-300 text-[11px]')
                                ui.html('<div class="lc-bar b"><i style="width:100%"></i></div>')
                        heights = [38, 55, 44, 70, 52, 86, 64, 96]
                        bars = ''.join(
                            f'<i style="height:{h}%;animation-delay:{0.1 * n:.1f}s,{1.6 + 0.2 * n:.1f}s"></i>'
                            for n, h in enumerate(heights))
                        ui.html(f'<div class="lc-spark">{bars}</div>')

        # Right: the form.
        with ui.column().classes('w-full lg:w-[480px] shrink-0 lc-form-panel items-center '
                                 'justify-center px-8 gap-0'):
            with ui.column().classes('w-full max-w-[360px] gap-5 lc-rise lc-d2'):
                with ui.row().classes('w-full justify-end'):
                    picker = ui.toggle({'en': '🇬🇧 EN', 'fr': '🇫🇷 FR'}, value=lang()) \
                        .props('dense unelevated no-caps').classes('lc-seg rounded-lg text-xs')
                    picker.on_value_change(lambda e: (set_lang(e.value), ui.navigate.reload()))

                with ui.row().classes('items-center gap-2 lc-mobile-only'):
                    with ui.element('div').classes('lc-logo rounded-xl p-2 grid place-items-center'):
                        ui.icon('account_balance').classes('text-white text-[20px]')
                    ui.label(t('app.product')).classes('text-xl font-bold text-slate-900')

                with ui.row().classes('items-center gap-4 no-wrap'):
                    with ui.element('div').classes('lc-lock'):
                        ui.icon('lock_open').classes('text-[26px]')
                    with ui.column().classes('gap-0.5'):
                        ui.label(t('auth.signin')).classes('text-[26px] font-bold text-slate-900 leading-tight')
                        ui.label(t('auth.use_account')).classes('text-sm text-slate-500')

                email = ui.input(t('auth.email')) \
                    .props('outlined dense autofocus autocomplete=username').classes('w-full')
                with email.add_slot('prepend'):
                    ui.icon('mail_outline').classes('text-slate-400')
                password = ui.input(t('auth.password'), password=True, password_toggle_button=True) \
                    .props('outlined dense autocomplete=current-password').classes('w-full')
                with password.add_slot('prepend'):
                    ui.icon('lock_outline').classes('text-slate-400')

                with ui.row().classes('items-center gap-1 min-h-[18px]'):
                    msg_icon = ui.icon('error_outline').classes('text-rose-600 text-[15px]')
                    msg_icon.set_visibility(False)
                    message = ui.label('').classes('text-xs text-rose-600')

                async def submit() -> None:
                    message.text = ''
                    msg_icon.set_visibility(False)
                    if not email.value or not password.value:
                        message.text = t('auth.need_both')
                        msg_icon.set_visibility(True)
                        ui.run_javascript("document.querySelector('.lc-submit')?.classList.add('lc-shake');"
                                          "setTimeout(()=>document.querySelector('.lc-submit')?.classList.remove('lc-shake'),450)")
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
                        msg_icon.set_visibility(True)
                    except Exception as exc:
                        message.text = f'Login error: {exc}'
                        msg_icon.set_visibility(True)
                    finally:
                        button.props(remove='loading')

                button = ui.button(t('auth.submit'), icon='login', on_click=submit) \
                    .props('unelevated no-caps size=md').classes('w-full lc-submit')
                password.on('keyup.enter', submit)
                email.on('keyup.enter', submit)

                with ui.row().classes('items-center justify-center gap-1.5 w-full pt-3'):
                    ui.icon('verified_user').classes('text-teal-600 text-[14px]')
                    ui.label(t('auth.secure_note')) \
                        .classes('text-[11px] text-slate-400')
