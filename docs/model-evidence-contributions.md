# Contribute model evidence

You can correct Bearing's model catalogue or challenge a rating **without access to Neon**. The checked-in `src/data/bearing-registry.json` is generated from the database, so editing it directly is not a reliable contribution.

## What can be proposed?

The first version of the evidence pipeline accepts **one narrowly scoped field change per proposal**: name, context window, price per million input/output tokens, a complete capabilities list, or one `task_fitness.<task type>` score.

Changes to canonical model identity, routing IDs, benchmark aliases, source mappings, active/retired status, methodology or licensing require a GitHub issue and more detailed review; they are **not** silently applied by this pipeline.

## A proposal in four steps

1. Check the live model and the committed snapshot. Find the canonical **model slug** and the current field value. Name the provider/evaluation variant precisely.
2. Add a file at `src/data/model-proposals/<unique-proposal-id>.json`. Keep the id lowercase kebab-case, and put one change in each file.
3. Run `npm ci`, `npm run evidence:sync`, `npm run evidence:validate`, and the relevant tests. Commit your proposal file **and** the regenerated `src/data/model-evidence-proposals.json` index. Open a pull request with a source link and a short rationale.
4. The PR runs independent evidence validation in GitHub CI. A maintainer reviews the contribution and merges it if it merits consideration for the canonical catalogue. **Merge is not acceptance.**

### Example

This is an illustrative example using a fictional model. Do **not** commit it as a real proposal.

```json
{
  "schema_version": 1,
  "id": "fictional-model-context-2026-10",
  "model_slug": "fictional-model",
  "field": "context_window",
  "expected": 8192,
  "proposed": 16384,
  "rationale": "The official documentation for the specified model version gives a longer context window than our catalogue snapshot.",
  "evidence": {
    "url": "https://example.org/models/fictional-model",
    "title": "Fictional Model API documentation",
    "claim": "This specific model deployment supports up to 16384 tokens of context.",
    "observed_on": "2026-10-09",
    "source_model_name": "fictional-model-v2",
    "variant": "v2",
    "licence_note": "Public provider documentation used only as a citation."
  }
}
```

`expected` is the value **you observed** before making the proposal, not something you want the review to assume remains true indefinitely. If another maintainer updates the live field first, your proposal will show **stale** and cannot be accepted as written.

A `task_fitness` change also requires `evaluation` (40+ characters) and an exact `evidence.variant`. The evaluation plan should say which task examples, golden corpus or counterexamples would help show whether the recommendation improved. A new benchmark score alone should not automatically rewrite the curated rating.

## How review works

Once an accepted PR is **merged and deployed**, an authenticated Bearing administrator visits `/admin/evidence-proposals`. The queue reads the *deployed, validated* proposal index, not values sent by the browser.

The administrator sees the existing field, proposed field, dated evidence, optional evaluation plan and whether the proposal still matches the live database. They can:

- **Accept** an applicable change, which updates only the named field in the canonical `models` table and writes a linked audit entry **in the same SQL statement**.
- **Reject** with a reason, preserving a review record without changing the catalogue.
- **Leave pending** while evidence is checked further.

Every proposal ID can be reviewed once. If a previously reviewed proposal file is edited later, the queue highlights the changed digest and does not allow it to be applied again. Use a new ID for a follow-up correction.

For pricing, context and capability corrections, catalogue verification is reset to *unknown*, not presented as silently re-verified. The next regular model-catalogue check can examine the new value. For task-fitness corrections, a maintainer should separately review ranking shifts before acceptance. The workflow never automatically publishes drafts, links benchmark variants or retires a model.

### What happens to the registry?

Neon remains the canonical store. Accepting a proposal changes Neon, and the normal `scripts/generate-registry.ts` snapshot generation picks up that value. A future JSON regeneration therefore does **not** erase the correction.

There is an important additional safeguard: `npm run db:seed` now inserts only missing slugs. It no longer performs an unconditional upsert of old snapshot rows over the maintained catalogue. Automatic provider verification observes discrepancies; separately accepting fresh external drift may still require judgement and could change a reviewed field again. The audit trail preserves what was accepted and why.

## Boundaries and safeguards

- Only the explicit field allowlist is accepted; identity, source mappings and operational routing IDs are out of scope.
- Proposals must contain dated public HTTPS evidence, a rationale and a before/after value. Avoid credentials, private user prompts, provider secrets, copyright-restricted datasets and personal information.
- The server action requires an authenticated admin. Browser input supplies only the proposal ID, accept/reject decision and reviewer note.
- A live expected-value equality check prevents stale overwrites, and the append-only audit prevents reusing the same ID.
- Database migration `036_reviewed_model_evidence.sql` must be applied **on the intended development/production Neon environment by a maintainer** before using the queue. No PR or CI job applies it automatically.
- PR validation does not validate the factual accuracy of sources, proprietary licensing conditions, or the effect of new task fitness scores on real-world tasks.

To propose a broader change to the evidence model, use a [GitHub issue](https://github.com/tomcwxyz/bearing/issues/new/choose) and discuss it before introducing a database migration. The [model rating methodology](model-ratings.md) explains what each factor means.
