import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dft,evaluate,orderPath,edgePoints,realDft,chainTip,axisEnvelope} from './fourier.mjs';
import {xdog,styleParameters,thresholdSketch,vectorize,joinStrokes,resampleClosed,simplify,thin} from './lineart.mjs';
import {selectTerms,formulaBody,latexDocument} from './portrait.mjs';
import {encodePortrait,decodePortrait,cleanName} from './share.mjs';
import {analyzeSketch} from './path.mjs';

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
    assert.ok(encoded.url.length<=2000);assert.ok(encoded.energy>=.99);
    const decoded=decodePortrait(encoded.url);
    assert.equal(decoded.mode,mode);assert.equal(decoded.name,'Ada 3');
    assert.deepEqual(decoded.path.map(p=>p.draw),path.map(p=>p.draw));
    const error=path.reduce((sum,p,i)=>sum+Math.hypot(p.x-decoded.path[i].x,p.y-decoded.path[i].y),0)/path.length;
    assert.ok(error<1,`round-trip error ${error}`);
    assert.deepEqual(decoded.dimensions,{width:200,height:200});
  }
  assert.ok(Array.from(cleanName('x'.repeat(30))).length<=16);
  assert.throws(()=>decodePortrait('#p=garbage'),/分享链接无效/);
  assert.throws(()=>decodePortrait('#p='+'a'.repeat(5000)),/分享链接无效/);
  assert.throws(()=>encodePortrait({mode:'xy',chains,path:[],dimensions:{width:200,height:200}},'https://example.org/'),/无可分享/);
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
