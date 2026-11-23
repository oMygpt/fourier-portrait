import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {dft,evaluate,orderPath,edgePoints,realDft,chainTip,axisEnvelope,xyLayout} from './fourier.mjs';
import {xdog,styleParameters,thresholdSketch,vectorize,joinStrokes,resampleClosed,simplify,thin} from './lineart.mjs';
import {selectTerms,formulaBody,latexDocument,limitChains} from './portrait.mjs';
import {encodePortrait,decodePortrait,cleanName,bytesToDecimal,decimalToBytes,shareQrSegments,shareQrBits,SHARE_BASE} from './share.mjs';
import {PALETTES,PALETTE_IDS,normalizePalette} from './palettes.mjs';
import {backgroundComplexity,portraitCrop,detectFace,shouldEnhancePortrait,featureRegions,touchesFeature} from './portrait-preprocess.mjs';
import {consolidatePortrait} from './strokes.mjs';
import {analyzeSketch} from './path.mjs';
import {numericExcerpt,cardCopy,renderSocialCard,drawCardQr,cardHero,spectrumBars,editionNumber,CARD_GOLD,CARD_NIGHT} from './card.mjs';
import {chooseLanguage,progressDetails} from './i18n.mjs';
import {deflateSync,inflateSync} from './vendor/fflate/fflate.mjs';
import {samplePortrait,closeStrokeSeams,visitorInk,PORTRAIT_INK} from './portrait-render.mjs';
import {shouldReloadForHash} from './navigation.mjs';
import {u2Input,u2Gray,sketchReveal,paperSketch,sketchBlend,subjectMatte} from './sketch.mjs';
import {modelLineArt,cancelLineArt,STALL_MS,warmModels} from './ml-client.mjs';

test('sketch matte keeps the connected portrait and its soft hair margin, not detached background blobs',()=>{
  const w=21,h=21,matte=new Uint8Array(w*h);for(let y=5;y<17;y++)for(let x=5;x<17;x++)matte[y*w+x]=255;
  matte[0]=matte[1]=255;matte[10*w+4]=100;const clean=subjectMatte(matte,w,h);
  assert.equal(clean[0],0);assert.equal(clean[1],0);assert.equal(clean[10*w+10],255);assert.ok(clean[10*w+4]>0);assert.equal(matte[0],255);
  assert.ok(subjectMatte(new Uint8Array(w*h),w,h).every(v=>v===0));assert.throws(()=>subjectMatte([],0,0),RangeError);
});

test('paper masking removes background and frame edges without pruning interior hair or shoulders',()=>{
  const w=101,h=101,gray=new Uint8Array(w*h),matte=new Uint8Array(w*h).fill(255),masked=paperSketch(gray,w,h,matte);
  for(let x=0;x<w;x++){assert.equal(masked[x],255);assert.equal(masked[(h-1)*w+x],255);}
  for(let y=0;y<h;y++){assert.equal(masked[y*w],255);assert.equal(masked[y*w+w-1],255);}
  assert.equal(masked[20*w+30],0);assert.equal(masked[80*w+30],0);assert.equal(masked[50*w+50],0);
  assert.ok(paperSketch(gray,w,h,new Uint8Array(w*h)).every(v=>v===255));
  assert.equal(paperSketch(new Uint8Array(w*h).fill(255),w,h)[50*w+50],255);
  assert.ok(paperSketch(gray,w,h,new Uint8Array(w*h).fill(128))[50*w+50]>0);
  assert.throws(()=>paperSketch([],0,0),RangeError);assert.throws(()=>paperSketch(gray,w,h,new Uint8Array(2)),RangeError);
  assert.equal(sketchBlend('ink'),'multiply');assert.equal(sketchBlend('navy'),'screen');assert.equal(sketchBlend('silver'),'screen');
});

test('upload intent warms models in the shared worker; data-saver connections skip it',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap,instances=[];
  globalThis.createImageBitmap=async()=>({});
  globalThis.Worker=class{constructor(){instances.push(this);this.sent=[];}postMessage(data){this.sent.push(data);}terminate(){this.terminated=true;}};
  try{
    assert.equal(warmModels({saveData:true}),false);assert.equal(instances.length,0);
    assert.equal(warmModels({}),true);assert.deepEqual(instances[0].sent,[{warm:true}]);
    const job=modelLineArt({},'contour',()=>{});await Promise.resolve();await Promise.resolve();
    assert.equal(instances.length,1,'the job reuses the warmed worker (and its in-flight downloads)');assert.equal(instances[0].sent[1].id>0,true);
    instances[0].onmessage({data:{id:instances[0].sent[1].id,gray:Uint8Array.of(1)}});await job;
  }finally{cancelLineArt();globalThis.Worker=originalWorker;globalThis.createImageBitmap=originalBitmap;}
});

