"""
Build script to generate standalone publication-grade HTML and PDF for the Budget Module User Guide.
"""

import os
import re
import subprocess
from pathlib import Path
import markdown2

DOCS_DIR = Path(__file__).resolve().parent
MD_PATH = DOCS_DIR / 'BUDGET_MODULE_USER_GUIDE.md'
HTML_PATH = DOCS_DIR / 'BUDGET_MODULE_USER_GUIDE.html'
PDF_PATH = DOCS_DIR / 'BUDGET_MODULE_USER_GUIDE.pdf'

def get_browser_path():
    chrome = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if chrome.exists():
        return str(chrome)
    edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if edge.exists():
        return str(edge)
    edge_64 = Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")
    if edge_64.exists():
        return str(edge_64)
    return None

def build():
    print(f"Reading {MD_PATH}...")
    md_content = MD_PATH.read_text(encoding='utf-8')

    # Convert markdown to HTML with markdown2
    extras = ['fenced-code-blocks', 'tables', 'header-ids', 'toc', 'strike', 'metadata']
    html_body = markdown2.markdown(md_content, extras=extras)

    # Convert GitHub-style alerts > [!NOTE] etc.
    alert_patterns = [
        (r'<blockquote>\s*<p>\s*\[!NOTE\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-note"><div class="callout-title">ℹ️ NOTE</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!TIP\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-tip"><div class="callout-title">💡 TIP</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!IMPORTANT\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-important"><div class="callout-title">⚠️ IMPORTANT</div><p>\1</p></div>'),
        (r'<blockquote>\s*<p>\s*\[!WARNING\]\s*(.*?)</p>\s*</blockquote>', r'<div class="callout callout-warning"><div class="callout-title">🚨 WARNING</div><p>\1</p></div>'),
    ]
    for pattern, repl in alert_patterns:
        html_body = re.sub(pattern, repl, html_body, flags=re.DOTALL | re.IGNORECASE)

    # Wrap tables in responsive divs
    html_body = re.sub(r'(<table>.*?</table>)', r'<div class="table-container">\1</div>', html_body, flags=re.DOTALL)

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LedgerCore — Budget Module & Commitment Control Manual</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
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
      --indigo: #4338ca;
      --indigo-light: #e0e7ff;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--slate-800);
      background-color: var(--slate-50);
      line-height: 1.65;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
    }}

    /* Top Navigation Bar */
    .top-header {{
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      color: white;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.75rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }}

    .header-logo {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1.25rem;
      letter-spacing: -0.02em;
    }}

    .header-logo .badge {{
      background: var(--primary);
      color: white;
      font-size: 0.7rem;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}

    .header-actions {{
      display: flex;
      gap: 0.5rem;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
    }}

    .btn:hover {{
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.3);
    }}

    .btn-primary {{
      background: var(--primary);
      border-color: var(--primary-dark);
    }}

    .btn-primary:hover {{
      background: var(--primary-dark);
    }}

    /* Main Container */
    .container {{
      max-width: 1040px;
      margin: 2rem auto;
      background: white;
      border-radius: 16px;
      border: 1px solid var(--slate-200);
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.05);
      padding: 3.5rem 4rem;
    }}

    /* Typography */
    h1, h2, h3, h4, h5, h6 {{
      font-family: 'Outfit', sans-serif;
      color: var(--slate-900);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }}

    h1 {{
      font-size: 2.4rem;
      line-height: 1.2;
      border-bottom: 2px solid var(--slate-200);
      padding-bottom: 0.75rem;
      margin-top: 0;
      color: var(--navy);
    }}

    h2 {{
      font-size: 1.65rem;
      line-height: 1.3;
      border-bottom: 1px solid var(--slate-200);
      padding-bottom: 0.5rem;
      margin-top: 2.75rem;
      color: var(--slate-900);
    }}

    h3 {{
      font-size: 1.3rem;
      margin-top: 1.75rem;
      color: var(--primary-dark);
    }}

    h4 {{
      font-size: 1.1rem;
      margin-top: 1.25rem;
    }}

    p {{
      margin-bottom: 1.1rem;
    }}

    ul, ol {{
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
    }}

    li {{
      margin-bottom: 0.4rem;
    }}

    hr {{
      border: 0;
      border-top: 1px solid var(--slate-200);
      margin: 2.5rem 0;
    }}

    strong {{
      color: var(--slate-900);
    }}

    /* Code Blocks */
    pre {{
      background: var(--navy);
      color: #f8fafc;
      padding: 1.25rem;
      border-radius: 10px;
      overflow-x: auto;
      font-family: 'Fira Code', monospace;
      font-size: 0.88rem;
      margin-bottom: 1.5rem;
      border: 1px solid var(--navy-light);
      line-height: 1.5;
    }}

    code {{
      font-family: 'Fira Code', monospace;
      font-size: 0.88em;
      background: var(--slate-100);
      color: var(--navy);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid var(--slate-200);
    }}

    pre code {{
      background: transparent;
      color: inherit;
      padding: 0;
      border: none;
    }}

    /* Tables */
    .table-container {{
      width: 100%;
      overflow-x: auto;
      margin: 1.5rem 0;
      border-radius: 8px;
      border: 1px solid var(--slate-200);
    }}

    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      text-align: left;
    }}

    th {{
      background: var(--slate-100);
      color: var(--slate-900);
      font-weight: 600;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid var(--slate-300);
    }}

    td {{
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--slate-200);
      vertical-align: top;
    }}

    tr:nth-child(even) td {{
      background-color: var(--slate-50);
    }}

    tr:hover td {{
      background-color: rgba(13, 148, 136, 0.04);
    }}

    /* Callouts */
    .callout {{
      padding: 1.1rem 1.4rem;
      border-radius: 10px;
      margin: 1.5rem 0;
      border-left: 4px solid;
    }}

    .callout-title {{
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}

    .callout-note {{
      background: #f0fdf4;
      border-color: var(--primary);
      color: #14532d;
    }}
    .callout-note .callout-title {{ color: var(--primary-dark); }}

    .callout-tip {{
      background: #f0f9ff;
      border-color: var(--sky);
      color: #075985;
    }}
    .callout-tip .callout-title {{ color: var(--sky); }}

    .callout-important {{
      background: #fefce8;
      border-color: var(--amber);
      color: #713f12;
    }}
    .callout-important .callout-title {{ color: var(--amber); }}

    .callout-warning {{
      background: #fff1f2;
      border-color: var(--rose);
      color: #881337;
    }}
    .callout-warning .callout-title {{ color: var(--rose); }}

    /* Print Formatting */
    @media print {{
      .top-header {{
        display: none;
      }}
      body {{
        background: white;
        font-size: 11pt;
      }}
      .container {{
        box-shadow: none;
        border: none;
        padding: 0;
        margin: 0;
        max-width: 100%;
      }}
      h2 {{
        page-break-before: always;
      }}
      pre, table, .callout {{
        page-break-inside: avoid;
      }}
    }}
  </style>
</head>
<body>
  <header class="top-header">
    <div class="header-logo">
      <span>💰 LedgerCore</span>
      <span class="badge">Budget Module</span>
      <span style="font-size: 0.85rem; font-weight: 400; color: #94a3b8;">User Guide & Manual</span>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="window.print()">🖨️ Print / Save PDF</button>
      <a class="btn btn-primary" href="/budgeting">🚀 Open Budget Module</a>
    </div>
  </header>

  <main class="container">
    {html_body}
  </main>
</body>
</html>
"""

    print(f"Writing {HTML_PATH}...")
    HTML_PATH.write_text(html_template, encoding='utf-8')
    print(f"HTML Manual successfully created at {HTML_PATH} ({os.path.getsize(HTML_PATH)} bytes).")

    # Generate PDF fallback with Chrome/Edge headless
    browser = get_browser_path()
    if browser:
        print(f"Found browser at {browser}. Generating PDF...")
        cmd = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--run-all-compositor-stages-before-draw",
            f"--print-to-pdf={PDF_PATH}",
            "--no-pdf-header-footer",
            str(HTML_PATH)
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"PDF Manual successfully created at {PDF_PATH} ({os.path.getsize(PDF_PATH)} bytes).")
        except Exception as e:
            print(f"Browser PDF generation warning: {e}")

if __name__ == '__main__':
    build()
