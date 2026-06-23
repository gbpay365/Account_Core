import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/authService';

const Login: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [loginName, setLoginName] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.login(loginName, password);
      window.location.href = '/';
    } catch (err) {
      const errorMessage = err && typeof err === 'object' && 'response' in err 
        ? (err.response as { data?: { error?: string } })?.data?.error 
        : t('login.error_invalid');
      setError(errorMessage || t('login.error_invalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-mesh)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Decorative blobs with floating animation */}
      <div className="animate-float" style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div className="animate-float" style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40vw', height: '40vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,0.1) 0%, transparent 70%)', pointerEvents: 'none', animationDelay: '-4s' }} />
      <div className="animate-float" style={{ position: 'absolute', top: '20%', right: '10%', width: '20vw', height: '20vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,180,252,0.08) 0%, transparent 70%)', pointerEvents: 'none', animationDelay: '-2s' }} />

      <div className="glass-panel animate-fade-in" style={{ 
        width: '440px', 
        padding: '40px 48px', 
        position: 'relative', 
        zIndex: 1,
        border: '1px solid rgba(255, 255, 255, 0.4)',
        background: 'rgba(255, 255, 255, 0.45)',
        boxShadow: '0 20px 50px rgba(31, 38, 135, 0.1)'
      }}>
        {/* Logo / Brand with pulsing effect */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div className="animate-pulse-slow" style={{
            width: '64px', height: '64px', borderRadius: '18px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', margin: '0 auto 16px',
            boxShadow: '0 10px 24px rgba(79,70,229,0.3)',
            transformOrigin: 'center'
          }}>💎</div>
          <h1 className="animate-slide-in" style={{ 
            margin: 0, 
            fontSize: '1.8rem', 
            fontFamily: 'var(--font-heading)', 
            fontWeight: 800,
            background: 'linear-gradient(to bottom, #1e293b, #475569)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animationDelay: '0.1s'
          }}>
            {t('login.title')}
          </h1>
          <p className="animate-slide-in" style={{ 
            margin: '8px 0 0', 
            color: 'var(--text-muted)', 
            fontSize: '0.95rem', 
            lineHeight: 1.4,
            fontWeight: 400,
            animationDelay: '0.2s'
          }}>
            {t('login.subtitle')}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="animate-fade-in" style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px', padding: '10px 16px', marginBottom: '20px',
            color: 'var(--color-danger)', fontSize: '0.9rem', fontWeight: 500
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Login name */}
          <div className="animate-slide-in" style={{ animationDelay: '0.3s', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                required
                autoComplete="username"
                placeholder=" "
                id="login-name-input"
                style={{
                  width: '100%', padding: '22px 14px 8px', borderRadius: '12px',
                  border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)',
                  fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 500,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => { 
                  e.target.style.borderColor = 'var(--color-primary)'; 
                  e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)';
                  e.target.style.background = '#fff';
                }}
                onBlur={e => { 
                  e.target.style.borderColor = 'rgba(0,0,0,0.08)'; 
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = 'rgba(255,255,255,0.8)';
                }}
              />
              <label 
                htmlFor="login-name-input"
                style={{ 
                  position: 'absolute', left: '14px', top: loginName ? '6px' : '16px', 
                  fontSize: loginName ? '0.7rem' : '0.95rem', color: loginName ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  transition: 'all 0.2s ease', pointerEvents: 'none'
                }}
              >
                {t('login.login_name', 'Login name')}
              </label>
              <span style={{ position: 'absolute', right: '14px', top: '16px', opacity: 0.5, fontSize: '0.9rem' }}>👤</span>
            </div>
          </div>

          {/* Password Field with Floating Label Effect */}
          <div className="animate-slide-in" style={{ animationDelay: '0.4s', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder=" "
                id="password-input"
                style={{
                  width: '100%', padding: '22px 14px 8px', borderRadius: '12px',
                  border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)',
                  fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 500,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => { 
                  e.target.style.borderColor = 'var(--color-primary)'; 
                  e.target.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.1)';
                  e.target.style.background = '#fff';
                }}
                onBlur={e => { 
                  e.target.style.borderColor = 'rgba(0,0,0,0.08)'; 
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = 'rgba(255,255,255,0.8)';
                }}
              />
              <label 
                htmlFor="password-input"
                style={{ 
                  position: 'absolute', left: '14px', top: password ? '6px' : '16px', 
                  fontSize: password ? '0.7rem' : '0.95rem', color: password ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  transition: 'all 0.2s ease', pointerEvents: 'none'
                }}
              >
                {t('login.password')}
              </label>
              <span style={{ position: 'absolute', right: '14px', top: '16px', opacity: 0.5, fontSize: '0.9rem' }}>🔒</span>
            </div>
          </div>

          {/* Language Toggle */}
          <div className="animate-slide-in" style={{ animationDelay: '0.45s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '-4px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: (i18n.language || '').startsWith('en') ? 'var(--color-primary)' : 'var(--text-muted)', transition: 'all 0.3s ease' }}>ENG</span>
            <div 
              onClick={() => {
                const currentLang = i18n.language || 'en';
                const newLang = currentLang.startsWith('en') ? 'fr' : 'en';
                i18n.changeLanguage(newLang);
                localStorage.setItem('lang', newLang);
              }}
              style={{
                width: '44px', height: '22px', borderRadius: '11px',
                background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)',
                position: 'relative', cursor: 'pointer', transition: 'all 0.3s ease'
              }}
            >
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%',
                background: 'var(--color-primary)', position: 'absolute', top: '2px',
                left: (i18n.language || '').startsWith('en') ? '2px' : '24px',
                transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                boxShadow: '0 2px 6px rgba(79,70,229,0.4)'
              }} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: (i18n.language || '').startsWith('fr') ? 'var(--color-primary)' : 'var(--text-muted)', transition: 'all 0.3s ease' }}>FR</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-glow animate-slide-in"
            style={{ 
              width: '100%', 
              padding: '14px', 
              marginTop: '8px', 
              fontSize: '1rem', 
              fontWeight: 800,
              opacity: loading ? 0.7 : 1,
              animationDelay: '0.5s',
              borderRadius: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              boxShadow: '0 8px 20px rgba(79,70,229,0.3)'
            }}
          >
            {loading ? t('login.loading') : t('login.submit')}
          </button>
        </form>

        <p className="animate-fade-in" style={{ textAlign: 'center', marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.8rem', animationDelay: '0.7s', letterSpacing: '0.2em', fontWeight: 600 }}>
          SYSCOHADA
        </p>
      </div>
    </div>
  );
};

export default Login;

