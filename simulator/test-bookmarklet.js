// Playwright test that runs the bookmarklet against the mock server
// and verifies it actually captures pages without errors.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const MOCK_PORT = 3333;
const MOCK_BASE = `http://localhost:${MOCK_PORT}`;
const HEADLESS = process.env.HEADLESS !== '0';

async function waitForServer(url, maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(url, (r) => { r.resume(); res(); });
        req.on('error', rej);
        req.setTimeout(500, () => req.destroy(new Error('timeout')));
      });
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} did not start within ${maxMs}ms`);
}

// Read the real bookmarklet source and rewrite BASE_URL to point at the mock server.
function loadBookmarkletSource() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bookmarklet-source.js'), 'utf8');
  return src
    .replace("var BASE_URL = 'https://deliobt.kr/transaction';", `var BASE_URL = '${MOCK_BASE}/transaction';`)
    .replace("if (!location.href.includes('deliobt.kr'))", "if (!location.href.includes('localhost'))")
    .replace('https://deliobt.kr/', `${MOCK_BASE}/`);
}

(async () => {
  console.log('[test] waiting for mock server...');
  await waitForServer(`${MOCK_BASE}/transaction?coinType=ETH&page=0`);
  console.log('[test] mock server up');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 }
  });

  const logs = [];
  const page = await context.newPage();
  page.on('console', (msg) => logs.push(`[browser:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[browser:pageerror] ${err.message}`));

  page.on('dialog', async (d) => {
    console.log(`[test] auto-dismissing dialog (${d.type()}): ${d.message()}`);
    if (d.type() === 'prompt') await d.accept('3');
    else await d.accept();
  });

  // Set up download promise BEFORE running bookmarklet
  let downloadPath = null;
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).then(async (dl) => {
    const dest = path.join(__dirname, 'captured.zip');
    await dl.saveAs(dest);
    downloadPath = dest;
    console.log(`[test] download saved to ${dest}`);
  }).catch((e) => {
    console.log(`[test] no download received: ${e.message}`);
  });

  // Disable showSaveFilePicker so the bookmarklet falls back to <a download>
  await context.addInitScript(() => {
    delete window.showSaveFilePicker;
  });

  console.log('[test] opening mock transaction page...');
  await page.goto(`${MOCK_BASE}/transaction?coinType=ETH&page=0`, { waitUntil: 'networkidle' });

  const tableVisible = await page.locator('table.tx-table').isVisible();
  console.log(`[test] table visible on host page: ${tableVisible}`);

  const bookmarkletSrc = loadBookmarkletSource();
  console.log('[test] injecting bookmarklet...');

  // Inject a probe to capture iframe state mid-execution
  await page.evaluate(() => {
    window.__probes = [];
    const origCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
      const el = origCreate(tag);
      if (tag.toLowerCase() === 'iframe') {
        // Watch for srcdoc/src assignment and onload
        const observer = new MutationObserver(() => {
          window.__probes.push({
            time: Date.now(),
            event: 'attr',
            src: el.src || '(none)',
            srcdoc: el.srcdoc ? `[len=${el.srcdoc.length}]` : '(none)'
          });
        });
        observer.observe(el, { attributes: true });
      }
      return el;
    };
  });

  await page.evaluate(bookmarkletSrc);

  const result = await page.waitForFunction(
    () => {
      const s = document.getElementById('dc-s');
      const btn = document.getElementById('dc-x');
      if (!s) return false;
      const text = s.innerHTML;
      const btnText = btn ? btn.textContent : '';
      if (btnText.includes('닫기')) return { status: 'done', text };
      if (text.includes('오류')) return { status: 'error', text };
      return false;
    },
    null,
    { timeout: 60000 }
  ).then((r) => r.jsonValue()).catch((e) => ({ status: 'timeout', text: e.message }));

  // Wait a bit for the download event to fire and complete
  await downloadPromise;

  console.log('\n========== RESULT ==========');
  console.log(`UI status: ${result.status}`);
  console.log(`final UI text: ${result.text.slice(0, 200)}`);

  // Dump iframe probes
  const probes = await page.evaluate(() => window.__probes || []);
  console.log(`\n========== IFRAME PROBES (${probes.length}) ==========`);
  for (const p of probes.slice(0, 8)) console.log(JSON.stringify(p));
  if (probes.length > 8) console.log(`...and ${probes.length - 8} more`);

  // Dump diagnostic info: what's actually in the iframe at the end
  const iframeDiag = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    return iframes.map((f) => {
      let info;
      try {
        info = f.contentDocument
          ? {
              hasDoc: true,
              bodyExists: !!f.contentDocument.body,
              bodyHTML: f.contentDocument.body ? f.contentDocument.body.innerHTML.slice(0, 300) : null,
              tableCount: f.contentDocument.querySelectorAll('table').length
            }
          : { hasDoc: false };
      } catch (e) {
        info = { hasDoc: false, error: e.message };
      }
      return { src: (f.src || '').slice(0, 80), srcdocLen: f.srcdoc ? f.srcdoc.length : 0, ...info };
    });
  });
  console.log(`\n========== IFRAME DIAG ==========`);
  console.log(JSON.stringify(iframeDiag, null, 2));

  console.log('\n========== BROWSER LOGS (last 10) ==========');
  for (const l of logs.slice(-10)) console.log(l);

  // Verify ZIP contents
  let zipOk = false;
  if (downloadPath && fs.existsSync(downloadPath)) {
    const stats = fs.statSync(downloadPath);
    console.log(`\n========== DOWNLOAD ==========`);
    console.log(`file: ${downloadPath}, size: ${stats.size} bytes`);

    // crude PNG-in-ZIP count using JSZip
    const JSZip = require(path.join(__dirname, 'node_modules', 'playwright', 'package.json'))
      ? null  // fallback
      : null;
    try {
      const buf = fs.readFileSync(downloadPath);
      // count PNG signatures
      const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      let count = 0;
      for (let i = 0; i < buf.length - 4; i++) {
        if (buf.slice(i, i + 4).equals(sig)) count++;
      }
      console.log(`PNG signatures found in zip bytes: ${count}`);
      zipOk = count >= 3; // expecting 3 pages
    } catch (e) {
      console.log(`could not inspect zip: ${e.message}`);
    }
  } else {
    console.log(`\n========== DOWNLOAD ==========`);
    console.log(`NO FILE DOWNLOADED`);
  }

  await browser.close();

  const success = result.status === 'done' && zipOk;
  console.log(`\n========== FINAL ==========`);
  console.log(`PASS: ${success}`);
  process.exit(success ? 0 : 1);
})();
