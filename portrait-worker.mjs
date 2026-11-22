import {detectFace,portraitCrop,backgroundComplexity,shouldEnhancePortrait} from './portrait-preprocess.mjs';

const sessions=new Map();
async function load(file,ort,bytes){
  if(!sessions.has(file))sessions.set(file,(async()=>{try{return await ort.InferenceSession.create(await bytes(file),{executionProviders:['wasm']});}catch(error){sessions.delete(file);throw error;}})());
  return sessions.get(file);
}
function tensor(canvas,bgr=false,normalize=false){
  const {width,height}=canvas,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data,data=new Float32Array(3*width*height);
  for(let i=0;i<width*height;i++)for(let c=0;c<3;c++){const value=rgba[i*4+(bgr?2-c:c)];data[c*width*height+i]=normalize?value/127.5-1:value;}
  return data;
}
async function infer(session,input){
  try{return await session.run({[session.inputNames[0]]:input});}finally{input.dispose();}
}
export async function portraitMatte(image,ort,bytes,progress=()=>{}){
  const matte=await load('modnet-q8.onnx',ort,bytes);
  progress('正在分离人物与背景…','matting');
  const small=new OffscreenCanvas(512,512),sc=small.getContext('2d',{willReadFrequently:true});sc.drawImage(image,0,0,512,512);
  const masks=await infer(matte,new ort.Tensor('float32',tensor(small,false,true),[1,3,512,512])),maskCanvas=new OffscreenCanvas(512,512),mc=maskCanvas.getContext('2d'),pixels=mc.createImageData(512,512);
  try{const alpha=masks[matte.outputNames[0]].data;for(let i=0;i<alpha.length;i++){pixels.data[4*i]=pixels.data[4*i+1]=pixels.data[4*i+2]=Math.round(Math.max(0,Math.min(1,alpha[i]))*255);pixels.data[4*i+3]=255;}}finally{Object.values(masks).forEach(value=>value.dispose());}mc.putImageData(pixels,0,0);
  return maskCanvas;
}
export async function preparePortrait(bitmap,ort,bytes,progress){
  progress('正在寻找人像与发梢…','matting');
  const ratio=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),width=Math.round(bitmap.width*ratio),height=Math.round(bitmap.height*ratio),image=new OffscreenCanvas(width,height),ctx=image.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);
  const detector=await load('yunet.onnx',ort,bytes),detectorCanvas=new OffscreenCanvas(640,640),dc=detectorCanvas.getContext('2d'),ds=640/Math.max(width,height);dc.fillStyle='#000';dc.fillRect(0,0,640,640);dc.drawImage(image,0,0,Math.round(width*ds),Math.round(height*ds));
  const output=await infer(detector,new ort.Tensor('float32',tensor(detectorCanvas,true),[1,3,640,640]));let face;
  try{face=detectFace(output,ds,width,height);}finally{Object.values(output).forEach(value=>value.dispose());}
  progress('正在分离人物与背景…','matting');
  const maskCanvas=await portraitMatte(image,ort,bytes,progress);
  const preview=maskCanvas.getContext('2d').getImageData(0,0,512,512).data;
  progress('背景已分离','matting',{gray:Uint8Array.from({length:512*512},(_,i)=>preview[4*i]),width:512,height:512});
  const checkScale=Math.min(1,400/Math.max(width,height)),check=new OffscreenCanvas(Math.max(4,Math.round(width*checkScale)),Math.max(4,Math.round(height*checkScale))),cc=check.getContext('2d',{willReadFrequently:true});cc.drawImage(maskCanvas,0,0,check.width,check.height);const mask=cc.getImageData(0,0,check.width,check.height).data,alpha=Float32Array.from({length:check.width*check.height},(_,i)=>mask[4*i]/255);cc.drawImage(image,0,0,check.width,check.height);
  const complexity=backgroundComplexity(cc.getImageData(0,0,check.width,check.height).data,alpha,check.width,check.height);
  if(!shouldEnhancePortrait(face,complexity))return {image:bitmap,sketchMatte:maskCanvas,face:null,landmarks:[],enhanced:false,mattingUsed:false,strategy:'original'};
  if(complexity.apply){
    const expanded=new OffscreenCanvas(width,height),ec=expanded.getContext('2d',{willReadFrequently:true});ec.drawImage(maskCanvas,0,0,width,height);const mask=ec.getImageData(0,0,width,height).data,rgba=ctx.getImageData(0,0,width,height);
    for(let i=0;i<width*height;i++){const a=Math.min(1,mask[4*i]/(255*.85));for(let c=0;c<3;c++)rgba.data[4*i+c]=rgba.data[4*i+c]*a+255*(1-a);}ctx.putImageData(rgba,0,0);
  }
  const crop=portraitCrop(face,width,height),cropped=new OffscreenCanvas(crop.width,crop.height),croppedContext=cropped.getContext('2d');croppedContext.fillStyle='#fff';croppedContext.fillRect(0,0,crop.width,crop.height);croppedContext.drawImage(image,-crop.x,-crop.y);
  const sketchMatte=new OffscreenCanvas(crop.width,crop.height);sketchMatte.getContext('2d').drawImage(maskCanvas,0,0,512,512,-crop.x,-crop.y,width,height);
  const size=Math.min(1,400/Math.max(crop.width,crop.height)),ow=Math.max(4,Math.round(crop.width*size)),oh=Math.max(4,Math.round(crop.height*size));
  return {image:cropped,sketchMatte,face:[(face.x-crop.x)*ow/crop.width,(face.y-crop.y)*oh/crop.height,face.w*ow/crop.width,face.h*oh/crop.height],landmarks:face.landmarks.map(p=>({x:(p.x-crop.x)*ow/crop.width,y:(p.y-crop.y)*oh/crop.height})),enhanced:true,mattingUsed:true,strategy:'matte-bust'};
}
