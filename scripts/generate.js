#!/usr/bin/env node

/**
 * PvPoke Rankings Generator
 *
 * Usage:
 *   ./generate.sh --cup all --league 1500
 *   ./generate.sh --config cups/championship2026.json
 */

import puppeteer from 'puppeteer';
import ora from 'ora';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Copy directory recursively
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

// Load moves.json and create moveId -> type lookup
function loadMoveTypes() {
  const movesPath = path.join(projectRoot, 'src', 'data', 'gamemaster', 'moves.json');
  const moves = JSON.parse(fs.readFileSync(movesPath, 'utf8'));
  const moveTypes = {};
  for (const move of moves) {
    moveTypes[move.moveId] = move.type;
  }
  return moveTypes;
}

// Enhance rankings file with opponent move data
function enhanceRankingsFile(filePath, moveTypes) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rankings = JSON.parse(content);

  // Build speciesId -> moveset lookup
  const movesetLookup = {};
  for (const pokemon of rankings) {
    if (pokemon.speciesId && pokemon.moveset) {
      movesetLookup[pokemon.speciesId] = pokemon.moveset;
    }
  }

  // Enhance each Pokemon's moveset, matchups and counters
  for (const pokemon of rankings) {
    // Enhance Pokemon's own moveset with types
    if (pokemon.moveset && Array.isArray(pokemon.moveset)) {
      pokemon.moveset = pokemon.moveset.map(moveId => ({
        moveId,
        type: moveTypes[moveId] || 'unknown'
      }));
    }

    // Enhance matchups
    if (pokemon.matchups) {
      for (const matchup of pokemon.matchups) {
        const opponentMoveset = movesetLookup[matchup.opponent];
        if (opponentMoveset) {
          matchup.moves = opponentMoveset.map(moveId => ({
            moveId,
            type: moveTypes[moveId] || 'unknown'
          }));
        }
      }
    }

    // Enhance counters
    if (pokemon.counters) {
      for (const counter of pokemon.counters) {
        const opponentMoveset = movesetLookup[counter.opponent];
        if (opponentMoveset) {
          counter.moves = opponentMoveset.map(moveId => ({
            moveId,
            type: moveTypes[moveId] || 'unknown'
          }));
        }
      }
    }
  }

  return rankings;
}

// Copy and enhance rankings directory
function copyAndEnhanceRankings(src, dest, moveTypes) {
  if (!fs.existsSync(src)) {
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyAndEnhanceRankings(srcPath, destPath, moveTypes);
    } else if (entry.name.endsWith('.json')) {
      // Enhance rankings JSON files
      const enhanced = enhanceRankingsFile(srcPath, moveTypes);
      fs.writeFileSync(destPath, JSON.stringify(enhanced, null, '\t'));
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

// Copy data to root data folder
function copyDataToRoot(cups) {
  const srcDataBase = path.join(projectRoot, 'src', 'data');
  const destDataBase = path.join(projectRoot, 'data');

  const spinner = ora('Copying data to data/...').start();

  // Copy gamemaster folder
  const gamemasterSrc = path.join(srcDataBase, 'gamemaster');
  const gamemasterDest = path.join(destDataBase, 'gamemaster');
  if (copyDirSync(gamemasterSrc, gamemasterDest)) {
    spinner.text = 'Copied gamemaster';
  }

  // Generate custom formats.json with only the generated cups
  const formats = cups.map(cup => ({
    title: cup.title || cup.name,
    cup: cup.name,
    cp: cup.league,
    meta: cup.name,
    showCup: true,
    showFormat: true,
    showMeta: true
  }));
  const formatsPath = path.join(gamemasterDest, 'formats.json');
  fs.writeFileSync(formatsPath, JSON.stringify(formats, null, '\t'));
  spinner.text = 'Generated custom formats.json';

  // Load move types for enhancing rankings
  const moveTypes = loadMoveTypes();
  spinner.text = 'Loaded move types';

  // Copy and enhance rankings/all folder
  const allSrc = path.join(srcDataBase, 'rankings', 'all');
  const allDest = path.join(destDataBase, 'rankings', 'all');
  if (copyAndEnhanceRankings(allSrc, allDest, moveTypes)) {
    spinner.text = 'Enhanced rankings/all';
  }

  // Copy and enhance each generated cup folder
  for (const cup of cups) {
    const cupSrc = path.join(srcDataBase, 'rankings', cup.name);
    const cupDest = path.join(destDataBase, 'rankings', cup.name);
    if (copyAndEnhanceRankings(cupSrc, cupDest, moveTypes)) {
      spinner.text = `Enhanced rankings/${cup.name}`;
    }
  }

  spinner.succeed('Data copied to data/');
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cup' && args[i + 1]) {
      config.cup = args[i + 1];
      i++;
    } else if (args[i] === '--league' && args[i + 1]) {
      config.league = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      config.configFile = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
      process.exit(0);
    } else if (args[i] === '--debug') {
      config.debug = true;
    }
  }

  return config;
}

