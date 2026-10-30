export const radians = n => n * Math.PI / 180;
export const degrees = n => n * 180 / Math.PI;
export const normalize = n => (n % 360 + 360) % 360;
export const deltaAngle = (a,b) => ((a-b+540)%360)-180;
export function distance(a,b) {
  const p=radians(b.lat-a.lat), q=radians(b.lng-a.lng);
  const h=Math.sin(p/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(q/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function bearing(a,b) {
  const p=radians(a.lat),q=radians(b.lat),d=radians(b.lng-a.lng);
  return normalize(degrees(Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))));
}
export function validPoint(p) {return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=85 && Math.abs(p.lng)<=180;}
export function formatDistance(m) {return m>=1000?`${(m/1000).toFixed(1)}km`:`${Math.round(m)}m`;}
export function formatDuration(s) {const m=Math.max(1,Math.round(s/60));return m>=60?`${Math.floor(m/60)}시간 ${m%60}분`:`${m}분`;}
export function sanitizeStops(stops) {
  if(!Array.isArray(stops)) return [];
  return stops.filter(validPoint).slice(0,12).map((p,i)=>({id:String(p.id||`p-${i}`),name:String(p.name||'선택한 위치').slice(0,120),lat:p.lat,lng:p.lng,kind:String(p.kind||'장소').slice(0,40)}));
}
export function distanceToLine(p,coords) {
  let min=Infinity;
  const k=111320, cos=Math.cos(radians(p.lat));
  for(let i=1;i<coords.length;i++){
    const a={x:(coords[i-1][0]-p.lng)*k*cos,y:(coords[i-1][1]-p.lat)*k},b={x:(coords[i][0]-p.lng)*k*cos,y:(coords[i][1]-p.lat)*k};
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1)));
    min=Math.min(min,Math.hypot(a.x+t*dx,a.y+t*dy));
  }
  return min;
}
export function wingCenter(center,width,height){return {x:width<430?width/2:Math.max(116,Math.min(width-116,center.x)),y:Math.max(Math.min(wingRadius(width,height)+50,height/2),Math.min(height-wingRadius(width,height)-110,center.y))};}
export function wingLayout(items,center,width,height,heading=0) {
  const radius=wingRadius(width,height);
  const {x:cx,y:cy}=wingCenter(center,width,height);
  // Keep geographic ordering but space hit targets evenly to avoid overlapping labels.
  const sorted=[...items].sort((a,b)=>normalize(a.bearing-heading)-normalize(b.bearing-heading));
  const span=Math.min(300,Math.max(150,sorted.length*48));
  const slots={1:[-90],2:[-135,-45],3:[-150,-90,-30],4:[-210,-140,-40,30],5:[-210,-150,-90,-30,30]}[sorted.length];
  return sorted.map((item,i)=>{const angle=radians(slots?slots[i]:-90-span/2+span*i/(sorted.length-1));return {...item,x:Math.max(58,Math.min(width-58,cx+Math.cos(angle)*radius)),y:Math.max(28,Math.min(height-28,cy+Math.sin(angle)*radius))};});
}
export function maneuverText(step) {
  const m=step?.maneuver||{},d={'left':'좌회전','right':'우회전','slight left':'왼쪽 방향','slight right':'오른쪽 방향','sharp left':'크게 좌회전','sharp right':'크게 우회전','straight':'직진','uturn':'유턴'};
  if(m.type==='arrive')return '목적지 도착';
  if(m.type==='depart')return `${step.name||'도로'} 방향으로 출발`;
  if(m.type==='roundabout'||m.type==='rotary')return `회전교차로 ${m.exit||''}번 출구`;
  return `${d[m.modifier]||'계속 이동'}${step.name?' · '+step.name:''}`;
}

export function restoreJourney(saved,fallback) {
  const data=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  const manualOrigin=data.manualOrigin===true&&validPoint(data.origin);
  return {origin:manualOrigin?{lat:data.origin.lat,lng:data.origin.lng}:{...fallback},manualOrigin,stops:sanitizeStops(data.stops),trace:Array.isArray(data.trace)?data.trace.filter(p=>Array.isArray(p)&&p.length===2&&validPoint({lng:p[0],lat:p[1]})).slice(-3000):[]};
}
export function journeySnapshot(state) {
  return {...(state.manualOrigin?{manualOrigin:true,origin:{...state.origin}}:{}),stops:state.stops,trace:state.trace.slice(-3000)};
}
export function wingRadius(width,height){return Math.min(160,Math.max(120,Math.min(width,height)*.25));}
export function wingFooter(center,width,height){const {x,y}=wingCenter(center,width,height);return {x,moreY:y+108,originY:y+64,closeY:y-58};}
export function coordinateChoice(point){return {lat:point.lat,lng:point.lng,id:'coordinate',name:'지도에서 선택한 위치',kind:'지정 위치',distance:0,bearing:359};}
export function clampPointer(point,bounds){
  const left=bounds.left,right=Math.max(left,bounds.right),top=bounds.top,bottom=Math.max(top,bounds.bottom);
  const x=Number.isFinite(point.x)?point.x:(left+right)/2,y=Number.isFinite(point.y)?point.y:(top+bottom)/2;
  return {x:Math.max(left,Math.min(right,x)),y:Math.max(top,Math.min(bottom,y)),docked:x<left||x>right||y<top||y>bottom};
}
