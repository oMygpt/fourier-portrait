importScripts('vendor/ort/ort.min.js');
ort.env.wasm.wasmPaths=new URL('vendor/ort/',self.location.href).href;
ort.env.wasm.numThreads=1;
ort.env.logLevel='error';
let session=null,currentStyle='';

async function modelBytes(file,id){
  const url=new URL(`models/${file}`,self.location.href).href;
  const model=file==='yunet.onnx'?'人像识别模型':file==='modnet-q8.onnx'?'背景分离模型':'描线模型',notify=data=>postMessage({id,model,...data});
  let cache;
  try{cache=await caches.open('fourier-lineart-v1');const saved=await cache.match(url);if(saved){notify({progress:100,cached:true});return saved.arrayBuffer();}}catch{}
  const response=await fetch(url);if(!response.ok)throw Error('Model download failed');
  const total=Number(response.headers.get('content-length'))||17500000,reader=response.body.getReader(),chunks=[];let received=0;
  while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;notify({progress:Math.min(99,Math.round(received/total*100))});}
  const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{await cache?.put(url,new Response(bytes,{headers:{'content-type':'application/octet-stream'}}));}catch{}
  notify({progress:100});return bytes;
}

async function run({data:{id,bitmap,style}}){
  try{
    let portrait={image:bitmap,face:null,enhanced:false,mattingUsed:false};
    try{const {preparePortrait}=await import('./portrait-worker.mjs');portrait=await preparePortrait(bitmap,ort,file=>modelBytes(file,id),message=>postMessage({id,message}));}
    catch(error){postMessage({id,message:'人像预处理暂不可用，使用原始描线',preprocessFallback:true,reason:error.message});}
    const source=portrait.image;
    if(!session||currentStyle!==style){
      if(session){await session.release();session=null;}
      const bytes=await modelBytes(style==='anime'?'anime512.onnx':'contour512.onnx',id);
      let gpu=false;try{gpu=Boolean(navigator.gpu&&await navigator.gpu.requestAdapter());}catch{}
      if(gpu){try{session=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu','wasm']});}catch{}}
      if(!session)session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
      currentStyle=style;
    }
    postMessage({id,progress:100,inference:true,message:'模型正在静静描线…'});
    const side=512,canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const ratio=side/Math.max(source.width,source.height),w=Math.round(source.width*ratio),h=Math.round(source.height*ratio),x=Math.floor((side-w)/2),y=Math.floor((side-h)/2);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);ctx.drawImage(source,x,y,w,h);
    const width=Math.max(4,Math.round(source.width*Math.min(1,400/Math.max(source.width,source.height)))),height=Math.max(4,Math.round(source.height*Math.min(1,400/Math.max(source.width,source.height))));bitmap.close();
    const rgba=ctx.getImageData(0,0,side,side).data,input=new Float32Array(side*side*3);
    for(let i=0;i<side*side;i++)for(let c=0;c<3;c++)input[c*side*side+i]=rgba[i*4+c]/255;
    const tensor=new ort.Tensor('float32',input,[1,3,side,side]),output=await session.run({[session.inputNames[0]]:tensor}),result=output[session.outputNames[0]],pixels=ctx.createImageData(side,side);
    for(let i=0;i<side*side;i++){const v=Math.max(0,Math.min(255,Math.round(result.data[i]*255)));pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=v;pixels.data[i*4+3]=255;}
    tensor.dispose();for(const value of Object.values(output))value.dispose();ctx.putImageData(pixels,0,0);
    const cropped=new OffscreenCanvas(width,height),cc=cropped.getContext('2d',{willReadFrequently:true});cc.drawImage(canvas,x,y,w,h,0,0,width,height);
    const image=cc.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=image[i*4];
    postMessage({id,gray,width,height,face:portrait.face,enhanced:portrait.enhanced,mattingUsed:portrait.mattingUsed},[gray.buffer]);
  }catch(error){bitmap?.close();postMessage({id,error:error.message||'Model inference failed'});}
}
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(()=>run(event));};
