import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createToneMap,packToneMap,unpackToneMap,sampleTone,renderTonePixels} from './tone.mjs';
import {encodePortrait,decodePortrait,decimalToBytes,bytesToDecimal} from './share.mjs';
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';
import {realDft,dft} from './fourier.mjs';

const solid=(value=7,bits=3)=>({width:4,height:4,bits,data:new Uint8Array(16).fill(value)});
const portrait=()=>{
  const path=Array.from({length:64},(_,i)=>({x:20*Math.cos(i*Math.PI/32),y:30*Math.sin(i*Math.PI/32),draw:i%12!==0}));
  return {mode:'xy',path,chains:{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)},dimensions:{width:100,height:150}};
};
test('tone downsampling averages area, compands darkness and respects transparent paper',()=>{
  const pixels=new Uint8ClampedArray(16*16*4).fill(255);
  assert.ok(createToneMap(pixels,16,16,4,4).data.every(v=>v===0));
  for(let i=0;i<16*16;i++)pixels.set([0,0,0,255],4*i);
  assert.ok(createToneMap(pixels,16,16,4,4).data.every(v=>v===7));
  for(let i=0;i<16*16;i++)pixels.set([0,0,0,i%2?255:0],4*i);
  const tone=createToneMap(pixels,16,16,4,4);assert.ok(tone.data.every(v=>v===5));assert.ok(Math.abs(sampleTone(tone,.5,.5)-.5)<.02);
  assert.throws(()=>createToneMap([],0,0),RangeError);assert.throws(()=>createToneMap(pixels,15,16),RangeError);assert.throws(()=>createToneMap(pixels,16,16,49,4),RangeError);
});
test('tone packing round-trips bit depths, non-byte-aligned grids and bounded malformed data',()=>{
  assert.equal(packToneMap(null).length,0);
  for(const bits of [2,3,4])for(const [width,height] of [[4,4],[5,7],[24,32],[32,44]]){
    const tone={width,height,bits,data:Uint8Array.from({length:width*height},(_,i)=>(i*13)%2**bits)},bytes=packToneMap(tone);
    assert.equal(bytes.length,7+Math.ceil(width*height*bits/8));assert.deepEqual(unpackToneMap(bytes),tone);
    assert.throws(()=>unpackToneMap(bytes.slice(0,-1)),RangeError);
  }
  const bytes=packToneMap(solid());
  for(const [offset,value] of [[0,1],[1,2],[2,0],[4,255],[5,255],[6,9]]){const bad=bytes.slice();bad[offset]=value;assert.throws(()=>unpackToneMap(bad),RangeError);}
  const odd=packToneMap({width:5,height:5,bits:3,data:new Uint8Array(25)});odd[odd.length-1]|=128;assert.throws(()=>unpackToneMap(odd),RangeError);
  assert.throws(()=>packToneMap({...solid(),data:new Uint8Array(16).fill(8)}),RangeError);
  assert.throws(()=>packToneMap({...solid(),width:48,height:64}),RangeError);
});
test('tone interpolation is bilinear in darkness, clamped and input-safe',()=>{
  const tone=solid(0);tone.data[0]=7;
  assert.equal(sampleTone(tone,.125,.125),1);assert.equal(sampleTone(tone,.25,.25),.25);assert.equal(sampleTone(tone,-1,-1),1);assert.equal(sampleTone(tone,2,2),0);
  assert.throws(()=>sampleTone(tone,NaN,0),RangeError);
});
test('procedural tone ink is deterministic, feathered, empty-safe and denser with darkness',()=>{
  const sum=pixels=>pixels.reduce((n,v,i)=>n+(i%4===3?v:0),0),before=solid(5),saved=before.data.slice(),a=renderTonePixels(before,96,128);
  assert.deepEqual(renderTonePixels(before,96,128),a);assert.deepEqual(before.data,saved);
  assert.equal(sum(renderTonePixels(solid(0),96,128)),0);
  assert.ok(sum(renderTonePixels(solid(7),96,128))>sum(a));assert.ok(sum(a)>sum(renderTonePixels(solid(2),96,128)));
  assert.ok(sum(a.slice(0,2*96*4))<sum(a.slice(60*96*4,62*96*4)));
  const navy=renderTonePixels(before,96,128,[245,249,255]);assert.ok(navy.some((v,i)=>i%4===0&&v===245));
  assert.throws(()=>renderTonePixels(before,2048,1),RangeError);assert.throws(()=>renderTonePixels(before,96,128,[NaN,0,0]),RangeError);
});
test('optional tone section preserves old shares, palettes, names and coefficient payloads',()=>{
  for(const mode of ['xy','complex'])for(const palette of ['ink','navy','silver']){
    const data={...portrait(),mode,palette,name:'圆周',guess:true},plain=encodePortrait(data),toneMap=solid(4),encoded=encodePortrait({...data,toneMap}),decoded=decodePortrait(encoded.url);
    assert.equal(decodePortrait(plain.url).toneMap,null);assert.equal(encoded.toneBytes,13);
    assert.deepEqual(decoded.toneMap,toneMap);assert.equal(decoded.palette,palette);assert.equal(decoded.name,'圆周');assert.equal(decoded.guess,true);
    assert.deepEqual(decoded.chains,decodePortrait(plain.url).chains);
    assert.deepEqual(decodePortrait('#p='+Buffer.from(decimalToBytes(encoded.url.split('#n')[1])).toString('base64url')).toneMap,toneMap);
    assert.equal(encodePortrait({...data,toneMap:null}).url,plain.url);assert.ok(encoded.qrBits<=8000);
  }
});
test('malformed tone extensions fail closed and payload budgets remain enforced',()=>{
  const data=portrait(),encoded=encodePortrait({...data,toneMap:solid(3)}),wire=decimalToBytes(encoded.url.split('#n')[1]),body=inflateSync(wire.subarray(2));
  for(const transform of [b=>b.slice(0,-1),b=>{b[b.length-13]=85;return b;},b=>Uint8Array.from([...b,0])]){
    const bad=transform(body.slice()),packed=Uint8Array.from([70,2,...deflateSync(bad)]);assert.throws(()=>decodePortrait('#n'+bytesToDecimal(packed)),/分享链接无效/);
  }
  assert.throws(()=>encodePortrait({...data,toneMap:solid(3)},undefined,1),/分享地址过长/);
});
