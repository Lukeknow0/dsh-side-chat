import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import Renderer,{act} from 'react-test-renderer'
import {SideChatPanel} from '../../src/client/SideChatPanel.js'
import {createSidechatThreadState} from '../../src/client/state.js'
import {createUploadDrafts} from '../../src/client/upload-drafts.js'

test('blank native tab uploads once to child and sends receipt without text; retry keeps attachments',async()=>{
 const calls=[];let reject=true
 const api={list:async()=>({threads:[]}),start:async(parent)=>{calls.push(['start',parent]);return {childSessionId:'child-file'}},prompt:async(...args)=>{calls.push(['prompt',...args]);if(reject)throw Error('network')}}
 const uploads=createUploadDrafts(async(child,file,name,signal,progress)=>{calls.push(['upload',child,name]);progress({loaded:file.size,total:file.size});return {ok:true,value:{receiptId:'receipt-file'}}})
 const tab={tab:{contentId:'sidebar://dsh-sidechat/new-files',visible:true,actions:{openResource(){}}}}
 const state=createSidechatThreadState();let r
 await act(async()=>{r=Renderer.create(React.createElement(SideChatPanel,{api,state,uploads,parentSessionId:'parent',useTabInfo:()=>tab}))})
 await act(async()=>{r.root.findByProps({'aria-label':'选择侧聊文件'}).props.onChange({target:{files:[new File(['content'],'test.txt',{type:'text/plain'})],value:''}});await new Promise(resolve=>setImmediate(resolve))})
 assert.deepEqual(calls.slice(0,2),[['start','parent'],['upload','child-file','test.txt']])
 assert.match(JSON.stringify(r.toJSON()),/已就绪/)
 const send=()=>r.root.findByType('form').props.onSubmit({preventDefault(){}})
 await act(async()=>send())
 const first=calls.find(x=>x[0]==='prompt');assert.deepEqual(first[3],[{type:'file',receiptId:'receipt-file'}])
 assert.equal(uploads.list(JSON.stringify(['parent',tab.tab.contentId])).length,1)
 reject=false;await act(async()=>send())
 assert.equal(calls.filter(x=>x[0]==='prompt')[1][2],first[2])
 assert.equal(uploads.list(JSON.stringify(['parent',tab.tab.contentId])).length,0)
 assert.equal(calls.filter(x=>x[0]==='start').length,1)
 await act(async()=>r.unmount());uploads.dispose()
})
