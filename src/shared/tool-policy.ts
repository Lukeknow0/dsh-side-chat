export const READ_ONLY_TOOL_CANDIDATES = Object.freeze([
  'read', 'read_image', 'glob', 'grep', 'lsp', 'view_image', 'web_search', 'skill',
  'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace',
  'job_list', 'job_output', 'terminal_list', 'terminal_read', 'list_agents', 'get_goal',
  'mnemon_document_search', 'mnemon_memory_bodies', 'mnemon_recall', 'mnemon_related', 'mnemon_status',
] as const)

export const READ_ONLY_TOOL_SET: ReadonlySet<string> = Object.freeze(new Set<string>([
  ...READ_ONLY_TOOL_CANDIDATES,
  'run_code',
]))

export function isSideChatToolAllowed(name: string): boolean {
  return READ_ONLY_TOOL_SET.has(name)
}

export const READ_ONLY_DENIAL = 'Side Chat is read-only. This tool could change external state, files, sessions, or processes. Answer using inherited context and read-only inspection instead.'
