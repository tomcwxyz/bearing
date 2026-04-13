# Community Scoring Design

> Date: 2026-04-13
> Status: Approved

## Goal

Let signed-in users suggest scoring changes for models, and surface the aggregated signals to admins for review. Two input channels: detailed suggestions on model detail pages, and lightweight performance signals from the post-feedback flow.

## Data model

One new table:

```sql
CREATE TABLE score_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  model_slug TEXT NOT NULL,
  score_field TEXT NOT NULL,
  direction TEXT NOT NULL,       -- 'agree', 'too_high', 'too_low'
  suggested_value FLOAT,         -- optional specific value
  current_value FLOAT NOT NULL,
  source TEXT NOT NULL,           -- 'model_page' or 'feedback'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- `score_field`: dotted notation for nested fields (e.g. `task_fitness.code`, `speed_score`, `transparency.transparency_score`)
- One suggestion per user per model per score field (upsert on conflict)
- `source` distinguishes model page suggestions from post-feedback signals

## Model detail page — suggest changes

For signed-in users, a "Community scoring" section below the model's existing scores.

Each user-facing score shows three buttons: **Agree / Too high / Too low**. If Too high or Too low, an optional slider appears for a specific suggested value. Agree submits immediately.

User-facing scores (not all internal scores):
- Task fitness per type (code, summarise, generate, extract, analyse, translate, conversation, vision)
- Speed score
- Privacy score
- Transparency score (overall)
- Sustainability score (overall)

Granular sub-scores (open_weights, inference_energy, etc.) are admin-only — too detailed for community input.

One suggestion per user per score per model. If already submitted, show their previous vote.

## Post-feedback signals

After thumbs up/down on the feedback page, one optional extra step:

- **Thumbs down:** "Was this model worse than expected at:" → tappable pills: Speed, Quality, Capability
- **Thumbs up:** "Was this model better than expected at:" → tappable pills: Speed, Quality, Capability

Each selection creates a score_suggestion with `source: 'feedback'`:
- Speed → `speed_score` (too_low if thumbs up, too_high if thumbs down)
- Quality → `task_fitness.{task_type}` from the classified task
- Capability → `capability` general signal

Optional — users can skip to the thank you state.

## Admin aggregate views

**Insights tab — "Community Feedback" section:**
Table of models ranked by disagreement volume. Columns: Model, Total suggestions, Agree %, Disagree %, Most contested score. Only models with 3+ suggestions shown. Links to admin edit page.

**Admin edit page — inline aggregates:**
Next to each score: "8 agree, 3 too high, avg suggested: 0.85" in small text. Coral highlight when majority disagrees, teal when majority agrees. No auto-apply — admin reads signals and decides.

## What's not included

- Auto-apply thresholds (add when there's volume)
- Anonymous suggestions (sign-in required)
- Discussion/comments on suggestions
- Granular sub-score suggestions from community
