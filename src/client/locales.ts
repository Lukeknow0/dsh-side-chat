export const NS = 'side-chat' as const

export type SideChatLocaleKey =
  | 'button.open' | 'button.close' | 'drawer.title' | 'drawer.subtitle' | 'drawer.readOnly'
  | 'drawer.mainRunning' | 'drawer.mainReady' | 'drawer.opening' | 'drawer.emptyTitle'
  | 'drawer.emptyBody' | 'drawer.placeholder' | 'drawer.send' | 'drawer.stop' | 'drawer.retry'
  | 'drawer.close' | 'drawer.discard' | 'drawer.you' | 'drawer.assistant' | 'drawer.reading'
  | 'drawer.contextNote' | 'drawer.error' | 'drawer.expiredTitle' | 'drawer.expiredBody'
  | 'drawer.restart' | 'drawer.shortcut'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'side-chat': SideChatLocaleKey }
}

export const en: Record<SideChatLocaleKey, string> = {
  'button.open': 'Open Side Chat', 'button.close': 'Close Side Chat',
  'drawer.title': 'Side Chat', 'drawer.subtitle': 'Ask aside. Stay on track.', 'drawer.readOnly': 'READ ONLY',
  'drawer.mainRunning': 'Main task running', 'drawer.mainReady': 'Main task ready', 'drawer.opening': 'Forking context…',
  'drawer.emptyTitle': 'Ask without drifting',
  'drawer.emptyBody': 'This temporary conversation can read the completed parent context, but cannot change files or external state.',
  'drawer.placeholder': 'Ask a side question…', 'drawer.send': 'Send', 'drawer.stop': 'Stop', 'drawer.retry': 'Try again',
  'drawer.close': 'Close Side Chat', 'drawer.discard': 'Kept across tasks · expires after 30 min parked and idle', 'drawer.you': 'You',
  'drawer.assistant': 'Side assistant', 'drawer.reading': 'Inspecting context…',
  'drawer.contextNote': 'Inherited context is reference-only. The main conversation stays untouched.',
  'drawer.error': 'Side Chat could not open',
  'drawer.expiredTitle': 'Side Chat ended',
  'drawer.expiredBody': 'This Side Chat ended after 30 minutes parked and idle.',
  'drawer.restart': 'Start again', 'drawer.shortcut': '⌘⇧.',
}

export const zh: Record<SideChatLocaleKey, string> = {
  'button.open': '打开侧边对话', 'button.close': '关闭侧边对话',
  'drawer.title': '侧边对话', 'drawer.subtitle': '临时问一句，主任务不跑偏。', 'drawer.readOnly': '只读',
  'drawer.mainRunning': '主任务运行中', 'drawer.mainReady': '主任务已就绪', 'drawer.opening': '正在继承上下文…',
  'drawer.emptyTitle': '放心追问，不污染主线',
  'drawer.emptyBody': '这个临时对话可读取父会话已完成的上下文，但不能修改文件或外部状态。',
  'drawer.placeholder': '输入一个临时问题…', 'drawer.send': '发送', 'drawer.stop': '停止', 'drawer.retry': '重试',
  'drawer.close': '关闭侧边对话', 'drawer.discard': '切换任务保留 · 后台空闲 30 分钟后结束', 'drawer.you': '你',
  'drawer.assistant': '侧边助手', 'drawer.reading': '正在查看上下文…',
  'drawer.contextNote': '继承内容仅作参考，主会话不会被写入这段追问。',
  'drawer.error': '侧边对话无法打开',
  'drawer.expiredTitle': '侧边对话已结束',
  'drawer.expiredBody': '这个侧边对话已在后台空闲 30 分钟后结束。',
  'drawer.restart': '重新开始', 'drawer.shortcut': '⌘⇧.',
}
