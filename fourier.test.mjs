import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dft,evaluate,orderPath,edgePoints,realDft,chainTip,axisEnvelope,xyLayout} from './fourier.mjs';
import {xdog,styleParameters,thresholdSketch,vectorize,joinStrokes,resampleClosed,simplify,thin} from './lineart.mjs';
import {selectTerms,formulaBody,latexDocument,limitChains} from './portrait.mjs';
import {encodePortrait,decodePortrait,cleanName,bytesToDecimal,decimalToBytes,shareQrSegments,shareQrBits,SHARE_BASE} from './share.mjs';
import {PALETTES,PALETTE_IDS,normalizePalette} from './palettes.mjs';
import {backgroundComplexity,portraitCrop,detectFace} from './portrait-preprocess.mjs';
import {consolidatePortrait} from './strokes.mjs';
import {analyzeSketch} from './path.mjs';
import {numericExcerpt,cardStats,drawCardQr,CARD_GOLD,CARD_NIGHT} from './card.mjs';
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';
import {samplePortrait,closeStrokeSeams,visitorInk,PORTRAIT_INK} from './portrait-render.mjs';
import {shouldReloadForHash} from './navigation.mjs';

test('hash navigation accepts numeric and legacy shares, resets home and rejects broken payloads',()=>{
  const path=Array.from({length:64},(_,i)=>({x:20*Math.cos(i*Math.PI/32),y:15*Math.sin(i*Math.PI/32),draw:true}));
  const share=encodePortrait({mode:'complex',chains:{complex:dft(path)},path,dimensions:{width:40,height:30},name:'导航测试'}),hash=new URL(share.url).hash;
  assert.equal(shouldReloadForHash(hash),true);
  const bytes=decimalToBytes(hash.slice(2)),legacy='#p='+Buffer.from(bytes).toString('base64url');
  assert.equal(shouldReloadForHash(legacy),true);
  assert.equal(shouldReloadForHash(''),true);assert.equal(shouldReloadForHash('#formula'),false);
  for(const bad of ['#n','#n123','#p=','#p=broken'])assert.throws(()=>shouldReloadForHash(bad));
});

test('dense portrait samples preserve Fourier geometry and explicit pen lifts in both modes',()=>{
  const path=Array.from({length:16},(_,i)=>({x:20*Math.cos(i*Math.PI/8),y:15*Math.sin(i*Math.PI/8),draw:i<6||i>9})),chains={x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)};
  for(const mode of ['xy','complex']){
    const points=samplePortrait(mode,chains,path,7200);assert.equal(points.length,7201);
    for(let i=0;i<points.length;i+=37){const t=i/7200;assert.ok(Math.hypot(points[i].x-20*Math.cos(t*2*Math.PI),points[i].y-15*Math.sin(t*2*Math.PI))<1e-10);assert.equal(points[i].draw,path[Math.min(15,Math.floor(t*16))].draw);}
  }
  assert.deepEqual(samplePortrait('xy',chains,[]),[]);assert.throws(()=>samplePortrait('xy',chains,path,0),RangeError);
});

test('seam repair only closes short smooth gaps, preserving distant and sharp pen lifts',()=>{
  const points=Array.from({length:10},(_,i)=>({x:i,y:0,draw:i!==0&&i!==4&&i!==5})),before=structuredClone(points);
  assert.ok(closeStrokeSeams(points,3).slice(1).every(p=>p.draw));assert.deepEqual(points,before);
  assert.equal(closeStrokeSeams(points,0)[4].draw,false);
  const corner=points.map((p,i)=>i>5?{...p,x:5,y:i-5}:p);assert.equal(closeStrokeSeams(corner,3)[4].draw,false);
  const distant=points.map((p,i)=>({...p,x:p.x+(i>=5?30:0)}));assert.equal(closeStrokeSeams(distant,3)[4].draw,false);
  assert.deepEqual(closeStrokeSeams([],3),[]);assert.throws(()=>closeStrokeSeams(points,-1),RangeError);
});

test('visitor ink stays readable and scales glow with the actual DPR backing store',()=>{
  assert.equal(PORTRAIT_INK.color,CARD_GOLD);assert.equal(PORTRAIT_INK.width,2.2);
  for(const css of [344,500]){const a=visitorInk(css,css/900),b=visitorInk(css,css*3/900);assert.equal(a.width,b.width);assert.ok(Math.abs(b.glow-3*a.glow)<1e-12);assert.ok(a.width*css/900>=1.1-1e-12);}
  assert.throws(()=>visitorInk(0,1),RangeError);assert.throws(()=>visitorInk(344,NaN),RangeError);
});

