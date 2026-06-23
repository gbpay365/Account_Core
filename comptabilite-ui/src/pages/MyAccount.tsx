import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/authService';
import { showToast } from '../utils/dialogs';

const MyAccount: React.FC = () => {
  const { t } = useTranslation();
  const [account, setAccount] = useState<{
    fullName: string;
    username: string;
    email: string;
    roleName?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    authService.getMe()
      .then(me => setAccount({
        fullName: me.fullName,
        username: me.username,
        email: me.email,
        roleName: me.roleName,
      }))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.next !== pwdForm.confirm) {
      showToast(t('settings.password_mismatch', 'New passwords do not match.'), 'error');
      return;
    }
    if (pwdForm.next.length < 8) {
      showToast(t('settings.password_too_short', 'Password must be at least 8 characters.'), 'error');
      return;
    }
    try {
      setPwdSaving(true);
      await authService.changePassword(pwdForm.current, pwdForm.next);
      setPwdForm({ current: '', next: '', confirm: '' });
      showToast(t('settings.password_updated', 'Password updated.'), 'success');
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      showToast(ax.response?.data?.error || ax.message || t('settings.password_failed', 'Could not update password.'), 'error');
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>👤 {t('settings.tab_account', 'My account')}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
          {t('account.subtitle', 'View your profile and change your password')}
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 24, maxWidth: 480 }}>
        {account && (
          <div style={{ marginBottom: 28, fontSize: '0.95rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>{account.fullName}</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
              {t('settings.login_name', 'Login')}: <code>{account.username}</code>
            </div>
            {account.email && <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{account.email}</div>}
            {account.roleName && <div style={{ color: 'var(--text-muted)' }}>{account.roleName}</div>}
          </div>
        )}

        <h3 style={{ marginTop: 0, marginBottom: 16 }}>{t('settings.change_password', 'Change password')}</h3>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="jem-field"
            placeholder={t('settings.current_password', 'Current password')}
            value={pwdForm.current}
            onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="jem-field"
            placeholder={t('settings.new_password', 'New password')}
            value={pwdForm.next}
            onChange={e => setPwdForm({ ...pwdForm, next: e.target.value })}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="jem-field"
            placeholder={t('settings.confirm_password', 'Confirm new password')}
            value={pwdForm.confirm}
            onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })}
          />
          <button type="submit" className="btn-glow" disabled={pwdSaving} style={{ marginTop: 8 }}>
            {pwdSaving ? t('common.loading') : t('settings.update_password', 'Update password')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MyAccount;
