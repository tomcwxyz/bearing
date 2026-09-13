'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/lib/db'
import { applyCatalogueDriftPatch } from '@/db/catalogue-drift'
import {
  buildCatalogueDriftPatch,
  getCurrentCatalogueDriftItem,
  type CatalogueDriftField,
} from '@/lib/catalogue-drift'
import { runCatalogueVerification } from '@/lib/verify-catalogue'

const ALLOWED_FIELDS = new Set<CatalogueDriftField>([
  'input_price',
  'output_price',
  'context_window',
  'capabilities',
])

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
}

/**
 * Re-fetch the current source evidence before applying anything. Form values
 * choose fields only; they never carry trusted proposed values from the client.
 */
export async function acceptCatalogueDriftAdmin(formData: FormData): Promise<void> {
  await requireAdmin()

  const slug = String(formData.get('slug') ?? '')
  if (!slug) throw new Error('Model slug is required')

  const fields = formData
    .getAll('field')
    .map(String)
    .filter((field): field is CatalogueDriftField => ALLOWED_FIELDS.has(field as CatalogueDriftField))

  if (fields.length === 0) return

  const current = await getCurrentCatalogueDriftItem(slug)
  if (!current) {
    throw new Error('No current catalogue drift remains for this model. Refresh and try again.')
  }

  const availableFields = new Set(current.item.changes.map((change) => change.field))
  const acceptedFields = fields.filter((field) => availableFields.has(field))
  if (acceptedFields.length === 0) {
    throw new Error('The selected catalogue changes are no longer current. Refresh and try again.')
  }

  const patch = buildCatalogueDriftPatch(current.model, current.item, acceptedFields)
  await applyCatalogueDriftPatch(slug, patch)

  // A failed re-check must not undo the accepted metadata. The DB helper has
  // already reset freshness to unknown, which is the safe degraded state.
  await runCatalogueVerification().catch(() => null)

  revalidatePath('/admin')
  revalidatePath('/admin/catalogue-review')
}
