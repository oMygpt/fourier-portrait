// The one formula. Every surface — creator page, visitor page, LaTeX, cards, video, QR — shows and draws
// the same canonical form, built from the same circles:
//   XY:      x(t) = a₀ + Σ aₖ cos(2πkt + φₖ),  y(t) likewise.  Each cosine term = one pair of counter-rotating circles.
//   complex: z(t) = Σ cₖ e^{2πikt}.                              Each term = one circle.
// "circles" counts rotating circles (complex coefficients); "terms" counts the written terms.

const finite=c=>[c.k,c.amplitude,c.phase].every(Number.isFinite)&&c.amplitude>=0;

// Merge conjugate circles (k, −k) of a real axis into one cosine term; sorted by amplitude.
export function axisTerms(values,real=true){
  const grouped=new Map();
  for(const c of values){
    if(!finite(c))throw new RangeError('Invalid coefficient');
    const k=real?Math.abs(c.k):c.k,phase=real&&c.k<0?-c.phase:c.phase,p=grouped.get(k)||{k,re:0,im:0,circles:0};
    p.re+=c.amplitude*Math.cos(phase);p.im+=c.amplitude*Math.sin(phase);p.circles++;grouped.set(k,p);
  }
  return [...grouped.values()].map(c=>({k:c.k,circles:c.circles,re:c.re,im:c.im,amplitude:Math.hypot(c.re,c.im),phase:Math.atan2(c.im,c.re)})).sort((a,b)=>b.amplitude-a.amplitude);
}

export function canonicalFormula(mode,chains){
  if(mode!=='xy'&&mode!=='complex')throw new RangeError('Invalid portrait mode');
  const axes=mode==='xy'?[['x',axisTerms(chains.x)],['y',axisTerms(chains.y)]]:[['z',axisTerms(chains.complex,false)]];
  const circles=mode==='xy'?chains.x.length+chains.y.length:chains.complex.length;
  return {mode,circles,axes:axes.map(([axis,terms])=>({axis,terms})),termCount:axes.reduce((n,[,terms])=>n+terms.length,0)};
}

// Evaluate the canonical form directly (what a reader of the card would compute by hand).
export function evaluateFormula(formula,t){
  const value=terms=>terms.reduce((s,c)=>s+(c.k?c.amplitude*Math.cos(2*Math.PI*c.k*t+c.phase):c.re),0);
  if(formula.mode==='xy')return {x:value(formula.axes[0].terms),y:value(formula.axes[1].terms)};
  return formula.axes[0].terms.reduce((p,c)=>{const a=c.phase+2*Math.PI*c.k*t;return {x:p.x+c.amplitude*Math.cos(a),y:p.y+c.amplitude*Math.sin(a)};},{x:0,y:0});
}

// Share of the full energy kept by a subset (both measured on the same circles).
export function energyShare(part,full){
  const e=list=>list.reduce((s,c)=>s+c.amplitude**2,0),total=e(full);
  return total?Math.min(1,e(part)/total):1;
}

// Frequency ladder used by the riddle and the video: 2, 4, 8, … and finally every circle.
export function frequencyLadder(total){
  if(!Number.isInteger(total)||total<1)throw new RangeError('Invalid circle count');
  const levels=[];for(let n=2;n<total;n*=2)levels.push(n);levels.push(total);
  return levels;
}

// ---- formatting: one formatter, two notations (unicode for canvas, LaTeX for KaTeX and .tex) ----
const number=v=>String(Number(v.toPrecision(3)));
const latexNumber=v=>number(v).replace(/e([+-]?\d+)/,'\\times 10^{$1}');

export function termText(c,{latex=false,real=true}={}){
  const n=latex?latexNumber:number,minus=latex?'-':'−';
  // Round-off noise (e.g. a phase of 1e-17) is printed as an exact zero and dropped.
  const tiny=v=>Math.abs(v)<5e-4,signed=v=>tiny(v)?'':` ${v<0?minus:'+'} ${n(Math.abs(v))}`;
  if(real){
    if(!c.k)return tiny(c.re)?'0':n(c.re);
    const freq=String(2*c.k);
    return latex?`${n(c.amplitude)}\\cos\\left(${freq}\\pi t${signed(c.phase)}\\right)`:`${n(c.amplitude)} cos(${freq}πt${signed(c.phase)})`;
  }
  const im=tiny(c.im)?'':`${signed(c.im)}i`;
  return latex?`\\left(${n(c.re)}${im}\\right)e^{2\\pi i (${c.k})t}`:`(${n(c.re)}${im}) e^(${c.k<0?'−':''}${2*Math.abs(c.k)}πit)`;
}

