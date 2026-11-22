function validate(tone){
  if(!tone||!Number.isInteger(tone.width)||!Number.isInteger(tone.height)||tone.width<4||tone.width>48||tone.height<4||tone.height>64||tone.width*tone.height>2048||!Number.isInteger(tone.bits)||tone.bits<2||tone.bits>4||!(tone.data instanceof Uint8Array)||tone.data.length!==tone.width*tone.height)throw new RangeError('Invalid tone map');
  const levels=(1<<tone.bits)-1;
  if(tone.data.some(value=>value>levels))throw new RangeError('Invalid tone value');
  return levels;
}

export function createToneMap(rgba,width,height,columns=24,rows=32,bits=3){
  const tone={width:columns,height:rows,bits,data:new Uint8Array(Number.isInteger(columns*rows)&&columns*rows>0&&columns*rows<=2048?columns*rows:0)},levels=validate(tone);
  if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||rgba.length!==width*height*4)throw new RangeError('Invalid sketch pixels');
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const x0=x*width/columns,x1=(x+1)*width/columns,y0=y*height/rows,y1=(y+1)*height/rows;let darkness=0;
    for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
      const weight=(Math.min(sx+1,x1)-Math.max(sx,x0))*(Math.min(sy+1,y1)-Math.max(sy,y0)),i=(sy*width+sx)*4;
      darkness+=(1-(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])/255)*rgba[i+3]/255*weight;
    }
    tone.data[y*columns+x]=Math.round(Math.sqrt(Math.max(0,Math.min(1,darkness/((x1-x0)*(y1-y0)))))*levels);
  }
  return tone;
}

export function packToneMap(tone){
  if(tone==null)return new Uint8Array();
  validate(tone);
  const size=Math.ceil(tone.data.length*tone.bits/8),length=size+3,bytes=new Uint8Array(size+7);
  bytes.set([84,1,length&255,length>>8,tone.width,tone.height,tone.bits]);
  for(let i=0;i<tone.data.length;i++)for(let bit=0;bit<tone.bits;bit++){const offset=i*tone.bits+bit;bytes[7+(offset>>3)]|=((tone.data[i]>>bit)&1)<<(offset&7);}
  return bytes;
}

export function unpackToneMap(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<7||bytes[0]!==84||bytes[1]!==1||bytes[2]+256*bytes[3]!==bytes.length-4)throw new RangeError('Invalid tone section');
  const tone={width:bytes[4],height:bytes[5],bits:bytes[6],data:new Uint8Array(bytes[4]*bytes[5])};validate(tone);
  const used=tone.data.length*tone.bits;
  if(bytes.length!==7+Math.ceil(used/8)||used%8&&bytes.at(-1)>>(used%8))throw new RangeError('Invalid tone packing');
  for(let i=0;i<tone.data.length;i++)for(let bit=0;bit<tone.bits;bit++){const offset=i*tone.bits+bit;tone.data[i]|=((bytes[7+(offset>>3)]>>(offset&7))&1)<<bit;}
  return tone;
}

function sample(tone,u,v){
  const x=Math.max(0,Math.min(tone.width-1,u*tone.width-.5)),y=Math.max(0,Math.min(tone.height-1,v*tone.height-.5)),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,tone.width-1),y1=Math.min(y0+1,tone.height-1),fx=x-x0,fy=y-y0,levels=(1<<tone.bits)-1;
  const value=(x,y)=>(tone.data[y*tone.width+x]/levels)**2;
  return (value(x0,y0)*(1-fx)+value(x1,y0)*fx)*(1-fy)+(value(x0,y1)*(1-fx)+value(x1,y1)*fx)*fy;
}

export function sampleTone(tone,u,v){
  validate(tone);if(!Number.isFinite(u)||!Number.isFinite(v))throw new RangeError('Invalid tone coordinates');
  return sample(tone,u,v);
}

function noise(x,y){
  let n=Math.imul(x+19,374761393)^Math.imul(y+71,668265263);n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967296;
}

function hatch(phase,spacing,width){
  const position=((phase%spacing)+spacing)%spacing,distance=Math.min(position,spacing-position),cover=d=>Math.max(0,Math.min(1,width,width/2+.5-d));
  return Math.min(1,cover(distance)+cover(spacing-distance));
}

export function renderTonePixels(tone,width,height,ink=[36,39,41]){
  validate(tone);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4||width>1024||height>1024||ink.length!==3||ink.some(c=>!Number.isInteger(c)||c<0||c>255))throw new RangeError('Invalid tone surface');
  const pixels=new Uint8ClampedArray(width*height*4),smooth=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
  for(let y=0;y<height;y++){
    const curve=3*Math.sin(y/65);
    for(let x=0;x<width;x++){
      const u=(x+.5)/width,v=(y+.5)/height,edge=smooth(Math.min(u/.025,(1-u)/.025,v/.02,(1-v)/.065)),d=sample(tone,u,v)**1.15*edge;
      if(d<.0001)continue;
      const grain=.94+.12*noise(x,y),a=hatch(x*.8+y*.6+curve,2.6,2.6*Math.min(.96,d))*.98,b=hatch(x*.6-y*.8-curve,3.1,3.1*Math.max(0,Math.min(.9,(d-.35)*1.5)))*.9,alpha=Math.min(1,(1-(1-a)*(1-b))*grain),i=(y*width+x)*4;
      pixels[i]=ink[0];pixels[i+1]=ink[1];pixels[i+2]=ink[2];pixels[i+3]=Math.round(alpha*255);
    }
  }
  return pixels;
}
