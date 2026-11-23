// Same-origin Worker route on the production site; the legacy workers.dev host serves the same bucket for old links.
export const SKETCH_API_BASE='https://fourier.jupyter.pro/api';
export const MAX_SKETCH_BYTES=250*1024,MAX_META_BYTES=192*1024,MAX_ENVELOPE_BYTES=MAX_SKETCH_BYTES+MAX_META_BYTES+64;
const aad=new TextEncoder().encode('fourier-portrait-sketch-v1');
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function binary(value,size){
  if(typeof value!=='string'||!/^[\w-]+$/.test(value))throw new RangeError('Invalid sketch reference');
  const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(bytes.length!==size||base64(bytes)!==value)throw new RangeError('Invalid sketch reference');return bytes;
}
export function packSketchReference(reference){
  if(reference==null)return new Uint8Array();
  return Uint8Array.from([69,1,48,0,...binary(reference.id,16),...binary(reference.key,32)]);
}
export function unpackSketchReference(bytes){
  if(bytes.length!==52||bytes[0]!==69||bytes[1]!==1||bytes[2]!==48||bytes[3]!==0)throw new RangeError('Invalid sketch section');
  return {id:base64(bytes.subarray(4,20)),key:base64(bytes.subarray(20))};
}
const IMAGE_TYPES=['image/webp','image/jpeg'];
async function encryptPlain(plain){
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,plain);
  return {ciphertext:Uint8Array.from([1,...iv,...new Uint8Array(cipher)]),key:base64(new Uint8Array(await crypto.subtle.exportKey('raw',key)))};
}
function checkImage(bytes,type){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_SKETCH_BYTES||!IMAGE_TYPES.includes(type))throw new RangeError('Invalid sketch image');
}
// Plaintext v1: [0|1, image]. Bundle: [2, image type, u32 meta length, meta, image].
export async function encryptSketch(bytes,type){
  checkImage(bytes,type);
  return encryptPlain(Uint8Array.from([IMAGE_TYPES.indexOf(type),...bytes]));
}
export async function encryptBundle(meta,bytes,type){
  checkImage(bytes,type);
  if(!(meta instanceof Uint8Array)||!meta.length||meta.length>MAX_META_BYTES)throw new RangeError('Invalid bundle metadata');
  const plain=new Uint8Array(6+meta.length+bytes.length);
  plain.set([2,IMAGE_TYPES.indexOf(type)]);new DataView(plain.buffer).setUint32(2,meta.length,true);plain.set(meta,6);plain.set(bytes,6+meta.length);
  return encryptPlain(plain);
}
export async function decryptEnvelope(bytes,keyString){
  if(!(bytes instanceof Uint8Array)||bytes.length<31||bytes.length>MAX_ENVELOPE_BYTES+30||bytes[0]!==1)throw new RangeError('Invalid encrypted sketch');
  const key=await crypto.subtle.importKey('raw',binary(keyString,32),'AES-GCM',false,['decrypt']),plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(1,13),additionalData:aad,tagLength:128},key,bytes.subarray(13)));
  if(plain[0]<=1&&plain.length>=2)return {image:new Blob([plain.subarray(1)],{type:IMAGE_TYPES[plain[0]]}),meta:null};
  if(plain[0]===2&&plain.length>=7&&plain[1]<=1){
    const length=new DataView(plain.buffer,plain.byteOffset).getUint32(2,true);
    if(length&&length<=MAX_META_BYTES&&6+length<plain.length)return {image:new Blob([plain.subarray(6+length)],{type:IMAGE_TYPES[plain[1]]}),meta:plain.slice(6,6+length)};
  }
  throw new RangeError('Invalid decrypted sketch');
}
export async function decryptSketch(bytes,keyString){
  return (await decryptEnvelope(bytes,keyString)).image;
}
async function imageBlob(source){
  if(!source||!source.width||!source.height)throw new Error('Sketch unavailable');
  const c=document.createElement('canvas'),scale=Math.min(1,768/Math.max(source.width,source.height));c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
  for(const quality of [.9,.8,.65]){let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',quality));if(!blob||blob.type!=='image/webp')blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size&&blob.size<=MAX_SKETCH_BYTES)return blob;}
  throw new Error('Sketch image too large');
}
const randomSecret=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
export const hashDeleteToken=async token=>base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
const timeout=signal=>AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
// Resolves to {id,key,deleteToken}. Only id+key ever go into links; the delete token stays with the creator.
async function upload(encrypted,signal){
  const deleteToken=randomSecret();
  const response=await fetch(SKETCH_API_BASE+'/s',{method:'POST',headers:{'X-Delete-Hash':await hashDeleteToken(deleteToken)},body:new Blob([encrypted.ciphertext],{type:'application/octet-stream'}),credentials:'omit',referrerPolicy:'no-referrer',signal:timeout(signal)});
  if(response.status!==201)throw new Error('Sketch upload unavailable');
  const {id}=await response.json(),reference={id,key:encrypted.key};packSketchReference(reference);return {...reference,deleteToken};
}
export async function revokeShare({id,deleteToken},{signal}={}){
  if(!/^[\w-]{22}$/.test(id)||!/^[\w-]{43}$/.test(deleteToken))throw new RangeError('Invalid share record');
  const response=await fetch(SKETCH_API_BASE+'/s/'+id,{method:'DELETE',headers:{'X-Delete-Token':deleteToken},credentials:'omit',referrerPolicy:'no-referrer',signal:timeout(signal)});
  if(response.status!==204)throw new Error(response.status===403?'Not the owner':'Revocation unavailable');
}
export async function publishSketch(source,{signal}={}){
  const blob=await imageBlob(source);
  return upload(await encryptSketch(new Uint8Array(await blob.arrayBuffer()),blob.type),signal);
}
// One upload per portrait: processed sketch + full-precision formula. Never the original photo.
export async function publishBundle(source,meta,{signal}={}){
  const blob=await imageBlob(source);
  return upload(await encryptBundle(meta,new Uint8Array(await blob.arrayBuffer()),blob.type),signal);
}
export async function fetchEnvelope(reference,{signal}={}){
  packSketchReference(reference);
  const response=await fetch(SKETCH_API_BASE+'/s/'+reference.id,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:timeout(signal)});
  if(response.status!==200||Number(response.headers.get('Content-Length'))>MAX_ENVELOPE_BYTES+30)throw new Error('Sketch unavailable or expired');
  return decryptEnvelope(new Uint8Array(await response.arrayBuffer()),reference.key);
}
export async function fetchSketch(reference,options){
  return (await fetchEnvelope(reference,options)).image;
}
