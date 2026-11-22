import {u2Input,u2Gray,paperSketch,subjectMatte} from './sketch.mjs';

let session;
export async function portraitSketch(source,ort,bytes,progress,matte=null){
  if(!session){progress('正在准备人像素描模型…');session=await ort.InferenceSession.create(await bytes('u2net-portrait-q8.onnx'),{executionProviders:['wasm']});}
  progress('正在细细描绘发丝与明暗…');
  const canvas=new OffscreenCanvas(512,512),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);ctx.drawImage(source,0,0,512,512);
  if(matte){
    const mask=new OffscreenCanvas(512,512),mc=mask.getContext('2d',{willReadFrequently:true});mc.drawImage(matte,0,0,512,512);const maskPixels=mc.getImageData(0,0,512,512),alpha=subjectMatte(Uint8Array.from({length:512*512},(_,i)=>maskPixels.data[i*4]),512,512),pixels=ctx.getImageData(0,0,512,512);
    for(let i=0;i<512*512;i++){const a=Math.min(1,alpha[i]/(255*.8));for(let c=0;c<3;c++){pixels.data[i*4+c]=255-(255-pixels.data[i*4+c])*a;maskPixels.data[i*4+c]=alpha[i];}}ctx.putImageData(pixels,0,0);mc.putImageData(maskPixels,0,0);matte=mask;
  }
  const input=new ort.Tensor('float32',u2Input(ctx.getImageData(0,0,512,512).data),[1,3,512,512]);let output;
  try{
    output=await session.run({[session.inputNames[0]]:input});const gray=u2Gray(output[session.outputNames[0]].data),pixels=ctx.createImageData(512,512);
    for(let i=0;i<gray.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=gray[i];pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);
    const ratio=512/Math.max(source.width,source.height),width=Math.max(4,Math.round(source.width*ratio)),height=Math.max(4,Math.round(source.height*ratio)),result=new OffscreenCanvas(width,height),rc=result.getContext('2d',{willReadFrequently:true});rc.drawImage(canvas,0,0,width,height);
    const rgba=rc.getImageData(0,0,width,height).data,raw=Uint8Array.from({length:width*height},(_,i)=>rgba[i*4]);let alpha=null;
    if(matte){rc.clearRect(0,0,width,height);rc.drawImage(matte,0,0,width,height);const mask=rc.getImageData(0,0,width,height).data;alpha=Uint8Array.from({length:width*height},(_,i)=>mask[i*4]);}
    return {gray:paperSketch(raw,width,height,alpha),width,height};
  }finally{input.dispose();if(output)Object.values(output).forEach(value=>value.dispose());}
}
