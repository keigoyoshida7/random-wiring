import * as THREE from './vendor/three.module.js';
import { buildBoard, routeBoard, freshSeed, randomFrom, COLS, ROWS, UNIT } from './topology.js';
import { createComponent, getComponentMetadata, updateComponentAnimation } from './components.js';
import { deformBoardPoint, boardSurfaceHeight, morphEnvelope } from './board-morph.js';
import { FORMATIONS, planFormation } from './emergence.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MAX_PATHS = 400, MAX_SEGMENTS = 24000;
const OUTLINE = [[-480,-270],[-438,-312],[350,-312],[480,-230],[480,230],[425,312],[-350,312],[-480,225]];
const _up = new THREE.Vector3(0,1,0), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _scale = new THREE.Vector3(1,1,1), _matrix = new THREE.Matrix4();
const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

/** Continuous physical PCB study. Geometry is rendered by WebGL, labels remain native DOM. */
export class WiringEngine {
  constructor(canvas, { onStats = () => {}, onInspect = () => {}, onLabels = () => {} } = {}) {
    this.canvas = canvas; this.onStats = onStats; this.onInspect = onInspect; this.onLabels = onLabels;
    this.options = { speed:1, density:1, persistence:75, rotation:.25, lineWidth:.65, nodes:true, grid:false, componentMotion:1, boardMotion:1, labels:true, componentCount:80 };
    this.view = 'perspective'; this.language = 'ja'; this.paused = false; this.selectedId = null; this.zoom = 1; this.pan = new THREE.Vector3(); this.yaw = -.24; this.tilt = .86; this.distance = 1350;
    this.width = 1; this.height = 1; this.lastTick = 0; this.lastStats = 0; this.lastLabels = 0; this.pointers = new Map(); this.listeners = []; this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#050505');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, preserveDrawingBuffer:true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    this.perspectiveCamera = new THREE.PerspectiveCamera(35, 1, 10, 8000); this.planCamera = new THREE.OrthographicCamera(-600,600,400,-400,10,8000); this.camera = this.perspectiveCamera;
    this.scene.add(new THREE.HemisphereLight(0xd7d7d7, 0x303030, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.7); key.position.set(-300, 700, 400); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbdbdbd, 2.3); fill.position.set(500,250,-500); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(0,-200,-700); this.scene.add(rim);
    this.buildDynamicObjects(); this.bindInput(); this.reset(); this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    this.frame = requestAnimationFrame(t => this.tick(t));
  }
  buildDynamicObjects() {
    const subdivisions = 8; this.boundaryBase = [];
    for(let i=0;i<OUTLINE.length;i++){const a=OUTLINE[i], b=OUTLINE[(i+1)%OUTLINE.length];for(let j=0;j<subdivisions;j++){const t=j/subdivisions;this.boundaryBase.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
    const n=this.boundaryBase.length, rings=5; this.boardBase = [[0,0]];
    for(let r=1;r<=rings;r++)for(const [x,z]of this.boundaryBase)this.boardBase.push([x*r/rings,z*r/rings]);
    const topCount=this.boardBase.length, positions=new Float32Array(topCount*2*3), indices=[];
    for(let i=0;i<n;i++)indices.push(0,1+i,1+(i+1)%n);
    for(let r=1;r<rings;r++)for(let i=0;i<n;i++){const a=1+(r-1)*n+i,b=1+(r-1)*n+(i+1)%n,c=1+r*n+i,d=1+r*n+(i+1)%n;indices.push(a,c,b,b,c,d);}
    const topIndexCount=indices.length;for(let i=0;i<topIndexCount;i+=3)indices.push(indices[i+2]+topCount,indices[i+1]+topCount,indices[i]+topCount);
    for(let i=0;i<n;i++){const a=1+(rings-1)*n+i,b=1+(rings-1)*n+(i+1)%n;indices.push(a,b,a+topCount,b,b+topCount,a+topCount);}
    this.boardGeometry=new THREE.BufferGeometry(); this.boardGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));this.boardGeometry.setIndex(indices);
    this.boardMesh=new THREE.Mesh(this.boardGeometry,new THREE.MeshStandardMaterial({color:0x2b2b2b,metalness:.5,roughness:.48,side:THREE.DoubleSide}));this.scene.add(this.boardMesh);
    this.boardOutline=new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage)),new THREE.LineBasicMaterial({color:0x9fa7ad,transparent:true,opacity:.55}));this.scene.add(this.boardOutline);
    this.gridGeometry=new THREE.BufferGeometry();this.gridGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(2400*3),3).setUsage(THREE.DynamicDrawUsage));this.gridMesh=new THREE.Points(this.gridGeometry,new THREE.PointsMaterial({color:0x8b939c,size:1.15,sizeAttenuation:false,transparent:true,opacity:.35}));this.scene.add(this.gridMesh);
    this.traceGeometry=new THREE.BufferGeometry();this.tracePositions=new Float32Array(MAX_SEGMENTS*4*3);this.traceOthers=new Float32Array(MAX_SEGMENTS*4*3);this.traceColors=new Float32Array(MAX_SEGMENTS*4*4);
    const traceIndices=new Uint32Array(MAX_SEGMENTS*6),sides=new Float32Array(MAX_SEGMENTS*4);for(let i=0;i<MAX_SEGMENTS;i++){const v=i*4,j=i*6;traceIndices.set([v,v+1,v+2,v+2,v+1,v+3],j);sides.set([-1,1,1,-1],v);}
    this.traceGeometry.setAttribute('position',new THREE.BufferAttribute(this.tracePositions,3).setUsage(THREE.DynamicDrawUsage));this.traceGeometry.setAttribute('other',new THREE.BufferAttribute(this.traceOthers,3).setUsage(THREE.DynamicDrawUsage));this.traceGeometry.setAttribute('traceColor',new THREE.BufferAttribute(this.traceColors,4).setUsage(THREE.DynamicDrawUsage));this.traceGeometry.setAttribute('side',new THREE.BufferAttribute(sides,1));this.traceGeometry.setIndex(new THREE.BufferAttribute(traceIndices,1));this.traceGeometry.setDrawRange(0,0);
    this.traceMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,uniforms:{resolution:{value:new THREE.Vector2(1,1)},thickness:{value:.65}},vertexShader:`attribute vec3 other;attribute float side;attribute vec4 traceColor;uniform vec2 resolution;uniform float thickness;varying vec4 vColor;void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(position,1.0);vec4 b=projectionMatrix*modelViewMatrix*vec4(other,1.0);vec2 d=(b.xy/b.w-a.xy/a.w)*resolution;float len=max(length(d),0.00001);vec2 normal=vec2(-d.y,d.x)/len; a.xy+=normal*side*thickness/resolution*a.w;gl_Position=a;vColor=traceColor;}`,fragmentShader:`varying vec4 vColor;void main(){gl_FragColor=vColor;}`});
    this.traceMesh=new THREE.Mesh(this.traceGeometry,this.traceMaterial);this.traceMesh.frustumCulled=false;this.traceMesh.renderOrder=2;this.scene.add(this.traceMesh);
    this.headGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAX_PATHS*3),3).setUsage(THREE.DynamicDrawUsage));
    this.headMesh=new THREE.Points(this.headGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pointSize:{value:4}},vertexShader:`uniform float pointSize;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=pointSize;}`,fragmentShader:`void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;gl_FragColor=vec4(vec3(1.0),1.0-smoothstep(0.22,0.5,r));}`}));this.headMesh.frustumCulled=false;this.headMesh.renderOrder=3;this.scene.add(this.headMesh);
    this.holeGroups=[];
    for(const [x,z]of [[-440,-270],[430,-255],[-425,267],[425,267]]){
      const g=new THREE.Group();g.userData.base={x,z};const ring=new THREE.Mesh(new THREE.TorusGeometry(8.5,2,6,22),new THREE.MeshStandardMaterial({color:0x9ca1a7,metalness:.88,roughness:.28}));ring.rotation.x=Math.PI/2;g.add(ring);const hole=new THREE.Mesh(new THREE.CircleGeometry(6.8,24),new THREE.MeshBasicMaterial({color:0x030303,side:THREE.DoubleSide}));hole.rotation.x=-Math.PI/2;hole.position.y=.5;g.add(hole);this.holeGroups.push(g);this.scene.add(g);
    }
    this.selectionOutline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0xf3f4f5,transparent:true,opacity:.8}));this.selectionOutline.visible=false;this.scene.add(this.selectionOutline);
  }
  setOptions(patch={}) {
    const nextCount=Number.isFinite(Number(patch.componentCount))?clamp(Math.round(Number(patch.componentCount)/16)*16,32,112):this.options.componentCount,countChanged=nextCount!==this.options.componentCount;this.options.componentCount=nextCount;
    const limits={speed:[.05,12],density:[.2,2],persistence:[10,180],rotation:[0,2],lineWidth:[.4,1.8],componentMotion:[0,2.5],boardMotion:[0,2.5]};
    for(const [key,value]of Object.entries(patch))if(key in limits&&Number.isFinite(Number(value)))this.options[key]=clamp(Number(value),...limits[key]);else if(['nodes','grid','labels'].includes(key))this.options[key]=!!value;
    this.traceMaterial.uniforms.thickness.value=this.options.lineWidth;if(countChanged){this.reset({seed:this.seed});return;}this.updateScene();this.draw();this.emitStats();
  }
  setPaused(value){this.paused=!!value;this.lastTick=0;this.emitStats();}
  setView(view){this.view=view==='plan'?'plan':'perspective';this.camera=this.view==='plan'?this.planCamera:this.perspectiveCamera;this.fit();this.emitStats();}
  setLanguage(lang){this.language=lang==='en'?'en':'ja';this.emitLabels();if(this.selectedId)this.onInspect(this.getComponents().find(p=>p.id===this.selectedId)||null);}
  getComponents(){return (this.parts||[]).map(p=>({...p.metadata}));}
  selectComponent(id){const part=this.parts?.find(p=>p.id===id);this.selectedId=part?.id||null;this.updateSelection();this.onInspect(part?{...part.metadata}:null);this.emitLabels();this.draw();this.emitStats();}
  reset({seed}={}) {
    this.clearComponents();this.seed=seed==null?freshSeed():String(seed);this.board=buildBoard(this.seed,this.options.componentCount);this.random=this.board.random;this.paths=[];this.occupancy=new Uint16Array((COLS+1)*(ROWS+1));this.links=new Set();this.totalConnections=0;this.elapsed=0;this.componentTime=0;this.boardTime=0;this.spawnBudget=0;this.lastTick=0;this.selectedId=null;this.relocations=0;this.reroutes=0;this.layoutVersion=0;this.lastRoutingTime=-1;this.rerouteQueue=[];this.queuedLinks=new Set();this.dirtyParts=new Set();this.motionRandom=randomFrom(this.seed+':journeys');this.nextDeparture=.2;this.nextGlobalRelayout=1.3;this.globalRelayouts=0;this.formation='scatter';
    this.parts=this.board.components.map(part=>{const mesh=createComponent(part);this.scene.add(mesh);return{...part,mesh,metadata:getComponentMetadata(part),baseX:(part.x+part.w/2-COLS/2)*UNIT,baseZ:(part.y+part.h/2-ROWS/2)*UNIT,logicalX:(part.x+part.w/2-COLS/2)*UNIT,logicalZ:(part.y+part.h/2-ROWS/2)*UNIT,current:new THREE.Vector3(),angle:0,lift:0,perch:0,energy:0,energyGoal:0,journey:null,dwellUntil:.15+this.motionRandom()*.7,completedJourneys:[]};});this.partMap=new Map(this.parts.map(p=>[p.id,p]));
    const padGeometry=new THREE.CylinderGeometry(2.2,2.2,1.1,8);const padMaterial=new THREE.MeshStandardMaterial({color:0x969ca5,metalness:.9,roughness:.3});this.padMesh=new THREE.InstancedMesh(padGeometry,padMaterial,this.board.pads.length);this.padMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.padMesh.frustumCulled=false;this.scene.add(this.padMesh);this.padPositions=this.board.pads.map(()=>new THREE.Vector3());this.padBasePositions=this.board.pads.map(p=>new THREE.Vector3(p.x,0,p.y));
    this.updateBoard();this.updateComponents();this.rebuildRoutingGrid();for(let i=0;i<Math.min(120,40+this.parts.length);i++)this.spawn(true);this.updateTraces();this.autoDistance=null;this.autoCenter=null;this.autoPlanHalf=null;this.updateCamera();this.draw();this.emitStats();this.onInspect(null);
  }
  clearComponents(){if(this.parts)for(const p of this.parts)this.disposeObject(p.mesh);if(this.padMesh){this.disposeObject(this.padMesh);this.padMesh=null;}}
  disposeObject(object){object.parent?.remove(object);const geometries=new Set(),materials=new Set(),instances=new Set();object.traverse(child=>{if(child.isInstancedMesh)instances.add(child);if(child.geometry)geometries.add(child.geometry);if(child.material)for(const material of Array.isArray(child.material)?child.material:[child.material])materials.add(material);});for(const instance of instances)instance.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
  fit(){this.zoom=1;this.pan.set(0,0,0);this.yaw=-.24;this.tilt=.86;this.autoDistance=null;this.autoCenter=null;this.autoPlanHalf=null;this.updateCamera();this.draw();}
  zoomBy(factor){if(Number.isFinite(factor)&&factor>0)this.zoom=clamp(this.zoom*factor,.4,3.2);this.updateCamera();this.draw();}
  resize(){const rect=this.canvas.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);this.renderer.setSize(this.width,this.height,false);this.traceMaterial.uniforms.resolution.value.set(this.width,this.height);this.headMesh.material.uniforms.pointSize.value=4*Math.min(globalThis.devicePixelRatio||1,2);this.updateCamera();this.draw();}
  updateCamera(){
    const aspect=this.width/this.height,fitPoints=[],box={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
    const include=(x,y,z)=>{fitPoints.push(x,y,z);box.minX=Math.min(box.minX,x);box.maxX=Math.max(box.maxX,x);box.minY=Math.min(box.minY,y);box.maxY=Math.max(box.maxY,y);box.minZ=Math.min(box.minZ,z);box.maxZ=Math.max(box.maxZ,z);};
    const board=this.boardOutline.geometry.attributes.position;for(let i=0;i<board.count;i++)include(board.getX(i),board.getY(i)-10,board.getZ(i));
    for(const part of this.parts||[]){const hx=part.w*UNIT/2+5,hz=part.h*UNIT/2+5,top=part.current.y+(part.mesh.userData.labelHeight||part.height)+8;for(const x of[part.current.x-hx,part.current.x+hx])for(const y of[part.current.y,top])for(const z of[part.current.z-hz,part.current.z+hz])include(x,y,z);}
    if(!Number.isFinite(box.minX)){box.minX=-480;box.maxX=480;box.minY=-10;box.maxY=80;box.minZ=-312;box.maxZ=312;}
    const center=new THREE.Vector3((box.minX+box.maxX)/2,(box.minY+box.maxY)/2,(box.minZ+box.maxZ)/2),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),ct=Math.cos(this.tilt),st=Math.sin(this.tilt),eye=new THREE.Vector3(sy*ct,st,cy*ct),right=new THREE.Vector3(cy,0,-sy),up=new THREE.Vector3(-sy*st,ct,-cy*st),tanY=Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov/2)),tanX=tanY*aspect;
    let required=1;
    for(let i=0;i<fitPoints.length;i+=3){_v.set(fitPoints[i],fitPoints[i+1],fitPoints[i+2]).sub(center);const depth=_v.dot(eye);required=Math.max(required,depth+Math.abs(_v.dot(right))/(tanX*.82),depth+Math.abs(_v.dot(up))/(tanY*.82));}
    required=Math.max(650,required*1.015);const dt=clamp(this.cameraDelta||1/60,1/120,.06),mix=this.autoDistance==null?1:1-Math.exp(-dt/(required>this.autoDistance ? .24 : 1.15));
    if(!this.autoCenter)this.autoCenter=center.clone();else if(!this.pointers.size)this.autoCenter.lerp(center,1-Math.exp(-dt/.65));
    if(this.autoDistance==null)this.autoDistance=required;else if(!this.pointers.size)this.autoDistance+=(required-this.autoDistance)*mix;
    this.distance=this.autoDistance/this.zoom;const target=this.autoCenter.clone().add(this.pan);
    this.perspectiveCamera.aspect=aspect;this.perspectiveCamera.position.copy(target).addScaledVector(eye,this.distance);this.perspectiveCamera.lookAt(target);this.perspectiveCamera.updateProjectionMatrix();
    const planGoal=Math.max((box.maxZ-box.minZ)/2/.82,(box.maxX-box.minX)/2/aspect/.82,150);if(this.autoPlanHalf==null)this.autoPlanHalf=planGoal;else if(!this.pointers.size)this.autoPlanHalf+=(planGoal-this.autoPlanHalf)*mix;
    const half=this.autoPlanHalf/this.zoom;this.planCamera.left=-half*aspect;this.planCamera.right=half*aspect;this.planCamera.top=half;this.planCamera.bottom=-half;this.planCamera.position.set(target.x,2200,target.z);this.planCamera.up.set(0,0,-1);this.planCamera.lookAt(target);this.planCamera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  bindInput(){
    const on=(type,fn,options)=>{this.canvas.addEventListener(type,fn,options);this.listeners.push([type,fn,options]);};
    on('pointerdown',event=>{if(event.button!==0)return;this.canvas.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false});});
    on('pointermove',event=>{const previous=this.pointers.get(event.pointerId);if(!previous)return;const before=[...this.pointers.values()],dx=event.clientX-previous.x,dy=event.clientY-previous.y;const moved=previous.moved||Math.hypot(event.clientX-previous.startX,event.clientY-previous.startY)>4;this.pointers.set(event.pointerId,{...previous,x:event.clientX,y:event.clientY,moved});
      if(this.pointers.size===2){const after=[...this.pointers.values()],a=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),b=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);if(a>2)this.zoomBy(b/a);}else if(this.view==='plan'||event.shiftKey){const scale=this.distance/Math.max(this.height,1)*.52;this.pan.x-=dx*scale;this.pan.z-=dy*scale;}else{this.yaw-=dx*.005;this.tilt=clamp(this.tilt+dy*.004,.1,1.49);}this.updateCamera();this.draw();});
    on('pointerup',event=>{const p=this.pointers.get(event.pointerId);if(p&&!p.moved&&this.pointers.size===1)this.pick(event.clientX,event.clientY);this.pointers.delete(event.pointerId);});const release=event=>this.pointers.delete(event.pointerId);on('pointercancel',release);on('lostpointercapture',release);
    on('wheel',event=>{event.preventDefault();this.zoomBy(Math.exp(-event.deltaY*.001));},{passive:false});on('dblclick',()=>this.fit());
  }
  pick(clientX,clientY){const r=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);const hits=this.raycaster.intersectObjects(this.parts.map(p=>p.mesh),true);let hit=hits[0]?.object;while(hit&&!this.parts.some(p=>p.mesh===hit))hit=hit.parent;this.selectComponent(this.parts.find(p=>p.mesh===hit)?.id||null);}
  routingPad(id){return this.currentRoutingPads?.[id];}
  spawn(prefill=false,pair=null){
    const pads=this.currentRoutingPads,random=this.random;if(!pads)return false;let a,b,link;
    if(pair){a=pads[pair.aId];b=pads[pair.bId];if(!a||!b)return false;link=a.id<b.id?`${a.id}:${b.id}`:`${b.id}:${a.id}`;if(this.links.has(link))return false;}
    else for(let attempt=0;attempt<15;attempt++){a=pads[Math.floor(random()*pads.length)];const candidates=pads.filter(p=>p.part!==a.part&&Math.hypot(p.gx-a.gx,p.gy-a.gy)<(random()<.3?95:48));b=candidates[Math.floor(random()*candidates.length)];if(!b)continue;link=a.id<b.id?`${a.id}:${b.id}`:`${b.id}:${a.id}`;if(!this.links.has(link)&&!this.queuedLinks.has(link))break;b=null;}
    if(!b)return false;const route=routeBoard(this.routingBoard,a,b,this.occupancy,random);if(!route)return false;
    const bridgeHeight=0;
    if(this.paths.length>=MAX_PATHS)this.removePath(0);for(const cell of route.cells)this.occupancy[cell]++;
    this.paths.push({...route,bridgeHeight,a:{...a},b:{...b},link,linkActive:true,counted:true,layoutVersion:this.layoutVersion,retiringAt:null,retireDuration:.34,layer:Math.floor(random()*3),brightness:.5+random()*.43,age:prefill?random()*14:0,progress:prefill?route.length:0});this.links.add(link);this.totalConnections++;if(pair)this.reroutes++;return true;
  }
  removePath(index){const p=this.paths[index];if(p.counted)for(const cell of p.cells)this.occupancy[cell]=Math.max(0,this.occupancy[cell]-1);if(p.linkActive)this.links.delete(p.link);this.paths.splice(index,1);}
  inverseBoard(x,z){
    let u=x/1.5,v=z/1.25;for(let i=0;i<7;i++){const p=this.deform(u,v),ex=p.x-x,ez=p.z-z;if(Math.abs(ex)+Math.abs(ez)<.002)break;const px=this.deform(u+.5,v),pz=this.deform(u,v+.5),a=(px.x-p.x)*2,b=(pz.x-p.x)*2,c=(px.z-p.z)*2,d=(pz.z-p.z)*2,det=a*d-b*c;if(Math.abs(det)<.03)break;u=clamp(u-(d*ex-b*ez)/det,-600,600);v=clamp(v-(-c*ex+a*ez)/det,-420,420);}return{x:u,z:v};
  }
  rebuildRoutingGrid(){
    this.layoutVersion++;this.routingBoard={blocked:new Uint8Array((COLS+1)*(ROWS+1)),random:this.random};
    const blocked=this.routingBoard.blocked;
    // Cache the deformed routing lattice once, then rasterise only each body's bounds.
    if(!this.routingCellWorld)this.routingCellWorld=new Float32Array((COLS+1)*(ROWS+1)*2);
    for(let gy=2;gy<=ROWS-2;gy++)for(let gx=2;gx<=COLS-2;gx++){const p=this.deform((gx-COLS/2)*UNIT,(gy-ROWS/2)*UNIT),i=(gy*(COLS+1)+gx)*2;this.routingCellWorld[i]=p.x;this.routingCellWorld[i+1]=p.z;}
    for(const part of this.parts){const c=Math.cos(part.angle),sn=Math.sin(part.angle),hx=part.w*UNIT/2+3,hz=part.h*UNIT/2+3,radius=Math.hypot(part.w,part.h)*UNIT*1.2,minX=clamp(Math.floor((part.logicalX-radius)/UNIT+COLS/2),2,COLS-2),maxX=clamp(Math.ceil((part.logicalX+radius)/UNIT+COLS/2),2,COLS-2),minZ=clamp(Math.floor((part.logicalZ-radius)/UNIT+ROWS/2),2,ROWS-2),maxZ=clamp(Math.ceil((part.logicalZ+radius)/UNIT+ROWS/2),2,ROWS-2);
      for(let gy=minZ;gy<=maxZ;gy++)for(let gx=minX;gx<=maxX;gx++){const cell=gy*(COLS+1)+gx,i=cell*2,dx=this.routingCellWorld[i]-part.current.x,dz=this.routingCellWorld[i+1]-part.current.z,lx=dx*c-dz*sn,lz=dx*sn+dz*c;if(Math.abs(lx)<hx&&Math.abs(lz)<hz)blocked[cell]=1;}
    }
    this.currentRoutingPads=this.board.pads.map(pad=>{const pose=this.padPositions[pad.id],logical=this.inverseBoard(pose.x,pose.z);return{id:pad.id,part:pad.part,x:logical.x,y:logical.z,z:pose.y,gx:clamp(Math.round(logical.x/UNIT+COLS/2),2,COLS-2),gy:clamp(Math.round(logical.z/UNIT+ROWS/2),2,ROWS-2)};});
    for(const pad of this.currentRoutingPads)blocked[pad.gy*(COLS+1)+pad.gx]=0;
    this.occupancy.fill(0);for(const path of this.paths){path.counted=path.retiringAt===null;if(path.counted)for(const cell of path.cells)this.occupancy[cell]++;}
    this.lastRoutingTime=this.componentTime;this.lastRoutingBoardTime=this.boardTime;
  }
  retirePath(path){
    if(path.retiringAt!==null)return;path.retiringAt=this.elapsed;path.endpointA=this.padPositions[path.a.id].clone();path.endpointB=this.padPositions[path.b.id].clone();if(path.counted){for(const cell of path.cells)this.occupancy[cell]=Math.max(0,this.occupancy[cell]-1);path.counted=false;}if(path.linkActive){this.links.delete(path.link);path.linkActive=false;}
    if(!this.queuedLinks.has(path.link)){while(this.rerouteQueue.length>=MAX_PATHS){const obsolete=this.rerouteQueue.shift();this.queuedLinks.delete(obsolete.link);}this.queuedLinks.add(path.link);this.rerouteQueue.push({aId:path.a.id,bId:path.b.id,link:path.link,attempts:0});}
  }
  refreshRoutes(force=false){
    const moving=new Set(this.parts.filter(p=>p.journey).map(p=>p.id)),boardChanged=this.boardTime-(this.lastRoutingBoardTime||0)>.6;if(!force&&!this.dirtyParts.size&&!boardChanged&&(!moving.size||this.componentTime-this.lastRoutingTime<.32))return;
    for(const id of this.dirtyParts)moving.add(id);this.rebuildRoutingGrid();
    for(const path of this.paths){const a=this.currentRoutingPads[path.a.id],b=this.currentRoutingPads[path.b.id],endpointShift=Math.hypot(a.x-path.a.x,a.y-path.a.y)>9||Math.hypot(b.x-path.b.x,b.y-path.b.y)>9;if(path.retiringAt===null&&(moving.has(path.a.part)||moving.has(path.b.part)||endpointShift||path.cells.some(cell=>this.routingBoard.blocked[cell])))this.retirePath(path);}
    this.dirtyParts.clear();
  }
  drainReroutes(){let work=0;while(this.rerouteQueue.length&&work++<4){const job=this.rerouteQueue.shift();this.queuedLinks.delete(job.link);if(this.links.has(job.link))continue;if(!this.spawn(false,job)&&job.attempts++<3){this.queuedLinks.add(job.link);this.rerouteQueue.push(job);}}}
  planGlobalRelayout(){
    this.pendingFormation=FORMATIONS[this.globalRelayouts%FORMATIONS.length];const futureTime=this.boardTime+3*this.options.boardMotion/Math.max(.05,this.options.componentMotion);
    return planFormation(this.parts,{formation:this.pendingFormation,cycle:this.globalRelayouts,random:this.motionRandom,deform:(x,z,t)=>this.deform(x,z,t),time:futureTime});
  }
  beginGlobalRelayout(){
    const planned=this.planGlobalRelayout();if(!planned){this.nextGlobalRelayout=this.componentTime+.8;return false;}
    this.formation=this.pendingFormation;
    for(let i=0;i<planned.length;i++){const slot=planned[i];slot.part.cluster=slot.cluster;this.startJourney(slot.part,{...slot,delay:i/Math.max(1,planned.length-1)*1.25,duration:1.85+this.motionRandom()*.65,lift:0,elevation:0,angle:0});}
    this.globalRelayouts++;this.nextGlobalRelayout=this.componentTime+12+this.motionRandom()*4;this.nextDeparture=this.componentTime+6.5;return true;
  }
  targetFor(part){
    const random=this.motionRandom,maxX=Math.max(180,420-part.w*UNIT*.8),maxZ=Math.max(80,260-part.h*UNIT*.8);let best=null;
    for(let i=0;i<110;i++){const x=(random()*2-1)*maxX,z=(random()*2-1)*maxZ,distance=Math.hypot(x-part.logicalX,z-part.logicalZ);if(distance<150)continue;const world=this.deform(x,z);let valid=true;for(const other of this.parts){if(other===part)continue;const tx=other.journey?.targetX??other.logicalX,tz=other.journey?.targetZ??other.logicalZ,p=this.deform(tx,tz);if(Math.abs(world.x-p.x)<(part.w+other.w)*UNIT/2+22&&Math.abs(world.z-p.z)<(part.h+other.h)*UNIT/2+22){valid=false;break;}}if(valid){best={x,z,distance};if(distance>230)return best;}}
    return best;
  }
  startJourney(part,target){
    const r=this.motionRandom;part.journey={startX:part.logicalX,startZ:part.logicalZ,targetX:target.x,targetZ:target.z,startAngle:part.angle,targetAngle:target.angle??(r()*2-1)*.28,start:this.componentTime+(target.delay||0),duration:target.duration??(1.25+r()*1.15),lift:0,startLift:0,startPerch:0,targetPerch:0,distance:target.distance};this.dirtyParts.add(part.id);
  }
  updateMotion(){
    const time=this.componentTime;for(const part of this.parts){const j=part.journey;if(!j)continue;const t=clamp((time-j.start)/j.duration,0,1),f=t*t*(3-2*t);part.logicalX=j.startX+(j.targetX-j.startX)*f;part.logicalZ=j.startZ+(j.targetZ-j.startZ)*f;part.angle=j.startAngle+(j.targetAngle-j.startAngle)*f;part.lift=0;part.perch=0;if(t>=1){part.logicalX=j.targetX;part.logicalZ=j.targetZ;part.lift=0;part.completedJourneys.push({...j,end:time});if(part.completedJourneys.length>12)part.completedJourneys.shift();part.journey=null;part.dwellUntil=time+.45+this.motionRandom()*1.1;this.relocations++;this.dirtyParts.add(part.id);}}
    if(this.options.componentMotion&&time>=this.nextGlobalRelayout&&this.beginGlobalRelayout())return;
    if(!this.options.componentMotion||time<this.nextDeparture)return;const desired=Math.min(8,Math.ceil(this.parts.length*.075));let travelling=this.parts.filter(p=>p.journey).length;
    if(travelling<desired){const candidates=this.parts.filter(p=>!p.journey&&p.dwellUntil<=time).sort((a,b)=>(a.completedJourneys.length-b.completedJourneys.length));for(let tries=0;tries<Math.min(candidates.length,6);tries++){const index=Math.floor(this.motionRandom()*Math.min(candidates.length,8)),part=candidates.splice(index,1)[0];if(!part)break;const target=this.targetFor(part);if(target){this.startJourney(part,target);travelling++;break;}}}
    this.nextDeparture=time+.24+this.motionRandom()*.25;
  }
  separateSettledParts(){
    if(this.options.componentMotion<=0)return;
    const bodies=this.parts.filter(part=>!part.journey).map(part=>{const p=this.deform(part.logicalX,part.logicalZ),c=Math.abs(Math.cos(part.angle)),sn=Math.abs(Math.sin(part.angle));return{part,x:p.x,z:p.z,startX:p.x,startZ:p.z,hx:(c*part.w+sn*part.h)*UNIT/2,hz:(sn*part.w+c*part.h)*UNIT/2};});
    // Rigid mounted bodies retain a small current-world clearance while the
    // substrate changes shape. Corrections slide along its surface, never lift.
    for(let pass=0;pass<10;pass++){let correction=0;
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const a=bodies[i],b=bodies[j],dx=b.x-a.x,dz=b.z-a.z,px=a.hx+b.hx+6-Math.abs(dx),pz=a.hz+b.hz+6-Math.abs(dz);if(px<=0||pz<=0)continue;const amount=Math.min(px,pz)*.505;correction=Math.max(correction,amount);if(px<pz){const push=Math.sign(dx||1)*amount;a.x-=push;b.x+=push;}else{const push=Math.sign(dz||1)*amount;a.z-=push;b.z+=push;}}
      if(correction<.025)break;
    }
    for(const body of bodies){const moved=Math.hypot(body.x-body.startX,body.z-body.startZ);if(moved<.002)continue;const part=body.part,p=this.inverseBoard(body.x,body.z),maxX=440-part.w*UNIT*.6,maxZ=275-part.h*UNIT*.65;part.logicalX=clamp(p.x,-maxX,maxX);part.logicalZ=clamp(p.z,-maxZ,maxZ);part.separationDrift=(part.separationDrift||0)+moved;if(part.separationDrift>8){this.dirtyParts.add(part.id);part.separationDrift=0;}}
  }
  tick(now){
    if(this.destroyed)return;const realDelta=this.lastTick?clamp((now-this.lastTick)/1000,0,.06):0;this.lastTick=now;
    if(!this.paused&&this.board){const delta=realDelta*this.options.speed;this.elapsed+=delta;this.componentTime+=delta*this.options.componentMotion;this.boardTime+=delta*this.options.boardMotion;if(this.view==='perspective'&&!this.pointers.size)this.yaw+=realDelta*this.options.rotation*.035;
      this.updateMotion();if(delta>0)this.separateSettledParts();this.updateBoard();this.updateComponents();this.refreshRoutes();this.drainReroutes();
      for(let i=this.paths.length-1;i>=0;i--){const p=this.paths[i];p.age+=delta;p.progress=Math.min(p.length,p.progress+delta*(390+p.length*.35));if(p.age>this.options.persistence||(p.retiringAt!==null&&this.elapsed-p.retiringAt>p.retireDuration))this.removePath(i);}
      this.spawnBudget+=delta*(2.2+this.options.density*3.8);const target=Math.min(MAX_PATHS,Math.round(90+this.options.density*120+this.parts.length*.8));let work=0;while(this.spawnBudget>=1&&work++<1){this.spawnBudget--;if(this.paths.length>=target)this.removePath(0);this.spawn();}while(this.paths.length>target+5)this.removePath(0);this.spawnBudget=Math.min(this.spawnBudget,12);this.updateTraces();this.cameraDelta=realDelta;this.updateCamera();this.renderer.render(this.scene,this.camera);
    }
    if(now-this.lastLabels>40){this.lastLabels=now;this.emitLabels();}if(now-this.lastStats>250){this.lastStats=now;this.emitStats();}this.frame=requestAnimationFrame(t=>this.tick(t));
  }
  deform(x,z,t=this.boardTime){const p=deformBoardPoint(x,z,t);return{x:p.x*1.5,z:p.z*1.25};}
  surfaceY(x,z,t=this.boardTime){return boardSurfaceHeight(x/1.5,z/1.25,t)*.38;}
  updateBoard(){
    const attr=this.boardGeometry.attributes.position,values=attr.array,count=this.boardBase.length;for(let i=0;i<count;i++){const base=this.boardBase[i],p=this.deform(base[0],base[1]),y=this.surfaceY(p.x,p.z);values[i*3]=p.x;values[i*3+1]=y;values[i*3+2]=p.z;values[(i+count)*3]=p.x;values[(i+count)*3+1]=y-9;values[(i+count)*3+2]=p.z;}attr.needsUpdate=true;this.boardGeometry.computeVertexNormals();
    const edge=this.boardOutline.geometry.attributes.position;for(let i=0;i<this.boundaryBase.length;i++){const b=this.boundaryBase[i],p=this.deform(b[0],b[1]);edge.setXYZ(i,p.x,this.surfaceY(p.x,p.z)+.7,p.z);}edge.needsUpdate=true;
    let n=0;const grid=this.gridGeometry.attributes.position;for(let z=-280;z<=280;z+=24)for(let x=-440;x<=440;x+=24){const p=this.deform(x,z);grid.setXYZ(n++,p.x,this.surfaceY(p.x,p.z)+.65,p.z);}grid.needsUpdate=true;this.gridGeometry.setDrawRange(0,n);this.gridMesh.visible=this.options.grid;
    for(const g of this.holeGroups){const p=this.deform(g.userData.base.x,g.userData.base.z);g.position.set(p.x,this.surfaceY(p.x,p.z)+1,p.z);}
  }
  updateComponents(){
    for(const part of this.parts){part.perch=0;part.lift=0;const p=this.deform(part.logicalX,part.logicalZ);part.slopeX=(this.surfaceY(p.x+3,p.z)-this.surfaceY(p.x-3,p.z))/6;part.slopeZ=(this.surfaceY(p.x,p.z+3)-this.surfaceY(p.x,p.z-3))/6;part.current.set(p.x,this.surfaceY(p.x,p.z)+.45,p.z);part.mesh.position.copy(part.current);_v.set(-part.slopeX,1,-part.slopeZ).normalize();part.mesh.quaternion.setFromUnitVectors(_up,_v);_q.setFromAxisAngle(_up,part.angle);part.mesh.quaternion.multiply(_q);}
    for(const pad of this.board.pads){const part=this.partMap.get(pad.part),lx=pad.x-part.baseX,lz=pad.y-part.baseZ,p=this.padPositions[pad.id];_v.set(lx,1.4,lz).applyQuaternion(part.mesh.quaternion);p.copy(part.current).add(_v);_matrix.compose(p,part.mesh.quaternion,_scale);this.padMesh.setMatrixAt(pad.id,_matrix);}this.padMesh.instanceMatrix.needsUpdate=true;this.padMesh.visible=this.options.nodes;this.updateSelection();
  }
  routePoint(path,vertexIndex,out){
    const p=path.vertices[vertexIndex],d=this.deform(p.x,p.y);out.set(d.x,this.surfaceY(d.x,d.z)+1.7+path.layer*.32,d.z);
    if(vertexIndex===0)out.copy(path.retiringAt===null?this.padPositions[path.a.id]:path.endpointA);else if(vertexIndex===path.vertices.length-1)out.copy(path.retiringAt===null?this.padPositions[path.b.id]:path.endpointB);return out;
  }
  updateTraces(){
    for(const part of this.parts)part.energyGoal=.035;
    let segments=0,heads=0;const a=new THREE.Vector3(),b=new THREE.Vector3();for(const path of this.paths){const fade=clamp((this.options.persistence-path.age)/Math.min(12,this.options.persistence*.25),0,1),retirement=path.retiringAt===null?1:clamp(1-(this.elapsed-path.retiringAt)/path.retireDuration,0,1),alpha=fade*retirement*path.brightness;if(alpha<.006)continue;const pa=this.partMap.get(path.a.part),pb=this.partMap.get(path.b.part),pulse=path.retiringAt===null&&path.progress<path.length?.16:.018;pa.energyGoal+=pulse;pb.energyGoal+=pulse;this.routePoint(path,0,a);for(let i=1;i<path.vertices.length;i++){if(path.distances[i-1]>=path.progress)break;this.routePoint(path,i,b);const end=path.distances[i];if(end>path.progress)b.lerpVectors(a,b,clamp((path.progress-path.distances[i-1])/(end-path.distances[i-1]),0,1));if(segments<MAX_SEGMENTS){const base=segments*12,col=segments*16;this.tracePositions.set([a.x,a.y,a.z,a.x,a.y,a.z,b.x,b.y,b.z,b.x,b.y,b.z],base);this.traceOthers.set([b.x,b.y,b.z,b.x,b.y,b.z,a.x,a.y,a.z,a.x,a.y,a.z],base);const c=path.layer===2?.84:.94;for(let k=0;k<4;k++)this.traceColors.set([c,c,c,alpha],col+k*4);segments++;}a.copy(b);if(end>path.progress)break;}if(path.retiringAt===null&&path.progress<path.length&&heads<MAX_PATHS)this.headGeometry.attributes.position.setXYZ(heads++,a.x,a.y+1,a.z);}
    this.traceGeometry.attributes.position.needsUpdate=true;this.traceGeometry.attributes.other.needsUpdate=true;this.traceGeometry.attributes.traceColor.needsUpdate=true;this.traceGeometry.setDrawRange(0,segments*6);this.headGeometry.attributes.position.needsUpdate=true;this.headGeometry.setDrawRange(0,heads);this.headCount=heads;for(const part of this.parts){part.energy=part.energy*.87+clamp(part.energyGoal,0,1)*.13;if(this.options.componentMotion>0)updateComponentAnimation(part.mesh,this.componentTime,part.energy);}
  }
  updateScene(){if(!this.board)return;this.updateBoard();this.updateComponents();this.updateTraces();}
  updateSelection(){const p=this.parts?.find(part=>part.id===this.selectedId);this.selectionOutline.visible=!!p;if(!p)return;this.selectionOutline.position.set(p.current.x,p.current.y+p.height/2,p.current.z);this.selectionOutline.rotation.y=p.angle;this.selectionOutline.scale.set(p.w*UNIT+12,p.height+10,p.h*UNIT+12);}
  draw(){if(this.destroyed||!this.renderer||!this.camera)return;this.renderer.render(this.scene,this.camera);this.emitLabels();}
  emitLabels(){
    if(!this.parts||!this.width||!this.height)return;this.camera.updateMatrixWorld();const labels=this.parts.map(part=>{_v.set(part.current.x,part.current.y+(part.mesh.userData.labelHeight||part.height)+9,part.current.z).project(this.camera);return{...part.metadata,x:(_v.x*.5+.5)*this.width,y:(-.5*_v.y+.5)*this.height,visible:this.options.labels&&_v.z>-1&&_v.z<1&&Math.abs(_v.x)<1.1&&Math.abs(_v.y)<1.1,selected:part.id===this.selectedId};});this.labels=labels;this.onLabels(labels);
  }
  snapshot(){return{connections:this.paths?.length||0,totalConnections:this.totalConnections||0,nodes:this.board?.pads.length||0,elapsed:this.elapsed||0,seed:this.seed,activeHeads:this.headCount||0,view:this.view,paused:this.paused,selectedId:this.selectedId,componentTime:this.componentTime||0,boardTime:this.boardTime||0,renderer:'WebGL',relocations:this.relocations||0,reroutes:this.reroutes||0,layoutVersion:this.layoutVersion||0,movingParts:this.parts?.filter(p=>p.journey).length||0,globalRelayouts:this.globalRelayouts||0,pendingReroutes:this.rerouteQueue?.length||0,componentCount:this.parts?.length||0,speciesCount:new Set(this.parts?.map(p=>p.kind)||[]).size,formation:this.formation,cycle:this.globalRelayouts||0};}
  emitStats(){this.onStats(this.snapshot());}
  exportPNG(){this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png');}
  exportSVG(){
    // The embedded rendered image preserves the shaded, genuinely 3D structure.
    // Labels remain SVG text so names are selectable in the exported document.
    const png=this.exportPNG(),labels=(this.labels||[]).filter(p=>p.visible).map(p=>`<text x="${p.x.toFixed(2)}" y="${(p.y-7).toFixed(2)}" text-anchor="middle" font-family="Georgia,serif" font-size="8" fill="#d5d5d5">${escapeXML(p.id+' '+(this.language==='en'?p.name:p.nameJa))}</text>`).join('');
    return`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><title>Random Wiring — ${escapeXML(this.seed)}</title><image width="100%" height="100%" href="${png}"/>${labels}</svg>`;
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();for(const[type,fn,options]of this.listeners)this.canvas.removeEventListener(type,fn,options);this.clearComponents();for(const object of [...this.scene.children])this.disposeObject(object);this.renderer.dispose();this.pointers.clear();}
}
