# ModelPicker — v1 Product Spec

**The Good Ship · tomcw.xyz · CC BY-NC 4.0**  
**Status:** Draft v2 · April 2026  
**Repo:** `good-ship-co/modelpicker` (proposed)

---

## What is this?

ModelPicker helps people choose the right AI model for their task. Describe what you want to do, tell us what matters to you, and get a ranked shortlist of models with transparent reasoning. For tasks where it's hard to judge from specs alone, signed-up users can run a head-to-head comparison — same prompt, two models, real outputs side by side.

The tool collects structured outcome data on what people actually want AI to do and which models work. This dataset — anonymised and published openly — is a core output, not a byproduct.

## Why build it?

Most people default to whatever model they've heard of. Most routing tools (RouteLLM, OpenRouter, Unify) optimise for developers who already understand the landscape. There's nothing that helps non-technical users make an informed choice, nothing that lets them validate whether their current model is the right fit, and nothing collecting real-world "did it actually work?" data across task types.

Existing benchmarks (MMLU, MT-Bench, Chatbot Arena) measure synthetic tasks. ModelPicker measures real-world intent and outcomes. That dataset — what people want to use AI for, what they prioritise, and whether the model delivered — is genuinely novel and publicly useful.

## Prior art

| Tool | What it does | Gap we fill |
|------|-------------|-------------|
| **RouteLLM** (LMSys) | Open source binary router using preference data | Automated, no user agency, developer-only |
| **OpenRouter** | API gateway with model selection and some auto-routing | API-level, not user-facing, commercial |
| **Unify** | Routes to optimal model/provider per prompt | Developer tool, opaque routing logic |
| **Not-Diamond** | ML-based routing with pairwise comparisons | Closed source, enterprise focus |
| **Chatbot Arena** | Crowdsourced model comparison via blind voting | Compares outputs but doesn't start from user intent or task context |

None of these educate the user, start from their priorities, or collect structured task→outcome data.

---

## Three modes

### 1. Recommend

*"I need to do X — what should I use?"*

The primary flow. User describes their task, answers a few clarifying questions, sets their priorities. Gets a ranked list of 5–10 models with transparent scoring. Selects one. We record the choice.

### 2. Validate

*"I'm using GPT-4o for everything — is that right?"*

User names their current model and describes what they use it for. We show where it sits in the ranking for that task type, flag if they're overpaying or missing capability, and suggest alternatives if relevant. Lower friction, higher value for people who already have a setup.

### 3. Compare (signed-up users, 2/day)

*"I can't tell from specs — show me the difference."*

For tasks where the right model isn't obvious from capability data alone (creative writing, nuanced analysis, tone-sensitive work), users can pick two models from their ranked list and run a head-to-head. Same prompt sent to both models, outputs displayed side by side. User picks which they preferred. This generates high-quality pairwise preference data.

Limited to signed-up users (email only, no password — magic link), capped at 2 comparisons per day to manage API costs.

---

## User flow: Recommend (primary)

### Step 1: Describe

Single text area: "What do you want to use AI for?"

No toggles or checkboxes at this stage — we ask follow-ups based on what they write rather than front-loading a form.

### Step 2: Clarify

Based on the initial description, 1–3 quick follow-up questions to sharpen the classification. Presented as tappable options, not open text. Examples:

- "Is this a one-off task or something you'll do regularly?"
- "Roughly how long is the input? A paragraph, a page, or a full document?"
- "Does this involve images or files, or is it text only?"

If the description is too vague to classify ("help me with AI stuff"), we say so and ask for more detail rather than guessing.

There's a confidence threshold in the classification step. Below it, we ask more questions. Above it, we proceed. The threshold and the classification prompt are both in the repo, visible and improvable.

### Step 3: Prioritise

"What matters most to you?" — a drag-to-rank of 4–6 factors:

- **Cost** — keeping spend low
- **Speed** — fast responses
- **Quality** — best possible output
- **Privacy** — data handling and retention policies
- **Sustainability** — energy and environmental footprint
- **Capability** — specific features (vision, tool use, long context, code)

Default ranking provided (quality > capability > cost > speed > privacy > sustainability) but user can reorder. This directly weights the scoring function.

### Step 4: Ranked results

A list of 5–10 models, ranked by weighted score. Each card shows:

