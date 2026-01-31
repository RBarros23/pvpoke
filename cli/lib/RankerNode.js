import { loadPvPokeModules, createGameMasterAdapter } from './pvpoke-compat.js';

export class RankerNode {
  constructor(gm) {
    this.gm = gm;
    this.scenarios = gm.data.rankingScenarios;
    this.pokemonList = [];
    this.targets = [];
    this.overrides = [];

    // Load official PvPoke battle modules
    const adapter = createGameMasterAdapter(gm);
    this.pvpoke = loadPvPokeModules(adapter);
    this.battle = new this.pvpoke.Battle();
  }

  // Run all ranking scenarios for a cup/league
  async rankAll(cup, league, progressCallback) {
    const cupData = typeof cup === 'string' ? this.gm.getCupById(cup) : cup;
    if (!cupData) {
      console.error(`Cup not found: ${cup}`);
      return null;
    }

    const cupName = cupData.name;

    // Check if official rankings exist for this cup/league (and it's not a custom cup)
    const officialData = this.gm.loadOfficialRankingData('overall', league, cupName);

    if (officialData && !this.gm.isCustomCup(cupName)) {
      progressCallback?.(`Using official rankings for ${cupName} @ ${league}`);

      // Copy all category rankings from official source to output
      for (const scenario of this.scenarios) {
        const categoryData = this.gm.loadOfficialRankingData(scenario.slug, league, cupName);
        if (categoryData) {
          this.gm.saveRankingData(cupName, scenario.slug, league, categoryData);
        }
      }

      return { usedOfficial: true };
    }

    // Otherwise, run simulation for custom cups using official PvPoke battle logic
    progressCallback?.(`Simulating battles for ${cupName} @ ${league} (using official battle logic)...`);

    this.battle.setCP(league);

    if (cupName !== 'custom') {
      this.battle.setCup(cupName);
    } else {
      this.battle.setCustomCup(cupData);
    }

    if (cupData.levelCap) {
      this.battle.setLevelCap(cupData.levelCap);
    }

    // Load existing ranking data to get movesets
    const rankingData = this.gm.loadRankingData('overall', league, cupName);

    // Load overrides
    this.loadOverrides(league, cupName);

    // Initialize Pokemon list
    this.initPokemonList(league, cupData, rankingData);

    progressCallback?.(`Loaded ${this.pokemonList.length} Pokemon for ${cupName} @ ${league}`);

    const results = {};

    // Run each scenario
    for (const scenario of this.scenarios) {
      progressCallback?.(`Ranking ${scenario.slug}...`);

      const rankings = this.rank(league, scenario, progressCallback);
      results[scenario.slug] = rankings;

      // Save results
      this.gm.saveRankingData(cupName, scenario.slug, league, rankings);
    }

    return results;
  }

  loadOverrides(league, cupName) {
    const overrideData = this.gm.loadOverrides(league, cupName);
    if (overrideData && overrideData.length > 0) {
      this.overrides = [{
        league: league,
        cup: cupName,
        pokemon: overrideData
      }];
    } else {
      this.overrides = [];
    }
  }

  initPokemonList(cp, cupData, rankingData) {
    this.pokemonList = [];
    this.targets = [];

    const include = cupData.include || [];
    const exclude = cupData.exclude || [];

    // Generate filtered Pokemon list using official PvPoke logic

    const minStats = this.getMinStats(cp);
    const bannedList = this.getBannedList();

    for (const pokeData of this.gm.data.pokemon) {
      // Create official PvPoke Pokemon
      const pokemon = new this.pvpoke.Pokemon(pokeData.speciesId, 0, this.battle);
      if (!pokemon || !pokemon.speciesName) continue;

      pokemon.initialize(cp);

      const stats = (pokemon.stats.hp * pokemon.stats.atk * pokemon.stats.def) / 1000;

      // Check stat threshold
      if (stats < minStats && !cupData.includeLowStatProduct) {
        if (!(cp === 1500 && pokemon.hasTag?.('include1500')) &&
            !(cp === 2500 && pokemon.hasTag?.('include2500')) &&
            !(cp === 10000 && pokemon.hasTag?.('include10000')) &&
            !pokemon.hasTag?.('mega')) {
          continue;
        }
      }

      // Skip unreleased Pokemon
      if (!pokemon.released) continue;

      // Skip banned Pokemon in lower leagues
      if (cp < 2500 && bannedList.includes(pokemon.speciesId)) continue;

      // Check include/exclude filters
      let allowed = this.checkFilters(pokemon, include, exclude, cp);

      if (allowed) {
        // Apply moveset from ranking data if available
        if (rankingData) {
          const rankEntry = rankingData.find(r => r.speciesId === pokemon.speciesId);
          if (rankEntry && rankEntry.moves) {
            const fastMoves = [...rankEntry.moves.fastMoves].sort((a, b) => b.uses - a.uses);
            const chargedMoves = [...rankEntry.moves.chargedMoves].sort((a, b) => b.uses - a.uses);

            pokemon.selectMove('fast', fastMoves[0].moveId);
            pokemon.selectMove('charged', chargedMoves[0].moveId, 0);
            if (chargedMoves.length > 1) {
              pokemon.selectMove('charged', chargedMoves[1].moveId, 1);
            }

            // Set weight modifier from ranking score
            pokemon.weightModifier = rankEntry.score / 100;
          } else {
            // Auto-select best moves for Pokemon not in rankings
            pokemon.autoSelectMoves();
          }
        } else {
          // No ranking data - auto-select moves
          pokemon.autoSelectMoves();
        }

        // Apply overrides
        this.applyOverrides(pokemon, cp, cupData.name);

        this.pokemonList.push(pokemon);

        // Add to targets (unless cup filters targets)
        if (cupData.filterTargets) {
          if (pokemon.weightModifier > 1) {
            this.targets.push(pokemon);
          }
        } else {
          this.targets.push(pokemon);
        }
      }
    }

    console.log(`Pokemon list: ${this.pokemonList.length}, Targets: ${this.targets.length}`);
  }

