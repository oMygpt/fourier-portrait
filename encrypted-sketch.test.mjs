import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptSketch,decryptSketch,packSketchReference,unpackSketchReference,publishSketch,fetchSketch,MAX_SKETCH_BYTES,SKETCH_API_BASE} from './encrypted-sketch.mjs';
import {encodePortrait,decodePortrait,decimalToBytes,bytesToDecimal} from './share.mjs';
import {realDft,dft} from './fourier.mjs';
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';
import {cardCopy} from './card.mjs';
import {readFile} from 'node:fs/promises';
const reference={id:'AAAAAAAAAAAAAAAAAAAAAA',key:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};
const portrait=()=>{const path=Array.from({length:64},(_,i)=>({x:20*Math.cos(i*Math.PI/32),y:30*Math.sin(i*Math.PI/32),draw:i%12!==0}));return {mode:'xy',path,chains:{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)},dimensions:{width:100,height:150}};};
test('AES-GCM uses a fresh 256-bit key and nonce, round-trips supported image types without mutation',async()=>{
  const bytes=new Uint8Array([82,73,70,70,1,2,3,4]),saved=bytes.slice(),first=await encryptSketch(bytes,'image/webp'),second=await encryptSketch(bytes,'image/webp');
  assert.notEqual(first.key,second.key);assert.notDeepEqual(first.ciphertext,second.ciphertext);assert.equal(first.ciphertext.length,bytes.length+30);assert.equal(first.key.length,43);
  for(const type of ['image/webp','image/jpeg']){const e=await encryptSketch(bytes,type),blob=await decryptSketch(e.ciphertext,e.key);assert.equal(blob.type,type);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);}
  assert.deepEqual(bytes,saved);
});
test('empty, oversized, tampered, truncated and wrong-key ciphertext is rejected',async()=>{
  for(const [bytes,type]of [[new Uint8Array(),'image/webp'],[new Uint8Array(MAX_SKETCH_BYTES+1),'image/webp'],[new Uint8Array([1]),'image/svg+xml']])await assert.rejects(encryptSketch(bytes,type),RangeError);
  const e=await encryptSketch(new Uint8Array([1,2,3]),'image/webp'),changed=e.ciphertext.slice();changed[changed.length-1]^=1;
  await assert.rejects(decryptSketch(changed,e.key));await assert.rejects(decryptSketch(e.ciphertext,reference.key));await assert.rejects(decryptSketch(e.ciphertext.slice(0,12),e.key),RangeError);
  changed[0]=2;await assert.rejects(decryptSketch(changed,e.key),RangeError);
});
test('reference sections are canonical and fixed-size with no endpoint override',()=>{
  assert.deepEqual(unpackSketchReference(packSketchReference(reference)),reference);assert.equal(packSketchReference(reference).length,52);assert.equal(packSketchReference(null).length,0);
  for(const bad of [{...reference,id:'https://evil.test'},{...reference,key:'x'}, {...reference,id:reference.id.slice(0,-1)+'B'}])assert.throws(()=>packSketchReference(bad));
  for(const i of [0,1,2,3]){const bytes=packSketchReference(reference);bytes[i]^=1;assert.throws(()=>unpackSketchReference(bytes),RangeError);}
  assert.throws(()=>unpackSketchReference(new Uint8Array()),RangeError);
});
test('optional E1 works with/without T1, preserves old links and stays within the QR budget',()=>{
  const source=portrait(),plain=encodePortrait(source),toneMap={width:4,height:4,bits:3,data:new Uint8Array(16).fill(4)};
  for(const tone of [null,toneMap]){const encoded=encodePortrait({...source,toneMap:tone,encryptedSketch:reference}),decoded=decodePortrait(encoded.url);assert.deepEqual(decoded.encryptedSketch,reference);assert.deepEqual(decoded.toneMap,tone);assert.ok(encoded.qrBits<=8000);}
  assert.equal(decodePortrait(plain.url).encryptedSketch,null);assert.equal(encodePortrait({...source,encryptedSketch:null}).url,plain.url);
});
test('duplicate, unknown and malformed reference extensions fail closed',()=>{
  const encoded=encodePortrait({...portrait(),encryptedSketch:reference}),wire=decimalToBytes(encoded.url.split('#n')[1]),body=inflateSync(wire.subarray(2));
  for(const bytes of [body.slice(0,-1),Uint8Array.from([...body,...packSketchReference(reference)]),Uint8Array.from([...body,69,1,0,0])])assert.throws(()=>decodePortrait('#n'+bytesToDecimal(Uint8Array.from([70,2,...deflateSync(bytes)]))));
});
test('fetch sends only the opaque id to the fixed API; failures reject for tone fallback',async t=>{
  const bytes=new Uint8Array([1,2,3]),encrypted=await encryptSketch(bytes,'image/webp'),ref={id:reference.id,key:encrypted.key},calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return new Response(encrypted.ciphertext,{status:200});});
  const blob=await fetchSketch(ref);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);assert.equal(calls[0].url,SKETCH_API_BASE+'/s/'+ref.id);assert.ok(!calls[0].url.includes(ref.key));assert.equal(calls[0].options.referrerPolicy,'no-referrer');assert.equal(calls[0].options.credentials,'omit');
  for(const status of [204,404,503]){globalThis.fetch=async()=>new Response(null,{status});await assert.rejects(fetchSketch(ref));}
  globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));await assert.rejects(fetchSketch(ref));
  globalThis.fetch=async()=>{throw Error('offline');};await assert.rejects(fetchSketch(ref));
});
test('publishing rejects absent sketches before any upload',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('unexpected upload');});
  await assert.rejects(publishSketch(null));assert.equal(calls,0);
});
test('encrypted cards disclose sketch storage and never print the decryption key',()=>{
  const c=cardCopy({...portrait(),encryptedSketch:reference});assert.match(c.privacy.join(' '),/Sketch encrypted.*30 days/);assert.ok(!JSON.stringify(c).includes(reference.key));
  assert.match(cardCopy({...portrait(),lang:'zh',encryptedSketch:reference}).privacy.join(' '),/端到端加密/);
});
test('HD sharing is on by default, explicitly described and never uploads the photo',async()=>{
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8'),input=html.match(/<input id="include-full"[^>]*>/)?.[0];
  assert.ok(input);assert.match(input,/\bchecked\b/);assert.match(html,/Your photo itself is never uploaded; only the encrypted sketch and formula are/);assert.match(html,/copies others saved cannot be recalled/);assert.match(html,/withdraw the stored copy at any time/);assert.match(html,/Uncheck to keep only the formula/);
});