// Terms with their operators: ['12 cos(2πt + 0.5)', '+ 6 cos(6πt − 0.7)', '− 3']; negatives fold into the operator.
export function expressionParts(terms,{latex=false,real=true,limit=Infinity}={}){
  return terms.slice(0,limit).map((c,i)=>{
    const term=termText(c,{latex,real}),negative=term.startsWith('-')||term.startsWith('−');
    return i?`${negative?(latex?'-':'−'):'+'} ${negative?term.slice(1):term}`:term;
  });
}

export function expression(terms,{latex=false,real=true,limit=Infinity,lang='zh',count=true}={}){
  const parts=expressionParts(terms,{latex,real,limit});
  let text=parts.length?parts.join(' '):'0';
  if(terms.length>parts.length)text+=latex?` + \\cdots`+(count?`\\quad\\text{${lang==='zh'?`共 ${terms.length} 项`:`${terms.length} terms`}}`:''):' + ⋯';
  return text;
}

export function formulaLatex(formula,limit=Infinity,lang='zh'){
  const real=formula.mode==='xy',rows=formula.axes.map(({axis,terms})=>`${axis}(t)&=${expression(terms,{latex:true,real,limit,lang})}`);
  return rows.length>1?`\\begin{aligned}${rows.join('\\\\')}\\end{aligned}`:rows[0].replace('&=','=');
}

export function formulaLines(formula,limit=2){
  const real=formula.mode==='xy';
  return formula.axes.map(({axis,terms})=>({axis,text:expression(terms,{real,limit}),parts:expressionParts(terms,{real,limit}),more:terms.length>limit,terms:terms.length}));
}

export function formulaSummary(formula,lang='zh'){
  const zh=lang==='zh',parts=formula.axes.map(({axis,terms})=>`${axis} ${terms.length}`);
  return zh?`${formula.circles} 个旋转的圆 · ${parts.join(' / ')} 项`:`${formula.circles} rotating circles · ${parts.join(' / ')} terms`;
}

export function latexDocument(formula,lang='zh'){
  const zh=lang==='zh',real=formula.mode==='xy';
  const blocks=formula.axes.map(({axis,terms})=>{
    const rows=terms.map((c,i)=>{const term=termText(c,{latex:true,real}),negative=term.startsWith('-');return `${i?`&{}${negative?'-':'+'} `:`${axis}(t)&=`}${i&&negative?term.slice(1):term}`;});
    return `\\begin{align*}\n${rows.length?rows.join(' \\\\\n'):`${axis}(t)&=0`}\n\\end{align*}`;
  }).join('\n');
  const note=zh
    ?`本公式与公式卡、二维码和网页复原使用同一组系数：共 ${formula.circles} 个旋转的圆，按幅值排序，数值保留约三位有效数字。${real?'每一项 $a\\cos(2\\pi kt+\\varphi)$ 对应一对反向旋转的圆。':''}参数 $t\\in[0,1]$；笔画间移动时抬笔，公式包含移动段。`
    :`The same coefficients as the formula card, its QR code and the web reconstruction: ${formula.circles} rotating circles, amplitude-ranked, rounded to about three significant digits. ${real?'Each term $a\\cos(2\\pi kt+\\varphi)$ is one pair of counter-rotating circles. ':''}Parameter $t\\in[0,1]$; lift the pen between strokes (the formula includes travel).`;
  return `% ${zh?'使用 XeLaTeX 编译':'Compile with XeLaTeX or pdfLaTeX'}\n\\documentclass{article}\n${zh?'\\usepackage{ctex}\n':''}\\usepackage{amsmath}\n\\allowdisplaybreaks\n\\title{${zh?'我的傅里叶公式':'My Fourier Formula'}}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n${note}\n${blocks}\n\\end{document}\n`;
}