- Rank position and model name/provider
- **Match score** — a clear number or bar showing overall fit
- **Why this rank** — one-sentence plain-English reasoning
- Per-factor scores (cost, speed, quality, etc.) shown as a small radar chart or bar breakdown so users can see *where* each model wins or loses
- Estimated cost for their specific task type (not just per-1K-tokens — contextualised: "roughly $0.02 for this task" where we can estimate)
- Capability flags relevant to their task

The #1 recommendation is highlighted but not forced. Users can see the full list and make their own call.

**"Compare these two" button** available on any pair (signed-up users only).

### Step 5: Select

User taps "Use this one" on their chosen model. This is the primary feedback signal — which model, at which rank, did they choose? Did they go with #1 or override to pick #4? That override data is gold.

### Step 6: Outcome (optional but encouraged)

Persistent URL and optional email follow-up. Thumbs up/down plus:

- "What went wrong?" (if thumbs down) — tappable options: too slow, poor quality, too expensive, couldn't do what I needed, other
- Free-text optional

Completion rate will be low (estimated 10–20%). That's fine. The selection signal from Step 5 is the primary data; outcome is bonus.

---

## User flow: Validate

### Step 1: Current setup

"What model are you currently using, and what for?"

Two fields: model name (with autocomplete from registry) and task description.

### Step 2: Assessment

Shows where their current model sits in the ranking for their task type, with their inferred priorities. Three possible states:

- **Good fit** — "This is a strong choice for what you're doing. Here's why." (with the scoring breakdown)
- **Overpaying** — "This works well, but you could get similar results for less with X."
- **Better options exist** — "For this task type, X would likely perform better. Here's the comparison."

Always shows the full ranked list so they can explore.

---

## User flow: Compare

### Step 1: Select pair

From the ranked results, user picks two models. (Or arrives here from the "Compare these two" button on results.)

### Step 2: Prompt

We pre-fill a prompt based on their task description, which they can edit. For safety: the prompt is reviewed by a lightweight content filter before being sent. Maximum prompt length capped (e.g., 2,000 tokens).

### Step 3: Side-by-side output

Both model responses displayed side by side (stacked on mobile). Model names visible — this isn't blind testing. We want users to build intuition, not just vote.

### Step 4: Preference

"Which response did you prefer?" — pick A or B, or "about the same." Optional: "Why?" as free text.

This generates pairwise preference data in the same format as Chatbot Arena, but anchored to a specific task type and user priorities. Much richer signal.

---

## Architecture

### Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Next.js (App Router) | Existing stack |
| Hosting | Vercel | Free tier, existing setup |
| Database | Neon (Postgres) | Free tier, serverless, existing stack |
| Auth | Magic link (email only) | Minimal friction, needed only for Compare |
| Styling | Tailwind + Good Ship brand tokens | Consistent identity |
| Task classification | Claude Haiku via API | Cheap, fast, handles clarification logic |
| Recommendation reasoning | Claude Haiku via API | Writes plain-English explanations |
| Head-to-head calls | Multiple provider APIs | OpenRouter as unified gateway, or direct provider SDKs |
| Model data | Static JSON + programmatic pricing | JSON for capabilities, API-fetched for pricing where possible |
| License | MIT | Maximum adoption |

### Data model

```sql
-- Users (Compare feature only)
users (
  id              uuid primary key,
  email           text unique not null,
  created_at      timestamptz default now(),
  comparisons_today int default 0,
  last_comparison_date date
)

-- Core task submissions
tasks (
  id              uuid primary key,
  created_at      timestamptz default now(),
  description_hash text,        -- hash of original description (not stored raw)
  task_type       text,         -- classified: summarise | generate | extract | code | analyse | translate | conversation | other
  task_subtype    text,         -- optional refinement from clarification
  complexity      text,         -- simple | moderate | complex
  input_length    text,         -- short | medium | long | very_long
  needs_vision    boolean default false,
  needs_tools     boolean default false,
  needs_code      boolean default false,
  is_recurring    boolean default false,
  mode            text,         -- recommend | validate | compare
  priority_order  jsonb,        -- ordered array of user's ranked priorities
  classification_confidence float -- how confident the classifier was
)

-- What we recommended (full ranked list)
recommendations (
  id              uuid primary key,
  task_id         uuid references tasks(id),
  model_slug      text,
  rank            int,
  weighted_score  float,
  factor_scores   jsonb,        -- { cost: 0.8, speed: 0.9, quality: 0.7, ... }
  reasoning       text,
  created_at      timestamptz default now()
)

-- What they chose
selections (
  id              uuid primary key,
  task_id         uuid references tasks(id),
  model_slug      text,
  recommended_rank int,          -- what rank was this model? (1 = top pick, 4 = override)
  source          text,          -- recommend | validate | compare
  created_at      timestamptz default now()
)

-- Outcome feedback (optional)
outcomes (
  id              uuid primary key,
  task_id         uuid references tasks(id),
  selection_id    uuid references selections(id),
  success         boolean,
  failure_reason  text,          -- too_slow | poor_quality | too_expensive | missing_capability | other
  feedback        text,
  created_at      timestamptz default now()
)

-- Head-to-head comparisons
comparisons (
  id              uuid primary key,
  task_id         uuid references tasks(id),
  user_id         uuid references users(id),
  model_a_slug    text,
  model_b_slug    text,
  prompt_hash     text,          -- hash of the prompt sent
  preferred       text,          -- model_a | model_b | tie
  preference_reason text,
  created_at      timestamptz default now()
)
```