  getMinStats(cp) {
    if (cp === 500) return 0;
    if (cp === 1500) return 1370;
    if (cp === 2500) return 2800;
    return 4900;
  }

  getBannedList() {
    return [
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
  }

  checkFilters(pokemon, include, exclude, cp) {
    let allowed = false;
    let includeIdFilter = false;

    const filterLists = [include, exclude];

    for (let n = 0; n < filterLists.length; n++) {
      const filters = filterLists[n];
      const isInclude = n === 0;
      let filtersMatched = 0;
      let requiredFilters = filters.length;

      for (const filter of filters) {
        // Check if filter applies to this league
        if (filter.leagues && !filter.leagues.includes(cp)) {
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
              if (pokemon.hasTag?.(tag)) {
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
              if (pokemon.knowsMove?.(moveId)) {
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

  applyOverrides(pokemon, league, cupName) {
    for (const override of this.overrides) {
      if (override.league === league && override.cup === cupName) {
        for (const pokeOverride of override.pokemon) {
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

  rank(league, scenario, progressCallback) {
    const cup = this.battle.getCup();
    const shieldCounts = scenario.shields;
    const rankings = [];
    const rankCount = this.pokemonList.length;

    let totalBattles = 0;
    const startTime = Date.now();

    // Simulate battles for each Pokemon
    for (let i = 0; i < rankCount; i++) {
      const pokemon = this.pokemonList[i];

      // Progress update every 10 Pokemon
      if (i % 10 === 0) {
        progressCallback?.(`${scenario.slug}: ${i}/${rankCount} Pokemon...`);
      }

      const rankObj = {
        speciesId: pokemon.speciesId,
        speciesName: pokemon.speciesName,
        rating: 0,
        matches: [],
        matchups: [],
        counters: [],
        moves: []
      };

      let avg = 0;

      // Simulate against each target
      for (let n = 0; n < this.targets.length; n++) {
        const opponent = this.targets[n];

        // Skip mirror matches for rating
        const isMirror = opponent.speciesId === pokemon.speciesId;

        // Reuse symmetric results when possible
        if (rankings[n] && this.pokemonList.length === this.targets.length &&
            shieldCounts[0] === shieldCounts[1] && scenario.energy[0] === scenario.energy[1]) {
          if (rankings[n].matches[i]) {
            rankObj.matches.push({
              opponent: opponent.speciesId,
              rating: rankings[n].matches[i].opRating,
              adjRating: rankings[n].matches[i].adjOpRating,
              opRating: rankings[n].matches[i].rating,
              adjOpRating: rankings[n].matches[i].adjRating,
              moveUsage: rankings[n].matches[i].oppMoveUsage,
              oppMoveUsage: rankings[n].matches[i].moveUsage
            });

            if (!isMirror) {
              avg += rankings[n].matches[i].adjOpRating;
            }
            continue;
          }
        }

        totalBattles++;

        // Set up battle using official PvPoke code
        this.battle.setNewPokemon(pokemon, 0, false);
        this.battle.setNewPokemon(opponent, 1, false);

        pokemon.reset();
        opponent.reset();

        // Set shields
        pokemon.setShields(shieldCounts[0]);
        opponent.setShields(shieldCounts[1]);

        // Set energy advantage
        this.setEnergyAdvantage(pokemon, scenario.energy[0]);
        this.setEnergyAdvantage(opponent, scenario.energy[1]);

        // Run simulation using official PvPoke battle engine
        this.battle.simulate();

        // Calculate ratings using official formulas
        const healthRating = pokemon.hp / pokemon.stats.hp;
        const damageRating = (opponent.stats.hp - opponent.hp) / opponent.stats.hp;
        const opHealthRating = opponent.hp / opponent.stats.hp;
        const opDamageRating = (pokemon.stats.hp - pokemon.hp) / pokemon.stats.hp;

        let rating = Math.floor((healthRating + damageRating) * 500);
        let opRating = Math.floor((opHealthRating + opDamageRating) * 500);

        // Modify by shields
        let winMultiplier = rating > opRating ? 1 : 0;
        let opWinMultiplier = rating > opRating ? 0 : 1;

        if (rating === 500) {
          winMultiplier = 0;
          opWinMultiplier = 0;
        }

        const adjRating = rating +
          (100 * (opponent.startingShields - opponent.shields) * winMultiplier) +
          (100 * pokemon.shields * winMultiplier);

        const adjOpRating = opRating +
          (100 * (pokemon.startingShields - pokemon.shields) * opWinMultiplier) +
          (100 * opponent.shields * opWinMultiplier);

        rankObj.matches.push({
          opponent: opponent.speciesId,
          rating,
          adjRating,
          opRating,
          adjOpRating,
          moveUsage: pokemon.generateMoveUsage?.(opponent, opponent.weightModifier) || { fastMoves: [], chargedMoves: [] },
          oppMoveUsage: opponent.generateMoveUsage?.(pokemon, pokemon.weightModifier) || { fastMoves: [], chargedMoves: [] }
        });

        if (!isMirror) {
          avg += adjRating;
        }
      }

      // Calculate average (excluding mirror)
      const nonMirrorCount = this.targets.length - 1;
      avg = Math.floor(avg / (nonMirrorCount || 1));

      rankObj.rating = avg;
      rankObj.scores = [avg];

      // Aggregate move usage
      rankObj.moves = this.aggregateMoveUsage(pokemon, rankObj.matches);

      rankings.push(rankObj);
    }

    console.log(`Total battles: ${totalBattles} in ${Date.now() - startTime}ms`);

    // Weight matchups by opponent rating
    this.weightMatchups(rankings, scenario, cup);

    // Finalize rankings
    this.finalizeRankings(rankings, this.pokemonList, scenario);

    return rankings;
  }

  setEnergyAdvantage(pokemon, turns) {
    if (turns === 0) {
      pokemon.startEnergy = 0;
    } else {
      const fastMoveCount = Math.max(1, Math.floor((turns * 500) / pokemon.fastMove.cooldown));
      pokemon.startEnergy = Math.min(pokemon.fastMove.energyGain * fastMoveCount, 100);
    }
  }

  aggregateMoveUsage(pokemon, matches) {
    const fastMoves = pokemon.fastMovePool?.map(m => ({ moveId: m.moveId, uses: 0 })) || [];
    const chargedMoves = pokemon.chargedMovePool?.map(m => ({ moveId: m.moveId, uses: 0 })) || [];

    for (const match of matches) {
      if (!match.moveUsage) continue;

      for (const fm of fastMoves) {
        const usage = match.moveUsage.fastMoves?.find(m => m.moveId === fm.moveId);
        if (usage) fm.uses += usage.uses;
      }

      for (const cm of chargedMoves) {
        const usage = match.moveUsage.chargedMoves?.find(m => m.moveId === cm.moveId);
        if (usage) cm.uses += usage.uses;
      }
    }

    fastMoves.sort((a, b) => b.uses - a.uses);
    chargedMoves.sort((a, b) => b.uses - a.uses);

    return { fastMoves, chargedMoves };
  }

  weightMatchups(rankings, scenario, cup) {
    const iterations = cup.name === 'custom' ? 7 : 1;
    const rankCutoffIncrease = 0.06;
    const rankWeightExponent = 1.65;
    const rankCount = rankings.length;

    for (let n = 0; n < iterations; n++) {
      const bestScore = Math.max(...rankings.map(r => r.scores[n]));

      for (let i = 0; i < rankCount; i++) {
        let score = 0;
        let weights = 0;
        const matches = rankings[i].matches;

        for (let j = 0; j < matches.length; j++) {
          let weight = 1;

          if (this.pokemonList.length === this.targets.length) {
            weight = Math.pow(
              Math.max(rankings[j].scores[n] / bestScore - (0.1 + rankCutoffIncrease * n), 0),
              rankWeightExponent
            );
          }

          // No weight for mirror match
          if (this.targets[j].speciesId === this.pokemonList[i].speciesId) {
            weight = 0;
          }

          // Apply weight modifier - CRITICAL for accurate rankings
          if (typeof this.targets[j].weightModifier !== 'undefined') {
            weight *= this.targets[j].weightModifier;
          } else {
            // For "all" cup, Pokemon without usage data get zero weight
            if (cup.name === 'all' && this.battle.getCP() === 1500) {
              weight = 0;
            }
          }

          // Soft cap for wins over 700
          if (matches[j].adjRating > 700) {
            matches[j].adjRating = 700 + Math.pow(matches[j].adjRating - 700, 0.5);
          }

          // Harsh curve for losses under 300
          if (matches[j].adjRating < 300) {
            const curveAdjustment = 300;
            matches[j].adjRating = Math.pow(
              300,
              (curveAdjustment + matches[j].adjRating) / (300 + curveAdjustment)
            );
          }

          // Extra penalty for hard losses in switch scenarios
          if (scenario.slug === 'switches' && matches[j].adjRating < 500) {
            weight *= 1 + Math.pow(500 - matches[j].adjRating, 2) / 20000;
          }

          const sc = matches[j].adjRating * weight;
          matches[j].score = sc;
          matches[j].opScore = matches[j].adjOpRating * Math.pow(4, weight);

          if (rankings[j].scores[n] / bestScore < 0.1 + rankCutoffIncrease * n) {
            weight = 0;
          }

          weights += weight;
          score += sc;
        }

        const avgScore = Math.floor(score / (weights || 1));
        rankings[i].scores.push(avgScore);
      }
    }
  }

  finalizeRankings(rankings, pokemonList, scenario) {
    const rankCount = rankings.length;

    for (let i = 0; i < rankCount; i++) {
      const pokemon = pokemonList[i];

      // Set moveset
      rankings[i].moveset = [
        pokemon.fastMove?.moveId,
        pokemon.chargedMoves?.[0]?.moveId
      ].filter(Boolean);

      if (pokemon.chargedMoves?.[1]) {
        rankings[i].moveset.push(pokemon.chargedMoves[1].moveId);
      }

      // Final score
      rankings[i].score = rankings[i].scores[rankings[i].scores.length - 1];

      // Charger adjustments
      if (scenario.slug === 'chargers' && pokemon.fastMove) {
        const fastMoveDpt = (pokemon.fastMove.power * (pokemon.fastMove.stab || 1) *
          (pokemon.shadowAtkMult || 1) * (pokemon.stats.atk / 100)) / (pokemon.fastMove.cooldown / 500);
        const activeChargedMoves = pokemon.chargedMoves?.filter(m => m) || [];
        const maxEnergyRemaining = 100 - Math.min(...activeChargedMoves.map(m => m?.energy || 100));

        rankings[i].score *= Math.pow(
          Math.pow(maxEnergyRemaining / 100, 0.5) * Math.pow(fastMoveDpt / 5, 1/6),
          1/6
        );
      }

      delete rankings[i].scores;

      // Set matchups (best wins) and counters (worst losses)
      this.setKeyMatchups(rankings[i]);
    }

    // Sort by score
    rankings.sort((a, b) => b.score - a.score);

    // Scale to 0-100
    const highest = rankings[0]?.score || 1;
    for (const ranking of rankings) {
      ranking.score = Math.floor((ranking.score / highest) * 1000) / 10;
    }
  }

  setKeyMatchups(rankObj) {
    const matches = rankObj.matches;
    const matchupCount = Math.min(5, matches.length);

    // Sort by opScore for counters (worst matchups)
    matches.sort((a, b) => b.opScore - a.opScore);

    let count = 0;
    for (const match of matches) {
      if (match.rating < 500) {
        rankObj.counters.push({
          opponent: match.opponent,
          rating: match.rating
        });
        count++;
        if (count >= matchupCount) break;
      }
    }

    rankObj.counters.sort((a, b) => a.rating - b.rating);

    // Sort by score for matchups (best wins)
    matches.sort((a, b) => b.score - a.score);

    count = 0;
    for (const match of matches) {
      if (match.rating > 500) {
        rankObj.matchups.push({
          opponent: match.opponent,
          rating: match.rating
        });
        count++;
        if (count >= matchupCount) break;
      }
    }

    rankObj.matchups.sort((a, b) => b.rating - a.rating);

    // Clean up matches
    delete rankObj.matches;
  }
}
