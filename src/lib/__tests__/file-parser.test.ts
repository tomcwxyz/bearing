import { describe, it, expect } from 'vitest'
import { validateFile, extractTextFromCsv, fileToBase64DataUrl } from '../file-parser'

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
  it('accepts by extension when MIME is wrong', () => {
    const result = validateFile('data.csv', 'application/octet-stream', 1000)
    expect(result.valid).toBe(true)
  })
})

describe('extractTextFromCsv', () => {
  it('returns CSV content as-is', () => {
    const buffer = Buffer.from('name,age\nAlice,30\nBob,25')
    expect(extractTextFromCsv(buffer)).toBe('name,age\nAlice,30\nBob,25')
  })
})

describe('fileToBase64DataUrl', () => {
  it('creates a data URL', () => {
    const buffer = Buffer.from('hello')
    const result = fileToBase64DataUrl(buffer, 'text/plain')
    expect(result).toBe('data:text/plain;base64,aGVsbG8=')
  })
})
