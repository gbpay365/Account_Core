"""
LedgerCore Health — front end entry point.

Run with:  python main.py      (the Node API must be running on API_BASE_URL)
"""

from __future__ import annotations

from nicegui import app, ui

from app.config import API_BASE_URL, STORAGE_SECRET, UI_HOST, UI_PORT, UI_TITLE
from app import pages  # noqa: F401 - importing registers the routes
from app.theme import CANVAS


@app.exception_handler(404)
async def not_found(request, exception):  # noqa: ANN001, ARG001
    from app.ui.shell import first_allowed_route
    from app import api
    from app.i18n import t
    from app.theme import apply as apply_theme

    apply_theme()
    with ui.column().classes('w-screen h-screen items-center justify-center gap-3'):
        ui.icon('explore_off').classes('text-6xl text-slate-300')
        ui.label(t('auth.missing')).classes('text-lg font-semibold text-slate-700')
        ui.button(t('auth.take_back'), icon='arrow_back',
                  on_click=lambda: ui.navigate.to(first_allowed_route() if api.token() else '/login')
                  ).props('unelevated')


ui.run(
    host=UI_HOST,
    port=UI_PORT,
    title=UI_TITLE,
    storage_secret=STORAGE_SECRET,
    favicon='🏥',
    dark=False,
    reload=False,
    show=False,
    uvicorn_logging_level='warning',
)
