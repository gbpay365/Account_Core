"""
Build script to compile all role-specific operational handbooks in docs/roles/
into publication-grade standalone HTML and PDF manuals with exact page numbers.
"""

import os
import re
import subprocess
from pathlib import Path
import markdown2

DOCS_DIR = Path(__file__).resolve().parent
ROLES_DIR = DOCS_DIR / 'roles'

ROLE_CONFIGS = [
    {
        'file': 'ACCOUNTING_CLERK_GUIDE',
        'title': 'LedgerCore Health — Role Guide: Accounting Clerk',
        'subtitle': 'Operational Voucher Capture, Supplier Invoicing & Cash Desk Operations',
        'badge': 'Accounting Clerk Handbook',
        'badge_color': 'badge-teal'
    },
    {
        'file': 'BIOMEDICAL_AND_ASSET_MANAGER_GUIDE',
        'title': 'LedgerCore Health — Role Guide: Biomedical & Asset Manager',
        'subtitle': 'Medical Equipment Lifecycle, CMMS Maintenance & Regulatory Safety',
        'badge': 'Biomedical & CMMS Handbook',
        'badge_color': 'badge-teal'
    },
    {
        'file': 'CFO_AND_CHIEF_ACCOUNTANT_GUIDE',
        'title': 'LedgerCore Health — Role Guide: CFO & Chief Accountant',
        'subtitle': 'Strategic Financial Governance, Statutory Reporting & Compliance',
        'badge': 'CFO & Chief Accountant Handbook',
        'badge_color': 'badge-teal'
    },
    {
        'file': 'SYSTEM_ADMINISTRATOR_GUIDE',
        'title': 'LedgerCore Health — Role Guide: System Administrator',
        'subtitle': 'System Deployment, RBAC Provisioning, Database Maintenance & Cryptographic Security',
        'badge': 'SysAdmin & Security Handbook',
        'badge_color': 'badge-navy'
    },
    {
        'file': 'TECHNICIAN_AND_GENERAL_SERVICES_GUIDE',
        'title': 'LedgerCore Health — Role Guide: Technicians & General Services',
        'subtitle': 'Field Execution, Work Orders, Errand Purchasing & Vehicle Fleet Dispatch',
        'badge': 'Technician & Fleet Handbook',
        'badge_color': 'badge-amber'
    },
]

