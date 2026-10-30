/** Physical and imagined components for a monochrome, kinetic circuit landscape. */
export const COMPONENT_KINDS = Object.freeze([
  ['qfp','U','QFP','Microcontroller','マイクロコントローラー','QFP package',6,6,16],
  ['dip','D','DIP','Logic package','ロジックパッケージ','Dual inline',2,4,18],
  ['header','J','HDR','Pin header','ピンヘッダー','Two-row contact array',4,2,22],
  ['connector','K','USB','Power connector','電源コネクター','Recessed metal socket',3,4,24],
  ['resistor','R','RES','Axial resistor','抵抗器','10 kΩ · study',3,1,9],
  ['capacitor','C','CAP','Electrolytic capacitor','電解コンデンサー','100 µF · study',2,2,35],
  ['inductor','L','COIL','Wound inductor','巻線インダクター','Visible helical winding',3,3,24],
  ['transistor','Q','FET','Switching transistor','スイッチングトランジスター','Three-terminal package',2,2,15],
  ['crystal','Y','XTAL','Quartz resonator','水晶振動子','16 MHz · study',3,2,15],
  ['ledbank','E','LIGHT','White light bank','白色光の列','Six gradual light cells',4,2,12],
  ['toroid','T','TOR','Toroidal winding','トロイダル巻線','Ferrite ring and turns',3,3,25],
  ['varicap','V','FIN','Variable capacitor','可変コンデンサー','Interleaved rotating fins',3,3,27],
  ['tube','N','TUBE','Clock lantern','クロックの灯','Imagined vacuum resonator',2,2,51],
  ['relay','A','RELAY','Miniature relay','小型リレー','Exposed contact arm',3,3,28],
  ['heatsink','H','SINK','Heat-sink tower','ヒートシンクの塔','Layered aluminum fins',3,3,42],
  ['antenna','B','AERIAL','Helical antenna','ヘリカルアンテナ','Spring-wire aerial',2,3,59],
  ['mirror','M','MEMS','Mirror sensor','ミラーセンサー','Tilting reflective plate',3,3,23],
  ['ring','O','ORBIT','Orbital resonator','軌道の共振器','Imagined rotating ring',3,3,33],
  ['gyro','G','GYRO','Gyroscopic cage','ジャイロの籠','Nested kinetic gimbals',4,4,45],
  ['lattice','W','WEAVE','Woven bridge','織られた橋','Imagined lattice conductor',6,3,34],
  ['iris','I','IRIS','Sensor iris','センサーの虹彩','Six opening metal blades',3,3,20],
  ['microdisplay','P','SCREEN','Micro display','マイクロディスプレイ','Monochrome light matrix',4,3,14],
  ['spring','S','SPRING','Telescopic contact','伸縮する接点','Spring-loaded metal crown',2,2,40],
  ['ceramicstack','F','STACK','Ceramic stack','セラミックの積層','Layered dielectric plates',2,3,32]
].map(([kind,prefix,label,name,nameJa,value,w,h,height])=>Object.freeze({kind,prefix,label,name,nameJa,value,w,h,height})));

function seeded(value) { let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);let n=h>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}; }
const BOARD_POLYGON=[[0,3.5],[3.5,0],[69.1666667,0],[80,6.8333333],[80,45.1666667],[75.4166667,52],[10.8333333,52],[0,44.75]];
function onBoard(x,y){for(let i=0;i<BOARD_POLYGON.length;i++){const a=BOARD_POLYGON[i],b=BOARD_POLYGON[(i+1)%BOARD_POLYGON.length];if((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])<0)return false;}return true;}
function shuffle(array,random){for(let i=array.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[array[i],array[j]]=[array[j],array[i]];}return array;}

/** The same seed produces stable IDs, dimensions and placement at every count. */
export function createComponentCatalog(seed='wiring',count=80) {
  const random=seeded(`${seed}:component-catalog-v2`), counters=new Map();
  // Build the full population before slicing so density changes preserve each identity.
  const parts=Array.from({length:112},(_,index)=>{
    const spec=COMPONENT_KINDS[index%COMPONENT_KINDS.length];
    const serial=(counters.get(spec.kind)||0)+1;counters.set(spec.kind,serial);
    const variant=random(),phase=random()*Math.PI*2;
    return {id:spec.prefix+String(serial).padStart(2,'0'),label:spec.label,name:spec.name,nameJa:spec.nameJa,value:spec.value,kind:spec.kind,w:spec.w,h:spec.h,height:spec.height*(.9+variant*.2),variant,phase,index,x:0,y:0,pads:[]};
  });
  // A sparse 15×12 slot backbone reserves extra cells for the few large objects.
  // Each component remains on integral 80×52 routing-grid coordinates.
  const occupied=new Uint8Array(15*12), anchors=shuffle(Array.from({length:180},(_,i)=>i),random);
  const ordered=[...parts].sort((a,b)=>Math.ceil((b.w+1)/5)*Math.ceil((b.h+1)/4)-Math.ceil((a.w+1)/5)*Math.ceil((a.h+1)/4)||a.index-b.index);
  for(const part of ordered){
    const cw=Math.ceil((part.w+1)/5),ch=Math.ceil((part.h+1)/4);
    let selected=-1;
    for(const cell of anchors){const col=cell%15,row=Math.floor(cell/15);if(col+cw>15||row+ch>12)continue;const px=2+col*5+Math.floor((cw*5-part.w)/2),py=2+row*4+Math.floor((ch*4-part.h)/2);if(![[px-1,py-1],[px+part.w+1,py-1],[px+part.w+1,py+part.h+1],[px-1,py+part.h+1]].every(([x,y])=>onBoard(x,y)))continue;let clear=true;for(let j=0;j<ch;j++)for(let i=0;i<cw;i++)if(occupied[(row+j)*15+col+i])clear=false;if(clear){selected=cell;break;}}
    if(selected<0)throw new Error('Component catalog packing failed');
    const col=selected%15,row=Math.floor(selected/15);for(let j=0;j<ch;j++)for(let i=0;i<cw;i++)occupied[(row+j)*15+col+i]=1;
    part.x=2+col*5+Math.floor((cw*5-part.w)/2);part.y=2+row*4+Math.floor((ch*4-part.h)/2);
  }
  const requested=Number.isFinite(Number(count))?Math.round(Number(count)):80;
  return parts.slice(0,Math.max(1,Math.min(112,requested)));
}