test('ML client times out only after a stall, not while large models keep downloading',async t=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap,instances=[],updates=[];
  t.mock.timers.enable({apis:['setTimeout']});
  globalThis.createImageBitmap=async()=>({});
  globalThis.Worker=class{constructor(){instances.push(this);}postMessage(data){this.id=data.id;}terminate(){this.terminated=true;}emit(data){this.onmessage({data:{id:this.id,...data}});}};
  try{
    const job=modelLineArt({},'contour',()=>{},d=>updates.push(d));await Promise.resolve();const worker=instances[0];
    for(let i=0;i<5;i++){t.mock.timers.tick(STALL_MS-1000);worker.emit({received:i*1e7,total:7e7,progress:i*14});}
    assert.ok(!worker.terminated,'a 5 × 89 s download must not time out');
    worker.emit({gray:Uint8Array.of(1),sketchPending:true});await job;
    t.mock.timers.tick(STALL_MS-1000);worker.emit({message:'sketching',phase:'sketching'});t.mock.timers.tick(STALL_MS-1000);
    assert.ok(!worker.terminated);assert.equal(updates.length,0);
    t.mock.timers.tick(1001);assert.ok(worker.terminated,'90 s with no progress falls back');assert.equal(updates[0].sketchFallback,true);
  }finally{t.mock.timers.reset();cancelLineArt();globalThis.Worker=originalWorker;globalThis.createImageBitmap=originalBitmap;}
});

test('ML client resolves contour before a late sketch and ignores stale or failed sketch jobs',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap,instances=[],updates=[],progress=[];
  globalThis.createImageBitmap=async()=>({});
  globalThis.Worker=class{constructor(){instances.push(this);}postMessage(data){this.id=data.id;}terminate(){this.terminated=true;}emit(data){this.onmessage({data:{id:this.id,...data}});}};
  try{
    const first=modelLineArt({},'contour',d=>progress.push(d),d=>updates.push(d));await Promise.resolve();const worker=instances[0];
    worker.emit({gray:Uint8Array.of(1),sketchPending:true});assert.equal((await first).gray[0],1);assert.equal(updates.length,0);
    worker.emit({progress:50});assert.equal(progress[0].sketchProgress,true);
    worker.emit({sketch:{gray:Uint8Array.of(2)}});assert.equal(updates[0].sketch.gray[0],2);cancelLineArt(true);assert.ok(!worker.terminated);
    const second=modelLineArt({},'contour',()=>{},d=>updates.push(d));await Promise.resolve();assert.equal(instances.length,1);worker.emit({gray:Uint8Array.of(3),sketchPending:true});await second;
    const oldId=worker.id;cancelLineArt(true);assert.equal(updates[1].sketchFallback,true);assert.ok(worker.terminated);worker.onmessage({data:{id:oldId,sketch:{gray:Uint8Array.of(9)}}});assert.equal(updates.length,2);
    const third=modelLineArt({},'contour',()=>{},d=>updates.push(d));await Promise.resolve();const next=instances[1];next.emit({gray:Uint8Array.of(4),sketchPending:true});await third;next.emit({sketchFallback:true});assert.equal(updates[2].sketchFallback,true);
    const failed=modelLineArt({},'contour',()=>{});await Promise.resolve();next.emit({error:'broken contour'});await assert.rejects(failed,/broken contour/);
  }finally{cancelLineArt();globalThis.Worker=originalWorker;globalThis.createImageBitmap=originalBitmap;}
});

test('U2 sketch preprocessing and output normalization are independent of Fourier data',()=>{
  const input=u2Input(Uint8Array.of(255,128,0,255,0,0,255,255));
  assert.equal(input.length,6);assert.ok(Math.abs(input[0]-(1-.485)/.229)<1e-6);assert.ok(Math.abs(input[4]-(0-.406)/.225)<1e-6);
  assert.deepEqual([...u2Gray(Float32Array.of(.2,.6,1))],[255,127,0]);assert.deepEqual([...u2Gray(Float32Array.of(.5,.5))],[255,255]);
  assert.ok([...u2Input(new Uint8Array(4))].every(Number.isFinite));
  assert.throws(()=>u2Input(new Uint8Array()),RangeError);assert.throws(()=>u2Input(new Uint8Array(3)),RangeError);assert.throws(()=>u2Gray([]),RangeError);assert.throws(()=>u2Gray([NaN]),RangeError);
});