CSS_STYLES = """
    :root {
      --primary: #0d9488;
      --primary-dark: #0f766e;
      --primary-light: #ccfbf1;
      --navy: #0f172a;
      --navy-light: #1e293b;
      --slate-50: #f8fafc;
      --slate-100: #f1f5f9;
      --slate-200: #e2e8f0;
      --slate-300: #cbd5e1;
      --slate-600: #475569;
      --slate-700: #334155;
      --slate-800: #1e293b;
      --slate-900: #0f172a;
      --amber: #d97706;
      --amber-light: #fef3c7;
      --rose: #e11d48;
      --rose-light: #ffe4e6;
      --sky: #0284c7;
      --sky-light: #e0f2fe;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--slate-800);
      background-color: var(--slate-50);
      line-height: 1.65;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
    }

    /* Top Navigation Bar */
    .top-header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      color: white;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.75rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.2);
    }

    .logo-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 1.5rem;
    }

    .logo-title {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .logo-subtitle {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.9rem;
      border-radius: 8px;
      font-size: 0.825rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-dark);
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3);
    }

    .btn-outline {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-outline:hover {
      background: rgba(255, 255, 255, 0.15);
      color: white;
    }

    /* Layout */
    .app-container {
      display: flex;
      max-width: 1440px;
      margin: 0 auto;
      min-height: calc(100vh - 65px);
    }

    /* Sidebar Navigation */
    .sidebar {
      width: 290px;
      background: white;
      border-right: 1px solid var(--slate-200);
      padding: 1.5rem 1rem;
      position: sticky;
      top: 65px;
      height: calc(100vh - 65px);
      overflow-y: auto;
      flex-shrink: 0;
    }

    .search-box {
      margin-bottom: 1.25rem;
    }

    .search-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--slate-200);
      font-size: 0.85rem;
      background: var(--slate-50);
      color: var(--slate-800);
      outline: none;
      transition: border-color 0.2s ease;
    }

    .search-input:focus {
      border-color: var(--primary);
      background: white;
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
    }

    .nav-section-title {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin: 1rem 0 0.4rem 0.5rem;
    }

    .nav-list {
      list-style: none;
    }

    .nav-item a {
      display: block;
      padding: 0.45rem 0.75rem;
      border-radius: 6px;
      color: var(--slate-600);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-item a:hover {
      background: var(--slate-100);
      color: var(--primary-dark);
    }

    /* Main Content */
    .main-content {
      flex: 1;
      min-width: 0;
      padding: 3rem 4rem;
      background: white;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.03);
    }

    /* Document Header Hero */
    .doc-hero {
      border-bottom: 2px solid var(--slate-100);
      padding-bottom: 1.75rem;
      margin-bottom: 2.25rem;
    }

    .doc-badges {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge-teal {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .badge-navy {
      background: #e2e8f0;
      color: var(--navy);
    }

    .badge-amber {
      background: var(--amber-light);
      color: var(--amber);
    }

    /* Typography */
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--navy);
      line-height: 1.25;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }

    h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--navy);
      margin: 2.75rem 0 1.15rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--slate-200);
      letter-spacing: -0.015em;
    }

    h3 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--slate-800);
      margin: 1.5rem 0 0.65rem;
    }

    h4 {
      font-family: 'Outfit', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      color: var(--slate-700);
      margin: 1.25rem 0 0.5rem;
    }

    p {
      margin-bottom: 1.15rem;
      color: var(--slate-700);
    }

    ul, ol {
      margin-bottom: 1.25rem;
      padding-left: 1.6rem;
      color: var(--slate-700);
    }

    li {
      margin-bottom: 0.4rem;
    }

    hr {
      border: none;
      border-top: 1px solid var(--slate-200);
      margin: 2rem 0;
    }

    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 1.5rem 0;
      border: 1px solid var(--slate-200);
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    th {
      background: var(--slate-50);
      color: var(--slate-800);
      font-weight: 700;
      padding: 0.85rem 1rem;
      border-bottom: 2px solid var(--slate-200);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--slate-200);
      color: var(--slate-700);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(241, 245, 249, 0.5);
    }

    /* Code Blocks */
    code {
      font-family: 'Fira Code', monospace;
      font-size: 0.85em;
      background: var(--slate-100);
      color: #b91c1c;
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
    }

    pre {
      background: var(--navy);
      color: #f8fafc;
      padding: 1.25rem;
      border-radius: 10px;
      overflow-x: auto;
      margin: 1.25rem 0;
      font-size: 0.85rem;
      line-height: 1.5;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    /* Callout Alerts */
    .callout {
      border-left: 4px solid;
      padding: 1rem 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.5rem 0;
      font-size: 0.9rem;
    }

    .callout-title {
      font-weight: 700;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .callout-note {
      background: var(--sky-light);
      border-color: var(--sky);
      color: #0369a1;
    }

    .callout-tip {
      background: var(--primary-light);
      border-color: var(--primary);
      color: #0f766e;
    }

    .callout-important {
      background: var(--amber-light);
      border-color: var(--amber);
      color: #92400e;
    }

    .callout-warning {
      background: var(--rose-light);
      border-color: var(--rose);
      color: #9f1239;
    }

    /* Images & Figures */
    .doc-figure {
      margin: 2rem auto;
      text-align: center;
      max-width: 900px;
    }

    .doc-figure img, img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08);
      border: 1px solid var(--slate-200);
      margin: 0.5rem auto;
      display: block;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .doc-figure img:hover, img:hover {
      box-shadow: 0 20px 30px -10px rgba(15, 23, 42, 0.2);
    }

    .figure-caption {
      font-size: 0.825rem;
      color: var(--slate-600);
      font-style: italic;
      display: block;
      text-align: center;
      margin-top: 0.5rem;
      margin-bottom: 1.5rem;
    }

    em {
      font-style: italic;
      color: inherit;
    }

    /* Print Styles for PDF Rendering */
    @media print {
      @page {
        size: A4;
        margin: 12mm 15mm 15mm 15mm;
      }

      body {
        background: white !important;
        font-size: 10pt !important;
        line-height: 1.4 !important;
        color: #0f172a !important;
      }

      .top-header, .sidebar, .header-actions {
        display: none !important;
      }

      .app-container {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
      }

      .main-content {
        padding: 0 !important;
        box-shadow: none !important;
      }

      h1 {
        font-size: 20pt !important;
        margin-top: 0 !important;
        page-break-before: avoid;
        color: #0f172a !important;
      }

      h2 {
        font-size: 14pt !important;
        margin-top: 20pt !important;
        page-break-before: auto;
        page-break-after: avoid;
        color: #0f172a !important;
        border-bottom: 1.5pt solid #cbd5e1 !important;
      }

      h3 {
        font-size: 11pt !important;
        margin-top: 12pt !important;
        page-break-after: avoid;
        color: #1e293b !important;
      }

      h4 {
        font-size: 10pt !important;
        margin-top: 10pt !important;
        page-break-after: avoid;
        color: #334155 !important;
      }

      .doc-figure {
        margin: 8pt auto 6pt !important;
        text-align: center !important;
        page-break-inside: avoid !important;
      }

      .doc-figure img, img {
        max-width: 85% !important;
        max-height: 220pt !important;
        width: auto !important;
        height: auto !important;
        margin: 4pt auto 2pt !important;
        display: block !important;
        page-break-inside: avoid !important;
        box-shadow: none !important;
        border: 1pt solid #cbd5e1 !important;
        border-radius: 4pt !important;
      }

      .figure-caption {
        font-size: 7.5pt !important;
        color: #475569 !important;
        font-style: italic !important;
        display: block !important;
        text-align: center !important;
        margin-top: 2pt !important;
        margin-bottom: 6pt !important;
        page-break-before: avoid !important;
      }

      em {
        font-style: italic !important;
        color: inherit !important;
        display: inline !important;
        margin: 0 !important;
        text-align: inherit !important;
      }

      table, pre, .callout {
        page-break-inside: avoid;
      }

      .table-container {
        box-shadow: none !important;
        border: 1pt solid #cbd5e1 !important;
      }

      th {
        background: #f1f5f9 !important;
        color: #0f172a !important;
      }

      a {
        text-decoration: none !important;
        color: inherit !important;
      }
    }
"""

