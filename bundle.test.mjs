import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packPortraitMeta,unpackPortraitMeta,encodePointer,decodePointer} from './bundle.mjs';
import {encryptBundle,encryptSketch,decryptEnvelope,decryptSketch,fetchEnvelope,fetchSketch,MAX_META_BYTES} from './encrypted-sketch.mjs';
import {realDft,dft} from './fourier.mjs';
import {shareQrBits,encodePortrait} from './share.mjs';
import {shouldReloadForHash} from './navigation.mjs';

const reference={id:'AAECAwQFBgcICQoLDA0ODw',key:'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8'};
const portrait=(mode='xy',n=360)=>{
  const path=Array.from({length:n},(_,i)=>({x:120*Math.cos(2*Math.PI*i/n)+17*Math.sin(14*Math.PI*i/n),y:160*Math.sin(2*Math.PI*i/n)-9*Math.cos(22*Math.PI*i/n),draw:i%37>2}));
  return {mode,path,chains:mode==='xy'?{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:[]}:{x:[],y:[],complex:dft(path)},dimensions:{width:300,height:400}};
};

test('bundle metadata keeps every coefficient at float32 precision and rebuilds the exact path in both modes',()=>{
  for(const mode of ['xy','complex']){
    const source=portrait(mode),meta=packPortraitMeta(source),back=unpackPortraitMeta(meta);
    assert.equal(back.mode,mode);assert.deepEqual(back.dimensions,source.dimensions);
    for(const key of ['x','y','complex'])assert.equal(back.chains[key].length,source.chains[key].length);
    assert.deepEqual(back.path.map(p=>p.draw),source.path.map(p=>p.draw));
    const error=Math.max(...back.path.map((p,i)=>Math.hypot(p.x-source.path[i].x,p.y-source.path[i].y)));
    assert.ok(error<.01,`max path error ${error}`);
    assert.ok(meta.length<MAX_META_BYTES);
  }
});

test('a full 1800-sample XY portrait fits the bundle metadata limit',()=>{
  const meta=packPortraitMeta(portrait('xy',1800));assert.ok(meta.length<MAX_META_BYTES,`${meta.length} bytes`);
});

test('malformed bundle metadata fails closed',()=>{
  const source=portrait();
  assert.throws(()=>packPortraitMeta({...source,path:[]}),RangeError);
  assert.throws(()=>packPortraitMeta({...source,dimensions:{width:2,height:400}}),RangeError);
  assert.throws(()=>packPortraitMeta({...source,mode:'polar'}),RangeError);
  assert.throws(()=>packPortraitMeta({...source,chains:{...source.chains,x:[{k:9999,re:1,im:0}]}}),RangeError);
  assert.throws(()=>unpackPortraitMeta(new Uint8Array([1,2,3])));
  const meta=packPortraitMeta(source);assert.throws(()=>unpackPortraitMeta(meta.slice(0,-4)));
});

test('QR pointer is short, numeric, round-trips display options and is accepted by navigation',()=>{
  for(const [name,guess,palette] of [['',false,'ink'],['圆周之间的我',true,'navy']]){
    const pointer=encodePointer({reference,counts:[213,198],name,guess,palette}),back=decodePointer(new URL(pointer.url).hash);
    assert.deepEqual(back,{reference,counts:[213,198],name,guess,hint:'',palette});
    assert.match(pointer.url,/#s\d+$/);assert.ok(pointer.qrBits<1100,`${pointer.qrBits} bits`);
    assert.equal(shouldReloadForHash(new URL(pointer.url).hash),true);
  }
  const long=encodePortrait({...portrait(),toneMap:{width:24,height:32,bits:3,data:new Uint8Array(768).fill(3)},encryptedSketch:reference});
  assert.ok(encodePointer({reference,counts:[1,1]}).qrBits*5<long.qrBits,'pointer QR must be far smaller than the self-contained one');
  assert.ok(shareQrBits(encodePointer({reference}).url)>0);
});

test('malformed pointers are rejected',()=>{
  const hash=new URL(encodePointer({reference,counts:[3,4],name:'x'}).url).hash;
  for(const bad of ['#s','#s123',hash.slice(0,-13),hash+'0000000000000'])assert.throws(()=>decodePointer(bad));
  assert.throws(()=>shouldReloadForHash('#s999'));
  assert.throws(()=>encodePointer({reference:null}));assert.throws(()=>encodePointer({reference,counts:[-1,0]}));
});

test('bundle envelopes round-trip; old sketch-only readers still get the image',async()=>{
  const meta=packPortraitMeta(portrait()),image=new Uint8Array([82,73,70,70,9,8,7]);
  const e=await encryptBundle(meta,image,'image/webp'),opened=await decryptEnvelope(e.ciphertext,e.key);
  assert.deepEqual(opened.meta,meta);assert.equal(opened.image.type,'image/webp');assert.deepEqual(new Uint8Array(await opened.image.arrayBuffer()),image);
  assert.deepEqual(new Uint8Array(await (await decryptSketch(e.ciphertext,e.key)).arrayBuffer()),image);
  const legacy=await encryptSketch(image,'image/jpeg');assert.equal((await decryptEnvelope(legacy.ciphertext,legacy.key)).meta,null);
  await assert.rejects(encryptBundle(new Uint8Array(),image,'image/webp'),RangeError);
  await assert.rejects(encryptBundle(new Uint8Array(MAX_META_BYTES+1),image,'image/webp'),RangeError);
  const changed=e.ciphertext.slice();changed[40]^=1;await assert.rejects(decryptEnvelope(changed,e.key));
});

test('visitors fetch the bundle with only the opaque id',async t=>{
  const meta=packPortraitMeta(portrait()),e=await encryptBundle(meta,new Uint8Array([1,2,3]),'image/jpeg'),ref={id:reference.id,key:e.key},calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return new Response(e.ciphertext,{status:200});});
  const opened=await fetchEnvelope(ref);assert.deepEqual(opened.meta,meta);assert.ok(!calls[0].url.includes(ref.key));assert.equal(calls[0].options.credentials,'omit');
  assert.equal((await fetchSketch(ref)).type,'image/jpeg');
  globalThis.fetch=async()=>new Response(null,{status:204});await assert.rejects(fetchEnvelope(ref));
});

