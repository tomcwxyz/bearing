# Compare File Attachments Design

> Date: 2026-04-13
> Status: Approved

## Goal

Allow users to attach a PDF or CSV file when comparing two models, so both models process the same document. Also fix Compare mode to use DB-stored `openrouter_id` instead of a hardcoded slug map.

## Approach

File upload on the Compare page alongside the existing text prompt. Server-side processing determines per-model whether to send the raw file as multimodal content (vision models) or extracted text (text-only models). Files are held in memory only — never persisted.

## Upload UX

Below the prompt textarea on the Compare page:
- "Attach file" button / drop zone. Shows file name, size, and remove button once attached.
- Accepted types: `.pdf`, `.csv`. Validated client-side and server-side.
- Size limit: 5MB. Inline error for rejected files.
- One file maximum. Optional — comparisons still work with just text.
- Vision/text badges on selected models so users understand the processing difference.

## Server-side file handling

When `runComparison` receives a file:

1. **Validate** — type (PDF/CSV) and size (< 5MB)
2. **Extract text** — for text-only model fallback:
   - CSV: read as UTF-8 text directly
   - PDF: extract text using `pdf-parse` (new dependency, ~100KB, pure JS)
3. **Build messages per model:**
   - Vision-capable model: multimodal message with base64 data URL + text prompt
   - Text-only model: prepend extracted text to prompt as context
4. **Call both models in parallel**, discard file from memory

Content filter runs on the text prompt only, not file content.

## callModel refactor

Remove hardcoded `SLUG_TO_OPENROUTER` map. Instead:
- `callModel` accepts an `openrouterId` directly (resolved by the caller from DB)
- `runComparison` looks up `openrouter_id` from the models table for each slug
- `callModel` also accepts optional multimodal message content for file attachments
- New signature: `callModel(openrouterId: string, messages: MessageContent[])`

## Data changes

- No schema changes. Files are memory-only.
- `comparisons` table unchanged — prompt hash covers the text part.

## New files

- `src/lib/file-parser.ts` — `extractText(buffer: Buffer, mimeType: string): string`

## Modified files

- `src/lib/openrouter.ts` — remove `SLUG_TO_OPENROUTER`, refactor `callModel` to accept `openrouterId` + multimodal messages
- `src/app/actions.ts` — `runComparison` accepts FormData with optional file, looks up `openrouter_id` from DB, decides vision vs text per model
- `src/app/compare/[taskId]/page.tsx` — file input UI, FormData construction, vision badges

## New dependency

- `pdf-parse` — PDF text extraction (pure JS, no native bindings)

## Constraints

- 5MB file size limit (Vercel serverless body limit)
- One file per comparison
- PDF and CSV only
- Memory only — no file persistence
