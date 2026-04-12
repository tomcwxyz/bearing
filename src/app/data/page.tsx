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
              Every time someone uses Bearing, we record the task classification
              (type, subtype, complexity), the user&apos;s priority ranking, which
              models were recommended and at what scores, which model the user
              selected, and -- optionally -- whether it worked.
            </p>
            <p className="mt-3 leading-relaxed">
              We also publish head-to-head comparison data: which two models were
              compared, and which one the user preferred.
            </p>
            <div className="mt-4 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3 text-sm">
              <span className="font-medium text-navy">What we never collect:</span>{' '}
              no raw task descriptions, no prompts, no email addresses, no IP
              addresses. All data is anonymised before storage.
            </div>
          </section>

          {/* Why this matters */}
          <section>
            <h2 className="font-display text-xl text-navy">
              Why this matters
            </h2>
            <p className="mt-3 leading-relaxed">
              There is no existing public dataset of real-world &ldquo;task &rarr;
              model &rarr; did it work?&rdquo; decisions. Benchmarks test raw
              capability; Bearing tests fit -- whether a model is the right choice
              for what someone actually wants to do.
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
                which model the user chose and at what rank in the recommendation
                list.
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
                      ['is_recurring', 'boolean', 'Recurring or repeated task'],
                      ['priority_order', 'string[]', 'User-ranked priority factors'],
                      ['models_recommended', 'object[]', '{slug, rank, weighted_score}'],
                      ['model_selected', 'object', '{slug, recommended_rank}'],
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
                      ['model_a_slug', 'string', 'First model in comparison'],
                      ['model_b_slug', 'string', 'Second model in comparison'],
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
