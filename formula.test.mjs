import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalFormula,evaluateFormula,axisTerms,frequencyLadder,energyShare,formulaLatex,formulaLines,formulaSummary,latexDocument,expressionParts} from './formula.mjs';
import {realDft,dft,evaluate} from './fourier.mjs';
import {limitChains,formulaBody} from './portrait.mjs';
import {cardCopy} from './card.mjs';
import {encodePortrait,decodePortrait} from './share.mjs';

const portrait=(n=180)=>{const path=Array.from({length:n},(_,i)=>({x:70*Math.cos(2*Math.PI*i/n)+11*Math.sin(10*Math.PI*i/n)+4,y:95*Math.sin(2*Math.PI*i/n)-7*Math.cos(6*Math.PI*i/n),draw:i%20>1}));
  return {path,chains:{x:realDft(path.map(p=>p.x)),y:realDft(path.map(p=>p.y)),complex:dft(path)}};};

test('the canonical cosine form reproduces exactly what the circles draw, for any subset of circles',()=>{
  const {chains}=portrait();
  for(const count of [1,2,7,40,360]){
    const xy=limitChains('xy',chains,count),f=canonicalFormula('xy',xy);
    for(let i=0;i<50;i++){const t=i/50,p=evaluateFormula(f,t);assert.ok(Math.abs(p.x-evaluate(xy.x,t).x)<1e-9);assert.ok(Math.abs(p.y-evaluate(xy.y,t).x)<1e-9);}
    assert.equal(f.circles,count);
  }
  const z=canonicalFormula('complex',{complex:chains.complex.slice(0,30)});
  for(let i=0;i<20;i++){const a=evaluateFormula(z,i/20),b=evaluate(chains.complex.slice(0,30),i/20);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);}
});

test('conjugate circles merge into one term; a lone circle of a pair still counts',()=>{
  const terms=axisTerms([{k:3,amplitude:2,phase:.5},{k:-3,amplitude:2,phase:-.5},{k:4,amplitude:1,phase:0}]);
  assert.deepEqual(terms.map(t=>[t.k,t.circles,Number(t.amplitude.toFixed(9))]),[[3,2,4],[4,1,1]]);
  assert.throws(()=>axisTerms([{k:1,amplitude:-1,phase:0}]),RangeError);
});

test('one formatter: page (KaTeX), LaTeX file and card print identical numbers',()=>{
  const {chains}=portrait(),xy={x:chains.x.slice(0,9),y:chains.y.slice(0,9)},f=canonicalFormula('xy',xy);
  const card=cardCopy({mode:'xy',chains:xy,lang:'zh'}),page=formulaBody('xy',xy,2,'zh'),doc=latexDocument(f,'zh'),lines=formulaLines(f,2);
  const numbers=text=>(text.match(/\d+(\.\d+)?/g)||[]).slice(0,5);
  assert.deepEqual(numbers(card.equations[0].text),numbers(lines[0].text));
  assert.deepEqual(numbers(page.split('\\\\')[0]),numbers(lines[0].text.replaceAll('π','\\pi')));
  for(const part of expressionParts(f.axes[0].terms,{latex:true}).slice(0,3))assert.ok(doc.includes(part.replace(/^[+-] /,'')));
  let depth=0;for(const c of doc+formulaLatex(f)){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
  assert.match(formulaSummary(f,'zh'),/^9|18 个旋转的圆/);assert.match(formulaSummary(f,'en'),/rotating circles/);
});

test('the formula printed from a shared link is the formula that link draws',()=>{
  const {path,chains}=portrait(),url=encodePortrait({mode:'xy',chains,path,dimensions:{width:160,height:220}}).url,shared=decodePortrait(url);
  const f=canonicalFormula('xy',shared.chains);
  for(let i=0;i<shared.path.length;i+=17){const p=evaluateFormula(f,i/shared.path.length);assert.ok(Math.abs(p.x-shared.path[i].x)<1e-9&&Math.abs(p.y-shared.path[i].y)<1e-9);}
});

test('frequency ladder and energy share',()=>{
  assert.deepEqual(frequencyLadder(40),[2,4,8,16,32,40]);assert.throws(()=>frequencyLadder(0),RangeError);
  const {chains}=portrait();assert.equal(energyShare(chains.x,chains.x),1);assert.ok(energyShare(chains.x.slice(0,3),chains.x)<1);assert.equal(energyShare([],[]),1);
});

import {formulaCardCopy} from './card.mjs';
test('formula card copy: one title, one summary, and an honest note about what the QR holds',()=>{
  const f=canonicalFormula('xy',{x:[{k:1,amplitude:2,phase:0},{k:-1,amplitude:2,phase:0}],y:[{k:2,amplitude:1,phase:0}]});
  const hd=formulaCardCopy({formula:f,lang:'zh'}),long=formulaCardCopy({formula:f,lang:'zh',selfContained:true});
  assert.equal(hd.title,'这是我的公式。');assert.equal(hd.subtitle,'它能复原我的样子。');assert.equal(hd.summary,'3 个旋转的圆 · x 1 / y 1 项');
  assert.match(hd.note,/端到端加密/);assert.match(long.note,/二维码里就是这串公式/);
  assert.equal(formulaCardCopy({formula:f,name:'Ada',lang:'en'}).title,"Ada's formula.");
});
