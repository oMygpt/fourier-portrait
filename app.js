import {edgePoints, orderPath, dft, evaluate} from './fourier.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const trail = document.createElement('canvas'); trail.width = canvas.width; trail.height = canvas.height;
const ink = trail.getContext('2d');
let coefficients = [], active = [], image = null, imageSize = null;
let time = 0, drawn = 0, playing = true, last = 0, generation = 0;
let scale = 1, sourceName = '内置示例 · 线条肖像';
const resolution = 2400;

function reset() {
  active = coefficients.slice(0, Number($('terms').value));
  time = 0; drawn = 0; ink.clearRect(0, 0, trail.width, trail.height);
  $('terms-value').value = String(active.length);
}

function install(points) {
  coefficients = dft(points);
  $('terms').max = String(coefficients.length);
  $('terms').value = String(Math.min(Number($('terms').value), coefficients.length));
  const extent = Math.max(...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), 1);
  scale = Math.min(canvas.width, canvas.height) * .37 / extent;
  reset(); $('status').textContent = `${points.length} 个采样点 · 本地绘制中`;
  $('source-label').textContent = sourceName;
}

function demo() {
  generation++; image = null; imageSize = null; $('original').checked = false;
  sourceName = '内置示例 · 线条肖像';
  const points = [];
  const segment = (fn, count) => {for (let i = 0; i < count; i++) points.push(fn(i / count));};
  segment(t => {const a = -Math.PI / 2 + t * Math.PI * 2; return {x:95*Math.cos(a)*(1+.12*Math.sin(a)),y:140*Math.sin(a)};}, 440);
  const curves = [
    [[0,-140],[-90,-145],[-122,-35],[-78,-57]],
    [[-78,-57],[-52,-107],[27,-75],[62,-118]],
    [[62,-118],[94,-100],[115,-45],[94,-12]],
    [[94,-12],[76,12],[100,44],[73,53]],
    [[73,53],[60,120],[22,150],[0,140]],
    [[0,140],[-5,161],[-15,164],[-40,164]],
    [[-40,164],[-112,173],[-140,198],[-150,220]],
    [[-150,220],[-30,240],[60,237],[153,220]],
    [[153,220],[134,178],[76,172],[50,159]],
    [[50,159],[43,140],[50,130],[47,119]],
    [[47,119],[-25,80],[-65,48],[-72,-10]],
    [[-72,-10],[-65,-45],[-40,-48],[-18,-33]],
    [[-18,-33],[-35,-43],[-48,-39],[-58,-30]],
    [[-58,-30],[-35,-20],[-28,-20],[-18,-33]],
    [[-18,-33],[0,-45],[27,-44],[47,-29]],
    [[47,-29],[24,-37],[13,-36],[7,-25]],
    [[7,-25],[27,-20],[37,-20],[47,-29]],
    [[47,-29],[28,-9],[30,17],[42,34]],
    [[42,34],[25,44],[10,43],[9,35]],
    [[9,35],[1,51],[-4,60],[-15,66]],
    [[-15,66],[9,57],[25,73],[43,63]],
    [[43,63],[22,92],[0,91],[-15,66]],
    [[-15,66],[-62,47],[-70,-18],[-72,-10]],
    [[-72,-10],[-108,-65],[-82,-129],[0,-140]],
  ];
  for (const [a,b,c,d] of curves) segment(t => ({x:(1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0],y:(1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]}),35);
  const center = 40; for (const p of points) p.y -= center;
  install(points);
}

async function processImage() {
  if (!image) return;
  const token = ++generation, current = image;
  $('status').textContent = '正在提取边缘与计算傅里叶系数…';
  await new Promise(resolve => setTimeout(resolve, 30));
  if (token !== generation) return;
  try {
    const work = document.createElement('canvas'), ratio = 360 / Math.max(current.width, current.height);
    work.width = Math.max(5, Math.round(current.width * Math.min(1,ratio)));
    work.height = Math.max(5, Math.round(current.height * Math.min(1,ratio)));
    const wc = work.getContext('2d', {willReadFrequently:true});
    wc.fillStyle = '#fff'; wc.fillRect(0,0,work.width,work.height); wc.drawImage(current,0,0,work.width,work.height);
    const points = edgePoints(wc.getImageData(0,0,work.width,work.height).data,work.width,work.height,Number($('detail').value));
    if (points.length < 8) { $('status').textContent = '未找到足够轮廓，请提高细节或换一张对比更清晰的照片。'; return; }
    imageSize = {width:work.width,height:work.height}; install(orderPath(points));
  } catch { $('status').textContent = '图片处理失败，请尝试较小的 JPG 或 PNG。'; }
}

