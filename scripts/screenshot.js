const { chromium } = require('playwright-core');
const Browserbase = require('@browserbasehq/sdk').default;

// Load env vars
require('dotenv').config({ path: '.env.local' });

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY,
});

async function takeScreenshot(url, outputPath = 'screenshot.png', options = {}) {
  console.log(`Taking screenshot of: ${url}`);
  let browser;

  const width = options.width || 1440;
  const height = options.height || 900;
  const fullPage = options.fullPage || false;

  try {
    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    });

    console.log(`Session: ${session.id}`);

    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 15000 });

    const defaultContext = browser.contexts()[0];
    const page = defaultContext?.pages()[0];

    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: outputPath, fullPage });

    console.log(`Saved: ${outputPath}`);
    return outputPath;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Get URL from command line args
const url = process.argv[2] || 'http://localhost:3000';
const output = process.argv[3] || 'screenshot.png';
const mode = process.argv[4] || 'desktop'; // desktop, mobile, full

const options = {
  desktop: { width: 1440, height: 900, fullPage: false },
  mobile: { width: 390, height: 844, fullPage: false },
  full: { width: 1440, height: 900, fullPage: true },
  mobilefull: { width: 390, height: 844, fullPage: true },
};

takeScreenshot(url, output, options[mode] || options.desktop).catch(console.error);
