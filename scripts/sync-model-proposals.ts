import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { validateEvidenceProposal, type EvidenceProposal } from '../src/lib/model-evidence-proposals'

const source = resolve('src/data/model-proposals')
const target = resolve('src/data/model-evidence-proposals.json')
const filenames = readdirSync(source).filter(name => name.endsWith('.json')).sort()
const ids = new Set<string>()
const proposals: EvidenceProposal[] = []

for (const filename of filenames) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(filename)) {
    throw new Error('Invalid model proposal filename: ' + filename)
  }
  const input: unknown = JSON.parse(readFileSync(join(source, filename), 'utf8'))
  const proposal = validateEvidenceProposal(input)
  if (basename(filename, '.json') !== proposal.id) {
    throw new Error(filename + ': filename must match proposal id')
  }
  if (ids.has(proposal.id)) throw new Error('Duplicate proposal id: ' + proposal.id)
  ids.add(proposal.id)
  proposals.push(proposal)
}

const json = JSON.stringify(proposals, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== json) {
    throw new Error('Model proposal index is out of date. Run npm run evidence:sync and commit the result.')
  }
  console.log('Validated ' + proposals.length + ' model proposals; manifest is current.')
} else {
  writeFileSync(target, json)
  console.log('Validated and indexed ' + proposals.length + ' model proposals.')
}
