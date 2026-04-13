'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getModelFromDb, upsertModel, deactivateModel } from '@/lib/db'
import type { Model } from '@/lib/registry'

async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
  return user.id
}

export async function listModelsAdmin(): Promise<Model[]> {
  await requireAdmin()
  return getAllModelsFromDb()
}

export async function getModelAdmin(slug: string): Promise<Model | null> {
  await requireAdmin()
  return getModelFromDb(slug)
}

export async function saveModelAdmin(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  try {
    const slug = formData.get('slug') as string
    const model = {
      slug,
      name: formData.get('name') as string,
      provider: formData.get('provider') as string,
      tier: formData.get('tier') as string,
      pricing: JSON.parse(formData.get('pricing') as string),
      context_window: parseInt(formData.get('context_window') as string, 10),
      capabilities: JSON.parse(formData.get('capabilities') as string),
      strengths: JSON.parse(formData.get('strengths') as string),
      weaknesses: JSON.parse(formData.get('weaknesses') as string),
      task_fitness: JSON.parse(formData.get('task_fitness') as string),
      speed_score: parseFloat(formData.get('speed_score') as string),
      privacy_score: parseFloat(formData.get('privacy_score') as string),
      transparency: JSON.parse(formData.get('transparency') as string),
      sustainability: JSON.parse(formData.get('sustainability') as string),
    }
    await upsertModel(model)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deactivateModelAdmin(slug: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await deactivateModel(slug)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