$('upload').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  if (!['image/jpeg','image/png'].includes(file.type)) { $('status').textContent = '请选择 JPG 或 PNG 格式的图片。'; e.target.value = ''; return; }
  const token = ++generation, url = URL.createObjectURL(file);
  try {
    const loaded = new Image(); loaded.src = url; await loaded.decode();
    if (token !== generation) return;
    image = loaded; sourceName = file.name; await processImage();
  } catch { $('status').textContent = '无法读取此图片，请选择有效的 JPG 或 PNG。'; }
  finally { URL.revokeObjectURL(url); e.target.value = ''; }
});
$('detail').addEventListener('input', () => { $('detail-value').value = $('detail').value; });
$('detail').addEventListener('change', processImage);
$('terms').addEventListener('input', reset);
$('speed').addEventListener('input', () => { $('speed-value').value = `${Number($('speed').value).toFixed(1)}×`; });
$('demo').addEventListener('click', demo);
$('play').addEventListener('click', () => {playing = !playing; $('play').textContent = playing ? 'Ⅱ 暂停' : '▷ 继续';});
$('download').addEventListener('click', () => {
  const output = document.createElement('canvas'); output.width = canvas.width; output.height = canvas.height;
  const out = output.getContext('2d'); out.fillStyle = '#102a2c'; out.fillRect(0,0,output.width,output.height); out.drawImage(trail,0,0);
  const a = document.createElement('a'); a.download = 'fourier-portrait.png'; a.href = output.toDataURL('image/png'); a.click();
});

function frame(timestamp) {
  const dt = last ? Math.min((timestamp-last)/1000,.08) : 0; last = timestamp;
  if (playing && active.length && time < 1) {
    time = Math.min(1,time + dt * Number($('speed').value) / 18);
    const target = Math.floor(time * resolution);
    ink.strokeStyle = '#cde9b5'; ink.lineWidth = 1.65; ink.lineJoin = 'round'; ink.lineCap = 'round'; ink.beginPath();
    const start = evaluate(active,drawn/resolution); ink.moveTo(canvas.width/2+start.x*scale,canvas.height/2+start.y*scale);
    for (let i = drawn+1; i <= target; i++) {const p = evaluate(active,i/resolution); ink.lineTo(canvas.width/2+p.x*scale,canvas.height/2+p.y*scale);}
    ink.stroke(); drawn = target;
    if (time === 1) $('status').textContent = `${coefficients.length} 个采样点 · 绘制完成（调整圆数量可重绘）`;
  }
  ctx.fillStyle = '#102a2c'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#a5d1bb09'; ctx.lineWidth = 1;
  for (let x=30;x<canvas.width;x+=40) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for (let y=20;y<canvas.height;y+=40) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  if (image && imageSize && $('original').checked) {
    ctx.globalAlpha = .16; ctx.drawImage(image,canvas.width/2-imageSize.width*scale/2,canvas.height/2-imageSize.height*scale/2,imageSize.width*scale,imageSize.height*scale); ctx.globalAlpha = 1;
  }
  ctx.drawImage(trail,0,0);
  let x=canvas.width/2,y=canvas.height/2;
  if ($('circles').checked) for (const c of active) {
    const angle=c.phase+2*Math.PI*c.k*time, nx=x+c.amplitude*Math.cos(angle)*scale, ny=y+c.amplitude*Math.sin(angle)*scale;
    ctx.strokeStyle='#8dbaa045';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,c.amplitude*scale,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#9dc5ac66';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();x=nx;y=ny;
  }
  else {const p=evaluate(active,time);x+=p.x*scale;y+=p.y*scale;}
  ctx.fillStyle='#e8fac9';ctx.shadowColor='#cff49d';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  $('progress').textContent = `${Math.round(time*100)}%`;
  requestAnimationFrame(frame);
}

window.addEventListener('load', () => {
  if (window.katex) for (const element of document.querySelectorAll('[data-tex]')) window.katex.render(element.dataset.tex,element,{throwOnError:false});
});
demo(); requestAnimationFrame(frame);