test('palette QR uses flat integer modules and an untextured four-module quiet zone',()=>{
  const qrcode=createRequire(import.meta.url)('./qrcode.js'),qr=qrcode(18,'L');qr.addData('a portrait in circles','Byte');qr.make();
  const fills=[],ctx={globalAlpha:.2,shadowBlur:8,fillStyle:'red',save(){this.state=[this.globalAlpha,this.shadowBlur,this.fillStyle];},restore(){[this.globalAlpha,this.shadowBlur,this.fillStyle]=this.state;},fillRect(x,y,w,h){fills.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha,blur:this.shadowBlur});}};
  assert.equal(drawCardQr(ctx,qr,620,996),388);assert.deepEqual(fills[0],{x:620,y:996,w:388,h:388,color:CARD_NIGHT,alpha:1,blur:0});
  for(const r of fills.slice(1)){assert.equal(r.color,CARD_GOLD);assert.equal(r.alpha,1);assert.equal(r.blur,0);assert.equal(r.w,4);assert.equal(r.h,4);assert.equal(r.x%4,0);assert.equal(r.y%4,0);assert.ok(r.x>=636&&r.y>=1012&&r.x+4<=992&&r.y+4<=1368);}
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const palette of PALETTE_IDS){fills.length=0;drawCardQr(ctx,qr,620,996,4,palette);assert.equal(fills[0].color,PALETTES[palette].background);assert.ok(fills.slice(1).every(r=>r.color===PALETTES[palette].line));const values=[luminance(PALETTES[palette].line),luminance(PALETTES[palette].background)].sort((a,b)=>a-b);assert.ok((values[1]+.05)/(values[0]+.05)>10);}
  assert.deepEqual([ctx.globalAlpha,ctx.shadowBlur,ctx.fillStyle],[.2,8,'red']);
  for(const unit of [0,3,4.5])assert.throws(()=>drawCardQr(ctx,qr,620,996,unit),RangeError);
  assert.throws(()=>drawCardQr(ctx,qr,620.5,996),RangeError);
  for(const modules of [0,22,93])assert.throws(()=>drawCardQr(ctx,{getModuleCount:()=>modules},620,996),RangeError);
});

test('personal card stats use the current mode, actual circle count and non-DC dominant frequency',()=>{
  const chains={x:[{k:0,amplitude:100},{k:-3,amplitude:8}],y:[{k:2,amplitude:5}],complex:[{k:7,amplitude:12}]};
  assert.deepEqual(cardStats('xy',chains),{count:3,k:-3,radius:100});assert.deepEqual(cardStats('complex',chains),{count:1,k:7,radius:12});
  assert.deepEqual(cardStats('xy',{x:[],y:[]}),{count:0,k:0,radius:0});
  for(const amplitude of [NaN,Infinity,-1])assert.throws(()=>cardStats('complex',{complex:[{k:1,amplitude}]}),RangeError);
});

test('visitor circle budget selects amplitude-ranked terms without mutating the shared portrait',()=>{
  const chains={x:[{k:1,amplitude:8},{k:2,amplitude:3}],y:[{k:3,amplitude:5}],complex:[{k:4,amplitude:6},{k:5,amplitude:2}]},before=structuredClone(chains);
  assert.deepEqual(limitChains('xy',chains,2),{x:[chains.x[0]],y:[chains.y[0]],complex:[]});
  assert.deepEqual(limitChains('xy',chains,100),{x:chains.x,y:chains.y,complex:[]});
  assert.deepEqual(limitChains('complex',chains,1),{x:[],y:[],complex:[chains.complex[0]]});
  assert.deepEqual(limitChains('xy',{x:[],y:[]},1),{x:[],y:[],complex:[]});assert.deepEqual(chains,before);
  for(const count of [0,-1,NaN,Infinity])assert.throws(()=>limitChains('xy',chains,count),RangeError);
});

