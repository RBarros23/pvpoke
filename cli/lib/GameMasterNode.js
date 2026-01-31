import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GameMasterNode {
  constructor() {
    this.dataPath = path.resolve(__dirname, '../../src/data');
    this.outputPath = path.resolve(__dirname, '../output/rankings');
    this.data = {};
    this.pokemonMap = new Map();
    this.moveMap = new Map();
    this.rankings = {};
    this.customCups = [];

    this.loadData();
  }

  loadData() {
    const gmPath = path.join(this.dataPath, 'gamemaster.json');
    this.data = JSON.parse(fs.readFileSync(gmPath, 'utf8'));
    this.createSearchMaps();

    // Sort Pokemon alphabetically
    this.data.pokemon.sort((a, b) =>
      a.speciesName > b.speciesName ? 1 : b.speciesName > a.speciesName ? -1 : 0
    );
  }

  createSearchMaps() {
    this.pokemonMap = new Map(this.data.pokemon.map(pokemon => [pokemon.speciesId, pokemon]));
    this.moveMap = new Map(this.data.moves.map(move => [move.moveId, move]));
  }

  // Get all available cups from gamemaster
  getAllCups() {
    return this.data.cups.map(cup => ({
      name: cup.name,
      title: cup.title || cup.name
    }));
  }

  // Register a custom cup
  registerCustomCup(cupDef) {
    // Add to cups array if not already there
    const existingIndex = this.data.cups.findIndex(c => c.name === cupDef.name);
    if (existingIndex >= 0) {
      this.data.cups[existingIndex] = cupDef;
    } else {
      this.data.cups.push(cupDef);
    }
    this.customCups.push(cupDef.name);
  }

  // Get Pokemon by ID
  getPokemonById(id) {
    id = id.replace('_xl', '');
    return this.pokemonMap.get(id);
  }

  // Get move by ID
  getMoveById(id) {
    if (id === 'none') return;

    const m = this.moveMap.get(id);
    if (!m) {
      console.error(`${id} missing`);
      return;
    }

    // Generate move abbreviation
    const arr = m.moveId.split('_');
    let abbreviation = m.abbreviation || arr.map(word => word.charAt(0)).join('');

    const move = {
      moveId: m.moveId,
      name: m.name,
      displayName: m.name,
      abbreviation,
      archetype: m.archetype || '',
      type: m.type,
      power: m.power,
      energy: m.energy,
      energyGain: m.energyGain,
      cooldown: m.cooldown,
      turns: m.turns,
      selfDebuffing: false,
      selfBuffing: false,
      selfAttackDebuffing: false,
      selfDefenseDebuffing: false,
      legacy: false,
      elite: false
    };

    if (move.moveId === 'RETURN' || move.moveId === 'FRUSTRATION') {
      move.legacy = true;
    }

    if (m.buffs) {
      move.buffs = m.buffs;
      move.buffApplyChance = parseFloat(m.buffApplyChance);
      move.buffTarget = m.buffTarget;

      if (move.buffTarget === 'both') {
        move.buffsSelf = m.buffsSelf;
        move.buffsOpponent = m.buffsOpponent;
      }

      if (move.buffTarget === 'self' && move.buffApplyChance >= 0.5 &&
          move.moveId !== 'DRAGON_ASCENT' && (move.buffs[0] < 0 || move.buffs[1] < 0)) {
        move.selfDebuffing = true;
        if (move.buffs[0] < 0) move.selfAttackDebuffing = true;
        if (move.buffs[1] < 0) move.selfDefenseDebuffing = true;
      }

      if (move.buffApplyChance === 1 &&
          (move.buffTarget === 'opponent' ||
           (move.buffTarget === 'self' && (move.buffs[0] > 0 || move.buffs[1] > 0)) ||
           (move.buffTarget === 'both' && (move.buffsSelf[0] > 0 || move.buffsSelf[1] > 0)))) {
        move.selfBuffing = true;
      }
    }

    if (m.formChange) {
      move.formChange = JSON.parse(JSON.stringify(m.formChange));
    }

    return move;
  }

  // Get cup by ID
  getCupById(id) {
    return this.data.cups.find(c => c.name === id);
  }

  // Load ranking data from file (checks output path first, then source data)
  loadRankingData(category, league, cup) {
    const key = `${cup}${category}${league}`;

    if (!this.rankings[key]) {
      // Check CLI output path first (for rankings we just generated)
      let rankPath = path.join(this.outputPath, cup, category, `rankings-${league}.json`);
      if (!fs.existsSync(rankPath)) {
        // Fall back to source data
        rankPath = path.join(this.dataPath, 'rankings', cup, category, `rankings-${league}.json`);
      }
      if (fs.existsSync(rankPath)) {
        this.rankings[key] = JSON.parse(fs.readFileSync(rankPath, 'utf8'));
      } else {
        return null;
      }
    }

    return this.rankings[key];
  }

  // Load moveset overrides
  loadOverrides(league, cup) {
    const overridePath = path.join(this.dataPath, 'overrides', cup, `${league}.json`);
    if (fs.existsSync(overridePath)) {
      return JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    }
    return [];
  }

  // Load official ranking data (always from source data, not CLI output)
  loadOfficialRankingData(category, league, cup) {
    const rankPath = path.join(this.dataPath, 'rankings', cup, category, `rankings-${league}.json`);
    if (fs.existsSync(rankPath)) {
      return JSON.parse(fs.readFileSync(rankPath, 'utf8'));
    }
    return null;
  }

  // Check if a cup is custom (registered via registerCustomCup)
  isCustomCup(cupName) {
    return this.customCups.includes(cupName);
  }

  // Save ranking data to file
  saveRankingData(cup, category, league, data) {
    const outputDir = path.join(this.outputPath, cup, category);
    const filePath = path.join(outputDir, `rankings-${league}.json`);

    // Create directory if needed
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));

    console.log(`Saved: ${filePath}`);
  }

  // Override a Pokemon's moveset
  overrideMoveset(pokemon, league, cup, overrides) {
    for (const override of overrides) {
      if (override.league === league && override.cup === cup) {
        const pokemonList = override.pokemon;

        for (const pokeOverride of pokemonList) {
          if (pokeOverride.speciesId === pokemon.speciesId) {
            if (pokeOverride.fastMove) {
              pokemon.selectMove('fast', pokeOverride.fastMove);
            }

            if (pokeOverride.chargedMoves) {
              for (let j = 0; j < pokeOverride.chargedMoves.length; j++) {
                pokemon.selectMove('charged', pokeOverride.chargedMoves[j], j);
              }

              if (pokeOverride.chargedMoves.length < 2) {
                pokemon.selectMove('charged', 'none', 1);
              }
            }

            if (typeof pokeOverride.weight !== 'undefined') {
              pokemon.weightModifier = pokeOverride.weight;
            }
            break;
          }
        }
        break;
      }
    }
  }

  // Generate filtered Pokemon list based on cup rules
  generateFilteredPokemonList(battle, include, exclude, rankingData, overrides) {
    const cp = battle.getCP();
    const cup = battle.getCup();

    // Minimum stat products for different leagues
    let minStats = 4900;
    if (cp === 500) minStats = 0;
    else if (cp === 1500) minStats = 1370;
    else if (cp === 2500) minStats = 2800;

    const bannedList = [
      'mewtwo', 'mewtwo_armored', 'giratina_altered', 'groudon', 'kyogre',
      'palkia', 'dialga', 'cobalion', 'terrakion', 'virizion', 'tornadus_therian',
      'landorus_therian', 'reshiram', 'zekrom', 'kyurem', 'genesect_burn',
      'xerneas', 'thundurus_therian', 'yveltal', 'meloetta_aria', 'zacian',
      'zamazenta', 'zacian_hero', 'zamazenta_hero', 'genesect_douse', 'zarude',
      'hoopa_unbound', 'genesect_shock', 'tapu_koko', 'tapu_lele', 'tapu_bulu',
      'nihilego', 'genesect_chill', 'solgaleo', 'lunala', 'keldeo_ordinary',
      'kyogre_primal', 'groudon_primal', 'zygarde_complete', 'enamorus_therian',
      'enamorus_incarnate', 'dialga_origin', 'palkia_origin', 'necrozma',
      'necrozma_dawn_wings', 'necrozma_dusk_mane', 'marshadow', 'kyurem_black',
      'kyurem_white', 'zacian_crowned_sword', 'zamazenta_crowned_shield',
      'eternatus', 'sinistcha', 'keldeo_resolute'
    ];

    const pokemonList = [];

    for (const pokeData of this.data.pokemon) {
      const pokemon = battle.createPokemon(pokeData.speciesId);
      if (!pokemon) continue;

      pokemon.initialize(cp);

      const stats = (pokemon.stats.hp * pokemon.stats.atk * pokemon.stats.def) / 1000;

      // Check stat threshold
      if (stats < minStats && !cup.includeLowStatProduct) {
        if (!(cp === 1500 && pokemon.hasTag('include1500')) &&
            !(cp === 2500 && pokemon.hasTag('include2500')) &&
            !(cp === 10000 && pokemon.hasTag('include10000')) &&
            !pokemon.hasTag('mega')) {
          continue;
        }
      }

      // Skip unreleased Pokemon
      if (!pokemon.released) continue;

      // Skip banned Pokemon in lower leagues
      if (cp < 2500 && bannedList.includes(pokemon.speciesId)) continue;

      // Check include/exclude filters
      let allowed = this.checkFilters(pokemon, include, exclude, battle);

      if (allowed) {
        // Apply moveset from ranking data if available
        if (rankingData && overrides) {
          const rankEntry = rankingData.find(r => r.speciesId === pokemon.speciesId);
          if (rankEntry) {
            const fastMoves = [...rankEntry.moves.fastMoves].sort((a, b) => b.uses - a.uses);
            const chargedMoves = [...rankEntry.moves.chargedMoves].sort((a, b) => b.uses - a.uses);

            pokemon.selectMove('fast', fastMoves[0].moveId);
            pokemon.selectMove('charged', chargedMoves[0].moveId, 0);

            // Set weight modifier from ranking score (for usage-based weighting)
            // Score is 0-100, normalize to 0-1 range
            pokemon.weightModifier = rankEntry.score / 100;

            if (chargedMoves.length > 1) {
              pokemon.selectMove('charged', chargedMoves[1].moveId, 1);
            }

            this.overrideMoveset(pokemon, cp, cup.name, overrides);
          }
        }

        pokemonList.push(pokemon);
      }
    }

    return pokemonList;
  }

  // Check include/exclude filters for a Pokemon
  checkFilters(pokemon, include, exclude, battle) {
    const filterLists = [include, exclude];
    let allowed = false;
    let includeIdFilter = false;

    for (let n = 0; n < filterLists.length; n++) {
      const filters = filterLists[n];
      const isInclude = n === 0;
      let filtersMatched = 0;
      let requiredFilters = filters.length;

      for (const filter of filters) {
        // Check if filter applies to this league
        if (filter.leagues && !filter.leagues.includes(battle.getCP())) {
          requiredFilters--;
          continue;
        }

        switch (filter.filterType) {
          case 'type':
            if (filter.values.includes(pokemon.types[0]) ||
                filter.values.includes(pokemon.types[1])) {
              filtersMatched++;
            }
            break;

          case 'dex':
            if (pokemon.dex >= filter.values[0] && pokemon.dex <= filter.values[1]) {
              filtersMatched++;
            }
            break;

          case 'tag':
            for (const tag of filter.values) {
              if (pokemon.hasTag(tag)) {
                filtersMatched++;
                break;
              }
            }
            break;

          case 'id':
            if (isInclude && filters.length > 1) {
              requiredFilters--;
            }

            let testId = pokemon.speciesId;
            if (!isInclude || filter.includeShadows) {
              testId = testId.replace('_shadow', '').replace('_xs', '');
            }

            if (filter.values.includes(testId) || filter.values.includes(pokemon.speciesId)) {
              filtersMatched += filters.length;
              if (isInclude) includeIdFilter = true;
            }
            break;

          case 'move':
            for (const moveId of filter.values) {
              if (pokemon.knowsMove(moveId)) {
                filtersMatched++;
                break;
              }
            }
            break;
        }
      }

      if (isInclude && filtersMatched >= requiredFilters) {
        allowed = true;
      }

      if (!isInclude && filtersMatched > 0 && !includeIdFilter) {
        allowed = false;
      }
    }

    return allowed;
  }
}
