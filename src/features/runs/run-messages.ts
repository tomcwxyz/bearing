import { fileToBase64DataUrl } from '@/lib/file-parser'

export interface RunFileData {
  buffer: Buffer
  mimeType: string
  name: string
  extractedText: string
}

export type RunMessage = {
  role: string
  content: string | Array<{ type: string; [key: string]: unknown }>
}

/** Build provider-compatible messages while keeping file handling out of actions. */
export function buildRunMessages(
  prompt: string,
  file: RunFileData | null,
  hasVision: boolean,
): RunMessage[] {
  if (!file) return [{ role: 'user', content: prompt }]

  if (hasVision && (file.mimeType === 'application/pdf' || file.name.endsWith('.pdf'))) {
    return [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: fileToBase64DataUrl(file.buffer, file.mimeType) } },
        { type: 'text', text: prompt },
      ],
    }]
  }

  return [{
    role: 'user',
    content: `Document content:\n\n${file.extractedText}\n\n---\n\nUser request: ${prompt}`,
  }]
}