def build_role_manuals():
    extras = ['fenced-code-blocks', 'tables', 'header-ids', 'toc', 'strike', 'metadata']
    alert_patterns = [
        (r'<blockquote>\s*<p>\s*\[!NOTE\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-note"><div class="callout-title">ℹ️ NOTE</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!TIP\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-tip"><div class="callout-title">💡 TIP</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!IMPORTANT\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-important"><div class="callout-title">⚠️ IMPORTANT</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!WARNING\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-warning"><div class="callout-title">🚨 WARNING</div><p>\1</p></div>'),
    ]

    for config in ROLE_CONFIGS:
        base_name = config['file']
        md_path = ROLES_DIR / f"{base_name}.md"
        html_path = ROLES_DIR / f"{base_name}.html"
        pdf_name = f"{base_name}.pdf"

        if not md_path.exists():
            print(f"Skipping {base_name}: {md_path} not found.")
            continue

        print(f"Processing role guide: {base_name}.md...")
        md_content = md_path.read_text(encoding='utf-8')

        # Convert to HTML
        html_body = markdown2.markdown(md_content, extras=extras)

        # Callout alerts
        for pattern, repl in alert_patterns:
            html_body = re.sub(pattern, repl, html_body, flags=re.DOTALL | re.IGNORECASE)

        # Wrap tables
        html_body = re.sub(r'(<table>.*?</table>)', r'<div class="table-container">\1</div>', html_body, flags=re.DOTALL)

        # Wrap images and captions into semantic <figure class="doc-figure">
        fig_pattern = re.compile(r'<p>\s*(<img\s+[^>]*src="[^"]+"[^>]*>)\s*<em>(Figure\s+\d+:?[^<]*)</em>\s*</p>', re.DOTALL | re.IGNORECASE)
        html_body = fig_pattern.sub(r'<figure class="doc-figure">\1<figcaption class="figure-caption">\2</figcaption></figure>', html_body)

        html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{config['title']}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
{CSS_STYLES}
  </style>
