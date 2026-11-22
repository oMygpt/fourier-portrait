export function detectFace(outputs,scale,width,height){
  const faces=[];
  for(const stride of [8,16,32]){
    const cls=outputs[`cls_${stride}`].data,obj=outputs[`obj_${stride}`].data,boxes=outputs[`bbox_${stride}`].data,columns=640/stride;
    for(let i=0;i<cls.length;i++){
      const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));if(score<.75)continue;
      const w=Math.exp(boxes[4*i+2])*stride/scale,h=Math.exp(boxes[4*i+3])*stride/scale,x=((i%columns+boxes[4*i])*stride)/scale-w/2,y=((Math.floor(i/columns)+boxes[4*i+1])*stride)/scale-h/2;
      if([x,y,w,h].every(Number.isFinite)&&w>8&&h>8&&x+w>0&&y+h>0&&x<width&&y<height){
        const keypoints=outputs[`kps_${stride}`]?.data,landmarks=keypoints?Array.from({length:5},(_,j)=>({x:(i%columns+keypoints[i*10+j*2])*stride/scale,y:(Math.floor(i/columns)+keypoints[i*10+j*2+1])*stride/scale})):[];
        faces.push({x,y,w,h,score,landmarks});
      }
    }
  }
  faces.sort((a,b)=>b.score-a.score);const selected=[];
  for(const face of faces){if(selected.some(other=>{const intersection=Math.max(0,Math.min(face.x+face.w,other.x+other.w)-Math.max(face.x,other.x))*Math.max(0,Math.min(face.y+face.h,other.y+other.h)-Math.max(face.y,other.y));return intersection/(face.w*face.h+other.w*other.h-intersection)>.3;}))continue;selected.push(face);}
  return selected.sort((a,b)=>b.w*b.h-a.w*a.h)[0]||null;
}

export function portraitCrop(face,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||face&&[face.x,face.y,face.w,face.h].some(v=>!Number.isFinite(v)))throw new RangeError('Invalid portrait dimensions');
  if(!face)return {x:0,y:0,width,height};
  const frameHeight=Math.max(face.h/.35,face.y+face.h*2.35),frameWidth=Math.max(width,face.w*3.2);
  const x=Math.floor((width-frameWidth)/2);
  return {x,y:0,width:Math.ceil(frameWidth),height:Math.ceil(frameHeight)};
}

export const shouldEnhancePortrait=(face,complexity)=>Boolean(face&&complexity.apply);

export function featureRegions(landmarks,face){
  if(!Array.isArray(landmarks)||landmarks.length!==5||!face||face.length!==4||landmarks.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return [];
  const [, ,w,h]=face,box=(p,rx,above,below)=>({x:p.x-w*rx,y:p.y-h*above,width:w*rx*2,height:h*(above+below)});
  const mouth={x:(landmarks[3].x+landmarks[4].x)/2,y:(landmarks[3].y+landmarks[4].y)/2};
  return [box(landmarks[0],.22,.16,.12),box(landmarks[1],.22,.16,.12),box(landmarks[2],.19,.18,.12),box(mouth,.35,.12,.14)];
}

export function touchesFeature(stroke,regions){
  return regions.some(r=>stroke.some((p,i)=>{const q=stroke[Math.max(0,i-1)];return Math.max(p.x,q.x)>=r.x&&Math.min(p.x,q.x)<=r.x+r.width&&Math.max(p.y,q.y)>=r.y&&Math.min(p.y,q.y)<=r.y+r.height;}));
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
