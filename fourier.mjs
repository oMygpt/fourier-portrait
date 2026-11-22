export function edgePoints(rgba, width, height, detail = 50, cap = 1800) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = .299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2];
  const blur = new Float32Array(gray.length);
  const kernel = [1, 2, 1];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    let sum = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += gray[(y + j) * width + x + i] * kernel[j + 1] * kernel[i + 1];
    blur[y * width + x] = sum / 16;
  }
  const points = [], threshold = 180 - detail * 1.55;
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const p = y * width + x;
    const gx = -blur[p-width-1]+blur[p-width+1]-2*blur[p-1]+2*blur[p+1]-blur[p+width-1]+blur[p+width+1];
    const gy = -blur[p-width-1]-2*blur[p-width]-blur[p-width+1]+blur[p+width-1]+2*blur[p+width]+blur[p+width+1];
    if (Math.hypot(gx, gy) > threshold) points.push({x:x-width/2,y:y-height/2});
  }
  if (points.length <= cap) return points;
  return Array.from({length:cap}, (_, i) => points[Math.floor(i * points.length / cap)]);
}

export function orderPath(points) {
  if (!points.length) return [];
  const remaining = [...points], path = [remaining.pop()];
  while (remaining.length) {
    const tip = path[path.length - 1];
    let best = 0, distance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = (tip.x - remaining[i].x) ** 2 + (tip.y - remaining[i].y) ** 2;
      if (d < distance) { distance = d; best = i; }
    }
    path.push(remaining[best]);
    remaining[best] = remaining[remaining.length - 1]; remaining.pop();
  }
  return path;
}

export function dft(points) {
  const n = points.length, coefficients = [];
  for (let k = -Math.floor(n / 2); k < Math.ceil(n / 2); k++) {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) {
      const a = 2 * Math.PI * k * j / n, c = Math.cos(a), s = Math.sin(a);
      re += points[j].x * c + points[j].y * s;
      im += points[j].y * c - points[j].x * s;
    }
    re /= n; im /= n;
    coefficients.push({k, re, im, amplitude:Math.hypot(re, im), phase:Math.atan2(im, re)});
  }
  return coefficients.sort((a, b) => b.amplitude - a.amplitude);
}

export function evaluate(coefficients, t) {
  let x = 0, y = 0;
  for (const c of coefficients) {
    const angle = c.phase + 2 * Math.PI * c.k * t;
    x += c.amplitude * Math.cos(angle); y += c.amplitude * Math.sin(angle);
  }
  return {x, y};
}
