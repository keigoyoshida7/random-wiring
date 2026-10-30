import * as THREE from './vendor/three.module.js';

export function getComponentMetadata(part) {
  return {id:part.id,name:part.name||part.label||part.kind,nameJa:part.nameJa||'電子部品',value:part.value||part.label||'—',kind:part.kind};
}

/** One component owns its meshes/materials; repeated details are locally instanced. */
export function createComponent(part) {
  const group=new THREE.Group();group.name=part.id;group.userData.partId=part.id;
  const w=part.w*12,d=part.h*12,H=part.height||24,phase=part.phase||0;
  const kinetics=[],lights=[],cache=new Map(),batches=new Map();
  const material={
    body:new THREE.MeshStandardMaterial({color:0x34383b,roughness:.6,metalness:.12}),
    top:new THREE.MeshStandardMaterial({color:0x62676a,roughness:.42,metalness:.35}),
    metal:new THREE.MeshStandardMaterial({color:0xc0c4c5,roughness:.25,metalness:.8}),
    brushed:new THREE.MeshStandardMaterial({color:0x929a9d,roughness:.4,metalness:.7}),
    dark:new THREE.MeshStandardMaterial({color:0x101315,roughness:.78,metalness:.08}),
    ceramic:new THREE.MeshStandardMaterial({color:0xc2c2b9,roughness:.64,metalness:.05}),
    white:new THREE.MeshStandardMaterial({color:0xd6d9d7,roughness:.38,metalness:.3}),
    light:new THREE.MeshStandardMaterial({color:0xdfe5e4,roughness:.33,metalness:.18,emissive:0xffffff,emissiveIntensity:.3}),
    glass:new THREE.MeshPhysicalMaterial({color:0xc1c9cd,roughness:.17,metalness:.05,transparent:true,opacity:.22,transmission:.18,thickness:1,depthWrite:false})
  };
  function geometry(key,create){if(!cache.has(key))cache.set(key,create());return cache.get(key);}
  const boxGeo=geometry('box',()=>new THREE.BoxGeometry(1,1,1));
  const cylGeo=geometry('cylinder',()=>new THREE.CylinderGeometry(1,1,1,18));
  const sphereGeo=geometry('sphere',()=>new THREE.SphereGeometry(1,12,8));
  function add(geo,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,parent=group){
    const key=`${parent.uuid}:${geo.uuid}:${mat.uuid}`;
    if(!batches.has(key))batches.set(key,{geo,mat,parent,items:[]});
    batches.get(key).items.push([x,y,z,sx,sy,sz,rx,ry,rz]);
  }
  function box(bw,bh,bd,x=0,y=bh/2,z=0,mat=material.body,rotation=[0,0,0],parent=group){add(boxGeo,mat,x,y,z,bw,bh,bd,...rotation,parent);}
  function cyl(radius,bh,x=0,y=bh/2,z=0,mat=material.metal,rotation=[0,0,0],parent=group){add(cylGeo,mat,x,y,z,radius,bh,radius,...rotation,parent);}
  function sphere(radius,x,y,z,mat=material.metal,parent=group){add(sphereGeo,mat,x,y,z,radius,radius,radius,0,0,0,parent);}
  function torus(radius,tube,x=0,y=0,z=0,mat=material.metal,rotation=[Math.PI/2,0,0],parent=group){const geo=geometry(`torus:${radius}:${tube}`,()=>new THREE.TorusGeometry(radius,tube,6,32));add(geo,mat,x,y,z,1,1,1,...rotation,parent);}
  function wire(a,b,r=.8,mat=material.metal,parent=group){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q),p=av.add(bv).multiplyScalar(.5);add(cylGeo,mat,p.x,p.y,p.z,r,delta.length(),r,e.x,e.y,e.z,parent);}
  function rounded(bw,bh,bd,r,x=0,y=0,z=0,mat=material.body,parent=group){
    const rr=Math.min(r,bw*.45,bd*.45);
    const geo=geometry(`round:${bw}:${bh}:${bd}:${rr}`,()=>{const a=-bw/2,b=-bd/2,s=new THREE.Shape();s.moveTo(a+rr,b);s.lineTo(a+bw-rr,b);s.quadraticCurveTo(a+bw,b,a+bw,b+rr);s.lineTo(a+bw,b+bd-rr);s.quadraticCurveTo(a+bw,b+bd,a+bw-rr,b+bd);s.lineTo(a+rr,b+bd);s.quadraticCurveTo(a,b+bd,a,b+bd-rr);s.lineTo(a,b+rr);s.quadraticCurveTo(a,b,a+rr,b);const g=new THREE.ExtrudeGeometry(s,{depth:bh,bevelEnabled:false,curveSegments:3,steps:1});g.rotateX(-Math.PI/2);return g;});
    add(geo,mat,x,y,z,1,1,1,0,0,0,parent);
  }
  function dynamic(mode,settings={},parent=group){const object=new THREE.Group();parent.add(object);kinetics.push({object,mode,phase,...settings});return object;}
  function plate(){rounded(w*.86,3,d*.82,2,0,1,0,material.body);}
  function leads(count=2){
    if(count===2){for(const sign of[-1,1])box(12,2,3,sign*(w/2+3),1.5,0,material.metal);}
    else for(let i=0;i<count;i++){const x=-w*.35+(count===1?0:i*w*.7/(count-1));box(3,2,10,x,1,d/2+3,material.metal);}
  }
  function helix(radius,bh,turns,originY,parent=group,mat=material.brushed,axis='y'){
    const pts=[];for(let i=0;i<=turns*18;i++){const t=i/(turns*18),a=t*turns*Math.PI*2;pts.push(axis==='y'?new THREE.Vector3(Math.cos(a)*radius,originY+t*bh,Math.sin(a)*radius):new THREE.Vector3(Math.cos(a)*radius,originY+Math.sin(a)*radius,-bh/2+t*bh));}
    const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),turns*18,.85,5,false);add(geo,mat,0,0,0,1,1,1,0,0,0,parent);
  }
  function lum(){if(!lights.length)lights.push(material.light);return material.light;}

  switch(part.kind){
    case 'qfp': {
      rounded(w,H-5,d,3,0,5,0,material.body);rounded(w-5,1.2,d-5,2,0,H,0,material.top);
      const n=6;for(let i=0;i<n;i++){const a=(i-(n-1)/2)*w*.13,b=(i-(n-1)/2)*d*.13;for(const s of[-1,1]){box(2,2,10,a,1.5,s*(d/2+4),material.metal);box(2,6,2,a,4,s*(d/2+1),material.metal);box(10,2,2,s*(w/2+4),1.5,b,material.metal);box(2,6,2,s*(w/2+1),4,b,material.metal);}}
      box(w*.37,.4,1.2,-w*.12,H+1.4,0,material.brushed);cyl(1.8,.5,-w*.34,H+1.5,-d*.34,material.white);break;
    }
    case 'dip': {
      rounded(w,H-4,d,2,0,4,0,material.body);rounded(w-3,1,d-3,1.5,0,H,0,material.top);
      const n=4;for(let i=0;i<n;i++)for(const s of[-1,1]){const z=(i-(n-1)/2)*d*.21;box(10,2,3,s*(w/2+3),1.5,z,material.metal);box(2,8,3,s*(w/2+1),5,z,material.metal);}
      cyl(2.5,.5,0,H+1.1,-d*.34,material.dark);break;
    }
    case 'header': {
      rounded(w,7,d+1,2,0,1,0,material.body);for(let i=0;i<6;i++)for(const s of[-1,1]){const x=-w*.4+i*w*.16,z=s*d*.28;box(2.3,H+2,2.3,x,H/2+1,z,material.metal);box(4,1,4,x,8,z,material.dark);}break;
    }
    case 'connector': {
      const bh=H*.8;rounded(w,2,d*.85,3,0,2,0,material.brushed);rounded(w,2,d*.85,3,0,bh,0,material.metal);box(2,bh-2,d*.85,-w/2+1,bh/2+1,0,material.metal);box(2,bh-2,d*.85,w/2-1,bh/2+1,0,material.metal);box(w-4,bh-4,2,0,bh/2+2,d*.4,material.dark);box(w*.73,3,d*.8,0,bh*.43,d*.02,material.dark);for(let i=0;i<7;i++)box(1.2,.8,d*.42,-w*.3+i*w*.1,bh*.43+1.8,-d*.1,material.metal);for(const s of[-1,1])for(const z of[-d*.25,d*.25])box(9,2,4,s*(w/2+2),1.5,z,material.metal);break;
    }
    case 'resistor': {
      const r=Math.min(d*.35,4.5),bh=w*.65,y=r+3;cyl(r,bh,0,y,0,material.ceramic,[0,0,Math.PI/2]);for(const f of[-.3,-.1,.1,.32])cyl(r+.2,2, bh*f,y,0,material.body,[0,0,Math.PI/2]);for(const s of[-1,1]){wire([s*bh/2,y,0],[s*(w/2+9),2,0],.75);}break;
    }
    case 'capacitor': {
      const r=Math.min(w,d)*.43;cyl(r+1,3,0,2.5,0,material.dark);cyl(r,H-5,0,(H-5)/2+3,0,material.brushed);cyl(r*.91,1.5,0,H-1,0,material.metal);box(r*1.4,.5,.8,0,H,0,material.dark);box(.8,.5,r*1.4,0,H,0,material.dark);const stripe=geometry('cap-stripe',()=>new THREE.CylinderGeometry(r+.12,r+.12,H-8,12,1,true,-.25,.35));add(stripe,material.ceramic,0,(H-8)/2+4,0);leads();break;
    }
    case 'inductor': {
      plate();const r=Math.min(w,d)*.3;cyl(r*.8,d*.65,0,r+4,0,material.dark,[Math.PI/2,0,0]);helix(r,d*.7,7,r+4,group,material.metal,'z');leads();break;
    }
    case 'transistor': {
      rounded(w*.7,H-3,d*.7,2,0,3,0,material.body);box(w*.5,.8,d*.48,0,H+.4,0,material.top);for(const s of[-1,1])box(w*.45,2,3,s*w*.46,1.5,-d*.2,material.metal);box(3,2,d*.5,-w*.1,1.5,d*.5,material.metal);break;
    }
    case 'crystal': {
      rounded(w*.95,3,d*.9,5,0,1,0,material.brushed);rounded(w*.85,H-3,d*.7,5,0,4,0,material.metal);box(w*.35,.4,1,0,H+1.4,0,material.top);leads();break;
    }
    case 'ledbank': {
      plate();for(let i=0;i<6;i++){const x=(i-2.5)*w*.145;box(w*.12,4,d*.6,x,6,0,material.dark);rounded(w*.09,3,d*.45,1,x,8,0,i%2?lum():material.white);}leads();break;
    }
    case 'toroid': {
      plate();const r=Math.min(w,d)*.29;torus(r,r*.3,0,r*.55+4,0,material.dark);for(const sign of[-1,1]){cyl(1.7,7,sign*r*.82,6.5,0,material.brushed);wire([sign*r,r*.55+4,0],[sign*(w/2+3),2,0],.85,material.metal);}for(let i=0;i<14;i++){const a=i*Math.PI*2/14,geo=geometry('toroid-loop',()=>new THREE.TorusGeometry(r*.36,.75,5,10));add(geo,material.metal,Math.cos(a)*r,r*.55+4,Math.sin(a)*r,1,1,1,0,-a,0);}leads();break;
    }
    case 'varicap': {
      plate();const r=Math.min(w,d)*.35;for(let i=0;i<7;i++)box(w*.78,.8,d*.68,0,5+i*2.7,0,material.brushed);
      const rotor=dynamic('spin',{axis:'y',speed:.21});rotor.position.y=5;for(let i=0;i<7;i++)box(w*.68,.8,d*.47,0,i*2.7+1.3,0,material.metal,[0,0,0],rotor);cyl(2,H,0,H/2+2,0,material.metal);cyl(4,4,0,H+1,0,material.top);leads();break;
    }
    case 'tube': {
      const r=Math.min(w,d)*.32;cyl(r+2,5,0,3,0,material.body);cyl(r,H-10,0,(H-10)/2+6,0,material.glass);cyl(r*.8,1.7,0,H-4,0,material.brushed);cyl(r*.22,H*.56,0,H*.39,0,material.dark);for(const s of[-1,1])wire([s*r*.4,6,0],[s*r*.4,H-8,0],.6,material.metal);helix(r*.46,H*.55,6,8,group,lum());leads();break;
    }
    case 'relay': {
      plate();box(w*.55,H*.6,d*.6,-w*.1,H*.3+5,0,material.top);helix(w*.19,H*.4,5,5,group,material.brushed);const arm=dynamic('rock',{axis:'z',amp:.12,speed:.7});arm.position.set(0,H*.72,0);box(w*.82,1.5,4,0,0,0,material.metal,[0,0,0],arm);for(const s of[-1,1])cyl(2,5,s*w*.33,H*.63,0,material.white);box(w*.9,H*.75,d*.86,0,H*.45,0,material.glass);leads();break;
    }
    case 'heatsink': {
      plate();box(w*.68,H*.8,d*.66,0,H*.4+3,0,material.brushed);for(let i=0;i<9;i++)box(w,.85,d,(0),7+i*(H-9)/8,0,i%2?material.metal:material.top);cyl(2.8,H+2,0,H/2+1,0,material.metal);leads();break;
    }
    case 'antenna': {
      plate();cyl(3,12,0,8,0,material.metal);helix(Math.min(w,d)*.22,H*.65,7,11,group,material.metal);wire([0,11,0],[Math.min(w,d)*.22,11,0],.85,material.metal);wire([Math.min(w,d)*.22,11+H*.65,0],[0,11+H*.65,0],.85,material.metal);cyl(1.2,H*.15,0,H*.9,0,material.white);sphere(1.7,0,H*.98,0,material.white);leads();break;
    }
    case 'mirror': {
      plate();const r=Math.min(w,d)*.3;cyl(r,4,0,5,0,material.brushed);for(const s of[-1,1])box(2,H*.6,3,s*r,H*.3+5,0,material.metal);cyl(.95,r*2+3,0,H*.63,0,material.metal,[0,0,Math.PI/2]);const tilting=dynamic('rock',{axis:'x',amp:.32,speed:.6});tilting.position.y=H*.63;rounded(w*.69,1.3,d*.64,2,0,0,0,material.metal,tilting);box(w*.54,.6,d*.49,0,1,0,material.white,[0,0,0],tilting);leads();break;
    }
    case 'ring': {
      plate();const r=Math.min(w,d)*.34,cy=r+6;cyl(1.5,cy-2,0,(cy+4)/2,0,material.brushed);sphere(2.5,0,cy,0,material.metal);const orbit=dynamic('spin',{axis:'y',speed:.33});orbit.position.y=cy;torus(r,1.1,0,0,0,material.metal,[0,0,0],orbit);for(let i=0;i<5;i++){const a=i*Math.PI*2/5,tip=[Math.cos(a)*r,Math.sin(a)*r,0];wire([0,0,0],tip,.65,material.brushed,orbit);sphere(1.9,...tip,lum(),orbit);}leads();break;
    }
    case 'gyro': {
      plate();const r=Math.min(w,d)*.34,cy=r+7;cyl(1.6,cy-2,0,(cy+4)/2,0,material.brushed);sphere(2.5,0,cy,0,material.metal);const outer=dynamic('spin',{axis:'y',speed:.17});outer.position.y=cy;torus(r,1.1,0,0,0,material.metal,[0,0,0],outer);wire([-r,0,0],[r,0,0],.75,material.brushed,outer);const inner=dynamic('spin',{axis:'x',speed:.27},outer);torus(r*.74,1.2,0,0,0,material.brushed,[Math.PI/2,0,0],inner);wire([0,0,-r*.74],[0,0,r*.74],.65,material.metal,inner);const core=dynamic('spin',{axis:'z',speed:.42},inner);torus(r*.46,1,0,0,0,material.white,[0,0,0],core);wire([-r*.46,0,0],[r*.46,0,0],.6,material.brushed,core);sphere(r*.18,0,0,0,lum(),core);leads();break;
    }
    case 'lattice': {
      const z=d*.36;for(const s of[-1,1])box(w,3,3,0,3,s*z,material.brushed);const bridge=dynamic('arch',{amp:.045,speed:.57});for(let i=0;i<7;i++){const x=-w*.46+i*w*.92/6,y=7+Math.sin(i*Math.PI/6)*H*.7;wire([x,4,-z],[x,y,0],.75,material.metal,bridge);wire([x,y,0],[x,4,z],.75,material.metal,bridge);if(i<6){const nx=x+w*.92/6,ny=7+Math.sin((i+1)*Math.PI/6)*H*.7;wire([x,y,-z*.35],[nx,ny,z*.35],.65,material.white,bridge);wire([x,y,z*.35],[nx,ny,-z*.35],.65,material.white,bridge);}}leads();break;
    }
    case 'iris': {
      plate();const r=Math.min(w,d)*.34;torus(r,2,0,8,0,material.brushed);cyl(r*.84,2,0,5,0,material.dark);cyl(r*.28,1.4,0,6.5,0,lum());for(let i=0;i<6;i++){const a=i*Math.PI/3,blade=dynamic('iris',{axis:'y',base:a,amp:.34,speed:.55});cyl(1.1,4.5,Math.cos(a)*r*.56,7,Math.sin(a)*r*.56,material.metal);blade.position.set(Math.cos(a)*r*.56,9,Math.sin(a)*r*.56);box(r*.84,.8,r*.34,-r*.19,0,0,material.metal,[0,0,0],blade);}leads();break;
    }
    case 'microdisplay': {
      plate();rounded(w*.94,6,d*.89,2,0,4,0,material.top);box(w*.82,1,d*.72,0,10,0,material.dark);for(let j=0;j<4;j++)for(let i=0;i<7;i++){if((i+j+Math.floor((part.variant||0)*5))%4!==0)box(w*.075,.8,d*.105,(i-3)*w*.105,10.8,(j-1.5)*d*.15,(i+j)%3?lum():material.brushed);}const scan=dynamic('scan',{amp:w*.33,speed:.36});scan.position.y=10.6;box(.8,.3,d*.6,0,0,0,material.white,[0,0,0],scan);leads(4);break;
    }
    case 'spring': {
      const r=Math.min(w,d)*.3;cyl(r+1,5,0,3,0,material.body);cyl(r*.58,H*.35,0,H*.175+3,0,material.brushed);const spring=dynamic('spring',{amp:.1,speed:.63});spring.position.y=5;helix(r,H*.63,7,0,spring,material.metal);const crown=dynamic('lift',{amp:3,speed:.63,baseY:H*.72});cyl(r*.3,H*.58,0,-H*.29,0,material.metal,[0,0,0],crown);cyl(r*.8,3,0,0,0,material.metal,[0,0,0],crown);cyl(r*.47,4,0,3,0,material.white,[0,0,0],crown);leads();break;
    }
    case 'ceramicstack': {
      plate();for(let i=0;i<7;i++){const layer=dynamic('rock',{axis:'z',amp:.06,speed:.45,phase:phase+i*.17});layer.position.y=5+i*(H-7)/7;box(w*.87,2,d*.78,0,0,0,i%2?material.ceramic:material.top,[0,0,0],layer);}for(const s of[-1,1])box(2,H,3,s*w*.4,H/2,0,material.metal);leads();break;
    }
    default: {plate();rounded(w*.7,H-4,d*.7,2,0,4,0,material.top);leads();}
  }
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),euler=new THREE.Euler();
  for(const batch of batches.values()){
    const object=new THREE.InstancedMesh(batch.geo,batch.mat,batch.items.length);object.name=part.id+' detail';object.userData.partId=part.id;
    for(let i=0;i<batch.items.length;i++){const [x,y,z,sx,sy,sz,rx,ry,rz]=batch.items[i];position.set(x,y,z);scale.set(sx,sy,sz);euler.set(rx,ry,rz);quaternion.setFromEuler(euler);matrix.compose(position,quaternion,scale);object.setMatrixAt(i,matrix);}
    object.computeBoundingSphere();batch.parent.add(object);
  }
  group.userData.kinetics=kinetics;group.userData.lightMaterials=lights;group.userData.labelHeight=Math.max(H+9,part.kind==='gyro'?Math.min(w,d)*.68+16:H+9);group.userData.animationPhase=phase;
  group.traverse(object=>{object.userData.partId=part.id;});
  updateComponentAnimation(group,0,1);
  return group;
}

