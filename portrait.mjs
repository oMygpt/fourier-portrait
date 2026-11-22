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

function number(value) {
  const s=String(Number(value.toPrecision(3)));
  return s.replace(/e([+-]?\d+)/,'\\times 10^{$1}');
}
function signed(value) {return `${value<0?'-':'+'} ${number(Math.abs(value))}`;}

export function formulaBody(mode, chains, limit = Infinity) {
  const expression=values=>{
    const terms=values.slice(0,limit).map(c=>mode==='xy'
      ?`${number(c.amplitude)}\\cos\\left(2\\pi (${c.k})t ${signed(c.phase)}\\right)`
      :`\\left(${number(c.re)} ${signed(c.im)}i\\right)e^{2\\pi i (${c.k})t}`);
    return (terms.join(' + ')||'0')+(values.length>limit?` + \\cdots\\quad\\text{共 ${values.length} 项}`:'');
  };
  return mode==='xy'?`\\begin{aligned}x(t)&=${expression(chains.x)}\\\\y(t)&=${expression(chains.y)}\\end{aligned}`:`z(t)=${expression(chains.complex)}`;
}

export function latexDocument(mode, chains) {
  const equations=mode==='xy'?[['x',chains.x],['y',chains.y]]:[['z',chains.complex]];
  const lines=equations.map(([name,values])=>{
    const chunks=[];
    for(let i=0;i<values.length;i++){
      const subset=values.slice(i,i+1),body=formulaBody(mode==='xy'?'xy':'complex',{x:subset,y:[],complex:subset});
      const expression=mode==='xy'?body.split('x(t)&=')[1].split('\\\\y(t)')[0]:body.slice(5);
      chunks.push(`${i?'&{}+':`${name}(t)&=`}${expression}`);
    }
    return `\\begin{align*}\n${chunks.length?chunks.join(' \\\\\n'):`${name}(t)&=0`}\n\\end{align*}`;
  }).join('\n');
  return `\\documentclass{article}\n\\usepackage{ctex}\n\\usepackage{amsmath}\n\\allowdisplaybreaks\n\\title{我的傅里叶肖像}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n以下为当前绘制的幅值排序系数，数值保留约三位有效数字。参数 $t\\in[0,1]$。${mode==='xy'?'横纵轴分别重建，导线交点为画笔。':'复平面单链重建。'}笔画间移动时抬笔；公式包含移动段。\n${lines}\n\\end{document}\n`;
}