test('sketch opacity reveals smoothly without changing Fourier samples or payload',()=>{
  assert.equal(sketchReveal(-1),0);assert.equal(sketchReveal(0),0);assert.equal(sketchReveal(1),1);assert.equal(sketchReveal(2),1);assert.ok(sketchReveal(.3)<sketchReveal(.7));
  const path=Array.from({length:64},(_,i)=>({x:20*Math.cos(i*Math.PI/32),y:15*Math.sin(i*Math.PI/32),draw:true})),chains={complex:dft(path)},data={mode:'complex',path,chains,dimensions:{width:40,height:30}};
  assert.deepEqual(encodePortrait(data),encodePortrait({...data,sketch:new Uint8Array([0,255])}));
});

test('all six samples include full-resolution pre-baked U2 sketches',()=>{
  for(const id of ['fourier','einstein','newton','curie','euler','gauss']){
    const png=readFileSync(new URL(`./samples/${id}-u2.png`,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(Math.max(png.readUInt32BE(16),png.readUInt32BE(20)),512);
  }
  assert.ok(readFileSync(new URL('./models/u2net-portrait-q8.onnx',import.meta.url)).length<50_000_000);
});

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
  for(const modules of [93,97,105])assert.equal(drawCardQr(ctx,{getModuleCount:()=>modules,isDark:()=>false},0,0),(modules+8)*4);
  for(const modules of [0,22,109])assert.throws(()=>drawCardQr(ctx,{getModuleCount:()=>modules},620,996),RangeError);
});

test('formula cards use real terms, localized copy and no private portrait',()=>{
  const chains={x:[{k:1,amplitude:2,phase:0}],y:[{k:3,amplitude:5,phase:.5}]};
  const en=cardCopy({mode:'xy',chains,name:'Ada'}),zh=cardCopy({mode:'xy',chains,name:'Ada',lang:'zh'});
  assert.equal(en.title,'My Fourier Formula');assert.equal(zh.title,'我的傅里叶公式');assert.equal(en.nickname,'Ada');
  assert.match(en.equations[0].text,/2 cos/);assert.match(en.equations[1].text,/5 cos\(6πt/);
  assert.equal(en.equations[0].terms,'… 1 term');assert.equal(zh.equations[0].terms,'… 共 1 项');
  assert.equal(cardCopy({mode:'xy',chains,name:'Ada',guess:true}).nickname,'');
  assert.equal(cardCopy({mode:'xy',chains:{x:[],y:[]}}).equations[0].text,'0');
  assert.throws(()=>cardCopy({mode:'xy',chains:{x:[{k:0,amplitude:NaN,phase:0}],y:[]}}),RangeError);
  assert.equal(cardHero({guess:true,sketch:{}}),'silhouette');assert.equal(cardHero({guess:false,sketch:{}}),'portrait');assert.equal(cardHero({}),'lines');
  assert.equal(cardCopy({mode:'xy',chains,name:'Ada',guess:true}).headline,'Me = 2 rotating circles');assert.equal(zh.headline,'Ada = 2 个旋转的圆');
});

test('card fingerprint: spectrum merges conjugates per axis and the edition number is stable',()=>{
  const chains={x:[{k:2,amplitude:3,phase:0},{k:-2,amplitude:3,phase:0},{k:0,amplitude:9,phase:0}],y:[{k:1,amplitude:1.5,phase:1}]};
  const [x,y]=spectrumBars('xy',chains,4);assert.deepEqual(x,[0,1,0,0]);assert.ok(y[0]>0&&y[0]<1);assert.deepEqual(y.slice(1),[0,0,0]);
  assert.equal(editionNumber('xy',chains),editionNumber('xy',structuredClone(chains)));assert.match(editionNumber('xy',chains),/^\d{5}$/);
  assert.notEqual(editionNumber('xy',chains),editionNumber('xy',{...chains,y:[{k:1,amplitude:1.6,phase:1}]}));
});

test('polished cards wrap at term boundaries and keep one bilingual scan CTA',()=>{
  const values=[{k:1,amplitude:12,phase:.5},{k:3,amplitude:6,phase:-.7},{k:4,amplitude:3,phase:1}];
  for(const lang of ['zh','en']){
    const copy=cardCopy({mode:'xy',chains:{x:values,y:[]},lang});
    assert.deepEqual(copy.equations[0].lines,['= 12 cos(2πt + 0.5)','+ 6 cos(6πt − 0.7) + ⋯']);
    assert.deepEqual(copy.equations[1].lines,['= 0']);
    assert.equal((copy.cta.join(' ').match(lang==='zh'?/扫码/g:/Scan/g)||[]).length,1);
    assert.ok(copy.example.includes(lang==='zh'?'傅里叶':'Fourier'));assert.ok(copy.mystery.endsWith('?'));
    assert.equal(copy.caption,undefined);
  }
  const complex=cardCopy({mode:'complex',chains:{complex:values}});
  assert.equal(complex.equations[0].axis,'z');assert.equal(complex.equations[0].lines.length,2);
});

test('language defaults and download details are local, bilingual and empty-safe',()=>{
  assert.equal(chooseLanguage(null,'zh-Hant'),'zh');assert.equal(chooseLanguage(null,'en-US'),'en');assert.equal(chooseLanguage(null),'en');
  assert.equal(chooseLanguage('en','zh-CN'),'en');assert.equal(chooseLanguage('zh','en-US'),'zh');assert.equal(chooseLanguage('invalid','zh'),'zh');
  assert.equal(progressDetails({received:1e6,total:4e6},'en',2000).bytes,'1.0 / 4.0 MB');
  assert.equal(progressDetails({received:1e6,total:4e6},'en',2000).eta,'~6s download left');
  assert.match(progressDetails({cached:true},'zh').bytes,/已缓存/);
  assert.match(progressDetails({},'en').bytes,/Computing/);
  assert.equal(progressDetails({received:1e6,total:0},'en').bytes,'1.0 MB');
  assert.match(progressDetails({received:0,total:10},'zh').eta,/55 MB/);
});

test('creator has one XY workflow, one final overlay and only in-panel circle controls',()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8'),app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
  for(const removed of ['data-mode=','model-style','data-result-view','card-palette','id="advanced"'])assert.ok(!html.includes(removed));
  assert.ok(html.indexOf('id="terms"')>html.indexOf('id="personal-formula"'));
  assert.ok(html.includes('data-zh="生成我的公式 ↗">Make mine ↗'));
  assert.ok(!app.includes('resultView'));assert.ok(app.includes("composition(out,1,true)"));
});

