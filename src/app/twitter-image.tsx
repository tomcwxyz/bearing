import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Bearing — Find the right AI model'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1B2A4A',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Georgia, serif',
        }}
      >
        <svg width="64" height="64" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="#2D8B7A" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="1.5" fill="#2D8B7A" />
          <path d="M16 4 L17.5 14.5 L16 16 L14.5 14.5 Z" fill="#2D8B7A" />
          <path d="M16 28 L17.5 17.5 L16 16 L14.5 17.5 Z" fill="#D4993D" />
        </svg>

        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#F5F0E8',
            marginTop: 20,
            letterSpacing: '-0.02em',
          }}
        >
          Bearing
        </div>

        <div
          style={{
            fontSize: 24,
            color: '#8BA4B8',
            marginTop: 8,
          }}
        >
          Find the right AI model for your task
        </div>
      </div>
    ),
    { ...size },
  )
}
