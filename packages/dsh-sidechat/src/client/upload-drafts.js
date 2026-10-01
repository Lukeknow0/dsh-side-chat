import { createAttachmentFromBlob, validateAttachmentMetadata } from './attachments.js'

/** @param {((child:string,file:Blob,name:string,signal:AbortSignal,progress:(value:{loaded:number,total?:number})=>void)=>Promise<any>)|undefined} upload */
export function createUploadDrafts(upload) {
  const scopes = new Map()
  const listeners = new Set()
  let revision = 0
  let disposed = false
  const publish = () => { revision++; for (const listener of listeners) listener() }
  /** @param {string} scope */
  const list = (scope) => scopes.get(scope) ?? []
  /** @param {string} scope @param {string} id @param {any} patch */
  function update(scope, id, patch) {
    if (disposed || !list(scope).some((/** @type {any} */ item) => item.id === id)) return
    scopes.set(scope, list(scope).map((/** @type {any} */ item) => item.id === id ? {...item,...patch} : item)); publish()
  }
  /** @param {string} scope @param {any} item */
  async function prepare(scope,item) {
    if (disposed) return
    const controller = new AbortController()
    update(scope,item.id,{status:'uploading',error:'',controller,progress:0})
    try {
      const child = item.child ?? await item.resolveChild()
      if (controller.signal.aborted) return
      update(scope,item.id,{child})
      const draft = await createAttachmentFromBlob(item.file)
      if (controller.signal.aborted) return
      let content
      if (draft.type === 'image') {
        content = {type:'image',mediaType:draft.mimeType,data:draft.dataUrl?.split(',')[1],name:draft.name}
      } else {
        if (!upload) throw Error('当前 Web 未提供文件上传服务。')
        const result = await upload(child,item.file,item.name,controller.signal,(value)=>update(scope,item.id,{progress:value.total ? Math.min(100,Math.round(value.loaded/value.total*100)):0}))
        if (!result?.ok || typeof result.value?.receiptId !== 'string') throw Error(result?.error?.message ?? '文件上传失败，未收到有效回执。')
        content = {type:'file',receiptId:result.value.receiptId}
      }
      if (controller.signal.aborted) return
      update(scope,item.id,{status:'ready',progress:100,content,dataUrl:draft.dataUrl,controller:undefined,resolveChild:undefined})
    } catch (cause) {
      if (!controller.signal.aborted) update(scope,item.id,{status:'failed',error:cause instanceof Error?cause.message:String(cause),controller:undefined})
    }
  }
  return {
    list,
    /** @param {string} parent @param {string} contentId @param {string|undefined} child */
    scope(parent,contentId,child) {
      const direct = JSON.stringify([parent,contentId])
      if (list(direct).length || !child) return direct
      for (const [key,items] of scopes) {
        if (key.startsWith(`${JSON.stringify([parent]).slice(0,-1)},`) && items.some((/** @type {any} */ item) => item.child === child)) return key
      }
      return direct
    },
    subscribe(/** @type {()=>void} */ fn) { listeners.add(fn); return ()=>{listeners.delete(fn)} },
    getSnapshot() { return revision },
    /** @param {string} scope @param {readonly File[]} files @param {()=>Promise<string>} resolveChild */
    async add(scope,files,resolveChild) {
      if (disposed) throw Error('上传服务已关闭。')
      if (list(scope).length+files.length>10) throw Error('每条消息最多添加 10 个附件。')
      for (const file of files) validateAttachmentMetadata({type:file.type.startsWith('image/')?'image':'file',name:file.name,size:file.size,mimeType:file.type})
      const items = files.map(file=>({id:crypto.randomUUID(),file,name:file.name,size:file.size,mimeType:file.type,type:file.type.startsWith('image/')?'image':'file',status:'uploading',resolveChild}))
      scopes.set(scope,[...list(scope),...items]); publish()
      await Promise.all(items.map(item=>prepare(scope,item)))
    },
    /** @param {string} scope @param {string} id */
    async retry(scope,id) { const item=list(scope).find((/** @type {any} */ x)=>x.id===id); if(item?.status==='failed') await prepare(scope,item) },
    /** @param {string} scope @param {string} id */
    remove(scope,id) { const item=list(scope).find((/** @type {any} */ x)=>x.id===id);item?.controller?.abort();scopes.set(scope,list(scope).filter((/** @type {any} */ x)=>x.id!==id));publish() },
    /** @param {string} scope @param {string} child */
    content(scope,child) {
      return list(scope).map((/** @type {any} */ item)=>{
        if(item.status!=='ready') throw Error('请等待附件上传完成，或重试／移除失败附件。')
        if(item.child!==child) throw Error('附件不属于当前侧聊。')
        return item.content
      })
    },
    /** @param {string} scope @param {string[]} ids */
    clear(scope,ids) { for (const id of ids) this.remove(scope,id) },
    dispose() { disposed=true;for(const items of scopes.values()) for(const item of items)item.controller?.abort();scopes.clear();listeners.clear() },
  }
}
