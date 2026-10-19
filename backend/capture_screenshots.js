import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsImagesDir = path.resolve(__dirname, '../docs/images');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching Chrome via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:8700/login', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    
    // Screenshot Login Page
    await page.screenshot({ path: path.join(docsImagesDir, 'screenshot_login.png') });
    console.log('Captured screenshot_login.png');

    // Fill credentials for Grace Ntamack (CFO / Chief Accountant)
    const emailInput = await page.$('input[type="text"], input[type="email"]');
    const passInput = await page.$('input[type="password"]');

    if (emailInput && passInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type('grace.ntamack@hgy.cm');
      await passInput.click({ clickCount: 3 });
      await passInput.type('Ledger@2026');
      
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text && (text.includes('Sign in') || text.includes('Se connecter'))) {
          await btn.click();
          break;
        }
      }

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    const pagesToCapture = [
      { url: 'http://localhost:8700/', name: 'screenshot_dashboard.png' },
      { url: 'http://localhost:8700/journal', name: 'screenshot_journal.png' },
      { url: 'http://localhost:8700/accounts', name: 'screenshot_accounts.png' },
      { url: 'http://localhost:8700/assets', name: 'screenshot_assets.png' },
      { url: 'http://localhost:8700/maintenance', name: 'screenshot_work_orders.png' },
      { url: 'http://localhost:8700/compliance', name: 'screenshot_compliance.png' },
      { url: 'http://localhost:8700/periods', name: 'screenshot_periods_close.png' },
      { url: 'http://localhost:8700/bank-reconciliation', name: 'screenshot_bank_recon.png' },
      { url: 'http://localhost:8700/withholding-tax', name: 'screenshot_withholding_tax.png' },
      { url: 'http://localhost:8700/depreciation', name: 'screenshot_depreciation.png' },
      { url: 'http://localhost:8700/reports', name: 'screenshot_reports.png' },
      { url: 'http://localhost:8700/asset-inventory', name: 'screenshot_asset_inventory.png' },
      { url: 'http://localhost:8700/donor-projects', name: 'screenshot_donor_projects.png' },
      { url: 'http://localhost:8700/payroll', name: 'screenshot_payroll.png' },
      { url: 'http://localhost:8700/cash-registers', name: 'screenshot_cash_registers.png' },
    ];

    for (const item of pagesToCapture) {
      console.log(`Navigating to ${item.url}...`);
      await page.goto(item.url, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 2200));
      const dest = path.join(docsImagesDir, item.name);
      await page.screenshot({ path: dest });
      console.log(`Captured ${item.name}`);
    }

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    console.log('Done.');
  }
}

run();
