"""Runtime configuration, read once from the environment."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')

import urllib.request

def get_api_base_url() -> str:
    env_url = os.getenv('API_BASE_URL', '').rstrip('/')
    
    # If local backend is alive on port 4700, ALWAYS prefer it
    try:
        req = urllib.request.Request('http://127.0.0.1:4700/api/health')
        with urllib.request.urlopen(req, timeout=0.5) as resp:
            if resp.status == 200:
                return 'http://127.0.0.1:4700/api'
    except Exception:
        pass

    # Break self-referential loops where public frontend domain is set as API_BASE_URL
    if 'ledgercore.up.railway.app' in env_url or '127.0.0.1:8700' in env_url:
        return 'http://127.0.0.1:4700/api'

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
