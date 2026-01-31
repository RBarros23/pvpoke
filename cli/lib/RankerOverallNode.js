export class RankerOverallNode {
  constructor(gm) {
    this.gm = gm;
  }

  // Combine category rankings into overall ranking
  async rankOverall(cup, league, progressCallback) {
    const cupName = typeof cup === 'string' ? cup : cup.name;

    // Check if official overall rankings exist (and it's not a custom cup)
    const officialData = this.gm.loadOfficialRankingData('overall', league, cupName);

    if (officialData && !this.gm.isCustomCup(cupName)) {
      progressCallback?.(`Using official overall rankings for ${cupName} @ ${league}`);
      this.gm.saveRankingData(cupName, 'overall', league, officialData);

      // Also copy consistency if available
      const consistencyData = this.gm.loadOfficialRankingData('consistency', league, cupName);
      if (consistencyData) {
        this.gm.saveRankingData(cupName, 'consistency', league, consistencyData);
      }

      return officialData;
    }

    // Otherwise compute from category rankings for custom cups
    progressCallback?.(`Computing overall rankings for ${cupName} @ ${league}...`);

    // Load all category rankings
    const categories = ['leads', 'closers', 'switches', 'chargers', 'attackers'];
    const categoryData = {};

    for (const category of categories) {
      const data = this.gm.loadRankingData(category, league, cupName);
      if (data) {
        categoryData[category] = data;
      } else {
        console.warn(`Missing category data: ${category} for ${cupName}@${league}`);
      }
    }

    if (Object.keys(categoryData).length === 0) {
      console.error('No category data available for overall calculation');
      return null;
    }

    // Use leads as base (or first available category)
    const baseCategory = categoryData.leads || Object.values(categoryData)[0];
    const rankings = [];

    // Calculate overall score for each Pokemon
    for (const pokemonData of baseCategory) {
      const overallEntry = {
        speciesId: pokemonData.speciesId,
        speciesName: pokemonData.speciesName,
        rating: 0,
        matchups: [],
        counters: [],
        moves: pokemonData.moves,
        moveset: pokemonData.moveset,
        score: 0,
        scores: []
      };

      // Gather scores from each category
      const scores = [];

      for (const [category, data] of Object.entries(categoryData)) {
        const entry = data.find(p => p.speciesId === pokemonData.speciesId);
        if (entry) {
          scores.push(entry.score);
          overallEntry.scores.push(entry.score);
        }
      }

      if (scores.length === 0) continue;

      // Calculate overall using geometric mean
      const geometricMean = Math.pow(
        scores.reduce((acc, s) => acc * Math.max(s, 0.1), 1),
        1 / scores.length
      );

      overallEntry.score = geometricMean;
      overallEntry.rating = Math.round(geometricMean * 10);

      // Copy matchups and counters from leads (or best source)
      if (categoryData.leads) {
        const leadsEntry = categoryData.leads.find(p => p.speciesId === pokemonData.speciesId);
        if (leadsEntry) {
          overallEntry.matchups = leadsEntry.matchups || [];
          overallEntry.counters = leadsEntry.counters || [];
        }
      }

      rankings.push(overallEntry);
    }

    // Sort by score
    rankings.sort((a, b) => b.score - a.score);

    // Scale to 0-100
    const highest = rankings[0]?.score || 1;
    for (const ranking of rankings) {
      ranking.score = Math.round((ranking.score / highest) * 1000) / 10;
    }

    // Save overall rankings
    this.gm.saveRankingData(cupName, 'overall', league, rankings);

    // Calculate and save consistency rankings
    await this.rankConsistency(cupName, league, categoryData, progressCallback);

    return rankings;
  }

  // Calculate consistency ranking (how stable a Pokemon performs across scenarios)
  async rankConsistency(cupName, league, categoryData, progressCallback) {
    progressCallback?.(`Computing consistency rankings for ${cupName} @ ${league}...`);

    const categories = Object.values(categoryData);
    if (categories.length === 0) return null;

    const baseCategory = categories[0];
    const rankings = [];

    for (const pokemonData of baseCategory) {
      const scores = [];

      for (const data of categories) {
        const entry = data.find(p => p.speciesId === pokemonData.speciesId);
        if (entry) {
          scores.push(entry.score);
        }
      }

      if (scores.length < 2) continue;

      // Calculate standard deviation (lower = more consistent)
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      // Consistency score: higher mean with lower deviation is better
      // Formula: mean - (stdDev * penalty factor)
      const consistencyScore = mean - (stdDev * 0.5);

      rankings.push({
        speciesId: pokemonData.speciesId,
        speciesName: pokemonData.speciesName,
        score: Math.max(0, consistencyScore),
        rating: Math.round(consistencyScore * 10),
        scores: scores,
        stdDev: Math.round(stdDev * 10) / 10,
        matchups: pokemonData.matchups || [],
        counters: pokemonData.counters || [],
        moves: pokemonData.moves,
        moveset: pokemonData.moveset
      });
    }

    // Sort by consistency score
    rankings.sort((a, b) => b.score - a.score);

    // Scale to 0-100
    const highest = rankings[0]?.score || 1;
    for (const ranking of rankings) {
      ranking.score = Math.round((ranking.score / highest) * 1000) / 10;
    }

    // Save consistency rankings
    this.gm.saveRankingData(cupName, 'consistency', league, rankings);

    return rankings;
  }
}
