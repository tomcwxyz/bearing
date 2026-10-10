import type { TaskType, Capability } from './registry'

export type EvidenceField = string

export interface EvidenceProposal {
  schema_version: 1
  id: string
  model_slug: string
  field: string
  expected: string | number | string[]
  proposed: string | number | string[]
  rationale: string
  evaluation?: string
  evidence: {
    url: string
    title: string
    claim: string
    observed_on: string
    source_model_name?: string
    variant?: string
    licence_note?: string
  }
}

const TASKS: TaskType[] = [
  'summarise','extract','generate','comms','code','math','reasoning',
  'analyse','research','qa','translate','conversation','embedding',
]
const CAPS: Capability[] = [
  'vision','tools','code','long_context','extended_thinking',
  'structured_output','multilingual','audio','video','computer_use',
]
const FIELDS = new Set(['name','context_window','pricing.input_per_1m','pricing.output_per_1m',
  'capabilities',...TASKS.map(t => 'task_fitness.' + t)])
const isRecord = (value: unknown): value is Record<string,unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim() === value && value.length >= min && value.length <= max

function keys(value: Record<string,unknown>, required: string[], optional: string[], label: string) {
  for (const key of required) if (!(key in value)) throw new Error(label + ': missing ' + key)
  for (const key of Object.keys(value)) {
    if (![...required,...optional].includes(key)) throw new Error(label + ': unexpected ' + key)
  }
}
function validValue(field: string, value: unknown): boolean {
  if (field === 'name') return text(value,2,160)
  if (field === 'context_window') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10000000
  if (field.startsWith('pricing.')) return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000
  if (field.startsWith('task_fitness.')) return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  if (field === 'capabilities') return Array.isArray(value) &&
    value.length <= CAPS.length && value.every(x => CAPS.includes(x as Capability)) &&
    new Set(value).size === value.length
  return false
}

/** Validates proposed evidence from untrusted pull requests. Does not approve or apply it. */
export function validateEvidenceProposal(input: unknown): EvidenceProposal {
  if (!isRecord(input)) throw new Error('Proposal must be an object')
  keys(input, ['schema_version','id','model_slug','field','expected','proposed','rationale','evidence'],
    ['evaluation'], 'proposal')
  if (input.schema_version !== 1) throw new Error('Unsupported proposal version')
  if (!text(input.id,8,100) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id as string)) throw new Error('Invalid proposal id')
  if (!text(input.model_slug,2,140) || !/^[a-zA-Z0-9._/-]+$/.test(input.model_slug as string)) throw new Error('Invalid model slug')
  if (typeof input.field !== 'string' || !FIELDS.has(input.field)) throw new Error('Unsupported model field')
  if (!validValue(input.field,input.expected) || !validValue(input.field,input.proposed)) throw new Error('Invalid expected or proposed value')
  if (JSON.stringify(input.expected) === JSON.stringify(input.proposed)) throw new Error('No value change proposed')
  if (!text(input.rationale,30,3000)) throw new Error('Proposal needs a clear rationale')
  if ('evaluation' in input && !text(input.evaluation,20,3000)) throw new Error('Invalid evaluation plan')
  if (!isRecord(input.evidence)) throw new Error('Evidence must be an object')
  const ev=input.evidence
  keys(ev,['url','title','claim','observed_on'],['source_model_name','variant','licence_note'],'evidence')
  if (!text(ev.url,12,2000)) throw new Error('Missing evidence URL')
  let url: URL
  try { url=new URL(ev.url as string) } catch { throw new Error('Invalid evidence URL') }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) throw new Error('Evidence URL must be public HTTPS')
  if (!text(ev.title,5,200) || !text(ev.claim,20,2000)) throw new Error('Missing descriptive evidence')
  if (!text(ev.observed_on,10,10) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(ev.observed_on as string) ||
      Number.isNaN(Date.parse(ev.observed_on + 'T00:00:00Z')) ||
      new Date(ev.observed_on + 'T00:00:00Z').toISOString().slice(0,10) !== ev.observed_on) {
    throw new Error('Invalid observation date')
  }
  for (const key of ['source_model_name','variant','licence_note']) {
    if (key in ev && !text(ev[key],2,1000)) throw new Error('Invalid evidence.' + key)
  }
  if (input.field.startsWith('task_fitness.') &&
      (!text(ev.variant,2,1000) || !text(input.evaluation,40,3000))) {
    throw new Error('Task fitness requires a model variant and validation plan')
  }
  return input as unknown as EvidenceProposal
}
