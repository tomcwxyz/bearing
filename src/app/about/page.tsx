export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16 sm:py-20">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-4xl text-navy">
          About Bearing
        </h1>

        <div className="mt-10 space-y-10 text-navy/80 leading-relaxed">
          {/* What it is */}
          <section>
            <h2 className="font-display text-xl text-navy">
              What is Bearing?
            </h2>
            <p className="mt-3 leading-relaxed">
              Bearing is an AI model recommendation tool. Describe what you want to use AI
              for, tell us what matters most to you, and Bearing will rank the best models
              for your specific task -- with transparent, explainable scoring.
            </p>
          </section>

          {/* How it works */}
          <section>
            <h2 className="font-display text-xl text-navy">
              How it works
            </h2>
            <ol className="mt-4 list-none space-y-3 leading-relaxed">
              <li className="flex gap-3">
                <span className="font-mono text-teal font-bold">1.</span>
                <span>
                  <span className="font-medium text-navy">Describe</span>{' '}
                  -- tell us what you want to use AI for in plain language.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-teal font-bold">2.</span>
                <span>
                  <span className="font-medium text-navy">Clarify</span>{' '}
                  -- answer a few quick questions so we understand your task better.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-teal font-bold">3.</span>
                <span>
                  <span className="font-medium text-navy">
                    Rank your priorities
                  </span>{' '}
                  -- drag factors like cost, speed, quality, privacy, and sustainability into the
                  order that matters to you.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-teal font-bold">4.</span>
                <span>
                  <span className="font-medium text-navy">
                    Get results
                  </span>{' '}
                  -- receive a ranked shortlist of models with scores you can inspect and
                  understand.
                </span>
              </li>
            </ol>
          </section>

          {/* Data */}
          <section>
            <h2 className="font-display text-xl text-navy">
              How your data is used
            </h2>
            <p className="mt-3 leading-relaxed">
              We anonymise all task descriptions before storing them and never keep the raw
              text you type. Aggregated, anonymised data may be used to improve our
              recommendations over time -- but your individual inputs are never shared or
              sold.
            </p>
          </section>

          {/* Open source */}
          <section>
            <h2 className="font-display text-xl text-navy">
              Open source
            </h2>
            <p className="mt-3 leading-relaxed">
              Bearing is open source. The model registry, scoring methodology, and full
              source code are publicly available so you can verify how recommendations are
              generated.
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
