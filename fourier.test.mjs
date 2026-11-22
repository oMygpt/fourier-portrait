import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dft,evaluate,orderPath,edgePoints} from './fourier.mjs';

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
