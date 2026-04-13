# Compare File Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to attach a PDF or CSV file in Compare mode, with multimodal support for vision models and text extraction fallback for text-only models. Also refactor `callModel` to use DB-stored `openrouter_id` instead of hardcoded slug map.

**Architecture:** File upload via FormData in the Compare page. Server action validates, extracts text (fallback), and builds per-model messages (multimodal for vision, text for others). `callModel` refactored to accept an OpenRouter ID directly + flexible message content. Files held in memory only.

**Tech Stack:** pdf-parse (new dependency for PDF text extraction), OpenRouter API multimodal messages, existing Neon DB for openrouter_id lookup.

---

### Task 1: Install pdf-parse

**Files:**
- Modify: `package.json`

**Step 1: Install dependency**

Run: `npm install pdf-parse`

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse dependency for file attachments"
```

---

### Task 2: File parser utility

**Files:**
- Create: `src/lib/file-parser.ts`
- Create: `src/lib/__tests__/file-parser.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/__tests__/file-parser.test.ts
import { describe, it, expect } from 'vitest'
import { validateFile, extractTextFromCsv } from '../file-parser'

describe('validateFile', () => {
  it('accepts PDF files under 5MB', () => {
    const result = validateFile('test.pdf', 'application/pdf', 1000)
    expect(result.valid).toBe(true)
  })

  it('accepts CSV files under 5MB', () => {
    const result = validateFile('data.csv', 'text/csv', 1000)
    expect(result.valid).toBe(true)
  })

  it('rejects files over 5MB', () => {
    const result = validateFile('big.pdf', 'application/pdf', 6 * 1024 * 1024)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('5MB')
  })

  it('rejects unsupported file types', () => {
    const result = validateFile('image.png', 'image/png', 1000)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('PDF or CSV')
  })
})

describe('extractTextFromCsv', () => {
  it('returns CSV content as-is', () => {
    const buffer = Buffer.from('name,age\nAlice,30\nBob,25')
    expect(extractTextFromCsv(buffer)).toBe('name,age\nAlice,30\nBob,25')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/file-parser.test.ts`
Expected: FAIL

**Step 3: Write file-parser.ts**

```typescript
// src/lib/file-parser.ts

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['application/pdf', 'text/csv'])

export function validateFile(
  filename: string,
  mimeType: string,
  size: number,
): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.has(mimeType)) {
    // Also check extension as fallback — browsers sometimes send wrong MIME
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf' && ext !== 'csv') {
      return { valid: false, error: 'Only PDF or CSV files are supported.' }
    }
  }
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File must be under 5MB.' }
  }
  return { valid: true }
}

export function extractTextFromCsv(buffer: Buffer): string {
  return buffer.toString('utf-8')
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buffer)
  return result.text
}

export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return extractTextFromPdf(buffer)
  }
  return extractTextFromCsv(buffer)
}

export function fileToBase64DataUrl(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/file-parser.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/file-parser.ts src/lib/__tests__/file-parser.test.ts
git commit -m "feat: add file parser with validation and text extraction"
```

---

### Task 3: Add getOpenRouterId helper to db.ts

**Files:**
- Modify: `src/lib/db.ts`

**Step 1: Add the helper**

Add to `src/lib/db.ts` in the Models section:

```typescript
/** Get the openrouter_id for a model slug. Returns null if not found or not mapped. */
export async function getOpenRouterId(slug: string): Promise<string | null> {
  const rows = await getDb()`
    SELECT openrouter_id FROM models WHERE slug = ${slug}
  `
  return rows.length > 0 ? (rows[0].openrouter_id as string | null) : null
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add getOpenRouterId helper for DB-based model lookup"
```

---

### Task 4: Refactor callModel to use DB openrouter_id + support multimodal

**Files:**
- Modify: `src/lib/openrouter.ts`

**Step 1: Refactor callModel**

Replace the current `callModel` function. Remove the `SLUG_TO_OPENROUTER` hardcoded map entirely.

New signature:
```typescript
export async function callModel(
  openrouterId: string,
  messages: Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }>,
): Promise<{ text: string; error?: string }>
```

The function:
- Takes an `openrouterId` directly (caller resolves from DB)
- Takes a `messages` array (OpenAI-style) instead of a plain string
- Supports multimodal content parts (text + image_url for vision models)

```typescript
export async function callModel(
  openrouterId: string,
  messages: Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }>,
): Promise<{ text: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { text: '', error: 'OpenRouter API key is not configured' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': baseUrl,
        'X-Title': 'Bearing',
      },
      body: JSON.stringify({
        model: openrouterId,
        max_tokens: 2048,
        messages,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`OpenRouter error (${response.status}):`, body)
      return { text: '', error: `Model request failed (${response.status})` }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return { text }
  } catch (err) {
    console.error('OpenRouter call failed:', err)
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling model',
    }
  }
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All pass (openrouter tests don't test callModel — it's an integration function).

**Step 3: Commit**

```bash
git add src/lib/openrouter.ts
git commit -m "refactor: callModel uses openrouterId param + multimodal messages

Removed hardcoded SLUG_TO_OPENROUTER map. Caller now resolves
openrouter_id from DB and passes it directly. Messages array
supports both plain text and multimodal content parts."
```

