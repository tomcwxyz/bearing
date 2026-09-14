'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { getCurrentUser } from '@/lib/auth'
import { isLearnablePreferenceFactor } from '@/lib/bearing-preferences'
import {
  resetBearingPreferenceSettings,
  saveBearingPreferenceSettings,
} from '@/db/preferences'

export async function saveBearingPreferences(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const learningEnabled = formData.get('learning_enabled') === 'on'
  const manualFactors = formData
    .getAll('preferred_factor')
    .filter(isLearnablePreferenceFactor)

  try {
    await saveBearingPreferenceSettings(user.id, {
      learningEnabled,
      manualFactors,
    })
  } catch (error) {
    console.error('[preferences] failed to save bearing preferences', error)
    redirect('/bearings/preferences?error=save')
  }

  revalidatePath('/bearings/preferences')
  redirect('/bearings/preferences?saved=1')
}

export async function resetBearingPreferences() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  try {
    await resetBearingPreferenceSettings(user.id)
  } catch (error) {
    console.error('[preferences] failed to reset bearing preferences', error)
    redirect('/bearings/preferences?error=reset')
  }

  revalidatePath('/bearings/preferences')
  redirect('/bearings/preferences?reset=1')
}