### Privacy approach

**We do not store raw task descriptions or prompts.**

What we store: hashed descriptions (for deduplication), classified task attributes, model recommendations, selections, and outcomes. The anonymised dataset contains task type, priorities, model chosen, rank override, and outcome — never the original text.

For Compare mode: prompts are sent to model APIs in real time and not persisted. We store a hash for deduplication and abuse prevention only.

The privacy policy and data processing approach will be documented in the repo and linked from the tool. This is a data controller situation — we're collecting and processing data about user choices — and the privacy notice should reflect that clearly.

### Model registry

Two layers:

**1. Static capability data** (checked into repo as JSON):

```json
{
  "claude-sonnet-4": {
    "name": "Claude Sonnet 4",
    "provider": "Anthropic",
    "context_window": 200000,
    "capabilities": ["vision", "tools", "code", "long_context"],
    "strengths": ["Balanced cost/quality", "Strong at structured tasks", "Good code generation"],
    "weaknesses": ["Not the cheapest for simple tasks"],
    "best_for": ["summarise", "extract", "code", "analyse"],
    "data_retention": "none_by_default",
    "sustainability_rating": null,
    "updated": "2026-04-09"
  }
}
```

**2. Dynamic pricing** (fetched from OpenRouter or provider APIs on a schedule, cached):

```json
{
  "claude-sonnet-4": {
    "cost_input_per_1m": 3.00,
    "cost_output_per_1m": 15.00,
    "last_fetched": "2026-04-09T12:00:00Z"
  }
}
```

This separates the fast-changing data (pricing) from the slow-changing data (capabilities), so community PRs to the capability registry don't require chasing price updates.

Start with 10–15 models: 2–3 Anthropic, 2–3 OpenAI, 2 Google, 2–3 open source (Llama, Mistral, Qwen), 1–2 specialist (e.g., Codestral for code). Enough to give meaningful rankings without pretending to be comprehensive.

### Scoring function

The scoring function is the core logic and must be transparent. It lives in a single, well-documented file (e.g., `lib/scoring.ts`).

**Inputs:**
- Classified task attributes (type, complexity, input length, capability requirements)
- User's priority ranking (mapped to weights)
- Model registry data (capabilities, pricing, speed)

**Per-factor scores (0–1):**

| Factor | How it's calculated |
|--------|-------------------|
| Cost | Inverse normalised against the cheapest model in the set. Contextualised to estimated token usage for this task type |
| Speed | Based on provider-reported latency tiers and context window overhead |
| Quality | Task-type-specific quality estimate based on benchmark data and community consensus. This is the weakest signal in v1 — we acknowledge that |
| Privacy | Based on provider data retention policies and terms |
| Sustainability | Based on published data where available, null/estimated otherwise. Flagged as uncertain |
| Capability | Binary for hard requirements (needs vision → must have vision), graduated for soft requirements |

**Weighting:**
User's priority ranking is converted to weights. Default: quality 0.30, capability 0.25, cost 0.20, speed 0.10, privacy 0.10, sustainability 0.05. User reordering shifts these proportionally.

**Output:**
Weighted sum per model → ranked list. Models that fail hard capability requirements are excluded entirely (not just ranked low).

