import { createComponentCatalog } from './catalog.js';
export const COLS = 80, ROWS = 52, UNIT = 12;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const keyAt = (x, y) => y * (COLS + 1) + x;
const point = (x, y, z = 0) => ({ x: (x - COLS / 2) * UNIT, y: (y - ROWS / 2) * UNIT, z });
const hash = value => { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; };
export const randomFrom = seed => { let n = hash(seed); return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
export const freshSeed = () => globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0') : Math.floor(Math.random() * 0xffffffff).toString(16);

/** Pure seeded PCB geometry, also usable without a browser. */
export function buildBoard(seed = 'wiring', count = 80) {
  const random = randomFrom(seed), pads = [];
  const components = createComponentCatalog(seed,count).map(source => {
    const part={...source,pads:[]}, {id,x,y,w,h,kind}=part;
    const add=(px,py)=>{const p={id:pads.length,part:id,...point(px,py,2),gx:Math.round(px),gy:Math.round(py)};pads.push(p);part.pads.push(p);};
    const horizontal=(n)=>{for(let i=0;i<n;i++){const px=x+w*(i+1)/(n+1);add(px,y-1);add(px,y+h+1);}};
    const vertical=(n)=>{for(let i=0;i<n;i++){const py=y+h*(i+1)/(n+1);add(x-1,py);add(x+w+1,py);}};
    if(kind==='qfp'){horizontal(2);vertical(2);}
    else if(['dip','header','connector','microdisplay'].includes(kind)){if(w>=h)horizontal(3);else vertical(3);}
    else if(kind==='resistor'||kind==='crystal'){add(x-1,y+h/2);add(x+w+1,y+h/2);}
    else if(kind==='transistor'){add(x-1,y+h*.3);add(x+w+1,y+h*.3);add(x+w/2,y+h+1);}
    else {horizontal(2);add(x-1,y+h/2);add(x+w+1,y+h/2);}
    return part;
  });
  const blocked=new Uint8Array((COLS+1)*(ROWS+1));
  for(const c of components)for(let y=Math.ceil(c.y);y<=c.y+c.h;y++)for(let x=Math.ceil(c.x);x<=c.x+c.w;x++)blocked[keyAt(x,y)]=1;
  for(const p of pads)blocked[keyAt(p.gx,p.gy)]=0;
  return {seed:String(seed),components,pads,blocked,random};
}

class MinHeap {
  constructor() { this.a = []; }
  push(node) { const a = this.a; a.push(node); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= node.f) break; a[i] = a[p]; i = p; } a[i] = node; }
  pop() { const a = this.a, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (true) { let child = i * 2 + 1; if (child >= a.length) break; if (child + 1 < a.length && a[child + 1].f < a[child].f) child++; if (a[child].f >= last.f) break; a[i] = a[child]; i = child; } a[i] = last; } return first; }
  get length() { return this.a.length; }
}

/** A* on the board grid. Existing traces affect cost, so each new connection finds a different way. */
export function routeBoard(board, start, end, occupancy, random = board.random) {
  const size = (COLS + 1) * (ROWS + 1), scores = new Float32Array(size).fill(Infinity), parents = new Int32Array(size).fill(-1), closed = new Uint8Array(size), heap = new MinHeap();
  const a = keyAt(start.gx, start.gy), b = keyAt(end.gx, end.gy);
  const heuristic = (x, y) => { const dx = Math.abs(x - end.gx), dy = Math.abs(y - end.gy); return Math.max(dx, dy) + Math.min(dx, dy) * .4142; };
  const bias = random() * 6.28, crossCost = .35 + random() * 1.1;
  scores[a] = 0; heap.push({ i: a, x: start.gx, y: start.gy, f: heuristic(start.gx, start.gy), dx: 0, dy: 0 });
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  while (heap.length) {
    const cur = heap.pop(); if (closed[cur.i]) continue; if (cur.i === b) break; closed[cur.i] = 1;
    for (const [dx, dy] of dirs) {
      const x = cur.x + dx, y = cur.y + dy; if (x < 2 || x > COLS - 2 || y < 2 || y > ROWS - 2) continue;
      const i = keyAt(x, y); if (closed[i] || (board.blocked[i] && i !== b)) continue;
      if (dx && dy && (board.blocked[keyAt(cur.x + dx, cur.y)] || board.blocked[keyAt(cur.x, cur.y + dy)])) continue;
      const turn = cur.dx && (cur.dx !== dx || cur.dy !== dy) ? .22 : 0;
      const noise = .06 * (1 + Math.sin(x * .6 + y * .4 + bias));
      const score = scores[cur.i] + (dx && dy ? 1.4142 : 1) + turn + Math.min(occupancy?.[i] || 0, 8) * crossCost + noise;
      if (score >= scores[i]) continue; scores[i] = score; parents[i] = cur.i; heap.push({ i, x, y, f: score + heuristic(x, y), dx, dy });
    }
  }
  if (parents[b] < 0) return null;
  const cells = []; for (let i = b; i !== -1; i = parents[i]) cells.push(i); cells.reverse();
  const vertices = []; let lastDx = 0, lastDy = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k], x = i % (COLS + 1), y = Math.floor(i / (COLS + 1));
    const next = cells[k + 1], dx = next === undefined ? 0 : next % (COLS + 1) - x, dy = next === undefined ? 0 : Math.floor(next / (COLS + 1)) - y;
    if (!k || k === cells.length - 1 || dx !== lastDx || dy !== lastDy) vertices.push(point(x, y, 1));
    lastDx = dx; lastDy = dy;
  }
  let length = 0; const distances = [0]; for (let i = 1; i < vertices.length; i++) { length += Math.hypot(vertices[i].x - vertices[i-1].x, vertices[i].y - vertices[i-1].y); distances.push(length); }
  return { cells, vertices, distances, length };
}

