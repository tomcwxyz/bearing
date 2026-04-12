# Bearing — Design Document

**Date:** 2026-04-12
**Status:** Approved
**Spec:** modelpicker-spec-v1.2.md
**Registry:** bearing-registry-v0.2.0.json (authoritative for scoring factors)

---

## Overview

Bearing helps people choose the right AI model for their task. Describe what you want to do, set your priorities, get a ranked shortlist with transparent scoring. For ambiguous cases, signed-up users can run head-to-head comparisons. The tool collects structured outcome data published as an open dataset.

## Architecture

**Approach:** Server-first. All logic runs in Next.js server actions. The frontend collects input and displays results.

**Stack:**
- Next.js 15 (App Router)
- Tailwind CSS (brand defined via impeccable/frontend-design skills)
- Neon Postgres (serverless driver, raw SQL, no ORM)
- Claude Haiku (classification + reasoning)
- OpenRouter (Compare mode API gateway)
- Vercel (hosting)
- Resend (magic link emails)

## Data Flow — Recommend Mode

```
User input (description)
    → classifyTask() server action
        → Haiku with prompts/classify.md
        → Returns structured JSON
        → If confidence < 0.6: clarification questions (max 2 rounds)
    → scoreModels() server action
        → Loads registry JSON
        → Applies user priority weights to 7-factor scoring
        → Filters models failing hard capability requirements
        → Returns ranked list with per-factor scores
    → generateReasoning() server action
        → Haiku with top models + task context
        → Returns plain-English explanations (streams in parallel with results)
    → recordSelection() server action
        → Writes task, recommendations, selection to Neon
```

## File Structure

```
src/
├── app/
│   ├── page.tsx                          # Home — mode selection + task input
│   ├── recommend/[taskId]/
│   │   ├── page.tsx                      # Clarification questions
│   │   ├── priorities/page.tsx           # Priority ranking (drag-to-rank, 7 factors)
│   │   ├── results/page.tsx              # Ranked model list with scores
│   │   └── feedback/page.tsx             # Outcome feedback
│   ├── validate/
│   │   ├── page.tsx                      # Current model + task input
│   │   └── [taskId]/results/page.tsx     # Assessment (good fit / overpaying / better exists)
│   ├── compare/[taskId]/
│   │   ├── page.tsx                      # Model pair selection
│   │   └── results/page.tsx              # Side-by-side + preference vote
│   ├── models/
│   │   ├── page.tsx                      # Browsable registry
│   │   └── [slug]/page.tsx               # Individual model page
│   ├── about/page.tsx
│   └── data/page.tsx                     # Public dataset
├── lib/
│   ├── scoring.ts                        # Pure scoring function
│   ├── registry.ts                       # Loads & types the model registry
│   ├── classification.ts                 # Haiku classification
│   ├── reasoning.ts                      # Haiku reasoning generation
│   ├── weights.ts                        # Priority rank → weight conversion
│   └── db.ts                             # Neon connection + queries
├── data/
│   └── bearing-registry.json             # Registry, checked in
└── prompts/
    ├── classify.md                       # Classification prompt
    └── reason.md                         # Reasoning prompt
```

## Scoring Engine

Pure function in `lib/scoring.ts`. No side effects.

**7 factors (from registry v0.2.0):**

| Factor | Calculation |
|---|---|
| Cost | Inverse-normalised against cheapest. Contextualised to estimated tokens (short=500, medium=2000, long=8000, very_long=32000) |
| Speed | Direct from registry `speed_score` |
| Quality | `task_fitness[task_type]` from registry |
| Privacy | Direct from registry `privacy_score` |
| Sustainability | Registry `sustainability_score` (composite of inference_energy, training_footprint, provider_infrastructure) |
| Transparency | Registry `transparency_score` (composite of open_weights, open_training_data, open_methodology, licence_openness, provider_disclosure) |
| Capability | Binary pass/fail for hard requirements. Failing models excluded entirely |

**Priority → weight conversion:**

User's drag-to-rank ordering applies multipliers to default weights, then normalises to sum to 1.0:

| Rank | Multiplier |
|---|---|
| 1st | 2.0x |
| 2nd | 1.5x |
| 3rd | 1.2x |
| 4th | 1.0x |
| 5th | 0.8x |
| 6th | 0.6x |
| 7th | 0.4x |

**Default weights (from registry):** quality 0.25, capability 0.20, cost 0.20, transparency 0.10, privacy 0.10, sustainability 0.10, speed 0.05.

**Output per model:** weighted score, per-factor breakdown, estimated cost for task, exclusion status.

## Classification

Haiku via Anthropic SDK. Prompt checked into `prompts/classify.md`.

- Confidence threshold: 0.6
- Below threshold: 1–3 clarification questions as tappable options
- Maximum 2 clarification rounds, then proceed with low-confidence flag
- Too-vague descriptions get a "tell us more" response, not a guess

## Database

Neon Postgres via `@neondatabase/serverless`. Raw SQL, no ORM. Schema per the spec with two adaptations:

1. `tasks.priority_order` stores 7 factors (adds transparency)
2. `recommendations.factor_scores` stores 7 scores (adds transparency)

Tables: users, tasks, recommendations, selections, outcomes, comparisons — all as defined in the spec.

**Privacy:** No raw descriptions or prompts stored. SHA-256 hashes only for dedup. Public dataset never includes text, emails, or IPs.

**Migrations:** SQL files run against Neon manually. No migration framework for now.

## Auth & Compare Mode

**Auth:** Magic link only. No passwords, no OAuth, no auth library.
- Generate signed token with expiry → store in users table → send via Resend → verify on click → HTTP-only session cookie (30-day expiry)

**Compare flow:**
1. Select two models from ranked results
2. Pre-filled editable prompt (2,000 token cap)
3. Content filter via Haiku before sending
4. Both models called via OpenRouter
5. Side-by-side display (stacked on mobile), model names visible
6. Preference vote: A, B, or tie + optional free text
7. Rate limit: 2/day/user

## Pages

| Route | Purpose |
|---|---|
| `/` | Home — text area + mode tabs (Recommend / Validate) |
| `/recommend/[taskId]` | Clarification questions |
| `/recommend/[taskId]/priorities` | Drag-to-rank 7 factors |
| `/recommend/[taskId]/results` | Ranked model list with scores, reasoning, compare button |
| `/recommend/[taskId]/feedback` | Outcome feedback (thumbs + failure reasons) |
| `/validate` | Current model (autocomplete) + task description |
| `/validate/[taskId]/results` | Assessment: good fit / overpaying / better options |
| `/compare/[taskId]` | Model pair selection |
| `/compare/[taskId]/results` | Side-by-side outputs + preference vote |
| `/about` | What this is, privacy, repo link |
| `/data` | Public dataset downloads + methodology |
| `/models` | Browsable registry grid |
| `/models/[slug]` | Individual model detail |

## Public Dataset

Anonymised CSV/JSON, regenerated weekly. Published fields: task_type, task_subtype, complexity, input_length, capability_requirements, priority_order, models_recommended (slugs + ranks + scores), model_selected (slug + rank), outcome_success, failure_reason. Served from `/data`.

## Key Decisions

- Registry v0.2.0 is authoritative (7 factors, expanded sub-dimensions)
- Server-first: all logic in server actions, thin frontend
- No ORM — raw SQL with Neon serverless driver
- No auth library — hand-rolled magic link
- OpenRouter as single gateway for Compare mode
- Prompts checked into repo as markdown files
- Design/brand to be developed using impeccable/frontend-design skills
