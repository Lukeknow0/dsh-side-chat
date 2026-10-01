// Browser interaction gate. Run manually with PUPPETEER_CORE and CHROME_BIN.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown', { paths: [require.resolve('tsdown')] })).href)
const { default: puppeteer } = await import(pathToFileURL(process.env.PUPPETEER_CORE).href)
const temp = await mkdtemp(join(tmpdir(), 'sidechat-controls-browser-'))
const source = `import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {ComposerControls} from ${JSON.stringify(fileURLToPath(new URL('../../src/client/ComposerControls.js',import.meta.url)))};
const h=React.createElement;
function App(){const [model,setModel]=React.useState('p/flash#low');const [permission,setPermission]=React.useState('workspace-write');
return h(ComposerControls,{model,permission,modelOptions:[...['off','low','high'].map(e=>({value:'p/flash#'+e,label:'Provider / Flash · '+e,selection:{provider:'p',model:'flash',reasoningEffort:e}})),{value:'p/pro',label:'Provider / Pro',selection:{provider:'p',model:'pro'}}],permissionOptions:[{value:'read-only',label:'仅可查看'},{value:'workspace-write',label:'工作区内修改'},{value:'danger-full-access',label:'完全权限'}],onModelChange:v=>{setModel(v);window.changedModel=v},onPermissionChange:v=>{setPermission(v);window.changedPermission=v}})};
createRoot(document.querySelector('#root')).render(h(App));`
await writeFile(join(temp,'entry.js'),source)
const build = await rolldown({input:join(temp,'entry.js')})
await build.write({file:join(temp,'bundle.js'),format:'iife'});await build.close()
await writeFile(join(temp,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:system-ui}#clip{position:absolute;bottom:0;width:100%;height:130px;overflow:hidden;border:1px solid #eee;box-sizing:border-box}#root{padding:12px;margin-top:70px}button:focus-visible{outline:2px solid #4080ff}</style><div id="clip"><div id="root"></div></div><script src="bundle.js"></script>')
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,pipe:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [360,480,760]){
  await page.setViewport({width,height:700});await page.goto(pathToFileURL(join(temp,'index.html')).href)
  await page.waitForSelector('[aria-label="更改权限"]')
  await page.click('[aria-label="更改权限"]')
  const box=await page.$eval('[role="menu"]',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})
  assert.ok(box.x>=0&&box.y>=0&&box.right<=width&&box.bottom<700,JSON.stringify(box))
  assert.equal(await page.$eval('[aria-label="工作区内修改"]',e=>e.getAttribute('aria-checked')),'true')
  await page.click('[aria-label="仅可查看"]')
  assert.equal(await page.evaluate(()=>window.changedPermission),'read-only')
  await page.click('[aria-label="切换模型"]');await page.click('[aria-label="模型"]')
  assert.equal((await page.$$('[data-model-choice="p/flash"]')).length,1)
  await page.click('[aria-label="返回"]');await page.click('[aria-label="推理等级"]');await page.click('[aria-label="high"]')
  assert.equal(await page.evaluate(()=>window.changedModel),'p/flash#high')
  await page.click('[aria-label="切换模型"]');await page.keyboard.press('Escape')
  assert.equal((await page.$$('[role="menu"]')).length,0)
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'切换模型')
  await page.click('[aria-label="更改权限"]');await page.mouse.click(width/2,30)
  assert.equal((await page.$$('[role="menu"]')).length,0)
 }
 assert.deepEqual(errors,[])
 console.log('PASS: real Chromium clicks, child callbacks, deduped models, effort, selected permission, Escape/focus, outside dismiss, unclipped portal at 360/480/760px')
 console.log('Fixture:',temp)
}finally{await browser.close()}
