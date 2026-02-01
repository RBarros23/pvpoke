# CLI Rankings Generator

Generate custom rankings from the terminal without opening a browser.

## Commands

```bash
# 1. Start the server
docker compose up -d

# 2. Install dependencies (first time only)
cd scripts && npm install && cd ..

# 3. Generate rankings
./scripts/generate.sh --config cups/championship2026.json
```

Results are saved to `data/rankings/`.

## Custom Cup JSON Format

Create a JSON file in the `cups/` folder:

```json
{
  "cups": [
    {
      "name": "mycup",
      "title": "My Custom Cup",
      "league": 1500,
      "include": [
        { "filterType": "type", "values": ["bug", "dark", "dragon"] },
        { "filterType": "id", "values": ["seaking", "politoed"] }
      ],
      "exclude": [
        { "filterType": "type", "values": ["fighting", "steel"] },
        { "filterType": "tag", "values": ["legendary", "mythical", "mega", "ultrabeast"] },
        { "filterType": "id", "values": ["wigglytuff", "chansey"] }
      ]
    }
  ]
}
```

## Filter Types

| Filter | Description | Example |
|--------|-------------|---------|
| `type` | Pokemon types | `["bug", "dark", "fire", "water"]` |
| `tag` | Pokemon tags | `["legendary", "mythical", "mega", "shadow", "ultrabeast"]` |
| `id` | Specific Pokemon IDs (lowercase) | `["pikachu", "charizard"]` |
| `dex` | Dex number range | `[1, 151]` |

## Multiple Cups

Define multiple cups in one file - they will all be generated:

```json
{
  "cups": [
    { "name": "cup1", "title": "Cup One", "league": 1500, "include": [...], "exclude": [...] },
    { "name": "cup2", "title": "Cup Two", "league": 2500, "include": [...], "exclude": [...] }
  ]
}
```

## Output

Rankings are enhanced with Pokemon and move types:

```json
{
  "speciesId": "bulbasaur",
  "types": ["grass", "poison"],
  "moveset": [
    { "moveId": "VINE_WHIP", "type": "grass" },
    { "moveId": "FRENZY_PLANT", "type": "grass" }
  ],
  "matchups": [
    {
      "opponent": "charizard",
      "types": ["fire", "flying"],
      "moves": [{ "moveId": "FIRE_SPIN", "type": "fire" }, ...]
    }
  ]
}
```
