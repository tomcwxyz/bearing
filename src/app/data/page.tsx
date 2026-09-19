export default function DataPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16 sm:py-20">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-4xl text-navy">Public Dataset</h1>
        <p className="mt-3 text-lg text-grey-blue">
          What people want to use AI for, and which models work
        </p>

        <div className="mt-10 space-y-10 text-navy/80 leading-relaxed">
          {/* What's in the dataset */}
          <section>
            <h2 className="font-display text-xl text-navy">
              What&apos;s in the dataset
            </h2>
            <p className="mt-3 leading-relaxed">
              Every time someone reaches a Bearing recommendation, we record the
              structured task classification, the priorities and factor weights
              the recommender actually applied, which models were recommended,
              any multi-stage plan, which model the person selected (if any), and
              -- optionally -- whether it worked. The current schema also records
              whether recommended/chosen models are open-weight or local-capable,
              and can capture the coarse hardware/fit context behind a local-model
              choice. Tasks are included even when no model was selected.
            </p>
            <p className="mt-3 leading-relaxed">
              We also publish head-to-head comparison data and Bearing-hosted
              Route / Trio / Challenger runs. Predicted hardware fit is kept
              separate from observed execution evidence, so future Ollama or
              other local-runtime measurements can record what actually ran,
              on what broad class of hardware, without pretending an estimate
              was a completed run.
            </p>
            <div className="mt-4 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3 text-sm">
              <span className="font-medium text-navy">What we never collect:</span>{' '}
              no raw task descriptions, no prompt or response text, no email
              addresses, no IP addresses, and no browser user-agent or detailed
              GPU model strings. If someone uses the hardware-aware local-model
              feature, only a coarse profile such as platform, architecture,
              memory amount and GPU vendor can be attached to their model choice.
            </div>
          </section>

          {/* Why this matters */}
          <section>
            <h2 className="font-display text-xl text-navy">
              Why this matters
            </h2>
            <p className="mt-3 leading-relaxed">
              Bearing is building a public record of real-world &ldquo;task &rarr;
              recommendation &rarr; choice &rarr; execution &rarr; outcome&rdquo;
              decisions. Benchmarks test raw capability; Bearing tests fit --
              whether a model is the right choice for what someone actually wants
              to do, including openness and local-execution constraints.
            </p>
            <p className="mt-3 leading-relaxed">
              This data is useful for anyone building routing systems,
              recommendation engines, or evaluation tools for AI models.
            </p>
          </section>

          {/* Download */}
          <section>
            <h2 className="font-display text-xl text-navy">Download</h2>

            <div className="mt-4">
              <h3 className="font-display text-sm font-semibold text-navy">
                Recommendation data
              </h3>
              <p className="mt-1 text-sm text-grey-blue">
                Task classifications, model recommendations, selections, and outcomes.
              </p>
              <div className="mt-3 flex gap-3">
                <a href="/api/dataset?format=json" className="btn-primary text-sm">
                  Download JSON
                </a>
                <a href="/api/dataset?format=csv" className="btn-secondary text-sm">
                  Download CSV
                </a>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-display text-sm font-semibold text-navy">
                Comparison data
              </h3>
              <p className="mt-1 text-sm text-grey-blue">
                Head-to-head model preferences with task context.
              </p>
              <div className="mt-3 flex gap-3">
                <a
                  href="/api/dataset/comparisons?format=json"
                  className="btn-primary text-sm"
                >
                  Download JSON
                </a>
                <a
                  href="/api/dataset/comparisons?format=csv"
                  className="btn-secondary text-sm"
                >
                  Download CSV
                </a>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-display text-sm font-semibold text-navy">
                Routed-run data
              </h3>
              <p className="mt-1 text-sm text-grey-blue">
                Route, Trio and Challenger runs with recommendation rank, open/local model metadata, blind-judge verdicts and human preferences.
              </p>
              <div className="mt-3 flex gap-3">
                <a
                  href="/api/dataset/routed-runs?format=json"
                  className="btn-primary text-sm"
                >
                  Download JSON
                </a>
                <a
                  href="/api/dataset/routed-runs?format=csv"
                  className="btn-secondary text-sm"
                >
                  Download CSV
                </a>
              </div>
            </div>
          </section>

          {/* Methodology */}
          <section>
            <h2 className="font-display text-xl text-navy">Methodology</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed">
              <li>
                <span className="font-medium text-navy">Task classification:</span>{' '}
                Claude Haiku with a confidence threshold of 0.6. Tasks below this
                threshold go through a clarification step.
              </li>
              <li>
                <span className="font-medium text-navy">Scoring:</span> 7-factor
                weighted scoring based on user-ranked priorities. See{' '}
                <a
                  href="/about"
                  className="text-teal underline underline-offset-2 hover:text-teal-light"
                >
                  About
                </a>{' '}
                for details.
              </li>
              <li>
                <span className="font-medium text-navy">Selection signal:</span>{' '}
                which model the user chose and at what rank, plus a snapshot of
                whether it was open-weight/local-capable and which open/local/
                hardware-fit filters were active.
              </li>
              <li>
                <span className="font-medium text-navy">Execution signal:</span>{' '}
                actual runtime observations are stored separately from predicted
                hardware fit. The schema can capture runtime, quant, context,
                coarse hardware, VRAM, latency and tokens/sec when that evidence
                genuinely exists.
              </li>
              <li>
                <span className="font-medium text-navy">Outcome signal:</span>{' '}
                optional thumbs up/down with structured failure reasons (e.g.
                quality, speed, cost, hallucination).
              </li>
            </ul>
          </section>

          {/* Schema */}
          <section>
            <h2 className="font-display text-xl text-navy">Schema</h2>

            <div className="mt-4">
              <h3 className="mb-2 font-display text-sm font-semibold text-navy">
                Recommendation dataset
              </h3>
              <div className="overflow-x-auto rounded-lg border border-cream-dark">
                <table className="w-full text-left text-sm">
                  <thead className="bg-cream-dark/60">
                    <tr>
                      <th className="px-3 py-2 font-medium text-navy">Field</th>
                      <th className="px-3 py-2 font-medium text-navy">Type</th>
                      <th className="px-3 py-2 font-medium text-navy">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-dark">
                    {[
                      ['task_type', 'string', 'Primary task category'],
                      ['task_subtype', 'string', 'Specific task sub-category'],
                      ['complexity', 'string', 'low | medium | high'],
                      ['input_length', 'string', 'short | medium | long | very_long'],
                      ['needs_vision', 'boolean', 'Requires image/vision capabilities'],
                      ['needs_tools', 'boolean', 'Requires tool use / function calling'],
                      ['needs_code', 'boolean', 'Requires code generation'],
                      ['needs_reasoning', 'boolean', 'Requires multi-step reasoning'],
                      ['is_recurring', 'boolean', 'Recurring or repeated task'],
                      ['data_sensitivity', 'string', 'Privacy / on-prem sensitivity class'],
                      ['latency_target', 'string', 'realtime | interactive | batch'],
                      ['volume', 'string', 'Expected usage volume'],
                      ['needs_long_context', 'boolean', 'Requires long context'],
                      ['needs_multilingual', 'boolean', 'Requires multilingual capability'],
                      ['is_agentic', 'boolean', 'Agentic / multi-step tool-using workload'],
                      ['output_length', 'string', 'short | medium | long | very_long'],
                      ['mode', 'string', 'recommend | embedding | pipeline | validate'],
                      ['priority_order', 'string[]', 'User-ranked priority factors'],
                      ['excluded_factors', 'string[]', 'Factors the user opted out of'],
                      ['factor_weights', 'object?', 'Normalised per-factor weights actually applied'],
                      ['pipeline_stages', 'object[]?', 'Multi-stage plan if recommended'],
                      ['classification_schema_version', 'string', 'v0.7 | v0.8 | v0.9 — task_type enum used'],
                      ['models_recommended', 'object[]', '{slug, rank, weighted_score, model_class, open_weights, is_open_weight, local_capable}'],
                      ['local_recommendations', 'object[]', 'Reviewed local candidates with quant, memory footprint and hardware tier'],
                      ['model_selected', 'object?', 'Chosen model + selection-time openness/local snapshot + privacy-safe choice context'],
                      ['execution_observations', 'object[]', 'Observed runtime/local execution evidence; never inferred from predicted fit'],
                      ['outcome_success', 'boolean?', 'User-reported success'],
                      ['failure_reason', 'string?', 'Failure reason if applicable'],
                      ['task_date', 'date', 'Date the task was created'],
                    ].map(([field, type, desc]) => (
                      <tr key={field}>
                        <td className="px-3 py-2 font-mono text-xs text-teal">
                          {field}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-grey-blue">
                          {type}
                        </td>
                        <td className="px-3 py-2">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 font-display text-sm font-semibold text-navy">
                Comparison dataset
              </h3>
              <div className="overflow-x-auto rounded-lg border border-cream-dark">
                <table className="w-full text-left text-sm">
                  <thead className="bg-cream-dark/60">
                    <tr>
                      <th className="px-3 py-2 font-medium text-navy">Field</th>
                      <th className="px-3 py-2 font-medium text-navy">Type</th>
                      <th className="px-3 py-2 font-medium text-navy">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-dark">
                    {[
                      ['task_type', 'string', 'Primary task category'],
                      ['classification_schema_version', 'string', 'v0.7 | v0.8 | v0.9 — task_type enum used'],
                      ['model_a_slug', 'string', 'First model in comparison'],
                      ['model_a_metadata', 'object', 'Current openness/local/model-class metadata'],
                      ['model_b_slug', 'string', 'Second model in comparison'],
                      ['model_b_metadata', 'object', 'Current openness/local/model-class metadata'],
                      ['preferred', 'string', 'model_a | model_b | tie'],
                      ['preference_reason', 'string?', 'Reason for preference'],
                      ['task_date', 'date', 'Date of comparison'],
                    ].map(([field, type, desc]) => (
                      <tr key={field}>
                        <td className="px-3 py-2 font-mono text-xs text-teal">
                          {field}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-grey-blue">
                          {type}
                        </td>
                        <td className="px-3 py-2">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 font-display text-sm font-semibold text-navy">
                Routed-run dataset
              </h3>
              <div className="overflow-x-auto rounded-lg border border-cream-dark">
                <table className="w-full text-left text-sm">
                  <thead className="bg-cream-dark/60">
                    <tr>
                      <th className="px-3 py-2 font-medium text-navy">Field</th>
                      <th className="px-3 py-2 font-medium text-navy">Type</th>
                      <th className="px-3 py-2 font-medium text-navy">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-dark">
                    {[
                      ['mode', 'string', 'route | trio | challenger'],
                      ['task_type', 'string', 'Underlying task category'],
                      ['candidates', 'object[]', 'Run candidates with rank, score, role and open/local metadata'],
                      ['execution_location', 'string', 'bearing_hosted for this dataset'],
                      ['judged_winner', 'string?', 'Blind judge choice'],
                      ['human_preferred', 'string?', 'Human preferred model or tie'],
                      ['run_date', 'date', 'Date of run'],
                    ].map(([field, type, desc]) => (
                      <tr key={field}>
                        <td className="px-3 py-2 font-mono text-xs text-teal">{field}</td>
                        <td className="px-3 py-2 font-mono text-xs text-grey-blue">{type}</td>
                        <td className="px-3 py-2">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Licence */}
          <section>
            <h2 className="font-display text-xl text-navy">Licence</h2>
            <p className="mt-3 leading-relaxed">
              This dataset is released under{' '}
              <a
                href="https://creativecommons.org/licenses/by-nc/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline underline-offset-2 hover:text-teal-light"
              >
                Creative Commons Attribution-NonCommercial 4.0 International (CC
                BY-NC 4.0)
              </a>
              . You are free to share and adapt the data for non-commercial purposes
              with attribution.
            </p>
          </section>

          {/* Footer */}
          <div className="border-t border-cream-dark pt-8">
            <p className="text-sm text-grey-blue">
              Built by{' '}
              <a
                href="https://good-ship.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:text-teal-light underline underline-offset-2"
              >
                The Good Ship
              </a>{' '}
              &middot; good-ship.co.uk
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
