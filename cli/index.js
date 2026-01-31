#!/usr/bin/env node

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { GameMasterNode } from './lib/GameMasterNode.js';
import { RankerNode } from './lib/RankerNode.js';
import { RankerOverallNode } from './lib/RankerOverallNode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log(chalk.cyan('\n=== PvPoke Rankings Generator ===\n'));

  // Initialize GameMaster
  const spinner = ora('Loading GameMaster data...').start();
  let gm;

  try {
    gm = new GameMasterNode();
    spinner.succeed('GameMaster loaded');
    console.log(chalk.gray(`Output: ${gm.outputPath}`));
  } catch (error) {
    spinner.fail('Failed to load GameMaster');
    console.error(error);
    process.exit(1);
  }

  // Get all available cups
  const existingCups = gm.getAllCups();

  // Step 1: Select existing cups
  const { selectedCups } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedCups',
    message: 'Select cups to generate:',
    choices: existingCups.map(cup => ({
      name: cup.title || cup.name,
      value: cup.name
    })),
    pageSize: 20,
    validate: (answer) => {
      if (answer.length === 0) {
        return 'You must select at least one cup (or skip to custom cups)';
      }
      return true;
    }
  }]);

  // Step 2: For each cup, select leagues
  const cupLeagues = [];

  for (const cupName of selectedCups) {
    const cupData = gm.getCupById(cupName);
    const defaultLeague = cupData?.league || 1500;

    const { leagues } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'leagues',
      message: `Select leagues for "${chalk.yellow(cupName)}":`,
      choices: [
        { name: 'Little Cup (500)', value: 500, checked: defaultLeague === 500 },
        { name: 'Great League (1500)', value: 1500, checked: defaultLeague === 1500 },
        { name: 'Ultra League (2500)', value: 2500, checked: defaultLeague === 2500 },
        { name: 'Master League (10000)', value: 10000, checked: defaultLeague === 10000 }
      ],
      validate: (answer) => {
        if (answer.length === 0) {
          return 'You must select at least one league';
        }
        return true;
      }
    }]);

    for (const league of leagues) {
      cupLeagues.push({ cup: cupName, league, isCustom: false });
    }
  }

  // Step 3: Check for custom cups file
  const customCupsPath = path.join(__dirname, 'custom-cups.json');
  const customCupsExists = fs.existsSync(customCupsPath);

  if (customCupsExists) {
    const { includeCustom } = await inquirer.prompt([{
      type: 'confirm',
      name: 'includeCustom',
      message: `Found custom-cups.json. Include custom cups?`,
      default: true
    }]);

    if (includeCustom) {
      try {
        const customCups = JSON.parse(fs.readFileSync(customCupsPath, 'utf8'));
        console.log(chalk.green(`\nFound ${customCups.length} custom cup(s): ${customCups.map(c => c.name).join(', ')}`));

        for (const customCup of customCups) {
          // Register the custom cup
          gm.registerCustomCup(customCup);

          // Check if cup has predefined league(s)
          let leagues;
          if (customCup.league) {
            // Single league specified in cup definition
            leagues = [customCup.league];
            console.log(`  ${chalk.magenta(customCup.name)} → ${customCup.league} CP (from config)`);
          } else if (customCup.leagues) {
            // Multiple leagues specified in cup definition
            leagues = customCup.leagues;
            console.log(`  ${chalk.magenta(customCup.name)} → ${customCup.leagues.join(', ')} CP (from config)`);
          } else {
            // Ask user to select leagues
            const response = await inquirer.prompt([{
              type: 'checkbox',
              name: 'leagues',
              message: `Select leagues for custom cup "${chalk.magenta(customCup.name)}":`,
              choices: [
                { name: 'Little Cup (500)', value: 500 },
                { name: 'Great League (1500)', value: 1500, checked: true },
                { name: 'Ultra League (2500)', value: 2500 },
                { name: 'Master League (10000)', value: 10000 }
              ],
              validate: (answer) => {
                if (answer.length === 0) {
                  return 'You must select at least one league';
                }
                return true;
              }
            }]);
            leagues = response.leagues;
          }

          for (const league of leagues) {
            cupLeagues.push({ cup: customCup.name, league, isCustom: true });
          }
        }
      } catch (error) {
        console.error(chalk.red('Failed to load custom cups:'), error.message);
      }
    }
  }

  // Confirm before starting
  console.log(chalk.cyan('\n--- Summary ---'));
  console.log(`Total rankings to generate: ${cupLeagues.length}`);
  for (const { cup, league, isCustom } of cupLeagues) {
    const tag = isCustom ? chalk.magenta('[custom]') : '';
    console.log(`  - ${cup} @ ${league} CP ${tag}`);
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Start generating rankings?',
    default: true
  }]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.'));
    process.exit(0);
  }

  // Step 4: Generate rankings
  console.log(chalk.cyan('\n--- Generating Rankings ---\n'));

  const ranker = new RankerNode(gm);
  const rankerOverall = new RankerOverallNode(gm);

  let completed = 0;
  const total = cupLeagues.length;

  for (const { cup, league, isCustom } of cupLeagues) {
    const tag = isCustom ? chalk.magenta('[custom]') : '';
    const spinner = ora(`[${completed + 1}/${total}] Generating ${cup} @ ${league} ${tag}`).start();

    try {
      // Generate category rankings
      await ranker.rankAll(cup, league, (msg) => {
        spinner.text = `[${completed + 1}/${total}] ${cup} @ ${league}: ${msg}`;
      });

      // Generate overall rankings
      await rankerOverall.rankOverall(cup, league, (msg) => {
        spinner.text = `[${completed + 1}/${total}] ${cup} @ ${league}: ${msg}`;
      });

      spinner.succeed(`[${completed + 1}/${total}] ${cup} @ ${league} ${tag}`);
    } catch (error) {
      spinner.fail(`[${completed + 1}/${total}] ${cup} @ ${league} - Error: ${error.message}`);
      console.error(error);
    }

    completed++;
  }

  console.log(chalk.green(`\n=== Done! Generated ${completed} ranking sets ===\n`));
}

// Run
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
