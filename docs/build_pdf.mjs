import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(__dirname, 'USER_GUIDE.html');
const pdfPath = path.resolve(__dirname, 'USER_GUIDE.pdf');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function generatePdf() {
  console.log('Generating PDF via Puppeteer with exact page numbers...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Navigate to local HTML file
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const headerTemplate = `
    <div style="font-size: 8pt; width: 100%; text-align: right; padding-right: 15mm; color: #94a3b8; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
      <span>LedgerCore Health — Comprehensive User Guide &amp; Operational Manual</span>
    </div>
  `;

  const footerTemplate = `
    <div style="font-size: 8pt; width: 100%; display: flex; justify-content: space-between; padding: 0 15mm; color: #64748b; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
      <span>Dual-Standard SYSCOHADA Revised (AUDCIF) &amp; IFRS Compliance</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `;

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: headerTemplate,
    footerTemplate: footerTemplate,
    margin: {
      top: '18mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    }
  });

  await browser.close();
  const size = fs.statSync(pdfPath).size;
  console.log(`PDF successfully created at ${pdfPath} (${size} bytes) with custom header and page numbers.`);
}

generatePdf().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
