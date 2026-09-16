'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import {
  getModelExternalIds,
  saveModelExternalIds,
  type ModelExternalIds,
} from '@/db/model-provider-mapping'

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  if (!(await isUserAdmin(user.id))) throw new Error('Not authorised')
}

export async function getModelExternalIdsAdmin(slug: string): Promise<ModelExternalIds> {
  await requireAdmin()
  return getModelExternalIds(slug)
}

function optionalId(value: FormDataEntryValue | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

export async function saveModelExternalIdsAdmin(formData: FormData): Promise<void> {
  await requireAdmin()
  const slug = optionalId(formData.get('slug'))
  if (!slug) throw new Error('Model slug is required')

  await saveModelExternalIds(slug, {
    openrouterId: optionalId(formData.get('openrouter_id')),
    providerModelId: optionalId(formData.get('provider_model_id')),
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/models/${slug}`)
  redirect('/admin')
}
