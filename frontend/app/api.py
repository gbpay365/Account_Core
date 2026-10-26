"""
The single door onto the Node API.

Every call carries the signed-in user's bearer token and turns a non-2xx
response into an ApiError holding the message the backend wrote, so a page
never has to inspect status codes to tell the user what went wrong.
"""

from __future__ import annotations

from typing import Any

import httpx
from nicegui import app, ui

from .config import API_BASE_URL

_client = httpx.AsyncClient(
    base_url=API_BASE_URL,
    timeout=httpx.Timeout(45.0, connect=5.0),
)


class ApiError(Exception):
    def __init__(self, status: int, message: str, details: list[dict] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details or []

    @property
    def full_message(self) -> str:
        if not self.details:
            return self.message
        fields = '; '.join(f"{d.get('field', '')}: {d.get('message', '')}".strip(': ') for d in self.details)
        return f'{self.message} ({fields})'


def token() -> str | None:
    return app.storage.user.get('token')


def user() -> dict:
    return app.storage.user.get('user') or {}


def permissions() -> set[str]:
    return set(user().get('permissions') or [])


def can(*codes: str) -> bool:
    """True when the signed-in role holds at least one of the permissions."""
    held = permissions()
    return any(code in held for code in codes)


from pathlib import Path

def _backend_diagnostic() -> str:
    log_file = Path('/tmp/backend.log')
    if log_file.exists():
        try:
            lines = [l.strip() for l in log_file.read_text(encoding='utf-8', errors='replace').splitlines() if l.strip()]
            if lines:
                err_lines = [l for l in lines if any(k in l.lower() for k in ('error', 'failed', 'cannot', 'exception', 'fatal'))]
                chosen = err_lines[-1] if err_lines else lines[-1]
                return f" [Log: {chosen[:220]}]"
        except Exception:
            pass
    return ""


async def request(method: str, path: str, *, params: dict | None = None, json: Any = None,
                  authenticated: bool = True) -> Any:
    headers: dict[str, str] = {}
    if authenticated and token():
        headers['Authorization'] = f'Bearer {token()}'

    clean = {k: v for k, v in (params or {}).items() if v is not None and v != ''}
    try:
        response = await _client.request(method, path, params=clean, json=json, headers=headers)
    except httpx.ConnectTimeout as exc:
        raise ApiError(0, f'Connection to backend API at {API_BASE_URL} timed out.{_backend_diagnostic()}') from exc
    except httpx.ConnectError as exc:
        raise ApiError(0, f'Cannot reach backend API at {API_BASE_URL}{_backend_diagnostic()}. Ensure the backend service is running.') from exc
    except httpx.HTTPError as exc:
        raise ApiError(0, f'Backend API unreachable ({exc.__class__.__name__}) at {API_BASE_URL}{_backend_diagnostic()}.') from exc

    if response.status_code == 204 or not response.content:
        return None

    try:
        body = response.json()
    except ValueError:
        if response.is_success:
            return None
        raise ApiError(response.status_code, response.text.strip() or 'Unexpected response from the server.')

    if response.is_success:
        return body

    error = (body or {}).get('error') or {}
    if response.status_code == 401:
        # The session is gone: clear it so the router sends the user to sign in.
        app.storage.user.clear()
    raise ApiError(response.status_code, error.get('message') or 'The request was refused.', error.get('details'))


async def get(path: str, **params: Any) -> Any:
    return await request('GET', path, params=params)


async def post(path: str, body: Any = None, **params: Any) -> Any:
    return await request('POST', path, json=body if body is not None else {}, params=params)


async def patch(path: str, body: Any = None) -> Any:
    return await request('PATCH', path, json=body or {})


async def put(path: str, body: Any = None, **params: Any) -> Any:
    return await request('PUT', path, json=body if body is not None else {}, params=params)


async def delete(path: str) -> Any:
    return await request('DELETE', path)


async def login(email: str, password: str) -> dict:
    body = await request('POST', '/auth/login', json={'email': email, 'password': password}, authenticated=False)
    if not isinstance(body, dict) or 'token' not in body or 'user' not in body:
        raise ApiError(0, 'Unexpected response from auth service. Check backend connection.')
    app.storage.user['token'] = body['token']
    app.storage.user['user'] = body['user']
    return body['user']


async def refresh_session() -> dict | None:
    """Re-reads the session so a role change takes effect without signing out."""
    try:
        body = await get('/auth/me')
    except ApiError:
        return None
    app.storage.user['user'] = body['user']
    return body['user']


def logout() -> None:
    app.storage.user.clear()
    ui.navigate.to('/login')


def notify_error(exc: Exception) -> None:
    """One place decides how a failure looks, so it looks the same everywhere."""
    if isinstance(exc, ApiError):
        if exc.status == 401:
            ui.navigate.to('/login')
            return
        ui.notify(exc.full_message, type='negative', position='top', timeout=6000, multi_line=True,
                  classes='max-w-lg')
        return
    ui.notify(f'Something went wrong: {exc}', type='negative', position='top', timeout=6000)


async def safe(coro, *, on_error=None, notify: bool = True, default: Any = None) -> Any:
    """
    Awaits an API call and reports failure rather than leaving a dead page.

    Pass notify=False for a supplementary panel, where a failure should leave
    the rest of the page usable instead of raising a toast the user cannot act on.
    """
    try:
        res = await coro
        return default if res is None and default is not None else res
    except Exception as exc:  # noqa: BLE001 - surfaced to the user, not swallowed
        if notify:
            notify_error(exc)
        if on_error is not None:
            on_error(exc)
        return default