---

### Task 5: Update runComparison to use DB lookup + accept files

**Files:**
- Modify: `src/app/actions.ts`

**Step 1: Update imports**

Add imports for the new modules:
```typescript
import { getOpenRouterId } from '@/lib/db'
import { validateFile, extractText, fileToBase64DataUrl } from '@/lib/file-parser'
```

**Step 2: Rewrite runComparison**

Change signature from `(comparisonId: string, prompt: string)` to `(comparisonId: string, formData: FormData)`.

The new function:
1. Extracts `prompt` and optional `file` from FormData
2. Validates file if present (type, size)
3. Looks up `openrouter_id` for both models from DB via `getOpenRouterId`
4. If file present, extracts text for fallback
5. For each model, builds messages:
   - If model has vision capability AND file is a PDF: multimodal message with base64 data URL
   - Otherwise: text prompt with extracted file content prepended
6. Calls `callModel` with the resolved openrouterId and messages

To check vision capability, query the model's capabilities from DB:
```typescript
const modelA = await getModelFromDb(comparison.model_a_slug)
const hasVisionA = modelA?.capabilities.includes('vision') ?? false
```

**Step 3: Build messages helper**

Add a helper function in actions.ts:

```typescript
function buildMessages(
  prompt: string,
  file: { buffer: Buffer; mimeType: string; name: string; extractedText: string } | null,
  hasVision: boolean,
): Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }> {
  if (!file) {
    return [{ role: 'user', content: prompt }]
  }

  if (hasVision && file.mimeType === 'application/pdf') {
    // Multimodal: send PDF as base64 image + text prompt
    return [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: fileToBase64DataUrl(file.buffer, file.mimeType) } },
        { type: 'text', text: prompt },
      ],
    }]
  }

  // Text fallback: prepend extracted content
  const contextPrompt = `Document content:\n\n${file.extractedText}\n\n---\n\nUser request: ${prompt}`
  return [{ role: 'user', content: contextPrompt }]
}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 5: Run tests**

Run: `npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: runComparison accepts file attachments + uses DB openrouter_id

- Resolves openrouter_id from DB instead of hardcoded map
- Accepts FormData with optional file (PDF/CSV, max 5MB)
- Vision models get multimodal base64 content
- Text-only models get extracted text prepended to prompt"
```

---

### Task 6: Update Compare page UI with file upload

**Files:**
- Modify: `src/app/compare/[taskId]/page.tsx`

**Step 1: Add file state and UI**

Add state:
```typescript
const [file, setFile] = useState<File | null>(null)
const [fileError, setFileError] = useState<string | null>(null)
```

Add file input UI below the prompt textarea (only shown when 2 models selected):
- Drop zone / file input accepting `.pdf,.csv`
- Shows file name + size + remove button when file attached
- Shows fileError if validation fails
- Shows vision badges on selected model cards (check `model.capabilities.includes('vision')`)

**Step 2: Update handleCompare**

Change the call from `runComparison(comparisonId, prompt.trim())` to build a FormData:

```typescript
const formData = new FormData()
formData.set('prompt', prompt.trim())
if (file) {
  formData.set('file', file)
}
const runResult = await runComparison(comparisonId, formData)
```

**Step 3: Add vision badge to model selection cards**

In the model selection list, show a small badge next to models that have vision capability:
```tsx
{model.capabilities.includes('vision') && (
  <span className="rounded bg-teal/10 px-1.5 py-0.5 text-xs text-teal">Vision</span>
)}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 5: Commit**

```bash
git add src/app/compare/[taskId]/page.tsx
git commit -m "feat: add file upload UI to Compare page with vision badges"
```

---

### Task 7: Verify and smoke test

**Step 1: Run tests**

Run: `npm test`
Expected: All pass.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors.

**Step 3: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Smoke test**

- Start `npm run dev`
- Navigate to a recommendation result, click Compare
- Select two models (one with vision, one without if possible)
- Test text-only comparison (no file) — should still work as before
- Attach a small PDF — should show file name and size
- Attach a CSV — should work
- Try a file over 5MB — should show error
- Try a .png file — should be rejected
- Run comparison with PDF attached — both models should respond
- Check vision badge appears on vision-capable models

**Step 5: Commit any fixes**

```bash
git commit -m "fix: polish compare file attachments"
```

---

### Task 8: Update project files

**Files:**
- Modify: `PLAN.md`
- Modify: `STATE.md`

**Step 1: Update project files**

Add file attachment feature to Sprint 4 tasks in PLAN.md. Update STATE.md component table.

**Step 2: Commit**

```bash
git add PLAN.md STATE.md
git commit -m "docs: update project files for compare file attachments"
```

---

## Dependency Graph

```
Task 1 (pdf-parse) ──→ Task 2 (file parser)
Task 2 ──→ Task 5 (runComparison rewrite)
Task 3 (DB helper) ──→ Task 4 (callModel refactor) ──→ Task 5
Task 5 ──→ Task 6 (UI)
Task 6 ──→ Task 7 (verify)
Task 7 ──→ Task 8 (docs)
```

Tasks 1+3 can run in parallel.
Tasks 2+4 can run in parallel (after their dependencies).
