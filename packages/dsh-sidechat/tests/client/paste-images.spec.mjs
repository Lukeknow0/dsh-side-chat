import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import Renderer,{act} from 'react-test-renderer'
import {SidechatComposer} from '../../src/client/SidechatComposer.js'
const image=()=>new File([new Uint8Array([1,2,3])],'screenshot.png',{type:'image/png'})
const setup=(extra={})=>{const calls=[];const renderer=Renderer.create(React.createElement(SidechatComposer,{draft:'',onDraftChange(){},onSubmit(){},onFiles:files=>calls.push(files),...extra}));return {calls,renderer,input:renderer.root.findByProps({'aria-label':'侧聊消息'})}}
test('clipboard image item becomes one attachment without duplicate files fallback',async()=>{
 const {calls,input}=setup();const f=image();let prevented=0
 await act(async()=>input.props.onPaste({clipboardData:{items:[{kind:'file',type:f.type,getAsFile:()=>f}],files:[f],getData:()=>''},preventDefault(){prevented++}}))
 assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(calls[0][0],f);assert.equal(prevented,1)
})
test('plain text and image plus text preserve default text paste',async()=>{
 const {calls,input}=setup();let prevented=0
 await act(async()=>input.props.onPaste({clipboardData:{items:[],files:[],getData:()=> 'hello'},preventDefault(){prevented++}}))
 assert.equal(calls.length,0)
 await act(async()=>input.props.onPaste({clipboardData:{items:[],files:[image()],getData:()=> 'caption'},preventDefault(){prevented++}}))
 assert.equal(calls.length,1);assert.equal(prevented,0)
})
test('unnamed clipboard image gets MIME-based filename; locked composer does not import',async()=>{
 const {calls,input}=setup();const f=new File(['bytes'],'',{type:'image/jpeg'})
 await act(async()=>input.props.onPaste({clipboardData:{items:[{kind:'file',type:f.type,getAsFile:()=>f}],files:[],getData:()=>''},preventDefault(){}}))
 assert.match(calls[0][0].name,/\.jpeg$/);assert.equal(calls[0][0].type,'image/jpeg')
 const locked=setup({childStatus:'running'})
 await act(async()=>locked.input.props.onPaste({clipboardData:{items:[],files:[image()],getData:()=>''},preventDefault(){}}))
 assert.equal(locked.calls.length,0)
})
