const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = new Set(['application/pdf', 'text/csv'])

export function validateFile(
  filename: string,
  mimeType: string,
  size: number,
): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.has(mimeType)) {
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
