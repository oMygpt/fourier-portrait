function gaussian(source, width, height, sigma) {
  const radius = Math.ceil(sigma * 3), kernel = [];
  let total = 0;
  for (let i = -radius; i <= radius; i++) {const v = Math.exp(-i * i / (2 * sigma * sigma)); kernel.push(v); total += v;}
  const temp = new Float32Array(source.length), result = new Float32Array(source.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let i = -radius; i <= radius; i++) temp[y * width + x] += source[y * width + Math.max(0, Math.min(width - 1, x + i))] * kernel[i + radius] / total;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let i = -radius; i <= radius; i++) result[y * width + x] += temp[Math.max(0, Math.min(height - 1, y + i)) * width + x] * kernel[i + radius] / total;
  }
  return result;
}

export function styleParameters(style = 50, detail = 50) {
  const s = Math.max(0, Math.min(100, style)) / 100;
  return {sigma: .9 + s * 1.2, k: 1.45 + s * .3, p: 45 + s * 20, epsilon: -.02 + detail * .0008 + s * .02, phi: 8 + s * 12};
}

export function xdog(rgba, width, height, parameters = styleParameters()) {
  if (rgba.length !== width * height * 4 || width < 1 || height < 1) throw new RangeError('Invalid image dimensions');
  const {sigma, k, p, epsilon, phi} = parameters;
  if (!(sigma > 0 && k > 1 && p >= 0 && phi > 0) || !Number.isFinite(epsilon)) throw new RangeError('Invalid XDoG parameters');
  const gray = new Float32Array(width * height);
  let min = 1, max = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]) / 255;
    min = Math.min(min, gray[i]); max = Math.max(max, gray[i]);
  }
  const output = new Uint8Array(gray.length).fill(255);
  if (max - min < .025) return output;
  for (let i = 0; i < gray.length; i++) gray[i] = .08 + .84 * (gray[i] - min) / (max - min);
  const narrow = gaussian(gray, width, height, sigma), wide = gaussian(gray, width, height, sigma * k);
  for (let i = 0; i < gray.length; i++) {
    const difference = (1 + p) * narrow[i] - p * wide[i];
    const response = difference >= epsilon ? 1 : 1 + Math.tanh(phi * (difference - epsilon));
    output[i] = response < .5 ? 0 : 255;
  }
  return output;
}

export function thin(binary, width, height) {
  const mask = Uint8Array.from(binary, v => v === 0 ? 1 : 0);
  const offsets = [-width, -width + 1, 1, width + 1, width, width - 1, -1, -width - 1];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const remove = [];
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const index = y * width + x; if (!mask[index]) continue;
        const n = offsets.map(o => mask[index + o]), count = n.reduce((a, b) => a + b, 0);
        if (count < 2 || count > 6) continue;
        let transitions = 0;
        for (let j = 0; j < 8; j++) if (!n[j] && n[(j + 1) % 8]) transitions++;
        if (transitions !== 1) continue;
        if (pass === 0 ? n[0]*n[2]*n[4] || n[2]*n[4]*n[6] : n[0]*n[2]*n[6] || n[0]*n[4]*n[6]) continue;
        remove.push(index);
      }
      for (const index of remove) mask[index] = 0;
      changed ||= remove.length > 0;
    }
  }
  return mask;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function simplify(points, tolerance = .8) {
  if (points.length < 3) return [...points];
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop(), a = points[start], b = points[end];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let best = tolerance, chosen = -1;
    for (let i = start + 1; i < end; i++) {
      const t = length ? Math.max(0, Math.min(1, ((points[i].x-a.x)*dx+(points[i].y-a.y)*dy)/length)) : 0;
      const d = Math.hypot(points[i].x-a.x-t*dx, points[i].y-a.y-t*dy);
      if (d > best) {best = d; chosen = i;}
    }
    if (chosen >= 0) {keep.add(chosen); stack.push([start, chosen], [chosen, end]);}
  }
  return [...keep].sort((a,b) => a-b).map(i => points[i]);
}

export function vectorize(binary, width, height, minLength = 7) {
  const mask = thin(binary, width, height), adjacency = new Map();
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x; if (!mask[index]) continue;
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !mask[index + dy * width + dx]) continue;
      if (dx && dy && (mask[index + dx] || mask[index + dy * width])) continue;
      neighbors.push(index + dy * width + dx);
    }
    adjacency.set(index, neighbors);
  }
  const visited = new Set(), strokes = [];
  const key = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  function trace(start, next) {
    const indices = [start]; let previous = start, current = next;
    visited.add(key(previous, current));
    while (true) {
      indices.push(current);
      const neighbors = adjacency.get(current) || [];
      if (neighbors.length !== 2 || current === start) break;
      const candidate = neighbors.find(n => n !== previous);
      if (visited.has(key(current, candidate))) break;
      visited.add(key(current, candidate)); previous = current; current = candidate;
    }
    const points = indices.map(i => ({x:i % width, y:Math.floor(i / width)}));
    let length = 0; for (let i = 1; i < points.length; i++) length += distance(points[i-1],points[i]);
    if (length >= minLength) strokes.push(simplify(points));
  }
  for (const [start, neighbors] of adjacency) if (neighbors.length !== 2) for (const next of neighbors) if (!visited.has(key(start,next))) trace(start,next);
  for (const [start, neighbors] of adjacency) for (const next of neighbors) if (!visited.has(key(start,next))) trace(start,next);
  return strokes;
}

export function joinStrokes(strokes) {
  const remaining = strokes.filter(s => s.length > 1).map(s => [...s]);
  if (!remaining.length) return [];
  remaining.sort((a,b) => b.length-a.length);
  const path = remaining.shift().map(p => ({...p}));
  path[0].move = true;
  while (remaining.length) {
    const tip = path[path.length-1]; let best = Infinity, chosen = 0, reverse = false;
    for (let i=0; i<remaining.length; i++) for (const flip of [false,true]) {
      const d = distance(tip,remaining[i][flip ? remaining[i].length-1 : 0]);
      if (d < best) {best=d;chosen=i;reverse=flip;}
    }
    const [stroke] = remaining.splice(chosen,1); if (reverse) stroke.reverse();
    path.push(...stroke.map((p,i) => ({...p,move:i===0})));
  }
  return path;
}

export function resampleClosed(path, count = 1500) {
  if (path.length < 2 || count < 2) return [];
  const cumulative = [0];
  for (let i=1; i<=path.length; i++) cumulative.push(cumulative[i-1]+distance(path[i-1],path[i%path.length]));
  const total = cumulative[cumulative.length-1]; if (!total) return [];
  let segment = 0;
  return Array.from({length:count},(_,i) => {
    const target = i*total/count;
    while (segment < path.length-1 && cumulative[segment+1] < target) segment++;
    const a=path[segment],b=path[(segment+1)%path.length], length=cumulative[segment+1]-cumulative[segment];
    const t=length ? (target-cumulative[segment])/length : 0;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,draw:!b.move};
  });
}
