# User Guide

This guide covers everything you need to know about using Bearing to find, validate, and compare AI models.

## Getting a recommendation

This is the main way most people use Bearing. You describe what you want to do, and Bearing tells you which model is the best fit.

### Step 1: Describe your task

On the home page, type a description of what you want to use AI for. Be specific — "summarise long research papers into bullet points" works better than "help me with documents."

### Step 2: Answer any follow-up questions

If Bearing needs more context, you'll see a few quick questions with tappable options. Things like "Is this a one-off task or something you'll do regularly?" or "Does this involve images?" Answer them and tap **Continue**.

If your description is clear enough, you'll skip this step entirely.

### Step 3: Rank your priorities

You'll see seven factors, each representing something that might matter to you:

- **Quality** — best possible output for your task
- **Capability** — specific features like vision, code generation, or long documents
- **Cost** — keeping spend low
- **Transparency** — open weights, published training data, methodology
- **Privacy** — how your data is handled and retained
- **Sustainability** — energy use and environmental footprint
- **Speed** — how fast responses come back

Drag them into the order that matters to you. The factor at the top has the most influence on your results. Tap the up/down arrows if you prefer not to drag.

### Step 4: Review your results

You'll see a ranked list of models, best fit first. Each model card shows:

- A **match score** (percentage) showing how well it fits your task and priorities
- A **one-sentence explanation** of why it ranked where it did
- **Per-factor scores** so you can see exactly where each model is strong or weak
- An **estimated cost** for your specific task type

The top recommendation is highlighted, but you can choose any model from the list.

### Pipeline recommendations

If your task involves multiple steps — like extracting text from a PDF and then summarising it — Bearing may suggest a **pipeline alternative** below the main results. A pipeline recommends a different specialist model for each stage of your task, often resulting in better quality or lower cost than using a single model for everything.

Each stage shows a recommended model and one alternative. The footer compares the total pipeline cost against the top single-model recommendation so you can see the trade-off at a glance.

Not every task gets a pipeline suggestion — only tasks where splitting the work across models would genuinely help.

### Step 5: Select a model

Tap **Use this one** on the model you want to try. This records your choice (anonymously) and helps improve future recommendations.

After selecting, you'll see a link to give feedback later — bookmark it if you want to come back after trying the model.

## Validating your current model

Already using a model? Check if it's the best fit for what you're doing.

### How it works

1. Go to the **Validate** tab on the home page, or visit the Validate page directly
2. Start typing your model's name — a dropdown will show matching models from the registry
3. Describe what you use the model for
4. Tap **Check my model**

### What you'll see

Bearing will show one of three assessments:

- **Good fit** — your model is a strong choice for this task. You'll see why, with a scoring breakdown.
- **Overpaying** — your model works fine, but you could get similar results for less. You'll see the cheaper alternative.
- **Better options exist** — for this task type, other models would likely perform better. You'll see the top alternatives and where your current model ranks.

In all cases, the full ranked list is shown below so you can explore.

## Comparing two models

For tasks where specs alone don't tell the full story — creative writing, nuanced analysis, tone-sensitive work — you can run a head-to-head comparison.

### Requirements

- You need to **sign in** with your email (magic link, no password)
- You get **2 comparisons per day** (to manage API costs)

### How it works

