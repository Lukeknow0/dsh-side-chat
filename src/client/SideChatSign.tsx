import { useId } from 'react'

export const SIDE_CHAT_SIGN_VIEW_BOX = '0 0 48 24'
export const SIDE_CHAT_SIGN_UPPER_PATH = 'M4 6H44'
export const SIDE_CHAT_SIGN_LOWER_PATH = 'M4 14H25C29 14 30 20 35 20H44'
export const SIDE_CHAT_SIGN_CLIP_X = 25

export interface SideChatSignProps {
  className?: string
  title?: string
}

export function SideChatSign({ className, title }: SideChatSignProps) {
  const clipId = `dsh-side-chat-sign-${useId().replaceAll(':', '')}`
  return (
    <svg
      className={className}
      viewBox={SIDE_CHAT_SIGN_VIEW_BOX}
      fill="none"
      role={title === undefined ? undefined : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={SIDE_CHAT_SIGN_CLIP_X} y="0" width="23" height="24" />
        </clipPath>
      </defs>
      <path d={SIDE_CHAT_SIGN_UPPER_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d={SIDE_CHAT_SIGN_LOWER_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SIDE_CHAT_SIGN_LOWER_PATH} stroke="#B7E85B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
    </svg>
  )
}
