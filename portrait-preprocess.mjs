export function detectFace(outputs,scale,width,height){
  const faces=[];
  for(const stride of [8,16,32]){
    const cls=outputs[`cls_${stride}`].data,obj=outputs[`obj_${stride}`].data,boxes=outputs[`bbox_${stride}`].data,columns=640/stride;
    for(let i=0;i<cls.length;i++){
      const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));if(score<.75)continue;
      const w=Math.exp(boxes[4*i+2])*stride/scale,h=Math.exp(boxes[4*i+3])*stride/scale,x=((i%columns+boxes[4*i])*stride)/scale-w/2,y=((Math.floor(i/columns)+boxes[4*i+1])*stride)/scale-h/2;
      if([x,y,w,h].every(Number.isFinite)&&w>8&&h>8&&x+w>0&&y+h>0&&x<width&&y<height)faces.push({x,y,w,h,score});
    }
  }
  faces.sort((a,b)=>b.score-a.score);const selected=[];
  for(const face of faces){if(selected.some(other=>{const intersection=Math.max(0,Math.min(face.x+face.w,other.x+other.w)-Math.max(face.x,other.x))*Math.max(0,Math.min(face.y+face.h,other.y+other.h)-Math.max(face.y,other.y));return intersection/(face.w*face.h+other.w*other.h-intersection)>.3;}))continue;selected.push(face);}
  return selected.sort((a,b)=>b.w*b.h-a.w*a.h)[0]||null;
}

export function portraitCrop(face,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||face&&[face.x,face.y,face.w,face.h].some(v=>!Number.isFinite(v)))throw new RangeError('Invalid portrait dimensions');
  if(!face)return {x:0,y:0,width,height};
  const x=Math.max(0,Math.floor(face.x-.85*face.w)),y=Math.max(0,Math.floor(face.y-.65*face.h)),right=Math.min(width,Math.ceil(face.x+1.85*face.w)),bottom=Math.min(height,Math.ceil(face.y+2.55*face.h));
  return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
}

export function backgroundComplexity(rgba,alpha,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<0||height<0||rgba.length!==width*height*4||alpha.length!==width*height)throw new RangeError('Invalid matte dimensions');
  const gray=Float32Array.from(alpha,(_,i)=>.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);let background=0,backgroundEdges=0,edges=0;
  for(let y=4;y<height-4;y++)for(let x=4;x<width-4;x++){
    const i=y*width+x,gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1],gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1],edge=Math.hypot(gx,gy)>140;
    if(edge)edges++;let plain=true;
    for(let dy=-4;dy<=4&&plain;dy++)for(let dx=-4;dx<=4;dx++)if(alpha[i+dy*width+dx]>=.08){plain=false;break;}
    if(plain){background++;if(edge)backgroundEdges++;}
  }
  const density=backgroundEdges/Math.max(1,background),share=backgroundEdges/Math.max(1,edges);
  return {density,share,apply:density>.008&&share>.2};
}
