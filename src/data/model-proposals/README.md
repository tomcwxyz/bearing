# Public evidence proposals

Submit a model correction by adding a single JSON file named after its unique
lowercase kebab-case proposal ID. Do not edit the generated model registry.

Each proposal changes **exactly one field**. It must include a real HTTPS
evidence source, its observation date, the current *expected* value, the new
*proposed* value, and a rationale. Task-fitness changes require the exact
evaluated variant and an evaluation plan.

Run `npm run evidence:sync` to regenerate
`src/data/model-evidence-proposals.json` and include it in
your pull request. CI checks the format and exact manifest.

A merged proposal does **not** automatically modify Neon. An authenticated
maintainer must review it in the Admin evidence queue. Live values must still
match the proposal's expected value; stale changes cannot be applied.

See `docs/model-evidence-contributions.md` for the complete
process and an example JSON object.
