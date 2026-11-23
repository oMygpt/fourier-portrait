importScripts('vendor/ort/ort.min.js');
ort.env.wasm.wasmPaths=new URL('vendor/ort/',self.location.href).href;
ort.env.wasm.numThreads=1;
ort.env.logLevel='error';
let session=null;

let partsManifest=null;
function modelParts(){
  partsManifest??=fetch(new URL('models/parts.json',self.location.href).href).then(r=>r.ok?r.json():{}).catch(()=>({}));
  return partsManifest;
}

// One download per model, shared by every caller (a warm-up started on upload intent, then the real job);
// progress goes to every job waiting on it, so the client's stall timer keeps seeing activity.
const inflight=new Map();
function modelBytes(file,id){
  let entry=inflight.get(file);
  if(!entry){
    entry={listeners:new Set(),last:null};
    entry.promise=downloadModel(file,data=>{entry.last=data;for(const listener of entry.listeners)if(listener!=null)postMessage({id:listener,file,...data});}).catch(error=>{inflight.delete(file);throw error;});
    inflight.set(file,entry);
  }
  entry.listeners.add(id);if(entry.last&&id!=null)postMessage({id,file,...entry.last});
  return entry.promise;
}

async function downloadModel(file,notify){
  const url=new URL(`models/${file}`,self.location.href).href;
  let cache;
  try{cache=await caches.open('fourier-lineart-v1');const saved=await cache.match(url);if(saved){const bytes=await saved.arrayBuffer();notify({progress:100,cached:true,received:bytes.byteLength,total:bytes.byteLength});return bytes;}}catch{}
  // Hosts with a per-file size limit (Cloudflare Pages: 25 MiB) serve big models as parts listed in models/parts.json.
  const parts=(await modelParts())[file],urls=parts?parts.parts.map(part=>new URL(`models/${part}`,self.location.href).href):[url];
  const chunks=[];let received=0,total=parts?.size||0;
  for(const partUrl of urls){
    const response=await fetch(partUrl);if(!response.ok)throw Error('Model download failed');
    if(!parts)total=Number(response.headers.get('content-length'))||0;
    const reader=response.body.getReader();
    while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;notify({progress:total?Math.min(99,Math.round(received/total*100)):0,received,total});}
  }
  if(parts&&received!==parts.size)throw Error('Model download incomplete');
  const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{await cache?.put(url,new Response(bytes,{headers:{'content-type':'application/octet-stream'}}));}catch{}
  notify({progress:100,received,total:received});return bytes;
}

async function run({data:{id,bitmap}}){
  try{
    let portrait={image:bitmap,face:null,enhanced:false,mattingUsed:false};
    try{const {preparePortrait}=await import('./portrait-worker.mjs');portrait=await preparePortrait(bitmap,ort,file=>modelBytes(file,id),(message,phase,matte)=>postMessage({id,message,phase,matte}));}
    catch(error){postMessage({id,message:'人像预处理暂不可用，使用原始描线',preprocessFallback:true,reason:error.message});}
    const source=portrait.image;
    if(!session){
      const bytes=await modelBytes('contour512-q8.onnx',id);
      let gpu=false;try{gpu=Boolean(navigator.gpu&&await navigator.gpu.requestAdapter());}catch{}
      if(gpu){try{session=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu','wasm']});}catch{}}
      if(!session)session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
    }
    postMessage({id,inference:true,phase:'formula'});
    const side=512,canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const ratio=side/Math.max(source.width,source.height),w=Math.round(source.width*ratio),h=Math.round(source.height*ratio),x=Math.floor((side-w)/2),y=Math.floor((side-h)/2);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);ctx.drawImage(source,x,y,w,h);
    const width=Math.max(4,Math.round(source.width*Math.min(1,400/Math.max(source.width,source.height)))),height=Math.max(4,Math.round(source.height*Math.min(1,400/Math.max(source.width,source.height))));
    const rgba=ctx.getImageData(0,0,side,side).data,input=new Float32Array(side*side*3);
    for(let i=0;i<side*side;i++)for(let c=0;c<3;c++)input[c*side*side+i]=rgba[i*4+c]/255;
    const tensor=new ort.Tensor('float32',input,[1,3,side,side]),output=await session.run({[session.inputNames[0]]:tensor}),result=output[session.outputNames[0]],pixels=ctx.createImageData(side,side);
    for(let i=0;i<side*side;i++){const v=Math.max(0,Math.min(255,Math.round(result.data[i]*255)));pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=v;pixels.data[i*4+3]=255;}
    tensor.dispose();for(const value of Object.values(output))value.dispose();ctx.putImageData(pixels,0,0);
    const cropped=new OffscreenCanvas(width,height),cc=cropped.getContext('2d',{willReadFrequently:true});cc.drawImage(canvas,x,y,w,h,0,0,width,height);
    const image=cc.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=image[i*4];
    postMessage({id,gray,width,height,sketchPending:true,face:portrait.face,landmarks:portrait.landmarks||[],enhanced:portrait.enhanced,mattingUsed:portrait.mattingUsed,strategy:portrait.strategy||'original'},[gray.buffer]);
    try{
      const {portraitSketch}=await import('./sketch-worker.mjs');let matte=portrait.sketchMatte;
      if(!matte)try{const {portraitMatte}=await import('./portrait-worker.mjs');matte=await portraitMatte(source,ort,file=>modelBytes(file,id));}catch{}
      const sketch=await portraitSketch(source,ort,file=>modelBytes(file,id),message=>postMessage({id,message,phase:'sketching',sketchProgress:true}),matte);
      postMessage({id,sketch},[sketch.gray.buffer]);
    }catch{postMessage({id,sketchFallback:true});}
    bitmap.close();
  }catch(error){bitmap?.close();postMessage({id,error:error.message||'Model inference failed'});}
}
// Warm-up: fetch the runtime and models in the order a job needs them, without joining the job queue.
const WARM_ORDER=['yunet.onnx','modnet-q8.onnx','contour512-q8.onnx','u2net-portrait-q8.onnx'];
let warming=null;
function warm(){
  warming??=(async()=>{
    // Initialise the ONNX runtime with the tiny face model: ORT loads its ~21 MB wasm once per worker,
    // through its own fetch, so warming it this way is reused by the job (a plain fetch was not).
    try{await ort.InferenceSession.create(await modelBytes('yunet.onnx',null),{executionProviders:['wasm']});}catch{}
    for(const file of WARM_ORDER)try{await modelBytes(file,null);}catch{}
  })();
  return warming;
}
let queue=Promise.resolve();
self.onmessage=event=>{if(event.data?.warm){warm();return;}queue=queue.then(()=>run(event));};
