import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1B2A4A',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" fill="none" stroke="#2D8B7A" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="1.5" fill="#2D8B7A" />
          <path d="M16 6 L17.5 14.5 L16 16 L14.5 14.5 Z" fill="#2D8B7A" />
          <path d="M16 26 L17.5 17.5 L16 16 L14.5 17.5 Z" fill="#D4993D" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