test('guessing flag and sanitized name round-trip in both modes, including anonymous and legacy links',()=>{
  const path=Array.from({length:16},(_,i)=>({x:20*Math.cos(i*Math.PI/8),y:15*Math.sin(i*Math.PI/8),draw:true})),chains={x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)};
  for(const mode of ['xy','complex'])for(const guess of [false,true])for(const name of ['', '小圆<>\n昵称']){
    const encoded=encodePortrait({mode,chains,path,dimensions:{width:100,height:100},name,guess}),decoded=decodePortrait(encoded.url);
    assert.equal(decoded.guess,guess);assert.equal(decoded.name,cleanName(name));
    const wire=decimalToBytes(encoded.url.split('#n')[1]),bytes=inflateSync(wire.subarray(2));
    assert.equal(bytes[1],2);assert.equal(bytes[24],guess?1:0);
    bytes[24]=7;const invalid=new Uint8Array([...wire.subarray(0,2),...deflateSync(bytes)]);assert.throws(()=>decodePortrait('#n'+bytesToDecimal(invalid)),/分享链接无效/);
  }
  const normal=encodePortrait({mode:'xy',chains,path,dimensions:{width:100,height:100},name:'旧链接'});
  assert.equal(decodePortrait('#p='+Buffer.from(decimalToBytes(normal.url.split('#n')[1])).toString('base64url')).guess,false);
});

test('share palettes round-trip independently of guessing and default old or unknown palettes to ink',()=>{
  const path=Array.from({length:24},(_,i)=>({x:20*Math.cos(i*Math.PI/12),y:15*Math.sin(i*Math.PI/12),draw:i%6!==0})),chains={x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)};
  for(const mode of ['xy','complex'])for(const palette of PALETTE_IDS)for(const guess of [false,true]){
    const encoded=encodePortrait({mode,chains,path,dimensions:{width:100,height:100},name:'圆周',guess,palette}),decoded=decodePortrait(encoded.url);
    assert.equal(decoded.palette,palette);assert.equal(decoded.guess,guess);assert.equal(decoded.name,'圆周');assert.ok(encoded.qrBits<=5760);
  }
  for(const palette of ['',null,undefined,'gold',{},'__proto__']){assert.equal(normalizePalette(palette),'ink');const encoded=encodePortrait({mode:'xy',chains,path,dimensions:{width:100,height:100},palette});assert.equal(decodePortrait(encoded.url).palette,'ink');}
  const encoded=encodePortrait({mode:'xy',chains,path,dimensions:{width:100,height:100}}),wire=decimalToBytes(encoded.url.split('#n')[1]),bytes=inflateSync(wire.subarray(2));assert.equal(bytes[24],0);assert.equal(decodePortrait('#p='+Buffer.from(wire).toString('base64url')).palette,'ink');
});

test('portrait background check rejects blank backgrounds and identifies clutter outside a matte',()=>{
  const width=40,height=40,alpha=new Float32Array(width*height),rgba=new Uint8ClampedArray(width*height*4).fill(255);
  assert.equal(backgroundComplexity(rgba,alpha,width,height).apply,false);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgba[(y*width+x)*4+c]=Math.floor(x/3)%2?255:0;
  assert.equal(backgroundComplexity(rgba,alpha,width,height).apply,true);alpha.fill(1);assert.equal(backgroundComplexity(rgba,alpha,width,height).apply,false);
  assert.equal(backgroundComplexity([],[],0,0).apply,false);assert.throws(()=>backgroundComplexity([],alpha,width,height),RangeError);
  assert.deepEqual(portraitCrop(null,80,100),{x:0,y:0,width:80,height:100});const crop=portraitCrop({x:20,y:20,w:20,h:30},80,100);assert.ok(crop.x<=3&&crop.y===0&&crop.width>=54&&crop.height===97);assert.throws(()=>portraitCrop(null,0,100),RangeError);
});

test('YuNet decoding handles detections, no face, overlap suppression and malformed outputs',()=>{
  const outputs={};for(const stride of [8,16,32]){const count=(640/stride)**2;outputs[`cls_${stride}`]={data:new Float32Array(count)};outputs[`obj_${stride}`]={data:new Float32Array(count)};outputs[`bbox_${stride}`]={data:new Float32Array(count*4)};}
  assert.equal(detectFace(outputs,1,640,640),null);const i=20*80+20;outputs.cls_8.data[i]=outputs.obj_8.data[i]=.99;outputs.bbox_8.data.set([.5,.5,Math.log(4),Math.log(5)],i*4);const face=detectFace(outputs,1,640,640);assert.ok(Math.abs(face.x-148)<1e-4&&Math.abs(face.y-144)<1e-4&&Math.abs(face.w-32)<1e-4);assert.throws(()=>detectFace({},1,640,640),TypeError);
});

