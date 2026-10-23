'use server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { reviewFeedback } from '@/db/community-feedback'
export async function decideFeedback(form:FormData){
  const user=await getCurrentUser()
  if (!user || !await isUserAdmin(user.id)) throw new Error('Not authorised')
  const id=String(form.get('id')??'')
  const decision=String(form.get('decision')??'')
  const note=String(form.get('note')??'').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['reviewed','dismissed'].includes(decision) || note.length<10 || note.length>1500) throw new Error('Review requires a decision and reason (10–1500 characters).')
  await reviewFeedback(id,decision as 'reviewed'|'dismissed',user.id,note)
  revalidatePath('/admin/community-feedback')
}
