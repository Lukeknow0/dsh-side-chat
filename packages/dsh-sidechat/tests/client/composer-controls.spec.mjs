import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import Renderer, { act } from 'react-test-renderer'
import { ComposerControls } from '../../src/client/ComposerControls.js'
const options = ['off', 'low', 'high'].map(e => ({value:`p/flash#${e}`, label:`Provider / Flash · ${e}`, selection:{provider:'p',model:'flash',reasoningEffort:e}}))
options.push({value:'p/pro',label:'Provider / Pro',selection:{provider:'p',model:'pro'}})
const props = {model:'p/flash#low',modelOptions:options,permission:'workspace-write',permissionOptions:[{value:'read-only',label:'仅可查看'},{value:'workspace-write',label:'工作区内修改'},{value:'danger-full-access',label:'完全权限'}]}
const button=(r,name)=>r.root.findByProps({'aria-label':name})
test('two-level model menu deduplicates models and submits exact effort selection',async()=>{
 const changes=[]; const r=Renderer.create(React.createElement(ComposerControls,{...props,onModelChange:v=>changes.push(v)}))
 await act(async()=>button(r,'切换模型').props.onClick())
 assert.ok(button(r,'推理等级'))
 await act(async()=>button(r,'模型').props.onClick())
 assert.equal(r.root.findAllByProps({'data-model-choice':'p/flash'}).length,1)
 await act(async()=>button(r,'返回').props.onClick())
 await act(async()=>button(r,'推理等级').props.onClick())
 await act(async()=>button(r,'high').props.onClick())
 assert.deepEqual(changes,['p/flash#high'])
 assert.doesNotMatch(JSON.stringify(r.toJSON()),/强度：中|了解更多/)
})
test('permission uses catalog labels and exact values, without invented fallbacks',async()=>{
 const changes=[];const r=Renderer.create(React.createElement(ComposerControls,{...props,onPermissionChange:v=>changes.push(v)}))
 await act(async()=>button(r,'更改权限').props.onClick())
 assert.equal(button(r,'工作区内修改').props['aria-checked'],true)
 await act(async()=>button(r,'仅可查看').props.onClick())
 assert.deepEqual(changes,['read-only'])
 const empty=Renderer.create(React.createElement(ComposerControls,{modelOptions:[],permissionOptions:[]}))
 assert.equal(button(empty,'切换模型').props.disabled,true)
 assert.equal(button(empty,'更改权限').props.disabled,true)
})
test('failed mutation preserves menu and reports error; busy controls cannot mutate',async()=>{
 const r=Renderer.create(React.createElement(ComposerControls,{...props,onPermissionChange:()=>{throw Error('Host rejected')}}))
 await act(async()=>button(r,'更改权限').props.onClick())
 await act(async()=>button(r,'完全权限').props.onClick())
 assert.match(JSON.stringify(r.toJSON()),/Host rejected/)
 assert.ok(button(r,'完全权限'))
 await act(async()=>r.update(React.createElement(ComposerControls,{...props,busy:true})))
 assert.equal(button(r,'切换模型').props.disabled,true)
})
