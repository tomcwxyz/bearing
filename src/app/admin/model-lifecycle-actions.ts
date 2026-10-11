'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { retireModels, restoreRetiredModels } from '@/db/model-lifecycle'
import { validateLifecycleSlugs, validateLifecycleReason } from '@/lib/model-lifecycle'

export type LifecycleBatchResult = {
  changed: string[]
  skipped: string[]
}

async function requireAdminId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user || !(await isUserAdmin(user.id))) throw new Error('Not authorised')
  return user.id
}

function refreshAdminModels() {
  revalidatePath('/admin')
  revalidatePath('/admin/retirement-review')
}

/** Archive published models. History remains queryable and model slugs stay reserved. */
export async function retireLiveModelsAdmin(
  requested: string[],
  reason: string,
  acknowledged: boolean,
): Promise<LifecycleBatchResult> {
  const actor = await requireAdminId()
  const slugs = validateLifecycleSlugs(requested)
  const explanation = validateLifecycleReason(reason)
  if (acknowledged !== true) throw new Error('Confirm that these models will leave live recommendations')
  const changed = await retireModels(slugs, explanation, actor, 'live')
  refreshAdminModels()
  const changedSet = new Set(changed)
  return { changed, skipped: slugs.filter(slug => !changedSet.has(slug)) }
}

/** For legacy records where prior publication is known by the maintainer but
 * unavailable in historic recommendations. Explicitly not automatic. */
export async function archiveLegacyDraftsAdmin(
  requested: string[],
  reason: string,
  acknowledged: boolean,
): Promise<LifecycleBatchResult> {
  const actor = await requireAdminId()
  const slugs = validateLifecycleSlugs(requested)
  const explanation = validateLifecycleReason(reason)
  if (acknowledged !== true) throw new Error('Confirm these are formerly live legacy models, not ordinary drafts')
  const changed = await retireModels(slugs, explanation, actor, 'draft')
  refreshAdminModels()
  const changedSet = new Set(changed)
  return { changed, skipped: slugs.filter(slug => !changedSet.has(slug)) }
}

/** Restores the exact retained model record to live, after an explicit
 * administrative acknowledgement. Verification is a separate evidence step. */
export async function restoreRetiredModelsAdmin(
  requested: string[],
  reason: string,
  acknowledged: boolean,
): Promise<LifecycleBatchResult> {
  const actor = await requireAdminId()
  const slugs = validateLifecycleSlugs(requested)
  const explanation = validateLifecycleReason(reason)
  if (acknowledged !== true) throw new Error('Confirm that restored models become public recommendations again')
  const changed = await restoreRetiredModels(slugs, explanation, actor)
  refreshAdminModels()
  const changedSet = new Set(changed)
  return { changed, skipped: slugs.filter(slug => !changedSet.has(slug)) }
}