test('worker download progress reports actual streamed and cached bytes and rejects failures',async()=>{
  const events=[],bytes=Uint8Array.of(1,2,3,4);
  let cached=false,fail=false;
  const env={URL,Response,Uint8Array,importScripts(){},ort:{env:{wasm:{}}},self:{location:{href:'https://example.test/'}},postMessage(data){events.push(data);},
    caches:{async open(){return{async match(){return cached?new Response(bytes):null;},async put(){}};}},
    async fetch(){return new Response(fail?null:bytes,{status:fail?503:200,headers:{'content-length':'4'}});}
  };
  const source=readFileSync(new URL('./ml-worker.js',import.meta.url),'utf8');
  await runInNewContext(source+"\nmodelBytes('contour512.onnx',7)",env);assert.equal(events.at(-1).received,4);assert.equal(events.at(-1).total,4);assert.equal(events.at(-1).file,'contour512.onnx');
  cached=true;events.length=0;await runInNewContext(source+"\nmodelBytes('contour512.onnx',8)",{...env});assert.equal(events[0].cached,true);assert.equal(events[0].received,4);
  cached=false;fail=true;await assert.rejects(runInNewContext(source+"\nmodelBytes('contour512.onnx',9)",{...env}),/download failed/);
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
  assert.deepEqual(portraitCrop(null,80,100),{x:0,y:0,width:80,height:100});const crop=portraitCrop({x:20,y:20,w:20,h:30},80,100);assert.ok(crop.x<=0&&crop.y===0&&crop.width>=80&&crop.height>=90);assert.throws(()=>portraitCrop(null,0,100),RangeError);
});

test('bust framing preserves the entire hair width and source top, with head and shoulder margins',()=>{
  for(const [width,height,face] of [[1024,1280,{x:375,y:88,w:248,h:351}],[960,1280,{x:315,y:254,w:425,h:620}]]){
    const crop=portraitCrop(face,width,height);assert.ok(crop.x<=0&&crop.x+crop.width>=width&&crop.y===0);assert.ok(face.h/crop.height>=.3&&face.h/crop.height<=.4);assert.ok(crop.height>=face.y+face.h*2.35);
  }
  assert.equal(shouldEnhancePortrait({}, {apply:false}),false);assert.equal(shouldEnhancePortrait(null,{apply:true}),false);assert.equal(shouldEnhancePortrait({}, {apply:true}),true);
});

