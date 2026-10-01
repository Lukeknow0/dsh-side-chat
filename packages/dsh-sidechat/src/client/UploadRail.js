import React, {createElement as h} from 'react'
import {formatAttachmentSize} from './attachments.js'
/** @param {{items:readonly any[], onRemove:(id:string)=>void, onRetry:(id:string)=>void, disabled?:boolean}} props */
export function UploadRail({items,onRemove,onRetry,disabled=false}) {
  if (!items.length) return null
  return h('ul',{'aria-label':'侧聊附件',style:{display:'flex',flexWrap:'wrap',gap:8,padding:0,margin:0,listStyle:'none',maxHeight:180,overflowY:'auto'}},
    items.map(item=>h('li',{key:item.id,'data-upload-id':item.id,style:{display:'flex',alignItems:'center',gap:8,padding:8,border:'1px solid var(--dsw-alias-hairline, #ddd)',borderRadius:10,maxWidth:'100%',color:'var(--dsw-alias-label-primary, #222)'}},
      item.dataUrl?h('img',{src:item.dataUrl,alt:item.name,style:{width:36,height:36,objectFit:'cover',borderRadius:6}}):h('span',{'aria-hidden':true},'📎'),
      h('div',{style:{minWidth:0}},h('div',{title:item.name,style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180,fontSize:12}},item.name),
        h('div',{role:'status',style:{fontSize:11,color:'var(--dsw-alias-label-tertiary, #777)'}},`${formatAttachmentSize(item.size)} · ${item.status==='ready'?'已就绪':item.status==='failed'?'上传失败':`上传中 ${item.progress??0}%`}`),
        item.status==='failed'?h('div',{role:'alert',style:{fontSize:11,maxWidth:200}},item.error):null),
      item.status==='failed'?h('button',{type:'button',disabled,'aria-label':`重试上传 ${item.name}`,onClick:()=>onRetry(item.id)},'重试'):null,
      h('button',{type:'button',disabled,'aria-label':`删除附件 ${item.name}`,onClick:()=>onRemove(item.id),style:{border:0,background:'transparent',color:'inherit',cursor:'pointer'}},'×'))))
}
