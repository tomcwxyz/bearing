import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export async function createComparison(
  taskId: string,
  userId: string,
  modelASlug: string,
  modelBSlug: string,
): Promise<string> {
  const rows = await getDb()`
    INSERT INTO comparisons (task_id, user_id, model_a_slug, model_b_slug)
    VALUES (${taskId}, ${userId}, ${modelASlug}, ${modelBSlug})
    RETURNING id
  `
  return rows[0].id as string
}

export async function updateComparisonPrompt(
  comparisonId: string,
  promptHash: string,
): Promise<void> {
  await getDb()`
    UPDATE comparisons
    SET prompt_hash = ${promptHash}
    WHERE id = ${comparisonId}
  `
}

export async function updateComparisonPreference(
  comparisonId: string,
  preferred: string,
  reason: string | null,
): Promise<void> {
  await getDb()`
    UPDATE comparisons
    SET preferred = ${preferred}, preference_reason = ${reason}
    WHERE id = ${comparisonId}
  `
}

export async function getUserComparisonCount(
  userId: string,
): Promise<{ count: number; date: string | null }> {
  const rows = await getDb()`
    SELECT comparisons_today, last_comparison_date
    FROM users
    WHERE id = ${userId}
  `
  if (rows.length === 0) return { count: 0, date: null }
  return {
    count: Number(rows[0].comparisons_today ?? 0),
    date: (rows[0].last_comparison_date as string | null) ?? null,
  }
}

export async function incrementUserComparisons(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await getDb()`
    UPDATE users
    SET
      comparisons_today = CASE
        WHEN last_comparison_date = ${today} THEN comparisons_today + 1
        ELSE 1
      END,
      last_comparison_date = ${today}
    WHERE id = ${userId}
  `
}

export async function getComparison(comparisonId: string) {
  const rows = await getDb()`
    SELECT * FROM comparisons WHERE id = ${comparisonId}
  `
  return rows[0] ?? undefined
}