</head>
<body>

  <header class="top-header">
    <div class="logo-group">
      <span class="logo-icon">🏥</span>
      <div>
        <div class="logo-title">LedgerCore Health</div>
        <div class="logo-subtitle">{config['title']}</div>
      </div>
    </div>
    <div class="header-actions">
      <a href="../USER_GUIDE.html" class="btn btn-outline">🏠 Comprehensive Manual</a>
      <button class="btn btn-outline" onclick="window.print()">🖨️ Print / PDF</button>
      <a href="{pdf_name}" class="btn btn-primary" download>📥 Download Role PDF</a>
    </div>
  </header>

  <div class="app-container">
    <aside class="sidebar">
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="🔍 Search guide..." onkeyup="filterNav()">
      </div>
      <div id="navContainer">
        <!-- Sidebar Navigation Links Generated Dynamically -->
      </div>
    </aside>

    <main class="main-content" id="mainArticle">
      <div class="doc-hero">
        <div class="doc-badges">
          <span class="badge {config['badge_color']}">{config['badge']}</span>
          <span class="badge badge-navy">SYSCOHADA Revised (AUDCIF)</span>
          <span class="badge badge-teal">IFRS Standards</span>
        </div>
      </div>

      {html_body}
    </main>
  </div>

  <script>
    document.addEventListener("DOMContentLoaded", function() {{
      const main = document.getElementById("mainArticle");
      const headings = main.querySelectorAll("h2, h3");
      const nav = document.getElementById("navContainer");
      let currentList = null;

      headings.forEach((h, index) => {{
        if (!h.id) {{
          h.id = "sec-" + index + "-" + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        }}

        if (h.tagName === "H2") {{
          const sectionTitle = document.createElement("div");
          sectionTitle.className = "nav-section-title";
          sectionTitle.textContent = h.textContent;
          nav.appendChild(sectionTitle);

          currentList = document.createElement("ul");
          currentList.className = "nav-list";
          nav.appendChild(currentList);
        }}

        const li = document.createElement("li");
        li.className = "nav-item";
        const a = document.createElement("a");
        a.href = "#" + h.id;
        a.textContent = (h.tagName === "H3" ? "↳ " : "") + h.textContent;
        li.appendChild(a);

        if (currentList) {{
          currentList.appendChild(li);
        }} else {{
          const ul = document.createElement("ul");
          ul.className = "nav-list";
          ul.appendChild(li);
          nav.appendChild(ul);
        }}
      }});
    }});

    function filterNav() {{
      const query = document.getElementById("searchInput").value.toLowerCase();
      const items = document.querySelectorAll(".nav-item");
      items.forEach(item => {{
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? "block" : "none";
      }});
    }}
  </script>
</body>
</html>
"""
        html_path.write_text(html_template, encoding='utf-8')
        print(f"Generated standalone HTML: {html_path.name}")

    # Generate PDFs via Puppeteer script
    pdf_script = DOCS_DIR / 'build_role_pdfs.mjs'
    print(f"Executing Puppeteer PDF generation via {pdf_script}...")
    try:
        res = subprocess.run(['node', str(pdf_script)], capture_output=True, text=True, check=True)
        print(res.stdout)
        print("All role PDFs successfully generated.")
    except Exception as e:
        print(f"Role PDF generation encountered an issue: {e}")

if __name__ == '__main__':
    build_role_manuals()
