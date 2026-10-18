"""
LedgerCore Health — front end entry point.

Run with:  python main.py      (the Node API must be running on API_BASE_URL)
"""

from __future__ import annotations

from nicegui import app, ui

from app.config import API_BASE_URL, STORAGE_SECRET, UI_HOST, UI_PORT, UI_TITLE
from app import pages  # noqa: F401 - importing registers the routes
from app.theme import CANVAS


import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse, Response


@app.api_route('/api/{path:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
async def proxy_api(request: Request) -> Response:
    """Forward /api/* calls to the Node.js API backend."""
    subpath = request.path_params.get('path', '')
    backend_base = API_BASE_URL.rstrip('/')
    target_url = f"{backend_base}/{subpath}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    # Break loop if target_url points to this frontend host or port
    req_host = request.headers.get('host', '').split(':')[0]
    if (req_host and req_host in target_url) or f":{UI_PORT}" in target_url or f"127.0.0.1:{UI_PORT}" in target_url:
        target_url = f"http://127.0.0.1:4700/api/{subpath}"
        if request.url.query:
            target_url = f"{target_url}?{request.url.query}"

    body = await request.body()
    headers = dict(request.headers)
    headers.pop('host', None)
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
            excluded_headers = {'content-encoding', 'content-length', 'transfer-encoding', 'connection'}
            resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get('content-type'),
            )
        except Exception as exc:
            return JSONResponse(
                {'error': {'message': f'Backend API unreachable at {target_url}: {exc}', 'status': 502}},
                status_code=502,
            )


@app.exception_handler(404)
async def not_found(request, exception):  # noqa: ANN001, ARG001
    if request.url.path.startswith('/api'):
        return JSONResponse(
            {'error': {'message': f'No route matches {request.method} {request.url.path}', 'status': 404}},
            status_code=404,
        )
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
