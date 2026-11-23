import {canonicalFormula,formulaLatex,latexDocument as formulaDocument} from './formula.mjs';
export function selectTerms(coefficients, points, scale = 1, axis = '') {
  if (!coefficients.length || !points.length) return {count:0,energy:1,error:0};
  const total=coefficients.reduce((sum,c)=>sum+c.amplitude**2,0),n=points.length;
  const re=new Float64Array(n),im=new Float64Array(n),minimum=Math.min(8,coefficients.length);
  let energy=0,error=0;
  for(let j=0;j<coefficients.length;j++) {
    const c=coefficients[j];energy+=c.amplitude**2;
    for(let i=0;i<n;i++) {
      const a=c.phase+2*Math.PI*c.k*i/n;
      re[i]+=c.amplitude*Math.cos(a);if(!axis)im[i]+=c.amplitude*Math.sin(a);
    }
    if(j+1<minimum || total&&energy/total<.99)continue;
    error=0;
    for(let i=0;i<n;i++)error+=axis?Math.abs(re[i]-points[i][axis]):Math.hypot(re[i]-points[i].x,im[i]-points[i].y);
    error=error/n*scale;
    if(error<=1.5||j===coefficients.length-1)return {count:j+1,energy:total?Math.min(1,energy/total):1,error};
  }
  return {count:coefficients.length,energy:1,error};
}

export function limitChains(mode,chains,count){
  if(!Number.isFinite(count)||count<1)throw new RangeError('Invalid circle count');
  const keys=mode==='xy'?['x','y']:['complex'],selected={x:[],y:[],complex:[]};
  const terms=keys.flatMap(key=>chains[key].map(c=>({key,c}))).sort((a,b)=>b.c.amplitude-a.c.amplitude);
  for(const {key,c} of terms.slice(0,Math.floor(count)))selected[key].push(c);
  return selected;
}

// Formula text lives in formula.mjs so every surface prints the same canonical formula.
export function formulaBody(mode, chains, limit = Infinity, lang = 'zh') {
  return formulaLatex(canonicalFormula(mode,chains),limit,lang);
}

export function latexDocument(mode, chains, lang = 'zh') {
  return formulaDocument(canonicalFormula(mode,chains),lang);
}