test('conservative portrait consolidation preserves long head outlines and is blank and error safe',()=>{
  const width=80,height=100,binary=new Uint8Array(width*height).fill(255),face=[20,20,40,55];for(let y=8;y<90;y++){binary[y*width+10]=0;binary[y*width+70]=0;}for(let x=10;x<=70;x++)binary[8*width+x]=0;
  const strokes=consolidatePortrait(binary,width,height,10,face);assert.ok(strokes.length>=1&&strokes.length<=120);assert.ok(strokes.flat().some(p=>p.y<=10));assert.ok(strokes.flat().some(p=>p.y>=85));assert.deepEqual(consolidatePortrait(new Uint8Array(width*height).fill(255),width,height,10,face),[]);assert.throws(()=>consolidatePortrait(binary,width,height,10,null),RangeError);assert.throws(()=>consolidatePortrait([],width,height,10,face),RangeError);
});

test('decimal transport preserves every tail length, zero padding and 40-bit blocks',()=>{
  for(const length of [...Array.from({length:32},(_,i)=>i),4096])for(const fill of [0,255,-1]){
    const bytes=Uint8Array.from({length},(_,i)=>fill<0?(i*173+81)%256:fill),digits=bytesToDecimal(bytes);
    assert.match(digits,/^[0-4]\d*$/);assert.deepEqual(decimalToBytes(digits),bytes);
  }
  assert.equal(bytesToDecimal(new Uint8Array()),'0');
  assert.equal(bytesToDecimal(new Uint8Array(5).fill(255)),'01099511627775');
  assert.equal(bytesToDecimal(Uint8Array.of(0)),'1000');
  for(const invalid of ['', '5', '00', '1256', '299999', '0'+'9'.repeat(13), '1x00', '0'.repeat(10652)])assert.throws(()=>decimalToBytes(invalid),RangeError);
  assert.throws(()=>bytesToDecimal([]),TypeError);assert.throws(()=>bytesToDecimal(new Uint8Array(4097)),RangeError);
});

test('vendored QR encoder uses separate Byte and Numeric segments within v18',()=>{
  const qrcode=createRequire(import.meta.url)('./qrcode.js');
  const bytes=Uint8Array.from({length:610},(_,i)=>(i*173+81)%256),url=SHARE_BASE+'#n'+bytesToDecimal(bytes),segments=shareQrSegments(url);
  assert.deepEqual(segments.map(s=>s.mode),['Byte','Numeric']);assert.equal(segments[0].data,SHARE_BASE+'#n');
  assert.equal(segments.map(s=>s.data).join(''),url);assert.ok(shareQrBits(url)<=5760);
  const mixed=qrcode(0,'L');for(const segment of segments)mixed.addData(segment.data,segment.mode);mixed.make();assert.ok(mixed.getModuleCount()<=89);
  const legacy=SHARE_BASE+'#p='+Buffer.from(bytes).toString('base64url'),plain=qrcode(0,'L');plain.addData(legacy,'Byte');plain.make();assert.ok(mixed.getModuleCount()<plain.getModuleCount());
  assert.deepEqual(shareQrSegments(legacy),[{data:legacy,mode:'Byte'}]);
});

test('card excerpts combine real conjugate terms and handle empty and invalid coefficients',()=>{
  const pair=[{k:1,amplitude:2,phase:.4},{k:-1,amplitude:2,phase:-.4}];
  assert.equal(numericExcerpt(pair),'4 cos(2πt + 0.4)');
  assert.match(numericExcerpt(pair,false),/e⁽/);
  assert.equal(numericExcerpt([]),'0');
  assert.throws(()=>numericExcerpt([{k:NaN,amplitude:2,phase:0}]),RangeError);
});

test('balanced XY bands remain in bounds and do not overlap the centered drawing',()=>{
  for(const dimensions of [{width:316,height:400},{width:400,height:180}])for(const size of [0,50,200]){
    const X={radius:size,band:size/3},Y={radius:size*2,band:size/2},layout=xyLayout(dimensions,X,Y),{plot,top,left}=layout,s=plot.scale;
    assert.deepEqual([plot.x,plot.y],[530,530]);
    assert.ok(top.x+X.radius*s<=840&&top.x-X.radius*s>=35);
    assert.ok(left.y+Y.radius*s<=840&&left.y-Y.radius*s>=35);
    assert.ok(top.y-X.band*s>=35&&left.x-Y.band*s>=35);
    assert.ok(top.y+X.band*s+24<=plot.y-dimensions.height*s/2);
    assert.ok(left.x+Y.band*s+24<=plot.x-dimensions.width*s/2);
  }
});