The weights, the factor calculations, and the quality estimates are all in the repo. We expect and welcome debate about them. They're wrong — the question is whether they're useful enough to learn from.

### Classification prompt

The classification prompt is a checked-in file (`prompts/classify.md`), not buried in code. It takes the user's description and any clarification answers, and outputs structured JSON:

```json
{
  "task_type": "generate",
  "task_subtype": "funding_proposal",
  "complexity": "complex",
  "input_length": "medium",
  "needs_vision": false,
  "needs_tools": false,
  "needs_code": false,
  "is_recurring": true,
  "confidence": 0.85,
  "clarification_needed": false,
  "suggested_questions": []
}
```

Below a confidence threshold (0.6), the system asks follow-up questions instead of proceeding. The threshold is configurable and visible.

---

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Home — mode selection (Recommend / Validate) and task input |
| `/recommend/[taskId]` | Clarification questions (if needed) |
| `/recommend/[taskId]/priorities` | Priority ranking |
| `/recommend/[taskId]/results` | Ranked model list with scores |
| `/recommend/[taskId]/feedback` | Outcome feedback |
| `/validate` | Validate mode — current model + task input |
| `/validate/[taskId]/results` | Validation assessment |
| `/compare/[taskId]` | Head-to-head setup (model pair selection) |
| `/compare/[taskId]/results` | Side-by-side outputs + preference vote |
| `/about` | What this is, how data is used, privacy, repo link |
| `/data` | Public dataset — downloadable, documented, with methodology |
| `/models` | Browsable model registry with full capability data |
| `/models/[slug]` | Individual model page with aggregated performance data |

---

## Public dataset

The anonymised dataset is a headline output of this project, not a stretch goal.

**Published fields per record:**

```
task_type, task_subtype, complexity, input_length,
capability_requirements, priority_order,
models_recommended (slugs + ranks + scores),
model_selected (slug + recommended_rank),
outcome_success (if provided), failure_reason (if provided)
```

**Never published:** raw descriptions, prompts, email addresses, IP addresses, or anything that could identify a user or their organisation.

**Format:** CSV and JSON, updated weekly, hosted in the repo and available via a simple API endpoint.

**Why this matters:** There is currently no public dataset of "what do real people want to use AI for, what do they prioritise, and did the model work?" Benchmark datasets test model capability. This tests model fit. That's a different and complementary signal that's useful for anyone building routing, recommendation, or evaluation tools.

---

## Training our own model (v1.5)

Everything in v1 is designed to generate training data for a custom routing model in v1.5.

**What we're collecting:**
- Task descriptions (classified, not raw) → what people want
- Priority weightings → what they care about
- Selection rank overrides → where our scoring was wrong
- Outcome data → whether the model actually worked
- Pairwise preferences from Compare → which model is better for which task type

**v1.5 goal:** Train a small classifier (fine-tuned on our data) that predicts the best model for a given task+priority combination, replacing or augmenting the rule-based scoring function. This is the same approach as RouteLLM but trained on real-world intent data rather than synthetic benchmarks.

**What we need before training:**
- Minimum ~1,000 task submissions with selections
- Minimum ~200 outcome signals
- Minimum ~100 pairwise comparisons
- Enough spread across task types to avoid bias toward the most common use case

