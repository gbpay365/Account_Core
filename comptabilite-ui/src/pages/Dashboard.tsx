import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { useFiscalYear } from '../hooks/useFiscalYear';
import { amountLocale } from '../utils/reportLocale';

function sumField(o: Record<string, unknown> | null, ...names: string[]): number | undefined {
  if (!o) return undefined;
  for (const n of names) {
    const v = o[n];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return undefined;
}

const StatCard: React.FC<{ title: string; value: string; icon: string; color: string; delay: number; badge: string }> =
  ({ title, value, icon, color, delay, badge }) => (
  <div className="glass-panel animate-fade-in" style={{
    padding: '32px', flex: 1, minWidth: '240px',
    animationDelay: `${delay}s`,
    borderTop: `6px solid ${color}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <span style={{ fontSize: '2.5rem' }}>{icon}</span>
      <span style={{
        background: `${color}22`, color,
        padding: '8px 16px', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 700
      }}>{badge}</span>
    </div>
    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', overflowWrap: 'anywhere' }}>{title}</div>
    <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{value}</div>
  </div>
);

const QuickLink: React.FC<{ to: string; label: string; desc: string; icon: string; delay: number; openLabel: string }> =
  ({ to, label, desc, icon, delay, openLabel }) => (
  <Link to={to} style={{ textDecoration: 'none' }}>
    <div className="glass-panel animate-fade-in" style={{
      padding: '32px 28px', cursor: 'pointer',
      animationDelay: `${delay}s`,
      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 24px 60px rgba(79,70,229,0.15)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--glass-shadow)'; }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '8px', fontFamily: 'var(--font-heading)', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: '1.5', overflowWrap: 'break-word' }}>{desc}</div>
      <div style={{ marginTop: '16px', color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {openLabel} <span style={{ transition: 'transform 0.2s' }}>→</span>
      </div>
    </div>
  </Link>
);

const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { fiscalYear, loading: yearLoading } = useFiscalYear();
  const numLoc = amountLocale(i18n.language);
  const [journalCount, setJournalCount] = useState<number | null>(null);
  const [netIncome, setNetIncome] = useState<number | null>(null);
  const [totalAssets, setTotalAssets] = useState<number | null>(null);
  const [operatingCf, setOperatingCf] = useState<number | null>(null);

  const fmt = (n: number | null) =>
    n == null ? '—' : n.toLocaleString(numLoc, { maximumFractionDigits: 0 });

  useEffect(() => {
    const companyId = getStoredCompanyId();
    if (!companyId || yearLoading) return;

    const lang = i18n.language || 'en';
    Promise.all([
      reportsApi.getReportAvailability(fiscalYear, companyId),
      reportsApi.getReportSummary('income_statement', fiscalYear, companyId, lang),
      reportsApi.getReportSummary('balance_sheet', fiscalYear, companyId, lang),
      reportsApi.getReportSummary('cash_flow', fiscalYear, companyId, lang),
    ])
      .then(([avail, inc, bs, cf]) => {
        const a = avail.data as Record<string, unknown>;
        setJournalCount(typeof a.journalEntryCount === 'number' ? a.journalEntryCount : null);
        setNetIncome(sumField(inc.data as Record<string, unknown>, 'netIncome', 'NetIncome') ?? null);
        setTotalAssets(sumField(bs.data as Record<string, unknown>, 'totalAssets', 'TotalAssets') ?? null);
        setOperatingCf(sumField(cf.data as Record<string, unknown>, 'operatingCashFlow', 'OperatingCashFlow') ?? null);
      })
      .catch(() => {
        setJournalCount(null);
        setNetIncome(null);
        setTotalAssets(null);
        setOperatingCf(null);
      });
  }, [fiscalYear, yearLoading, i18n.language]);

  return (
    <div>
      <div className="glass-panel animate-fade-in" style={{
        padding: '40px 48px', marginBottom: '40px',
        background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(129,140,248,0.08))',
        borderLeft: '6px solid var(--color-primary)',
        borderRadius: '24px'
      }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}>
          🧾 {t('dashboard.title')}
        </h1>
        <p style={{ margin: '12px 0 0 0', color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 500 }}>
          {t('dashboard.welcome', { year: fiscalYear })}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <StatCard title={t('dashboard.stat_journal_entries', { defaultValue: 'Posted journal entries' })} value={fmt(journalCount)} icon="📒" color="var(--color-primary)" delay={0.1} badge={t('dashboard.badge_live')} />
        <StatCard title={t('dashboard.stat_net_income', { defaultValue: 'Net income' })} value={fmt(netIncome)} icon="📉" color="#10b981" delay={0.2} badge={t('dashboard.badge_live')} />
        <StatCard title={t('dashboard.stat_total_assets', { defaultValue: 'Total assets' })} value={fmt(totalAssets)} icon="⚖️" color="#38bdf8" delay={0.3} badge={t('dashboard.badge_live')} />
        <StatCard title={t('dashboard.stat_operating_cf', { defaultValue: 'Operating cash flow' })} value={fmt(operatingCf)} icon="💰" color="#f59e0b" delay={0.4} badge={t('dashboard.badge_live')} />
      </div>

      <h2 style={{ marginBottom: '20px', fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 500 }}>{t('dashboard.quick_access')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
        <QuickLink to="/journal" label={t('dashboard.quick_journal')} desc={t('dashboard.quick_journal_desc')} icon="✏️" delay={0.1} openLabel={t('dashboard.open')} />
        <QuickLink to="/general-ledger" label={t('general_ledger.title', { defaultValue: 'General ledger' })} desc={t('dashboard.quick_gl_desc', { defaultValue: 'Live GL from posted journals' })} icon="📖" delay={0.12} openLabel={t('dashboard.open')} />
        <QuickLink to="/trial-balance" label={t('trial_balance.title')} desc={t('dashboard.quick_tb_desc', { defaultValue: 'Trial balance & close' })} icon="⚖️" delay={0.14} openLabel={t('dashboard.open')} />
        <QuickLink to="/income-statement" label={t('income_statement.title')} desc={t('dashboard.quick_pl_desc', { defaultValue: 'P&L from ledger' })} icon="📉" delay={0.16} openLabel={t('dashboard.open')} />
        <QuickLink to="/balance-sheet" label={t('balance_sheet.title')} desc={t('dashboard.quick_bs_desc', { defaultValue: 'Balance sheet' })} icon="📊" delay={0.18} openLabel={t('dashboard.open')} />
        <QuickLink to="/cash-flow" label={t('cash_flow.title')} desc={t('dashboard.quick_cf_desc', { defaultValue: 'Cash flow statement' })} icon="💰" delay={0.2} openLabel={t('dashboard.open')} />
      </div>

      <h2 style={{ margin: '32px 0 16px', fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 500 }}>
        {t('dashboard.workflow_title', 'GL & close workflow')}
      </h2>
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          marginBottom: 24,
          borderLeft: '4px solid var(--color-primary)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px 24px',
          alignItems: 'center',
        }}
      >
        {[
          { to: '/companies', label: t('dashboard.wf_tenant', '1. Company & access'), desc: t('dashboard.wf_tenant_desc', 'Entity & users') },
          { to: '/accounts', label: t('dashboard.wf_chart', '2. Chart of accounts'), desc: t('dashboard.wf_chart_desc', 'SYSCOHADA comptes') },
          { to: '/cost-centers', label: t('dashboard.wf_cc', '3. Cost centres'), desc: t('dashboard.wf_cc_desc', 'Analytical axis') },
          { to: '/journal', label: t('dashboard.wf_je', '4. Journal'), desc: t('dashboard.wf_je_desc', 'GL entries & CC') },
          { to: '/trial-balance', label: t('dashboard.wf_close', '5. Trial & statements'), desc: t('dashboard.wf_close_desc', 'TB → P&L, balance sheet') },
        ].map((s) => (
          <Link key={s.to} to={s.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div
              style={{
                minWidth: 200,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(79,70,229,0.06)',
                border: '1px solid rgba(79,70,229,0.2)',
                transition: 'transform 0.2s',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-primary)', overflowWrap: 'anywhere' }}>{s.label}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, overflowWrap: 'anywhere' }}>{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