test('worker sketch analysis prepares Fourier chains and rejects empty or invalid sketches',()=>{
  const binary=new Uint8Array(32*32).fill(255);
  for(let y=5;y<27;y++){binary[y*32+8]=0;binary[y*32+22]=0;}
  const result=analyzeSketch(binary,32,32,3);
  assert.equal(result.path.length,1800);assert.equal(result.coefficients.length,1800);
  assert.ok(result.automatic.x.count>=8);assert.ok(result.bounds.x.radius>0);
  assert.ok(result.path.some(p=>!p.draw));
  assert.throws(()=>analyzeSketch(new Uint8Array(32*32).fill(255),32,32,3),/未找到足够线条/);
  assert.throws(()=>analyzeSketch([],32,32,3),RangeError);
  const portrait=new Uint8Array(64*64).fill(255);
  for(let y=12;y<=18;y++)portrait[y*64+32]=0;
  for(let y=45;y<=51;y++)portrait[y*64+5]=0;
  for(let y=30;y<=55;y++)portrait[y*64+55]=0;
  assert.equal(analyzeSketch(portrait,64,64,10,true).strokes.length,2);
});

test('model thresholding preserves contours, removes tiny components and handles blank/error inputs',()=>{
  const gray=new Uint8Array(20*20).fill(255);
  for(let y=4;y<16;y++)gray[y*20+10]=40;
  gray[21]=0;
  const binary=thresholdSketch(gray,20,20);
  assert.equal(binary[21],255);assert.equal(binary[10*20+10],0);assert.ok(binary.every(v=>v===0||v===255));
  assert.ok(thresholdSketch(new Uint8Array(100).fill(255),10,10).every(v=>v===255));
  assert.throws(()=>thresholdSketch([],10,10),RangeError);
});

test('versioned portrait URLs preserve both modes, pen lifts and bounded reconstruction',()=>{
  const path=Array.from({length:128},(_,i)=>({x:80*Math.cos(2*Math.PI*i/128)+8*Math.sin(6*Math.PI*i/128),y:65*Math.sin(4*Math.PI*i/128),draw:i%20>2}));
  const chains={x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)};
  for(const mode of ['xy','complex']){
    const encoded=encodePortrait({mode,chains,path,dimensions:{width:200,height:200},name:'Ada <3\n'},'https://example.org/portrait/');
    assert.ok(encoded.qrBits<=5760);assert.ok(encoded.energy>=.99);assert.match(encoded.url,/#n[0-4]\d+$/);
    const decoded=decodePortrait(encoded.url);
    assert.equal(decoded.mode,mode);assert.equal(decoded.name,'Ada 3');
    assert.deepEqual(decoded.path.map(p=>p.draw),path.map(p=>p.draw));
    const error=path.reduce((sum,p,i)=>sum+Math.hypot(p.x-decoded.path[i].x,p.y-decoded.path[i].y),0)/path.length;
    assert.ok(error<1,`round-trip error ${error}`);
    assert.deepEqual(decoded.dimensions,{width:200,height:200});
    const legacyV2='#p='+Buffer.from(decimalToBytes(encoded.url.split('#n')[1])).toString('base64url');
    assert.deepEqual(decodePortrait(legacyV2),decoded);
  }
  assert.ok(Array.from(cleanName('x'.repeat(30))).length<=16);
  assert.throws(()=>decodePortrait('#p=garbage'),/分享链接无效/);
  assert.throws(()=>decodePortrait('#p='+'a'.repeat(5000)),/分享链接无效/);
  assert.throws(()=>encodePortrait({mode:'xy',chains,path:[],dimensions:{width:200,height:200}},'https://example.org/'),/无可分享/);
  assert.throws(()=>encodePortrait({mode:'xy',chains,path,dimensions:{width:200,height:200}},'https://'+'x'.repeat(900)),/分享地址过长/);
  assert.throws(()=>decodePortrait('#p=RgIA'),/分享链接无效/);
  assert.throws(()=>decodePortrait('#n1256'),/分享链接无效/);
  const legacy=new Uint8Array(30),view=new DataView(legacy.buffer);
  legacy.set([70,1,1]);view.setUint16(3,8,true);view.setUint16(5,100,true);view.setUint16(7,100,true);view.setUint16(9,1,true);view.setFloat32(13,10,true);view.setFloat32(17,1,true);view.setUint16(21,65535,true);legacy[25]=255;
  assert.ok(decodePortrait('#p='+Buffer.from(legacy).toString('base64url')).path.every(p=>p.x===10&&p.y===0&&p.draw));
});