test('clean sample fallback keeps all six main contour assets and disables enhanced pruning',()=>{
  const metadata=JSON.parse(readFileSync(new URL('./samples/portraits.json',import.meta.url),'utf8')),hash=createHash('sha256');
  for(const id of ['fourier','einstein','newton','curie','euler','gauss']){
    assert.equal(metadata[id].strategy,'original');assert.equal(metadata[id].face,null);assert.deepEqual(metadata[id].landmarks,[]);
    hash.update(readFileSync(new URL(`./samples/${id}-contour.png`,import.meta.url)));
  }
  assert.equal(hash.digest('hex'),'7df6ccfb53887aa8c2f1649b0c02e5cbf599075fa2d77e8782237fed5c9924eb');
});

test('landmark-region strokes survive aggressive pruning and cannot merge across features',()=>{
  const width=120,height=160,face=[30,30,60,85],landmarks=[{x:45,y:60},{x:75,y:60},{x:60,y:86},{x:49,y:104},{x:71,y:104}],binary=new Uint8Array(width*height).fill(255),regions=featureRegions(landmarks,face);
  for(const [y,a,b] of [[60,45,47],[60,49,51],[86,59,61],[104,56,64]])for(let x=a;x<=b;x++)binary[y*width+x]=0;
  const strokes=consolidatePortrait(binary,width,height,50,face,landmarks);assert.equal(strokes.length,4);assert.ok(strokes.every(s=>touchesFeature(s,regions)));assert.equal(strokes.filter(s=>s.every(p=>p.y===60)).length,2);assert.deepEqual(featureRegions([],face),[]);assert.equal(touchesFeature([],regions),false);
  const ordinary=thresholdSketch(binary,width,height,50,50),protectedBinary=thresholdSketch(binary,width,height,50,50,regions);assert.equal(ordinary[60*width+45],255);assert.equal(protectedBinary[60*width+45],0);assert.equal(protectedBinary[86*width+60],0);assert.equal(consolidatePortrait(protectedBinary,width,height,50,face,landmarks).length,4);
  const dense=new Uint8Array(width*height).fill(255);let count=0;
  for(let y=48;y<=112;y+=4)for(let x=32;x<=88;x+=4)if(touchesFeature([{x,y},{x:x+1,y}],regions)){dense[y*width+x]=dense[y*width+x+1]=0;count++;}
  assert.ok(count>120);assert.equal(consolidatePortrait(thresholdSketch(dense,width,height,50,50,regions),width,height,50,face,landmarks).length,count);
});

test('YuNet decoding handles detections, no face, overlap suppression and malformed outputs',()=>{
  const outputs={};for(const stride of [8,16,32]){const count=(640/stride)**2;outputs[`cls_${stride}`]={data:new Float32Array(count)};outputs[`obj_${stride}`]={data:new Float32Array(count)};outputs[`bbox_${stride}`]={data:new Float32Array(count*4)};}
  assert.equal(detectFace(outputs,1,640,640),null);const i=20*80+20;outputs.cls_8.data[i]=outputs.obj_8.data[i]=.99;outputs.bbox_8.data.set([.5,.5,Math.log(4),Math.log(5)],i*4);outputs.kps_8={data:new Float32Array(6400*10)};outputs.kps_8.data.set([.1,.2,.5,.2,.3,.4,.2,.7,.6,.7],i*10);const face=detectFace(outputs,1,640,640);assert.ok(Math.abs(face.x-148)<1e-4&&Math.abs(face.y-144)<1e-4&&Math.abs(face.w-32)<1e-4);assert.equal(face.landmarks.length,5);assert.ok(Math.abs(face.landmarks[0].x-160.8)<1e-4&&Math.abs(face.landmarks[0].y-161.6)<1e-4);assert.throws(()=>detectFace({},1,640,640),TypeError);
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
  assert.equal(numericExcerpt(pair,false),'(1.84 + 0.779i) e^(2πit) + (1.84 − 0.779i) e^(−2πit)');
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
    // XY: the k=0 circle is a constant, the k=±1 pair is one cosine term per axis.
    assert.equal((body.match(/\\cos/g)||[]).length,mode==='xy'?2:0);
    assert.equal((body.match(/e\^/g)||[]).length,mode==='complex'?2:0);
    let depth=0;for(const c of document){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
    assert.ok(document.includes('\\documentclass{article}'));assert.ok(document.includes('\\end{document}'));
    assert.ok(formulaBody(mode,chains,1).includes('共 2 项'));
    assert.ok(formulaBody(mode,chains,1,'en').includes('2 terms'));
    assert.ok(!/[\u3400-\u9fff]/u.test(latexDocument(mode,chains,'en')));
    assert.ok(latexDocument(mode,chains,'en').startsWith('% Compile with'));
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
