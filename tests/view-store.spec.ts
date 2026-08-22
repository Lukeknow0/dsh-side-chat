import { describe, expect, it, vi } from 'vitest'
import { SideChatViewStore } from '../src/client/view-store.ts'

describe('SideChatViewStore', () => {
  it('retains independent draft and visibility by parent session', () => {
    const store = new SideChatViewStore()
    store.show('parent-a', 'drawer')
    store.setDraft('parent-a', 'unfinished A')
    store.show('parent-b', 'better-sidebar')
    store.setDraft('parent-b', 'unfinished B')
    store.minimize('parent-a')

    expect(store.get('parent-a')).toEqual({
      visible: false, draft: 'unfinished A', sendError: null, presentation: 'drawer',
    })
    expect(store.get('parent-b')).toEqual({
      visible: true, draft: 'unfinished B', sendError: null, presentation: 'better-sidebar',
    })
  })

  it('clears only after explicit end', () => {
    const store = new SideChatViewStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.show('parent', 'drawer')
    store.setDraft('parent', 'keep me')
    store.setSendError('parent', 'temporary failure')
    store.clear('parent')

    expect(store.get('parent')).toEqual({
      visible: false, draft: '', sendError: null, presentation: 'drawer',
    })
    expect(listener).toHaveBeenCalled()
  })

  it('falls visible Better Sidebar views back to the drawer without data loss', () => {
    const store = new SideChatViewStore()
    store.show('parent-a', 'better-sidebar')
    store.setDraft('parent-a', 'unfinished A')
    store.show('parent-b', 'better-sidebar')
    store.setDraft('parent-b', 'unfinished B')

    store.fallbackVisiblePresentation('better-sidebar', 'drawer')

    expect(store.get('parent-a')).toMatchObject({
      visible: true, presentation: 'drawer', draft: 'unfinished A',
    })
    expect(store.get('parent-b')).toMatchObject({
      visible: true, presentation: 'drawer', draft: 'unfinished B',
    })
  })
})
