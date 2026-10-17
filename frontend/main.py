"""
LedgerCore Health — front end entry point.

Run with:  python main.py      (the Node API must be running on API_BASE_URL)
"""

from __future__ import annotations

from nicegui import app, ui

from app.config import API_BASE_URL, STORAGE_SECRET, UI_HOST, UI_PORT, UI_TITLE
from app import pages  # noqa: F401 - importing registers the routes
from app.theme import CANVAS


from starlette.responses import RedirectResponse


@app.exception_handler(404)
async def not_found(request, exception):  # noqa: ANN001, ARG001
    return RedirectResponse(url='/')


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
