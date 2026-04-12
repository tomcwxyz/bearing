export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          About Bearing
        </h1>

        <div className="mt-8 space-y-8 text-zinc-700 dark:text-zinc-300">
          {/* What it is */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              What is Bearing?
            </h2>
            <p className="mt-2 leading-relaxed">
              Bearing is an AI model recommendation tool. Describe what you want to use AI
              for, tell us what matters most to you, and Bearing will rank the best models
              for your specific task -- with transparent, explainable scoring.
            </p>
          </section>

          {/* How it works */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              How it works
            </h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 leading-relaxed">
              <li>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">Describe</span>{' '}
                -- tell us what you want to use AI for in plain language.
              </li>
              <li>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">Clarify</span>{' '}
                -- answer a few quick questions so we understand your task better.
              </li>
              <li>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  Rank your priorities
                </span>{' '}
                -- drag factors like cost, speed, quality, privacy, and sustainability into the
                order that matters to you.
              </li>
              <li>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  Get results
                </span>{' '}
                -- receive a ranked shortlist of models with scores you can inspect and
                understand.
              </li>
            </ol>
          </section>

          {/* Data */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              How your data is used
            </h2>
            <p className="mt-2 leading-relaxed">
              We anonymise all task descriptions before storing them and never keep the raw
              text you type. Aggregated, anonymised data may be used to improve our
              recommendations over time -- but your individual inputs are never shared or
              sold.
            </p>
          </section>

          {/* Open source */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Open source
            </h2>
            <p className="mt-2 leading-relaxed">
              Bearing is open source. The model registry, scoring methodology, and full
              source code are publicly available so you can verify how recommendations are
              generated.
            </p>
          </section>

          {/* Footer */}
          <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Built by{' '}
              <a
                href="https://good-ship.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
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
