import 'server-only';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

export async function resolveWithBrowser(url: string): Promise<{ url: string; filename?: string } | null> {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] 
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Tunggu Cloudflare Turnstile selesai (jika ada)
    await page.waitForFunction(() => {
      const cf = document.querySelector('#challenge-stage, .cf-turnstile, iframe[src*="turnstile"]');
      return !cf;
    }, { timeout: 15000 }).catch(() => {});

    // Untuk Modsfire: klik GENERATE LINK jika ada
    const btnGenerate = await page.$('button:has-text("GENERATE LINK"), a:has-text("GENERATE LINK")');
    if (btnGenerate) {
      await btnGenerate.click();
      await page.waitForSelector('a.download-button[href]', { timeout: 15000 });
    }

    // Untuk SFL/AdLinkFly: klik tombol lanjut jika ada
    const btnNext = await page.$('a:has-text("Continue"), button:has-text("Continue"), a:has-text("Next")');
    if (btnNext) {
      await btnNext.click();
    }

    // Tunggu navigasi ke halaman final (bisa file atau artikel)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    
    const finalUrl = page.url();
    
    // Jika ada tombol download langsung, ambil href-nya
    const downloadHref = await page.$eval('a.download-button[href]', (el) => (el as HTMLAnchorElement).href).catch(() => null);

    await browser.close();
    return { url: downloadHref || finalUrl };
  } catch (err) {
    await browser.close();
    return null;
  }
}