import {listShares,rememberShare,forgetShare} from './my-shares.mjs';
import {publishBundle,revokeShare,hashDeleteToken,SKETCH_API_BASE} from './encrypted-sketch.mjs';
import {hashDeleteToken as workerHash} from './worker/index.mjs';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),m};};
const token='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

test('share records keep only id + delete token, newest first, and expire after 30 days',()=>{
  const store=memory(),now=Date.UTC(2026,10,23);
  rememberShare({id:reference.id,deleteToken:token,label:'我'},store,now-1000);rememberShare({id:'BBBBBBBBBBBBBBBBBBBBBB',deleteToken:token,label:'b'},store,now);
  assert.deepEqual(listShares(store,now).map(r=>r.id),['BBBBBBBBBBBBBBBBBBBBBB',reference.id]);
  assert.ok(!store.m.get('fourier-my-shares').includes(reference.key));
  assert.equal(listShares(store,now+31*864e5).length,0);
  forgetShare(reference.id,store,now);assert.deepEqual(listShares(store,now).map(r=>r.id),['BBBBBBBBBBBBBBBBBBBBBB']);
  assert.throws(()=>rememberShare({id:'x',deleteToken:token},store));
  store.setItem('fourier-my-shares','not json');assert.deepEqual(listShares(store),[]);
});

test('client and worker agree on the delete-token hash; links never contain the delete token',async t=>{
  assert.equal(await hashDeleteToken(token),await workerHash(token));
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return options.method==='DELETE'?new Response(null,{status:204}):new Response(JSON.stringify({id:reference.id}),{status:201});});
  const surface={width:2,height:2},created=await publishBundle(surface,packPortraitMeta(portrait())).catch(e=>e);
  // publishBundle needs a canvas (browser-only); exercise revoke directly instead when unavailable.
  if(!(created instanceof Error)){assert.match(created.deleteToken,/^[\w-]{43}$/);assert.equal(calls[0].options.headers['X-Delete-Hash'],await hashDeleteToken(created.deleteToken));assert.ok(!encodePointer({reference:created}).url.includes(created.deleteToken));}
  calls.length=0;await revokeShare({id:reference.id,deleteToken:token});
  assert.equal(calls[0].url,SKETCH_API_BASE+'/s/'+reference.id);assert.equal(calls[0].options.method,'DELETE');assert.equal(calls[0].options.headers['X-Delete-Token'],token);
  globalThis.fetch=async()=>new Response(null,{status:403});await assert.rejects(revokeShare({id:reference.id,deleteToken:token}),/Not the owner/);
  await assert.rejects(revokeShare({id:'bad',deleteToken:token}),RangeError);
  assert.ok(!encodePointer({reference:{...reference,deleteToken:token}}).url.includes(token));
});

import {bytesToDecimal,decimalToBytes,decodePortrait as decodeLong} from './share.mjs';
test('riddle hints: only in guessing mode, sanitised to 12 chars, in both pointer and text link; v1 pointers still decode',()=>{
  const p=decodePointer(encodePointer({reference,counts:[5,6],name:'阿尔伯特',guess:true,hint:'  高中同桌<script>，坐我左边的那个人  '}).url);
  assert.equal(p.hint,'高中同桌script，坐');assert.equal(p.name,'阿尔伯特');
  assert.equal(decodePointer(encodePointer({reference,guess:false,hint:'泄露'}).url).hint,'');
  const v2=decimalToBytes(new URL(encodePointer({reference,counts:[5,6],name:'ab'}).url).hash.slice(2)),v1=Uint8Array.from([...v2.subarray(0,10),...v2.subarray(11)]);v1[1]=1;
  assert.deepEqual(decodePointer('#s'+bytesToDecimal(v1)),{reference,counts:[5,6],name:'ab',guess:false,hint:'',palette:'ink'});
  const long=encodePortrait({...portrait(),guess:true,hint:'猜猜看'}),plain=encodePortrait({...portrait(),guess:true});
  assert.equal(decodeLong(long.url).hint,'猜猜看');assert.equal(decodeLong(plain.url).hint,'');assert.equal(decodeLong(encodePortrait({...portrait(),hint:'x'}).url).hint,'');
});
