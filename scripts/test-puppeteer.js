#!/usr/bin/env node

import puppeteer from 'puppeteer';

async function test() {
  console.log('1. Launching browser...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });
    console.log('2. Browser launched successfully');
  } catch (err) {
    console.error('Failed to launch browser:', err.message);
    process.exit(1);
  }

  let page;
  try {
    page = await browser.newPage();
    console.log('3. Page created');
  } catch (err) {
    console.error('Failed to create page:', err.message);
    await browser.close();
    process.exit(1);
  }

  page.on('console', msg => console.log('   PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('   PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.log('   REQUEST FAILED:', req.url(), req.failure()?.errorText));

  try {
    console.log('4. Navigating to http://127.0.0.1:8080/custom-rankings.php ...');

    const response = await page.goto('http://127.0.0.1:8080/custom-rankings.php', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('5. Response status:', response?.status());
    console.log('6. Page title:', await page.title());

    // Wait for scripts to load
    console.log('7. Waiting for scripts to load...');
    await new Promise(r => setTimeout(r, 3000));

    // Check if customRankingInterface exists
    const hasInterface = await page.evaluate(() => {
      return typeof customRankingInterface !== 'undefined';
    });
    console.log('8. customRankingInterface exists:', hasInterface);

    if (hasInterface) {
      console.log('\n✅ SUCCESS! The page loaded correctly.');
      console.log('   The generate.js script should work now.');
    } else {
      console.log('\n⚠️ Page loaded but interface not found.');
      console.log('   There might be a JavaScript error.');
    }

    console.log('\nBrowser will close in 10 seconds...');
    await new Promise(r => setTimeout(r, 10000));

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.message.includes('socket hang up')) {
      console.log('\nSocket hang up usually means:');
      console.log('  - Browser crashed');
      console.log('  - Connection timeout');
      console.log('  - Port not accessible');
      console.log('\nTry running: curl http://127.0.0.1:8080/');
    }
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

test();
