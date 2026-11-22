import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dft,evaluate,orderPath,edgePoints} from './fourier.mjs';
import {xdog,styleParameters,vectorize,joinStrokes,resampleClosed,simplify,thin} from './lineart.mjs';

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