/** Absolute-clock animation remains deterministic and freezes with the engine clock. */
export function updateComponentAnimation(group,time=0,energy=1){
  if(!Number.isFinite(time)||!Number.isFinite(energy)||energy<=0)return;
  const t=time,phase=group.userData.animationPhase||0;
  for(const k of group.userData.kinetics||[]){const wave=Math.sin(t*(k.speed||.5)+(k.phase??phase));
    if(k.mode==='spin')k.object.rotation[k.axis||'y']=(k.base||0)+t*k.speed+(k.phase||0);
    else if(k.mode==='rock')k.object.rotation[k.axis||'z']=(k.base||0)+(k.amp||.1)*wave;
    else if(k.mode==='iris')k.object.rotation.y=(k.base||0)+.28+(k.amp||.3)*wave;
    else if(k.mode==='float')k.object.position.y=(k.amp||1)*(.5+.5*wave);
    else if(k.mode==='arch')k.object.scale.y=1+(k.amp||.04)*wave;
    else if(k.mode==='scan')k.object.position.x=(k.amp||3)*wave;
    else if(k.mode==='lift')k.object.position.y=(k.baseY||0)+(k.amp||2)*wave;
    else if(k.mode==='spring')k.object.scale.y=.95+(k.amp||.1)*wave;
  }
  const pulse=.18+.58*(.5+.5*Math.sin(t*.73+phase));
  for(const material of group.userData.lightMaterials||[])material.emissiveIntensity=pulse*Math.min(1.5,energy);
}
