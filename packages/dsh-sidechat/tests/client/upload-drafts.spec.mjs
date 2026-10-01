import assert from 'node:assert/strict'
import test from 'node:test'
import { createUploadDrafts } from '../../src/client/upload-drafts.js'
const file = () => new File(['example'], 'example.txt', {type:'text/plain'})
test('uploads real Blob to resolved child with progress and returns scoped receipt',async()=>{
 const calls=[];const store=createUploadDrafts(async(child,data,name,signal,progress)=>{calls.push([child,data,name]);progress({loaded:data.size,total:data.size});return {ok:true,value:{receiptId:'receipt-1'}}})
 await store.add('a',[file()],async()=> 'child-a')
 assert.equal(calls[0][0],'child-a');assert.ok(calls[0][1] instanceof Blob)
 assert.equal(store.list('a')[0].status,'ready')
 assert.deepEqual(store.content('a','child-a'),[{type:'file',receiptId:'receipt-1'}])
 assert.throws(()=>store.content('a','child-b'),/侧聊/)
 assert.deepEqual(store.list('b'),[])
})
test('failed upload retains file, blocks send and retries same child',async()=>{
 let count=0;const store=createUploadDrafts(async()=>{if(count++===0)throw Error('network');return {ok:true,value:{receiptId:'retry'}}})
 await store.add('a',[file()],async()=> 'child-a');const item=store.list('a')[0]
 assert.equal(item.status,'failed');assert.throws(()=>store.content('a','child-a'),/上传/)
 await store.retry('a',item.id)
 assert.equal(store.list('a')[0].status,'ready')
})
test('removing uploading file aborts and ignores late receipt; oversized file creates no child',async()=>{
 let finish;let signal;let creates=0
 const store=createUploadDrafts(async(c,f,n,s)=>{signal=s;return await new Promise(r=>{finish=r})})
 const pending=store.add('a',[file()],async()=>{creates++;return 'child-a'})
 await new Promise(r=>setImmediate(r));store.remove('a',store.list('a')[0].id);assert.equal(signal.aborted,true)
 finish({ok:true,value:{receiptId:'late'}});await pending;assert.deepEqual(store.list('a'),[])
 await assert.rejects(store.add('a',[new File([new Uint8Array(21*1024*1024)],'big.bin')],async()=>{creates++;return 'x'}))
 assert.equal(creates,1)
})
test('image is prepared as native image content and only sent items are cleared',async()=>{
 const store=createUploadDrafts(async()=>{throw Error('images use prompt content')})
 await store.add('a',[new File([new Uint8Array([1,2,3])],'photo.png',{type:'image/png'})],async()=> 'child-a')
 const ids=store.list('a').map(x=>x.id)
 assert.deepEqual(store.content('a','child-a'),[{type:'image',mediaType:'image/png',data:'AQID',name:'photo.png'}])
 await store.add('a',[new File([new Uint8Array([4])],'later.png',{type:'image/png'})],async()=> 'child-a')
 store.clear('a',ids);assert.equal(store.list('a').length,1)
})
test('reopened child reuses its pending files without crossing parent ownership',async()=>{
 const store=createUploadDrafts(async()=>({ok:true,value:{receiptId:'reopen'}}))
 const oldScope=JSON.stringify(['parent-a','blank-tab'])
 await store.add(oldScope,[file()],async()=> 'child-a')
 assert.equal(store.scope('parent-a','child-resource','child-a'),oldScope)
 assert.notEqual(store.scope('parent-b','child-resource','child-a'),oldScope)
 store.dispose()
})
