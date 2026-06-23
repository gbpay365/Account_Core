import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';
import type { AccountTreeNode } from '../api/accountsApi';
import { useTranslation } from 'react-i18next';

type Props = { roots: AccountTreeNode[]; depth?: number };

const Row: React.FC<{ n: AccountTreeNode; depth: number }> = ({ n, depth }) => {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith('en');
  const [open, setOpen] = useState(depth < 2);
  const has = n.children && n.children.length > 0;
  const pad = 8 + depth * 14;
  return (
    <li style={{ listStyle: 'none' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0 2px ' + pad + 'px', fontSize: '0.85rem' }}
      >
        {has ? (
          <button type="button" onClick={() => setOpen(!open)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span style={{ width: 16, display: 'inline-block' }} />
        )}
        <Hash size={12} color="#94a3b8" />
        <span className="mono" style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0f172a' }}>
          {n.code}
        </span>
        <span style={{ color: '#475569' }}>— {isEn ? n.nameEn : n.nameFr}</span>
        {!n.isLeaf && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(+)</span>}
      </div>
      {has && open && (
        <ul style={{ margin: 0, padding: 0 }}>
          {n.children.map((c) => (
            <Row key={c.code} n={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const AccountTreeView: React.FC<Props> = ({ roots, depth = 0 }) => {
  if (roots.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No accounts in this view.</p>;
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {roots.map((r) => (
        <Row key={r.code} n={r} depth={depth} />
      ))}
    </ul>
  );
};
