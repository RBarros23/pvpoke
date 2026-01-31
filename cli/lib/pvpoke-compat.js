/**
 * Compatibility layer to use PvPoke's browser-based battle code in Node.js
 * This loads the official PvPoke JavaScript files and provides the necessary globals
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Load PvPoke battle modules into a sandboxed context
 * @param {object} gamemaster - GameMasterNode instance adapted to PvPoke's API
 * @returns {object} - Object containing Pokemon, Battle, ActionLogic, DamageCalculator
 */
export function loadPvPokeModules(gamemaster) {
  // Create the sandbox context with all necessary globals
  const context = {
    // GameMaster singleton - returns our adapter
    GameMaster: {
      getInstance: () => gamemaster
    },

    // InterfaceMaster - UI only, return null
    InterfaceMaster: {
      getInterface: () => null
    },

    // Standard JavaScript globals
    console: console,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Error: Error,
    TypeError: TypeError,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Infinity: Infinity,
    NaN: NaN,
    undefined: undefined,
    null: null,

    // setTimeout/setInterval stubs (not needed for simulation mode)
    setTimeout: (fn) => fn(),
    setInterval: () => null,
    clearInterval: () => null,
  };

  // Create the VM context
  vm.createContext(context);

  // Files to load in dependency order
  const files = [
    'src/js/battle/DamageCalculator.js',
    'src/js/battle/timeline/TimelineAction.js',
    'src/js/battle/timeline/TimelineEvent.js',
    'src/js/pokemon/Pokemon.js',
    'src/js/battle/actions/ActionLogic.js',
    'src/js/battle/Battle.js'
  ];

  // Load each file
  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      vm.runInContext(code, context, { filename: file });
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message);
      throw error;
    }
  }

  return {
    Pokemon: context.Pokemon,
    Battle: context.Battle,
    ActionLogic: context.ActionLogic,
    DamageCalculator: context.DamageCalculator,
    DamageMultiplier: context.DamageMultiplier,
    TimelineAction: context.TimelineAction,
    TimelineEvent: context.TimelineEvent
  };
}

/**
 * Create a GameMaster adapter that wraps GameMasterNode with PvPoke-compatible API
 * @param {GameMasterNode} gmNode - Our GameMasterNode instance
 * @returns {object} - PvPoke-compatible GameMaster object
 */
export function createGameMasterAdapter(gmNode) {
  return {
    // Direct data access (PvPoke accesses gm.data.pokemon, gm.data.moves, etc.)
    data: gmNode.data,

    // Get Pokemon by ID
    getPokemonById: (id) => gmNode.getPokemonById(id),

    // Get move by ID - PvPoke expects the raw move data, not our processed version
    getMoveById: (id) => {
      if (id === 'none') return null;
      return gmNode.data.moves.find(m => m.moveId === id);
    },

    // Get cup by ID
    getCupById: (id) => gmNode.getCupById(id),

    // Rankings data
    rankings: gmNode.rankings,

    // Load ranking data
    loadRankingData: (ranker, category, league, cup) => {
      const data = gmNode.loadRankingData(category, league, cup);
      if (ranker && ranker.displayRankingData) {
        ranker.displayRankingData(data);
      }
      return data;
    },

    // Generate filtered Pokemon list
    generateFilteredPokemonList: (...args) => gmNode.generateFilteredPokemonList(...args)
  };
}
