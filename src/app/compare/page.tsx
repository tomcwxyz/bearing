import Link from 'next/link'

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-bold text-navy">
        Compare models head-to-head
      </h1>
      <p className="mt-3 text-grey-blue">
        Send the same prompt to two models and see how they perform side by side.
        To get started, describe your task and get a recommendation first.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-lg bg-navy px-6 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light"
      >
        Describe your task
      </Link>
    </div>
  )
}
