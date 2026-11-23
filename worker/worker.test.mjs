import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{MAX_BYTES,RETENTION_MS,hashDeleteToken} from './index.mjs';
const origin='http://localhost:8088';
function storage(){
  const objects=new Map();
  return {objects,async put(id,bytes,options={}){objects.set(id,{bytes:bytes.slice(),uploaded:new Date(),customMetadata:options.customMetadata||{}});},
    async get(id){const o=objects.get(id);return o?{body:new Blob([o.bytes]).stream(),uploaded:o.uploaded,size:o.bytes.length,customMetadata:o.customMetadata}:null;},
    async head(id){const o=objects.get(id);return o?{uploaded:o.uploaded,size:o.bytes.length,customMetadata:o.customMetadata}:null;},
    async delete(id){objects.delete(id);}};
}
function request(path='/s',method='POST',body=new Uint8Array([1,2,3]),headers={}){
  return new Request('https://example.com'+path,{method,headers:{Origin:origin,...(body?{'Content-Length':String(body.length)}:{}),...headers},...(body?{body}: {})});
}
test('ciphertext storage returns random 128-bit ids, round-trips opaque bytes and disables caching',async()=>{
  const bucket=storage(),env={SKETCHES:bucket},ids=[];
  for(let i=0;i<2;i++){const r=await worker.fetch(request(),env);assert.equal(r.status,201);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Cache-Control'),'no-store');ids.push((await r.json()).id);}
  assert.match(ids[0],/^[\w-]{22}$/);assert.notEqual(...ids);
  const r=await worker.fetch(request('/s/'+ids[0],'GET',null),env);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/octet-stream');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([1,2,3]));
});
test('CORS permits only GitHub Pages and http localhost, including preflight',async()=>{
  for(const good of ['https://fourier.jupyter.pro','https://omygpt.github.io','http://localhost','http://localhost:12345']){
    const r=await worker.fetch(request('/s','OPTIONS',null,{Origin:good}),{});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),good);assert.match(r.headers.get('Access-Control-Allow-Methods'),/POST/);assert.match(r.headers.get('Access-Control-Allow-Methods'),/DELETE/);assert.match(r.headers.get('Access-Control-Allow-Headers'),/X-Delete-Token/);
  }
  for(const bad of ['', 'https://evil.com','https://fourier.jupyter.pro.evil.com','https://omygpt.github.io.evil.com','http://127.0.0.1:8088','https://localhost:8088']){const r=await worker.fetch(request('/s','POST',null,{Origin:bad}),{});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);}
});
test('POST requires bounded content-length and rejects mismatched streamed bodies',async()=>{
  const env={SKETCHES:storage()};
  assert.equal((await worker.fetch(new Request('https://example.com/s',{method:'POST',headers:{Origin:origin},body:'x'}),env)).status,411);
  for(const [length,status]of [['0',400],['-1',400],['garbage',400],[String(MAX_BYTES+1),413],['1',413],['9',400]]){
    assert.equal((await worker.fetch(request('/s','POST',new Uint8Array([1,2,3]),{'Content-Length':length}),env)).status,status);
  }
  assert.equal(env.SKETCHES.objects.size,0);
});
test('expired and absent objects have no content; storage failures reveal no details',async()=>{
  const env={SKETCHES:storage()},id='AAAAAAAAAAAAAAAAAAAAAA';
  assert.equal((await worker.fetch(request('/s/'+id,'GET',null),env)).status,204);
  env.SKETCHES.objects.set(id,{bytes:new Uint8Array([1]),uploaded:new Date(Date.now()-RETENTION_MS-1)});
  assert.equal((await worker.fetch(request('/s/'+id,'GET',null),env)).status,204);
  assert.equal((await worker.fetch(request('/s/invalid','GET',null),env)).status,400);
  assert.equal((await worker.fetch(request('/else','GET',null),env)).status,404);
  assert.equal((await worker.fetch(request(),{SKETCHES:{put(){throw Error('private details');}}})).status,503);
});

const token='T'.repeat(43);
test('delete tokens: only the hash is stored, the right token deletes, wrong or missing tokens do not',async()=>{
  const env={SKETCHES:storage()},hash=await hashDeleteToken(token);
  const r=await worker.fetch(request('/s','POST',new Uint8Array([7,7]),{'X-Delete-Hash':hash}),env),{id}=await r.json();
  assert.equal(r.status,201);assert.equal(env.SKETCHES.objects.get(id).customMetadata.d,hash);assert.ok(!JSON.stringify([...env.SKETCHES.objects.values()]).includes(token));
  for(const [value,status] of [[undefined,400],['short',400],['U'.repeat(43),403]]){
    assert.equal((await worker.fetch(request('/s/'+id,'DELETE',null,value?{'X-Delete-Token':value}:{}),env)).status,status);
  }
  assert.equal(env.SKETCHES.objects.size,1);
  assert.equal((await worker.fetch(request('/s/'+id,'DELETE',null,{'X-Delete-Token':token,Origin:'https://evil.com'}),env)).status,403);
  assert.equal((await worker.fetch(request('/s/'+id,'DELETE',null,{'X-Delete-Token':token}),env)).status,204);
  assert.equal(env.SKETCHES.objects.size,0);
  assert.equal((await worker.fetch(request('/s/'+id,'GET',null),env)).status,204);
  assert.equal((await worker.fetch(request('/s/'+id,'DELETE',null,{'X-Delete-Token':token}),env)).status,204);
});
test('legacy uploads without a delete hash cannot be deleted; malformed hashes are refused',async()=>{
  const env={SKETCHES:storage()},{id}=await (await worker.fetch(request(),env)).json();
  assert.equal((await worker.fetch(request('/s/'+id,'DELETE',null,{'X-Delete-Token':token}),env)).status,403);
  assert.equal((await worker.fetch(request('/s','POST',new Uint8Array([1]),{'X-Delete-Hash':'nope'}),env)).status,400);
});
test('same-origin /api route: prefixed paths work and same-origin GETs need no Origin header',async()=>{
  const env={SKETCHES:storage()},site={Origin:'https://fourier.jupyter.pro'};
  const {id}=await (await worker.fetch(new Request('https://fourier.jupyter.pro/api/s',{method:'POST',headers:{...site,'Content-Length':'2'},body:new Uint8Array([4,2])}),env)).json();
  const r=await worker.fetch(new Request('https://fourier.jupyter.pro/api/s/'+id),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([4,2]));
  assert.equal((await worker.fetch(new Request('https://fourier.jupyter.pro/api/s',{method:'POST',headers:{'Content-Length':'1'},body:new Uint8Array([1])}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://fourier.jupyter.pro/apis/s/'+id),env)).status,404);
});