function showHelp() {
  console.log(`
${chalk.bold('PvPoke Rankings Generator')}

${chalk.yellow('Usage:')}
  ./generate.sh --cup <name> --league <cp>    Generate predefined cup
  ./generate.sh --config <file.json>          Generate custom cup from JSON

${chalk.yellow('Examples:')}
  ./generate.sh --cup all --league 1500
  ./generate.sh --cup amor --league 1500
  ./generate.sh --config cups/championship2026.json

${chalk.yellow('JSON Config Format:')}
  {
    "name": "mycup",
    "league": 1500,
    "include": [
      { "filterType": "type", "values": ["bug", "dark"] },
      { "filterType": "id", "values": ["pikachu"] }
    ],
    "exclude": [
      { "filterType": "tag", "values": ["legendary", "mythical"] },
      { "filterType": "id", "values": ["mewtwo"] }
    ]
  }

${chalk.yellow('Filter Types:')}
  type  - Pokemon types (bug, dark, fire, water, etc.)
  tag   - Tags (legendary, mythical, mega, shadow, ultrabeast)
  id    - Specific Pokemon IDs (lowercase)
  dex   - Dex number range [min, max]
`);
}

// Load config from JSON file (supports single cup or multiple cups)
function loadConfig(filePath) {
  const fullPath = path.resolve(projectRoot, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const config = JSON.parse(content);

  // Support both formats:
  // 1. { "cups": [...] } - multiple cups
  // 2. { "name": "...", ... } - single cup
  if (config.cups && Array.isArray(config.cups)) {
    return config.cups;
  } else if (config.name) {
    return [config];
  } else {
    throw new Error('Invalid config format. Expected { "cups": [...] } or { "name": "...", ... }');
  }
}

// Start Docker container
async function startDocker() {
  const spinner = ora('Starting Docker container...').start();

  return new Promise((resolve, reject) => {
    const docker = spawn('docker', ['compose', 'up', '-d'], {
      cwd: projectRoot,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stderr = '';
    docker.stderr?.on('data', (data) => { stderr += data.toString(); });

    docker.on('close', (code) => {
      if (code === 0) {
        spinner.succeed('Docker container started');
        resolve();
      } else {
        spinner.fail(`Failed to start Docker (exit code ${code})`);
        if (stderr) console.error(stderr);
        reject(new Error('Docker failed. Is Docker Desktop running?'));
      }
    });

    docker.on('error', (err) => {
      spinner.fail('Docker not found');
      reject(new Error('Docker not found. Please install Docker Desktop.'));
    });
  });
}

// Stop Docker container
async function stopDocker() {
  const spinner = ora('Stopping Docker container...').start();

  return new Promise((resolve) => {
    const docker = spawn('docker', ['compose', 'down'], { cwd: projectRoot });
    docker.on('close', () => {
      spinner.succeed('Docker container stopped');
      resolve();
    });
  });
}

// Wait for server to be ready
async function waitForServer(url, maxAttempts = 60) {
  await new Promise(r => setTimeout(r, 3000));

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server did not start. Try: docker compose up -d && curl http://127.0.0.1:8080/');
}

// Generate rankings for predefined cup
async function generatePredefinedCup(cup, league) {
  const spinner = ora(`Generating rankings for ${cup} @ ${league}...`).start();

  const browser = await puppeteer.launch({
    headless: 'new',
    pipe: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-extensions'
    ]
  });

  const page = await browser.newPage();

  // Set longer timeout
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(120000);

  // Track progress
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('/rankings-')) {
      spinner.text = `Saved: ${text}`;
    } else if (text.includes('total battles')) {
      spinner.text = text;
    }
  });

  try {
    await page.goto('http://127.0.0.1:8080/ranker.php', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Select format
    await page.evaluate((cup, league) => {
      const select = document.querySelector('.format-select');
      for (const option of select.options) {
        if (option.getAttribute('cup') === cup && option.value === league) {
          option.selected = true;
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    }, cup, league);

    await new Promise(r => setTimeout(r, 2000));

    // Click simulate
    await page.click('.simulate');

    // Wait for completion
    await waitForRankingsComplete(page, spinner);

    spinner.succeed(`Rankings complete for ${cup} @ ${league}`);

  } finally {
    await browser.close();
  }
}

// Generate rankings for custom cup from config
async function generateCustomCup(config, debug = false) {
  const spinner = ora(`Generating custom rankings for ${config.name} @ ${config.league}...`).start();

  const browser = await puppeteer.launch({
    headless: debug ? false : 'new',
    pipe: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-extensions'
    ],
    slowMo: debug ? 100 : 0
  });

  const page = await browser.newPage();

  // Set longer timeout for navigation
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(120000);

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('/rankings-')) {
      spinner.text = `Saved: ${text}`;
    } else if (text.includes('total battles')) {
      spinner.text = text;
    }
  });

  page.on('pageerror', err => {
    console.error('Page error:', err.message);
  });

  try {
    spinner.text = 'Loading custom-rankings.php...';

    let response;
    try {
      response = await page.goto('http://127.0.0.1:8080/custom-rankings.php', {
        waitUntil: 'networkidle2',
        timeout: 120000
      });
    } catch (navError) {
      spinner.fail(`Navigation failed: ${navError.message}`);
      throw navError;
    }

    if (!response || !response.ok()) {
      throw new Error(`Page returned status ${response?.status() || 'unknown'}`);
    }

    spinner.text = 'Waiting for interface to load...';

    // Wait for the custom ranking interface to be ready
    await page.waitForFunction(() => typeof customRankingInterface !== 'undefined', {
      timeout: 60000
    });

    // Wait a bit more for everything to initialize
    await new Promise(r => setTimeout(r, 3000));

    // Override downloadJSON to save to write.php instead of downloading
    await page.evaluate((cupName) => {
      customRankingInterface.downloadJSON = function(jsonData, filename) {
        // Parse filename to extract category: cupname_category_rankings-league.json
        const parts = filename.replace('.json', '').split('_');
        const category = parts[parts.length - 2]; // e.g., "overall", "leads", etc.
        const leaguePart = parts[parts.length - 1]; // e.g., "rankings-1500"
        const league = leaguePart.replace('rankings-', '');

        // POST to write.php
        $.ajax({
          url: 'data/write.php',
          type: 'POST',
          data: {
            data: jsonData,
            league: league,
            category: category,
            cup: cupName
          },
          dataType: 'json',
          success: function(data) {
            console.log('Saved: /' + cupName + '/' + category + '/rankings-' + league + '.json');
          },
          error: function(request, error) {
            console.log('Save error: ' + error);
          }
        });
      };
    }, config.name);

    // Import cup settings (filters, league)
    spinner.text = 'Importing cup settings...';
    await page.evaluate((cupConfig) => {
      customRankingInterface.importCupSettings({
        include: cupConfig.include || [],
        exclude: cupConfig.exclude || [],
        league: cupConfig.league
      });
    }, config);

    await new Promise(r => setTimeout(r, 1000));

    // Set cup name (need to expand Advanced section first)
    await page.click('.toggle');
    await new Promise(r => setTimeout(r, 500));
    await page.type('.custom-cup-name', config.name);

    await new Promise(r => setTimeout(r, 1000));

    // Click simulate
    await page.click('.simulate');

    // Wait for completion
    await waitForRankingsComplete(page, spinner);

    spinner.succeed(`Custom rankings complete for ${config.name} @ ${config.league}`);

  } finally {
    await browser.close();
  }
}

