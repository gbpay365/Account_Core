"""Runtime configuration, read once from the environment."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')


def get_api_base_url() -> str:
    """Return the backend API base URL.

    ``API_BASE_URL`` always wins when set; otherwise fall back to the local
    development default.
    """
    env_url = os.getenv('API_BASE_URL', '').strip().rstrip('/')
    if env_url:
        return env_url
    return 'http://127.0.0.1:4700/api'

API_BASE_URL = get_api_base_url()
UI_HOST = os.getenv('UI_HOST', '0.0.0.0')
UI_PORT = int(os.getenv('PORT', os.getenv('UI_PORT', '8700')))
UI_TITLE = os.getenv('UI_TITLE', 'LedgerCore Health')
STORAGE_SECRET = os.getenv('STORAGE_SECRET', 'change-me')

#: The hospital keeps its books in XAF; the UI never assumes a decimal currency.
ZERO_DECIMAL_CURRENCIES = {'XAF', 'XOF', 'JPY', 'KMF', 'GNF', 'RWF', 'UGX', 'VUV'}
