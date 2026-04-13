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
4. Tap **Run comparison** — both models receive the same prompt
5. Read both responses side by side (model names are visible — this isn't blind testing)
6. Vote: **Model A**, **Model B**, or **About the same**
7. Optionally explain why

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

## Privacy

Bearing does not store your task descriptions or comparison prompts. What we store:

- A hash of your description (for deduplication, not reversible)
- Classified task attributes (type, complexity, input length)
- Your priority ranking
- Which model you chose and at what rank
- Your outcome feedback (if you give it)
- Your comparison preferences (if you compare models)

For sign-in, we store your email address. Nothing else about you.