The v1 scoring function stays as a baseline. The trained model either replaces it (if it's better) or runs alongside it (if we want to A/B test). Either way, the rule-based system remains as a fallback and as a transparent reference point.

---

## Costs

### Per-request costs (Recommend/Validate mode)

| Component | Estimated cost |
|-----------|---------------|
| Classification (Haiku) | ~$0.0003 |
| Reasoning generation (Haiku) | ~$0.0005 |
| Total per recommendation | ~$0.001 |

At 10,000 recommendations: ~$10.

### Per-comparison costs (Compare mode)

Depends on models selected. Worst case (two expensive models, long prompt):

| Component | Estimated cost |
|-----------|---------------|
| Model A call | $0.01–$0.10 |
| Model B call | $0.01–$0.10 |
| Total per comparison | $0.02–$0.20 |

At 2/day/user, 50 active users: ~$5–$20/day worst case. The daily cap is the cost control.

### Infrastructure

| Component | Cost |
|-----------|------|
| Vercel | Free tier |
| Neon | Free tier (0.5 GB) |
| Domain | Existing |
| OpenRouter API key | Pay-as-you-go for Compare |

Total monthly infrastructure cost at moderate usage: **$20–$50**, almost entirely from Compare mode API calls.

---

## Development plan

### Sprint 1: Core recommend flow — ~4 days

- [ ] Repo setup (Next.js, Tailwind, Neon, Good Ship brand)
- [ ] Model registry JSON (10–15 models)
- [ ] Dynamic pricing fetch from OpenRouter API
- [ ] Classification prompt + Haiku integration
- [ ] Clarification question flow
- [ ] Priority ranking interface
- [ ] Scoring function (documented, tested)
- [ ] Ranked results display
- [ ] Selection tracking
- [ ] Deploy to Vercel

### Sprint 2: Validate + feedback loop — ~3 days

- [ ] Validate mode (model autocomplete, assessment logic)
- [ ] Outcome feedback flow (persistent URLs)
- [ ] About page with privacy notice
- [ ] `/models` browsable registry
- [ ] Basic analytics dashboard (internal)
- [ ] Open source repo polish (README, LICENSE, CONTRIBUTING, scoring methodology doc)

### Sprint 3: Compare + public dataset — ~4 days

- [ ] Magic link auth (email only)
- [ ] Compare mode (model pair selection, dual API calls, side-by-side display)
- [ ] Rate limiting (2/day)
- [ ] Content filter on prompts
- [ ] Pairwise preference capture
- [ ] Public dataset export (CSV, JSON, API endpoint)
- [ ] Dataset documentation and methodology page
- [ ] `/data` page

### Sprint 4: Learn + write — ~2 days

- [ ] First dataset analysis
- [ ] Blog post: what people actually want to use AI for
- [ ] Weeknote / LinkedIn post
- [ ] Model registry update based on new releases
- [ ] Review scoring function against early outcome data
- [ ] Document v1.5 training requirements and data quality thresholds

---

## Naming

**ModelPicker** is the working name. Open to something with more character. Candidates:

- **Bearing** — navigational, fits Good Ship metaphor, implies finding direction
- **Sounding** — nautical (measuring depth), implies testing/understanding
- **Tack** — nautical (changing direction), implies choosing a course
- **Which Model** — descriptive, SEO-friendly, forgettable
- **ModelPicker** — functional, clear, unremarkable

---

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Model data goes stale | Programmatic pricing + community PRs for capabilities. Monthly review cycle |
| Classification is wrong | Confidence threshold + follow-up questions. Show classification to user, let them correct |
| Nobody gives feedback | Selection signal is primary data; outcome is bonus. Compare mode generates high-quality data even without post-hoc feedback |
| Quality scores are unreliable | Acknowledge openly. Use benchmark data as starting point, improve with outcome data. Flag uncertainty in the UI |
| Sustainability data is sparse | Show "data not available" honestly rather than guessing. Lobby providers for better disclosure |
| Compare mode is abused | Rate limit (2/day), content filter, magic link auth, prompt length cap |
| Recommendations feel obvious | That's fine — transparency and data collection are the value, not surprising insights |
| Haiku calls are too coarse for classification | Monitor confidence scores. If median confidence is low, upgrade to Sonnet for classification (still cheap) |
| Privacy incident | No raw text stored. Hashed descriptions. Clear privacy notice. Regular audit of what's in the database |

---

## Success metrics

| Timeframe | Target |
|-----------|--------|
| Week 2 | Deployed, working, 10+ models. Shared via weeknotes + LinkedIn |
| Month 1 | 200+ task submissions. 50+ selections. 20+ outcomes. First community PR to model registry |
| Month 2 | Compare mode live. 50+ pairwise comparisons. First public dataset export |
| Month 3 | 1,000+ tasks in dataset. Blog post on findings. Assessment of whether we have enough data for v1.5 training |
| Month 6 | v1.5 trained model running alongside rule-based scoring. Published comparison of both approaches |

---

## What v2 looks like (not in scope)

- Embeddable widget / web component for other products
- API endpoint for programmatic recommendations
- Automatic model registry from provider APIs
- Trained routing model as a service
- Organisation-level dashboards ("your team uses X models, here's your cost profile")
- Integration with OpenRouter / LiteLLM for direct model access from results

---

*This spec is designed to ship fast and learn. The rule-based scoring will be wrong. The quality estimates will be debatable. The sustainability data will be patchy. That's the point — we're building a system that improves from use, and we're being transparent about what we don't know yet.*