test('automatic terms meet energy and normalized reconstruction error with a bounded minimum',()=>{
  const points=Array.from({length:64},(_,i)=>({x:80*Math.cos(2*Math.PI*i/64)+.05*Math.sin(26*Math.PI*i/64),y:50*Math.sin(4*Math.PI*i/64)}));
  for(const [values,axis] of [[dft(points),''],[realDft(points.map(p=>p.x)),'x'],[realDft(points.map(p=>p.y)),'y']]){
    const selection=selectTerms(values,points,2,axis);
    assert.ok(selection.count>=8&&selection.count<64);assert.ok(selection.energy>=.99);assert.ok(selection.error<=1.5);
  }
  assert.equal(selectTerms([],[]).count,0);
  assert.equal(selectTerms(realDft([0,0]),[{x:0},{x:0}],1,'x').count,2);
});

test('personal LaTeX includes current terms, valid delimiters and clean signs',()=>{
  const values=[{k:0,re:-.12,im:-.2,amplitude:.233,phase:-2.1},{k:-1,re:2,im:.3,amplitude:2.02,phase:.15}];
  const chains={x:values,y:values,complex:values};
  for(const mode of ['xy','complex']){
    const body=formulaBody(mode,chains),document=latexDocument(mode,chains);
    assert.ok(!body.includes('+ -'));assert.ok(!document.includes('+ -'));
    assert.equal((body.match(/\\cos/g)||[]).length,mode==='xy'?4:0);
    assert.equal((body.match(/e\^/g)||[]).length,mode==='complex'?2:0);
    let depth=0;for(const c of document){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
    assert.ok(document.includes('\\documentclass{article}'));assert.ok(document.includes('\\end{document}'));
    assert.ok(formulaBody(mode,chains,1).includes('共 2 项'));
    assert.ok(latexDocument(mode,{x:[],y:[],complex:[]}).includes('=0'));
  }
});

test('real XY chains reconstruct both axes with zero and quarter-turn rotations',()=>{
  for(const n of [7,16]) {
    const x=Array.from({length:n},(_,i)=>Math.sin(i)*37+3),y=x.map((_,i)=>Math.cos(i*2)*23-5);
    const X=realDft(x),Y=realDft(y);
    for(let i=0;i<n;i++) {
      assert.ok(Math.abs(chainTip(X,i/n).x-x[i])<1e-9);
      assert.ok(Math.abs(chainTip(Y,i/n,Math.PI/2).y-y[i])<1e-9);
    }
    for(const coefficients of [X,Y,X.slice(0,3)]) {
      const bounds=axisEnvelope(coefficients);
      for(let i=0;i<100;i++)for(let j=0;j<coefficients.length;j++) {
        const tip=chainTip(coefficients.slice(0,j),i/100),r=coefficients[j].amplitude;
        assert.ok(Math.abs(tip.x)+r<=bounds.radius+1e-8);
        assert.ok(Math.abs(tip.y)+r<=bounds.band+1e-8);
      }
    }
  }
  assert.deepEqual(realDft([]),[]);assert.deepEqual(chainTip([],0,Math.PI/2),{x:0,y:0});
  assert.equal(axisEnvelope([]).radius,0);
});

test('DFT reconstructs an arbitrary closed sequence, odd and even lengths',()=>{
  for(const n of [7,16]) {
    const points=Array.from({length:n},(_,i)=>({x:Math.sin(i)*37+3,y:Math.cos(i*2)*23-5}));
    const coefficients=dft(points);
    assert.equal(coefficients.length,n);
    for(let i=0;i<n;i++) {const p=evaluate(coefficients,i/n);assert.ok(Math.hypot(p.x-points[i].x,p.y-points[i].y)<1e-9);}
    assert.deepEqual(evaluate(coefficients,0),evaluate(coefficients,0));
    assert.ok(Math.hypot(evaluate(coefficients,0).x-evaluate(coefficients,1).x,evaluate(coefficients,0).y-evaluate(coefficients,1).y)<1e-9);
  }
});

test('XDoG is binary, non-empty on a synthetic face, and blank-safe',()=>{
  const w=90,h=110,rgba=new Uint8ClampedArray(w*h*4).fill(255);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let v=245;
    if(((x-45)/29)**2+((y-48)/39)**2<1)v=160;
    if(((x-34)/5)**2+((y-39)/3)**2<1||((x-56)/5)**2+((y-39)/3)**2<1)v=25;
    if(x>41&&x<46&&y>44&&y<61||y>70&&y<74&&x>34&&x<57)v=35;
    const p=(y*w+x)*4;rgba[p]=rgba[p+1]=rgba[p+2]=v;
  }
  for(const style of [0,50,100]){
    const binary=xdog(rgba,w,h,styleParameters(style));
    assert.equal(binary.length,w*h);assert.ok(binary.every(v=>v===0||v===255));
    assert.ok(binary.includes(0));assert.ok(binary.includes(255));
    assert.ok(vectorize(binary,w,h).length>2);
  }
  assert.ok(xdog(new Uint8Array(w*h*4).fill(255),w,h).every(v=>v===255));
  assert.throws(()=>xdog([],2,2),RangeError);
  assert.throws(()=>xdog(rgba,w,h,{sigma:0,k:2,p:1,phi:5,epsilon:0}),RangeError);
});