// Wait for rankings to complete
async function waitForRankingsComplete(page, spinner) {
  const startTime = Date.now();
  const timeout = 30 * 60 * 1000; // 30 min

  while (Date.now() - startTime < timeout) {
    const text = spinner.text || '';

    // Check if we've saved the last scenario (consistency is last for custom rankings)
    if (text.includes('consistency/rankings-') || text.includes('overall/rankings-') || text.includes('attackers/rankings-')) {
      await new Promise(r => setTimeout(r, 5000)); // Wait for final saves
      return;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error('Rankings generation timed out');
}

// Main
async function main() {
  console.log(chalk.bold.blue('\n=== PvPoke Rankings Generator ===\n'));

  const args = parseArgs();

  // Validate arguments
  if (!args.cup && !args.configFile) {
    showHelp();
    process.exit(1);
  }

  try {
    // Check if server is ready (user manages Docker manually)
    const spinner = ora('Checking server...').start();
    try {
      await waitForServer('http://127.0.0.1:8080/', 10);
      spinner.succeed('Server ready');
    } catch (e) {
      spinner.fail('Server not running');
      console.log(chalk.yellow('\nPlease start the server first:'));
      console.log(chalk.cyan('  docker compose up -d\n'));
      process.exit(1);
    }

    // Generate rankings
    if (args.configFile) {
      const cups = loadConfig(args.configFile);
      console.log(chalk.cyan(`Found ${cups.length} cup(s) to generate\n`));

      for (let i = 0; i < cups.length; i++) {
        const cup = cups[i];
        console.log(chalk.yellow(`[${i + 1}/${cups.length}] Generating ${cup.name}...`));
        await generateCustomCup(cup, args.debug);
        console.log(chalk.green(`✓ ${cup.name} complete\n`));
      }

      // Copy data to root folder (pass full cups array for formats.json generation)
      copyDataToRoot(cups);

      console.log(chalk.green.bold(`\nAll done! Generated ${cups.length} cup(s)`));
      console.log(chalk.gray(`Results copied to data/rankings/\n`));
    } else {
      const league = args.league || '1500';
      await generatePredefinedCup(args.cup, league);

      // Copy data to root folder
      copyDataToRoot([{ name: args.cup, title: args.cup, league: parseInt(league) }]);

      console.log(chalk.green(`\nDone! Results copied to data/rankings/${args.cup}/\n`));
    }

  } catch (error) {
    console.error(chalk.red('\nError:'), error.message);
    process.exit(1);
  }
}

main();
