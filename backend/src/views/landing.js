/**
 * LedgerCore Health — Root Landing Page & API Status Dashboard
 * Rendered when a browser requests GET /
 */

export function renderLandingPage({ env = 'production', version = '1.0.0' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LedgerCore Health — Hospital Accounting & Asset Core</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏥</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-hover-border: rgba(14, 165, 233, 0.3);
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-subtle: #64748b;
      --primary: #0284c7;
      --primary-light: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.15);
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --code-bg: #030712;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(14, 165, 233, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.08) 0px, transparent 50%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 24px;
      width: 100%;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 32px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 40px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-badge {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #0284c7 0%, #0d9488 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 8px 20px rgba(13, 148, 136, 0.3);
    }

    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .brand-subtitle {
      font-size: 13px;
      color: var(--primary-light);
      font-weight: 500;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent-glow);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      color: #34d399;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background-color: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }

    /* Hero */
    .hero {
      text-align: left;
      margin-bottom: 48px;
    }

    .badge-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--primary-light);
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .hero h1 {
      font-size: 38px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.03em;
      margin-bottom: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 16px;
      color: var(--text-muted);
      max-width: 760px;
      line-height: 1.6;
    }

    /* Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(12px);
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .card:hover {
      border-color: var(--card-hover-border);
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    }

    .card-icon {
      font-size: 26px;
      margin-bottom: 14px;
      display: inline-block;
    }

    .card-title {
      font-size: 17px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }

    .card-desc {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.55;
    }

    /* Live Check Box */
    .action-panel {
      background: linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 40px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .panel-title {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0284c7;
      color: #fff;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn:hover {
      background: #0369a1;
      box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
      border: 1px solid var(--card-border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
      box-shadow: none;
    }

    .console-box {
      background: var(--code-bg);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #38bdf8;
      overflow-x: auto;
      max-height: 200px;
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      margin-top: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }

    th {
      color: var(--text-subtle);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      padding: 10px 14px;
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-muted);
    }

    td.bold {
      color: #fff;
      font-weight: 600;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      background: rgba(255, 255, 255, 0.06);
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #38bdf8;
    }

    /* Frontend Guide Banner */
    .banner {
      background: rgba(14, 165, 233, 0.06);
      border: 1px dashed rgba(14, 165, 233, 0.3);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 40px;
    }

    .banner h3 {
      font-size: 16px;
      font-weight: 700;
      color: var(--primary-light);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .banner ol {
      padding-left: 20px;
      color: var(--text-muted);
      font-size: 13.5px;
      line-height: 1.8;
    }

    footer {
      margin-top: auto;
      text-align: center;
      padding: 24px 0;
      border-top: 1px solid var(--card-border);
      color: var(--text-subtle);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">🏥</div>
        <div>
          <div class="brand-title">LedgerCore Health</div>
          <div class="brand-subtitle">Core Accounting & Asset Management Engine</div>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span>
        API Online & Ready
      </div>
    </header>

    <div class="hero">
      <div class="badge-pill">SYSCOHADA AUDCIF & IFRS Dual Core</div>
      <h1>Enterprise Hospital Financial & Asset Management</h1>
      <p>
        High-performance REST API powering statutory accounting, biomedical asset lifecycle tracking,
        Cameroon DGI electronic fiscal invoicing (DFE), and multi-currency treasury operations.
      </p>
    </div>

    <!-- Live Healthcheck Panel -->
    <div class="action-panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>⚡</span> Live API & Database Connectivity
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="checkHealth()">
            <span>🔄</span> Refresh Status
          </button>
          <a href="/api/health" target="_blank" class="btn">
            <span>↗</span> Open /api/health
          </a>
        </div>
      </div>
      <div id="health-console" class="console-box">Testing connection to backend database...</div>
    </div>

    <!-- Core Capabilities -->
    <div class="grid">
      <div class="card">
        <div class="card-icon">📊</div>
        <div class="card-title">Dual-Standard General Ledger</div>
        <div class="card-desc">
          Single book of record with automated divergence handling between SYSCOHADA (Revised AUDCIF) and IFRS (IAS 16, IAS 36, IFRS 16 leases).
        </div>
      </div>

      <div class="card">
        <div class="card-icon">🩺</div>
        <div class="card-title">Biomedical & Fixed Assets</div>
        <div class="card-desc">
          Complete asset registry, dual depreciation schedules, IEC 60601 safety tests, calibration schedules, work orders, and physical barcode audits.
        </div>
      </div>

      <div class="card">
        <div class="card-icon">📑</div>
        <div class="card-title">Statutory Tax & CEMAC Pack</div>
        <div class="card-desc">
          Automated DSF annual tax tables generation, CEMAC cross-border reporting, withholding tax certificates (AIR/TVA), and DGI fiscal tokens.
        </div>
      </div>

      <div class="card">
        <div class="card-icon">💳</div>
        <div class="card-title">Treasury, Banking & MoMo</div>
        <div class="card-desc">
          Automated bank statements matching, Mobile Money (MTN MoMo & Orange Money) reconciliations, cash registers, and multi-currency FX revaluation.
        </div>
      </div>
    </div>

    <!-- Demonstration Logins -->
    <div class="card" style="margin-bottom: 40px;">
      <div class="card-title" style="margin-bottom: 4px;">👥 Demonstration Accounts (Seeded)</div>
      <div class="card-desc" style="margin-bottom: 16px;">
        Use these credentials to authenticate via the Python NiceGUI frontend or via <code>POST /api/auth/login</code>:
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Name</th>
              <th>Email</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bold">Administrator</td>
              <td>System Admin</td>
              <td><code>admin@ledgercore.health</code></td>
              <td><code>admin123</code></td>
            </tr>
            <tr>
              <td class="bold">Chief Financial Officer</td>
              <td>Grace Ntamack</td>
              <td><code>grace.ntamack@hgy.cm</code></td>
              <td><code>passer123</code></td>
            </tr>
            <tr>
              <td class="bold">Senior Accountant</td>
              <td>Amina Bakari</td>
              <td><code>amina.bakari@hgy.cm</code></td>
              <td><code>passer123</code></td>
            </tr>
            <tr>
              <td class="bold">Biomedical & Asset Manager</td>
              <td>Marcel Ebelle</td>
              <td><code>marcel.ebelle@hgy.cm</code></td>
              <td><code>passer123</code></td>
            </tr>
            <tr>
              <td class="bold">External Auditor</td>
              <td>Ernst & KPMG Joint Audit</td>
              <td><code>audit@ledgercore.health</code></td>
              <td><code>audit123</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Frontend Service Deployment Info -->
    <div class="banner">
      <h3><span>🖥️</span> Need the Web User Interface?</h3>
      <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 12px;">
        This deployment is the <strong>Backend API engine</strong> (Node.js + Express + MySQL 8.4). The interactive web interface is written in <strong>Python (NiceGUI)</strong> under the <code>/frontend</code> directory.
      </p>
      <ol>
        <li><strong>Deploy Frontend on Railway:</strong> In your Railway project, click <strong>+ New &rarr; GitHub Repo &rarr; Account_Core</strong>.</li>
        <li><strong>Set Root Directory:</strong> In the new service's settings, set <strong>Root Directory</strong> to <code>/frontend</code>.</li>
        <li><strong>Set Environment Variable:</strong> Add <code>API_BASE_URL=https://ledgercore.up.railway.app/api</code>.</li>
        <li><strong>Generate Public Domain:</strong> Railway will provide your live web application URL (e.g., <code>https://ledgercore-ui.up.railway.app</code>).</li>
      </ol>
    </div>

    <footer>
      LedgerCore Health v${version} &bull; Environment: ${env} &bull; Cameroon & CEMAC Region Hospital Ledger
    </footer>
  </div>

  <script>
    async function checkHealth() {
      const consoleEl = document.getElementById('health-console');
      consoleEl.innerHTML = '<span style="color: #94a3b8;">Connecting to /api/health...</span>';
      const t0 = performance.now();
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        const elapsed = Math.round(performance.now() - t0);
        consoleEl.innerHTML = 
          '<span style="color: #34d399; font-weight: 600;">✓ 200 OK (' + elapsed + 'ms)</span>\\n' +
          JSON.stringify(data, null, 2);
      } catch (err) {
        consoleEl.innerHTML = 
          '<span style="color: #f87171;">✕ Failed to fetch /api/health:</span> ' + err.message;
      }
    }
    // Auto-run on page load
    checkHealth();
  </script>
</body>
</html>`;
}