test('stroke tracing preserves loops, filters specks, and simplifies straight strokes',()=>{
  const w=40,h=40,binary=new Uint8Array(w*h).fill(255);
  for(let x=8;x<=30;x++){binary[8*w+x]=0;binary[30*w+x]=0;}
  for(let y=8;y<=30;y++){binary[y*w+8]=0;binary[y*w+30]=0;}
  binary[3*w+3]=0;
  const strokes=vectorize(binary,w,h);
  assert.equal(strokes.length,1);assert.ok(strokes[0].length>=5);
  assert.deepEqual(strokes[0][0],strokes[0].at(-1));
  assert.deepEqual(simplify([{x:0,y:0},{x:1,y:0},{x:2,y:0}]),[{x:0,y:0},{x:2,y:0}]);
  assert.equal(vectorize(new Uint8Array(w*h).fill(255),w,h).length,0);
  assert.equal(thin(binary,w,h).length,w*h);
});

test('nearest endpoint ordering reverses strokes and arc-length sampling closes uniformly',()=>{
  const strokes=[[{x:0,y:0},{x:10,y:0},{x:20,y:0}],[{x:40,y:0},{x:21,y:0}]];
  const joined=joinStrokes(strokes);assert.equal(joined[3].x,21);assert.equal(joined[3].move,true);
  assert.equal(strokes[1][0].x,40);
  const points=resampleClosed([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],8);
  assert.equal(points.length,8);
  for(let i=0;i<8;i++)assert.ok(Math.abs(Math.hypot(points[i].x-points[(i+1)%8].x,points[i].y-points[(i+1)%8].y)-5)<1e-9);
  assert.deepEqual(joinStrokes([]),[]);assert.deepEqual(resampleClosed([]),[]);
  assert.deepEqual(resampleClosed([{x:1,y:1},{x:1,y:1}]),[]);
});
test('empty pipeline is safe and nearest neighbor keeps each point once',()=>{
  assert.deepEqual(dft([]),[]);assert.deepEqual(orderPath([]),[]);assert.deepEqual(evaluate([],0),{x:0,y:0});
  const points=[{x:0,y:0},{x:5,y:0},{x:1,y:0}]; const ordered=orderPath(points);
  assert.equal(new Set(ordered).size,3);assert.equal(points.length,3);assert.equal(ordered[1],points[0]);
});
test('Sobel ignores blank images, detects edges, and caps samples',()=>{
  const size=40,data=new Uint8ClampedArray(size*size*4);
  for(let i=0;i<size*size;i++) {data[i*4]=data[i*4+1]=data[i*4+2]=255;data[i*4+3]=255;}
  assert.equal(edgePoints(data,size,size).length,0);
  for(let y=10;y<30;y++)for(let x=10;x<30;x++)data.fill(0,(y*size+x)*4,(y*size+x)*4+3);
  assert.ok(edgePoints(data,size,size,100).length>=edgePoints(data,size,size,0).length);
  assert.equal(edgePoints(data,size,size,50,20).length,20);
});
