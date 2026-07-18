// 모아 로고 — 자산이 쌓이는(모이는) 막대 모티브
import { useId } from 'react'

export default function Logo({ size = 28 }: { size?: number }) {
  const gid = 'moa' + useId().replace(/:/g, '') // 여러 개 렌더돼도 그라디언트 id 충돌 없게
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16c8b4" />
          <stop offset="1" stopColor="#0e9c8d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${gid})`} />
      <g fill="#ffffff">
        <rect x="16" y="34" width="8" height="14" rx="4" opacity="0.7" />
        <rect x="28" y="26" width="8" height="22" rx="4" opacity="0.85" />
        <rect x="40" y="16" width="8" height="32" rx="4" />
      </g>
      <circle cx="44" cy="16" r="5" fill="#ffffff" />
    </svg>
  )
}
