/** Spatial scores for a circuit that periodically reorganises into a new machine ecology. */
export const FORMATIONS = Object.freeze(['archipelago', 'spiral', 'crown', 'weave', 'scatter']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function formationAnchors(count, formation='archipelago', phase=0) {
  const anchors=[];
  for(let i=0;i<count;i++){
    const t=(i+.5)/count,angle=i*2.399963229728653+phase;let x=0,z=0;
    if(formation==='spiral'){
      const theta=t*Math.PI*5.2+phase,r=.12+.88*t;x=Math.cos(theta)*385*r;z=Math.sin(theta)*235*r;
    }else if(formation==='crown'){
      const band=i%3,theta=Math.floor(i/3)/Math.ceil(count/3)*Math.PI*2+phase+(band%2)*.075,r=.46+band*.25;x=Math.cos(theta)*390*r;z=Math.sin(theta)*238*r;
    }else if(formation==='weave'){
      const lane=i%6,u=(Math.floor(i/6)+.5)/Math.ceil(count/6);x=(u*2-1)*385;z=Math.sin(u*Math.PI*1.7+Math.floor(lane/2)*1.7)*118+(lane%2?1:-1)*32+(Math.floor(lane/2)-1)*40;
    }else if(formation==='archipelago'){
      const centers=[[-270,-145],[250,-140],[-260,145],[265,145],[0,0]],cluster=i%5,c=centers[cluster],r=Math.sqrt((Math.floor(i/5)+.5)/Math.ceil(count/5));x=c[0]+Math.cos(angle)*125*r;z=c[1]+Math.sin(angle)*92*r;
    }else{
      const columns=Math.ceil(Math.sqrt(count*1.6)),rows=Math.ceil(count/columns);x=((i%columns+.5)/columns*2-1)*400;z=((Math.floor(i/columns)+.5)/rows*2-1)*245;
    }
    anchors.push({x:clamp(x,-405,405),z:clamp(z,-245,245),cluster:formation==='archipelago'?i%5:Math.floor(t*6)});
  }
  return anchors;
}

/** Largest-first packing follows a spatial score, while keeping every identity travelling. */
export function planFormation(parts,{formation='archipelago',cycle=0,random=Math.random,deform,time=0}={}) {
  const count=parts.length,anchors=formationAnchors(count,formation,cycle*.71),ordered=[...parts].sort((a,b)=>b.w*b.h-a.w*a.h);
  for(let restart=0;restart<12;restart++){
    const planned=[],available=anchors.map((p,i)=>({...p,index:i}));let failed=false;
    for(const part of ordered){
      const elevation=0,maxX=430-part.w*12*.68,maxZ=267-part.h*12*.68;let slot=null;
      for(let attempt=0;attempt<230;attempt++){
        const anchor=available[(part.index*37+cycle*17+attempt*11+restart*7)%available.length],spread=attempt<24?10+attempt*1.3:Math.min(115,35+attempt*.6);
        let x=anchor.x+(random()*2-1)*spread,z=anchor.z+(random()*2-1)*spread;if(attempt>170){x=(random()*2-1)*maxX;z=(random()*2-1)*maxZ;}
        x=clamp(x,-maxX,maxX);z=clamp(z,-maxZ,maxZ);const distance=Math.hypot(x-part.logicalX,z-part.logicalZ);if(distance<150)continue;
        const world=deform(x,z,time);let valid=true;
        for(const other of planned){if(Math.abs(world.x-other.world.x)<(part.w+other.part.w)*6+5&&Math.abs(world.z-other.world.z)<(part.h+other.part.h)*6+5){valid=false;break;}}
        if(valid){slot={part,x,z,distance,world,elevation,cluster:anchor.cluster,anchor:anchor.index};break;}
      }
      if(!slot){failed=true;break;}planned.push(slot);const used=available.findIndex(p=>p.index===slot.anchor);if(used>=0)available.splice(used,1);
    }
    if(!failed)return planned;
  }
  return null;
}
