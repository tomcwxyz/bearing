# Contributing to Bearing

Thanks for your interest. Bearing is an open project and contributions are welcome.

## Model registry

The most valuable contribution is improving the model registry at `src/data/bearing-registry.json`. This includes:

- **Adding new models** as they're released
- **Updating pricing** when providers change rates
- **Correcting task fitness scores** based on real-world experience
- **Improving transparency/sustainability data** with better sources
- **Fixing inaccuracies** in capabilities, context windows, or provider info

### How to add a model

Each model follows this structure in the registry JSON:

```json
"model-slug": {
  "name": "Display Name",
  "provider": "Provider Name",
  "tier": "flagship|balanced|budget|reasoning|specialist_*",
  "pricing": { "input_per_1m": 1.0, "output_per_1m": 5.0 },
  "context_window": 128000,
  "capabilities": ["vision", "tools", "code", ...],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "task_fitness": {
    "summarise": 0.8, "generate": 0.8, "extract": 0.8,
    "code": 0.8, "analyse": 0.8, "translate": 0.8,
    "conversation": 0.8, "vision": 0.0
  },
  "speed_score": 0.7,
  "privacy_score": 0.7,
  "transparency": { ... },
  "sustainability": { ... }
}
```

Task fitness scores are 0.0-1.0 estimates. They don't need to be perfect — they'll improve with real outcome data from users.

## Scoring function

The scoring logic lives in `src/lib/scoring.ts`. It's a pure function with tests. If you think the scoring methodology is wrong, open an issue to discuss before sending a PR.

## Code contributions

1. Fork the repo
2. Create a branch (`git checkout -b my-change`)
3. Make your changes
4. Run tests (`npm test`)
5. Run the build (`npm run build`)
6. Open a PR with a clear description of what and why

## Development setup

```bash
npm install
cp .env.local.example .env.local
# Fill in your API keys
npm run dev
```

## Reporting issues

Open an issue on GitHub. Include:
- What you expected
- What actually happened
- Steps to reproduce (if applicable)