1. From your recommendation results, tap **Compare two models head-to-head**
2. Select exactly two models from your ranked list
3. Write or edit a prompt for your task
4. Optionally **attach a file** (PDF or CSV, up to 5MB) — both models will process the same document alongside your prompt
5. Tap **Run comparison** — both models receive the same prompt and file
6. Read both responses side by side (model names are visible — this isn't blind testing)
7. Vote: **Model A**, **Model B**, or **About the same**
8. Optionally explain why

### Attaching files

When you attach a file, models that support vision (marked with a **Vision** badge) receive the raw document. Text-only models receive the extracted text content instead. This means you can compare how a vision model handles a PDF layout versus how a text model handles the same content as plain text.

Your preference is recorded as pairwise data — the same format used by research benchmarks like Chatbot Arena, but anchored to your specific task type and priorities.

## Browsing the model registry

Visit the **Models** page to explore all 29 models in the registry.

### Filtering

- **Search** — type a model name, provider, or slug
- **Provider filters** — tap a provider name to see only their models
- **Capability filters** — tap Vision, Code, Tools, Long context, Reasoning, Audio, or Video to filter by capability

Tap any filter again to remove it, or use **Clear filters** to reset.

### Model detail pages

Click any model card to see its full profile:

- Capabilities, strengths, and weaknesses
- Pricing (per million tokens, input and output)
- Transparency scores (open weights, training data, methodology, licence, provider disclosure)
- Sustainability data (inference energy, training footprint, provider infrastructure)
- Task fitness bars showing how well the model performs across different task types

Want to understand how these scores are calculated? See [How We Rate Models](model-ratings.md) for the full methodology, research sources, and decisions behind every rating.

## Giving feedback

After trying a model, come back to give feedback using the bookmarkable link from your results page.

- **Worked well** — great, this helps confirm the recommendation
- **Not great** — select what went wrong: too slow, poor quality, too expensive, couldn't do what you needed, or other
- Add an optional comment

Feedback is the most valuable signal for improving recommendations. Even a thumbs up helps.

## The public dataset

All anonymised data is available for download on the **Data** page.

- **Recommendation data** — task types, priorities, which model was recommended and chosen, outcomes
- **Comparison data** — which model was preferred in head-to-head tests

Available in JSON and CSV formats. Never includes raw descriptions, prompts, email addresses, or anything that could identify you.

## Managing models (admin)

If you have admin access, you can add, edit, and deactivate models directly from the browser.

### Accessing the admin panel

Visit `/admin` while signed in with an admin account. You'll see a table listing every model in the registry with its name, provider, tier, speed score, and pricing.

### Editing a model

Click **Edit** next to any model to open the edit form. The form is organised into sections:

- **Basic info** — name, provider, and tier category
- **Pricing** — input and output cost per million tokens
- **Performance** — context window size, speed score, and privacy score (sliders from 0 to 1)
- **Capabilities** — toggle which capabilities the model supports (vision, code, tools, etc.)
- **Task fitness** — adjust how well the model performs across different task types using sliders
- **Transparency** — sub-scores for open weights, training data, methodology, licence, and provider disclosure
- **Sustainability** — inference energy, training footprint, and provider infrastructure scores
- **Strengths and weaknesses** — editable lists of plain-text descriptions

Click **Save Model** when you're done. Changes appear immediately on the Models page. To update the recommendation engine's snapshot, run the registry generation step during the next deployment.

### Adding a new model

Click **Add Model** on the admin page to open a blank form. Choose a URL-safe slug (e.g. `my-new-model`) — this cannot be changed after creation.

### Deactivating a model

Deactivated models are hidden from the registry and recommendations but preserved in the database for historical data integrity. Deactivation is available through the admin server actions.

### Usage and Insights dashboard

The admin panel includes **Usage** and **Insights** tabs alongside the model list.

**Usage** shows:
- Total tasks, users, selections, and comparisons
- Activity over time (tasks and selections per day, week, or month)
- Mode breakdown (Recommend, Validate, Compare)
- User signups over time

**Insights** shows:
- Outcome success rate and average selected rank
- Task type distribution — what people are using AI for
- Model leaderboard — which models are recommended and selected most
- Outcome breakdown — success vs failure with failure reasons
- Capability demand — how often tasks need vision, tools, or code

Use the toggle in the top-right to switch between daily, weekly, and monthly views.

### Discovering new models

The **Discover** tab shows AI models available on OpenRouter that aren't yet in the Bearing registry. You can search by name or provider, then import individual models.

When you import a model:
1. Click **Import** — a form opens with the model's specs from OpenRouter (name, pricing, context window, capabilities)
2. Click **Generate Estimates** — Claude Haiku suggests initial scores for task fitness, transparency, sustainability, and other factors based on the model's metadata
3. Review and adjust the estimates — all fields are editable
4. Click **Save as Draft** — the model is added to the registry but not yet visible to users

To make a draft model live, go to the Models tab, find the model, and edit it to set it as active.

### Syncing pricing

Click **Sync Pricing** on the Discover tab to update pricing for all models from OpenRouter's latest data. You'll see a summary of how many models were updated.

## Privacy

Bearing does not store your task descriptions or comparison prompts. What we store:

- A hash of your description (for deduplication, not reversible)
- Classified task attributes (type, complexity, input length)
- Your priority ranking
- Which model you chose and at what rank
- Your outcome feedback (if you give it)
- Your comparison preferences (if you compare models)

For sign-in, we store your email address. Nothing else about you.
