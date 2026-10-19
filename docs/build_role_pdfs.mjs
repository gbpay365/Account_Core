import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rolesDir = path.resolve(__dirname, 'roles');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const roleGuides = [
  { file: 'ACCOUNTING_CLERK_GUIDE', title: 'LedgerCore Health — Role Guide: Accounting Clerk' },
  { file: 'BIOMEDICAL_AND_ASSET_MANAGER_GUIDE', title: 'LedgerCore Health — Role Guide: Biomedical & Asset Manager' },
  { file: 'CFO_AND_CHIEF_ACCOUNTANT_GUIDE', title: 'LedgerCore Health — Role Guide: CFO & Chief Accountant' },
  { file: 'SYSTEM_ADMINISTRATOR_GUIDE', title: 'LedgerCore Health — Role Guide: System Administrator' },
  { file: 'TECHNICIAN_AND_GENERAL_SERVICES_GUIDE', title: 'LedgerCore Health — Role Guide: Technicians & General Services' },
];

async function generateRolePdfs() {
  console.log('Launching browser to generate role PDFs with page numbers...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const role of roleGuides) {
    const htmlPath = path.resolve(rolesDir, `${role.file}.html`);
    const pdfPath = path.resolve(rolesDir, `${role.file}.pdf`);

    if (!fs.existsSync(htmlPath)) {
      console.warn(`HTML file not found: ${htmlPath}, skipping...`);
      continue;
    }

    console.log(`Generating PDF for ${role.file}...`);
    const page = await browser.newPage();
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1500));

    const headerTemplate = `
      <div style="font-size: 8pt; width: 100%; text-align: right; padding-right: 15mm; color: #94a3b8; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
        <span>${role.title}</span>
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

    await page.close();
    const size = fs.statSync(pdfPath).size;
    console.log(`Successfully generated ${role.file}.pdf (${size} bytes)`);
  }

  await browser.close();
  console.log('All role PDFs generated successfully.');
}

generateRolePdfs().catch(err => {
  console.error('Error generating role PDFs:', err);
  process.exit(1);
});
