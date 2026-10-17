"""
Shared marks for the UI: emoji for wayfinding and status, Material icons for
actions. Pages should look these up rather than inventing their own.
"""

from __future__ import annotations

NAV_GROUP: dict[str, str] = {
    'nav.overview': '🏠',
    'nav.accounting': '📒',
    'nav.assets': '🏥',
    'nav.maintenance': '🔧',
    'nav.services': '🧰',
    'nav.reporting': '📈',
}

NAV_ITEM: dict[str, str] = {
    '/': '📊',
    '/accounts': '🌳',
    '/journal': '🧾',
    '/ledger': '📖',
    '/periods': '📅',
    '/bank-reconciliation': '🏦',
    '/withholding-tax': '🧾',
    '/cash-registers': '📱',
    '/donor-projects': '🌍',
    '/payroll': '👥',
    '/dfe-invoicing': '⚡',
    '/assets': '🏷️',
    '/categories': '📂',
    '/depreciation': '📉',
    '/leases': '🏢',
    '/fiscal-depreciation': '📉',
    '/asset-inventory': '📦',
    '/maintenance': '🛠️',
    '/plans': '🗓️',
    '/compliance': '⚡',
    '/worklist': '📋',
    '/errands': '🏃',
    '/shopping': '🛒',
    '/reports': '📑',
    '/dsf': '📑',
    '/asset-reports': '📦',
    '/audit': '🕵️',
}

STATUS: dict[str, str] = {
    'draft': '📝', 'posted': '✅', 'reversed': '↩️',
    'open': '🟢', 'closed': '🔒', 'locked': '🔐',
    'in_stock': '📦', 'installing': '🔧', 'in_service': '💚',
    'under_maintenance': '🛠️', 'awaiting_parts': '⏳',
    'calibration_overdue': '⚠️', 'quarantined': '🚫',
    'out_of_service': '⛔', 'pending_disposal': '📤', 'disposed': '🗂️',
    'requested': '📨', 'approved': '👍', 'assigned': '👤',
    'in_progress': '🔄', 'on_hold': '⏸️', 'completed': '✅',
    'shopping': '🛒', 'received': '📦', 'needed': '📝',
    'bought': '✅', 'unavailable': '🚫', 'urgent': '🚨',
    'verified': '✔️', 'cancelled': '✖️', 'rejected': '❌',
    'pass': '✅', 'pass_with_adjustment': '🟡', 'conditional': '🟠',
    'fail': '❌', 'indeterminate': '❔',
    'low': '⬇️', 'normal': '➡️', 'medium': '↗️', 'high': '⬆️',
    'emergency': '🚨', 'critical': '‼️',
    'simulated': '🧪', 'active': '🟢', 'expiring': '⏰', 'expired': '⌛',
    'pending_approval': '🕓',
    'both': '↔️', 'ohada': '🇨🇲', 'ifrs': '🌐',
    'due_soon': '⏰', 'overdue': '🚨',
    'posting': '✍️', 'heading': '📁', 'imputable': '✍️', 'collectif': '📁',
}

CLASS_MARK: dict[int, str] = {
    1: '🏛️', 2: '🏢', 3: '📦', 4: '👥', 5: '🏦',
    6: '💸', 7: '💰', 8: '⚡', 9: '📎',
}

PAGE: dict[str, str] = {
    'dash.hello': '👋',
    'coa.title': '🌳',
    'je.title': '🧾',
    'gl.title': '📖',
    'per.title': '📅',
    'bank_rec.title': '🏦',
    'withholding.title': '🧾',
    'ar.title': '🏷️',
    'cat.title': '📂',
    'dp.title': '📉',
    'wo.title': '🛠️',
    'pl.title': '🗓️',
    'cal.title': '⚡',
    'wl.title': '📋',
    'er.title': '🏃',
    'sl.title': '🛒',
    'st.title': '📑',
    'arep.title': '📦',
    'au.title': '🕵️',
}

ROLE_MARK: dict[str, str] = {
    'role.admin': '🛡️',
    'role.cfo': '💼',
    'role.clerk': '🧮',
    'role.asset_mgr': '🏷️',
    'role.tech': '🩺',
    'role.gst': '🔧',
    'role.ward': '🛏️',
}


def mark(key: str | None) -> str:
    if not key:
        return ''
    raw = str(key).lower()
    return STATUS.get(raw, '')


def labelled(key: str | None, text: str) -> str:
    emoji = mark(key)
    return f'{emoji} {text}'.strip() if emoji else text
