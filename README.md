# Bearing

**Find the right AI model for your task.**

Describe what you want to do, tell us what matters to you, and get a ranked shortlist of models with transparent scoring. For tasks where it's hard to judge from specs alone, validate whether your current model is the best fit.

The tool collects structured outcome data on what people actually want AI to do and which models work. This dataset — anonymised and published openly — is a core output, not a byproduct.

Built by [The Good Ship](https://good-ship.co.uk) | CC BY-NC 4.0

## Three modes

### 1. Recommend

*"I need to do X — what should I use?"*

Describe your task, answer a few clarifying questions, rank your priorities. Get a ranked list of models with transparent per-factor scoring and plain-English reasoning.

### 2. Validate

*"I'm using GPT-5.4 for everything — is that right?"*

Name your current model and what you use it for. See where it sits in the ranking — good fit, overpaying, or better options exist.

### 3. Compare (coming soon)

*"Show me the difference."*

Pick two models, same prompt, real outputs side by side. You pick which you preferred. Generates high-quality pairwise preference data.

## How scoring works

Every model is scored across **7 factors**:

| Factor | What it measures |
|--------|-----------------|
| **Quality** | Task-specific fitness from benchmark and community data |
| **Capability** | Required features (vision, code, tools, long context) |
| **Cost** | Estimated cost for your specific task type |
| **Transparency** | Open weights, training data, methodology, FMTI scores |
| **Privacy** | Data retention and handling policies |
| **Sustainability** | Inference energy, training footprint, provider infrastructure |
| **Speed** | Response latency |

Your priority ranking shifts the weights. The scoring function is a pure, tested TypeScript function — no black box.

## Model registry

24 models across 11 providers:

- **Anthropic**: Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano
- **Google**: Gemini 3.1 Pro, Gemini 3 Flash, Gemini 2.5 Flash-Lite
- **DeepSeek**: V4, R1, R1 0528
- **Meta**: Llama 4 Maverick
- **Mistral**: Medium 3, OCR (Pixtral Large), Codestral, Devstral
- **Alibaba**: Qwen 2.5 72B, Qwen 3 235B
- **Moonshot AI**: Kimi K2
- **MiniMax**: MiniMax-M1
- **GreenPT**: GreenL, GreenR
- **IBM**: Granite 3.3

Registry data includes transparency scoring (referencing Stanford FMTI 2025) and expanded sustainability sub-dimensions.

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4, Fraunces + DM Sans + JetBrains Mono |
| Database | Neon (Postgres, serverless) |
| Classification | Claude Haiku via Anthropic SDK |
| Reasoning | Claude Haiku via Anthropic SDK |
| Model data | Static JSON registry (checked in) |
| Hosting | Vercel |

## Getting started

```bash
# Clone
git clone https://github.com/dataforaction-tom/bearing.git
cd bearing

# Install
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   NEON_DATABASE_URL=postgresql://...
#   OPENROUTER_API_KEY=sk-or-...

# Run database migration
psql $NEON_DATABASE_URL -f src/db/migrations/001-initial-schema.sql

# Start dev server
npm run dev
```

## Project structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Home — task input + mode tabs
│   ├── recommend/[taskId]/       # Recommend flow
│   │   ├── page.tsx              # Clarification questions
│   │   ├── priorities/page.tsx   # Priority ranking
│   │   ├── results/              # Ranked results
│   │   └── feedback/page.tsx     # Outcome feedback
│   ├── validate/                 # Validate flow
│   │   ├── page.tsx              # Model + task input
│   │   └── [taskId]/results/     # Assessment results
│   ├── models/                   # Browsable registry
│   ├── about/page.tsx
│   └── actions.ts                # Server actions
├── lib/
│   ├── scoring.ts                # Pure 7-factor scoring function
│   ├── registry.ts               # Typed model registry loader
│   ├── weights.ts                # Priority → weight conversion
│   ├── classification.ts         # Haiku task classification
│   ├── reasoning.ts              # Haiku reasoning generation
│   └── db.ts                     # Neon connection + queries
├── data/
│   └── bearing-registry.json     # 17 models, 8 providers
├── prompts/
│   ├── classify.md               # Classification prompt
│   └── reason.md                 # Reasoning prompt
└── db/migrations/
    └── 001-initial-schema.sql    # Postgres schema
```

## Testing

```bash
npm test          # Run all tests (vitest)
npm run test:watch  # Watch mode
npm run build     # Production build
npm run lint      # ESLint
```

19 unit tests covering the scoring engine, weight conversion, registry loader, and classification parsing.

## Privacy

We do not store raw task descriptions or prompts. What we store: hashed descriptions (for dedup), classified task attributes, model recommendations, selections, and outcomes. The anonymised dataset contains task type, priorities, model chosen, and outcome — never the original text.

## Roadmap

- [x] Sprint 1: Core recommend flow
- [x] Sprint 2: Validate mode + visual design
- [ ] Sprint 3: Compare mode (head-to-head, magic link auth)
- [ ] Sprint 4: Public dataset export + analysis

## Contributing

The scoring function, quality estimates, and default weights are all in the repo. They're wrong — the question is whether they're useful enough to learn from. PRs welcome, especially to the model registry.

## Licence

CC BY-NC 4.0
