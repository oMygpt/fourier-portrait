import {u2Input,u2Gray} from './sketch.mjs';

let session;
export async function portraitSketch(source,ort,bytes,progress){
  if(!session){progress('正在准备人像素描模型…');session=await ort.InferenceSession.create(await bytes('u2net-portrait-q8.onnx'),{executionProviders:['wasm']});}
  progress('正在细细描绘发丝与明暗…');
  const canvas=new OffscreenCanvas(512,512),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);ctx.drawImage(source,0,0,512,512);
  const input=new ort.Tensor('float32',u2Input(ctx.getImageData(0,0,512,512).data),[1,3,512,512]);let output;
  try{
    output=await session.run({[session.inputNames[0]]:input});const gray=u2Gray(output[session.outputNames[0]].data),pixels=ctx.createImageData(512,512);
    for(let i=0;i<gray.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=gray[i];pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);
    const ratio=512/Math.max(source.width,source.height),width=Math.max(4,Math.round(source.width*ratio)),height=Math.max(4,Math.round(source.height*ratio)),result=new OffscreenCanvas(width,height),rc=result.getContext('2d',{willReadFrequently:true});rc.drawImage(canvas,0,0,width,height);
    const rgba=rc.getImageData(0,0,width,height).data;return {gray:Uint8Array.from({length:width*height},(_,i)=>rgba[i*4]),width,height};
  }finally{input.dispose();if(output)Object.values(output).forEach(value=>value.dispose());}
}
