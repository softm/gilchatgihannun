import {distance,bearing,normalize,deltaAngle,formatDistance,formatDuration,sanitizeStops,wingLayout,wingCenter,wingFooter,restoreJourney,journeySnapshot,coordinateChoice,distanceToLine,maneuverText,validPoint} from './core.js?v=20261031.1';
import {CONFIG,nearby,routes as fetchRoutes} from './providers.js?v=20261031.1';
import {rasterAdapter} from './raster-map.js?v=20261031.1';
let maps=window.maplibregl;let raster=false;
const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
const fallback={lat:37.4785,lng:126.854};
let saved={};try{saved=JSON.parse(localStorage.getItem('gilchatgi.v1')||'{}');}catch{}
const state={...restoreJourney(saved,fallback),gps:null,heading:0,hasHeading:false,category:'all',radius:500,routes:[],selected:0,nav:false,next:0,follow:false,mode:'map',focus:0,pitch:45,poi:[],page:0,probe:null};
let suppressHandleClickUntil=0,modeSeq=0,wingRenderKey=null,wingFrame=null;
let map,handle,gpsMarker,stopMarkers=[],placeMarkers=[],searchController,searchSeq=0,routeController,routeSeq=0,searchTimer,drag=null,wingPoints=[],hovered=null,stream=null,toastTimer,watch=null,rerouteAt=0,offRouteCount=0,stepIndex=0,orientationListening=false;
const colors=['#078563','#6684c5','#bd885a'];
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function persist(){try{localStorage.setItem('gilchatgi.v1',JSON.stringify(journeySnapshot(state)));}catch{}}
function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function feature(coords,type='LineString'){return {type:'Feature',properties:{},geometry:{type,coordinates:coords}};}
function lineSource(id,coords,color,width=5,dash){if(!map.isStyleLoaded())return;const data=feature(coords.length>=2?coords:[]);if(map.getSource(id)){map.getSource(id).setData(data);return;}map.addSource(id,{type:'geojson',data});map.addLayer({id,type:'line',source:id,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':color,'line-width':width,'line-opacity':.88,...(dash?{'line-dasharray':dash}:{})}});}
function updateTrace(){lineSource('trace',state.trace,'#3588f1',4);}
function invalidateRoute(){routeSeq++;routeController?.abort();state.routes=[];state.nav=false;state.next=0;$('route-results').replaceChildren();$('navigation').hidden=true;syncNative();$('route').disabled=!state.stops.length;$('route').textContent='경로 탐색 ↗';if(map?.isStyleLoaded()){for(let i=0;i<3;i++){if(map.getLayer(`route-${i}`))map.removeLayer(`route-${i}`);if(map.getSource(`route-${i}`))map.removeSource(`route-${i}`);}}}
function changed(){invalidateRoute();renderStops();persist();}
function originDetails(){return state.manualOrigin?`${state.origin.lat.toFixed(5)}, ${state.origin.lng.toFixed(5)} · 직접 지정한 출발지`:state.gps?`${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)} · 정확도 ±${Math.round(state.gps.accuracy)}m`:'현재 위치를 사용하거나 지점으로 출발하세요';}
function updateOrigin(point,name){if(!validPoint(point))return;state.origin={lat:point.lat,lng:point.lng};$('origin-name').textContent=name;$('location-status').textContent=originDetails();if(!drag&&!state.probe&&!state.stops.length)handle?.setLngLat([point.lng,point.lat]);}
function renderStops(){
  $('stop-count').textContent=state.stops.length;$('empty').hidden=!!state.stops.length;$('route').disabled=!state.stops.length;
  $('stops').replaceChildren();stopMarkers.forEach(m=>m.remove());stopMarkers=[];
  state.stops.forEach((p,i)=>{
    const row=make('li','stop-row'),num=make('span','stop-num',String(i+1)),main=make('button','stop-main');main.append(make('strong','',p.name),make('small','',`${p.kind||'장소'} · 길게 눌러 다음 장소 추가`));
    main.onclick=()=>{if(Date.now()<suppressHandleClickUntil)return;stopMarkers.forEach(m=>m.getElement().classList.remove('active'));map.flyTo({center:[p.lng,p.lat],zoom:16});stopMarkers[i]?.getElement().classList.add('active');};
    const actions=make('div','stop-actions');for(const [label,title,action,disabled] of [['↑','앞 순서로',()=>reorder(i,-1),i===0],['↓','뒤 순서로',()=>reorder(i,1),i===state.stops.length-1],['×','목적지 삭제',()=>{state.stops.splice(i,1);changed();},false]]){const b=make('button','',label);b.title=title;b.setAttribute('aria-label',`${p.name} ${title}`);b.onclick=action;b.disabled=disabled;actions.append(b);}
    row.append(num,main,actions);$('stops').append(row);
    if(map){const pin=make('button','place-pin',String(i+1));pin.title=`${p.name} · 길게 눌러 다음 장소 연결`;bindLongPress(pin,p);const marker=new maps.Marker({element:pin}).setLngLat([p.lng,p.lat]).addTo(map);stopMarkers.push(marker);}
    bindLongPress(main,p);
  });
  lineSource('plan',[[state.origin.lng,state.origin.lat],...state.stops.map(p=>[p.lng,p.lat])],'#618c76',2,[2,3]);
}
function reorder(i,d){[state.stops[i],state.stops[i+d]]=[state.stops[i+d],state.stops[i]];changed();}
function addStop(p){if(p.id==='coordinate')p={...p,id:`point-${Date.now()}`};if(state.stops.length>=12)return toast('목적지는 최대 12곳까지 추가할 수 있습니다.');if(state.stops.some(s=>s.id===p.id))return toast('이미 동선에 있는 장소입니다.');state.stops.push(...sanitizeStops([p]));hideWings();document.body.classList.remove('panel-collapsed');$('toggle-panel').textContent='접기 ⌄';changed();toast(`${state.stops.length}번째 목적지에 추가했습니다.`);handle.setLngLat([p.lng,p.lat]);$('hint').textContent='목적지를 길게 눌러 다음 장소를 연결하세요';}
function bindLongPress(el,p){let timer,start;el.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;startDrag(e,el,p);},450);});el.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>9)clearTimeout(timer);});for(const name of ['pointerup','pointercancel','pointerleave'])el.addEventListener(name,()=>clearTimeout(timer));el.addEventListener('contextmenu',e=>e.preventDefault());}
function pointerPoint(e){const rect=$('map').getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};}
function startDrag(e,el,anchor){if(!map)return;e.preventDefault();e.stopPropagation();hideWings();state.probe={lat:anchor.lat,lng:anchor.lng};state.follow=false;drag={pointer:e.pointerId,el,anchor,point:pointerPoint(e),active:null};el.setPointerCapture(e.pointerId);map.dragPan.disable();$('hint').hidden=true;handle.setLngLat([anchor.lng,anchor.lat]);lineSource('drag-link',[[anchor.lng,anchor.lat],[anchor.lng,anchor.lat]],'#078563',3,[2,2]);}
function candidateAt(e){return wingPoints.find(w=>{const b=$$('#wing-items button').find(b=>b.dataset.id===w.id);if(!b)return false;const r=b.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;})||null;}
function moveDrag(e){if(!drag||drag.pointer!==e.pointerId)return;e.preventDefault();const p=pointerPoint(e);drag.point=p;hovered=candidateAt(e);
  $$('#wing-items button').forEach(b=>b.classList.toggle('active',b.dataset.id===hovered?.id));
  if(hovered){clearTimeout(searchTimer);return;}
  const ll=map.unproject([p.x,p.y]);const point={lng:ll.lng,lat:ll.lat};handle.setLngLat(ll);state.probe=point;
  lineSource('drag-link',[[drag.anchor.lng,drag.anchor.lat],[point.lng,point.lat]],'#078563',3,[2,2]);
  if(p.x<28||p.x>$('map').clientWidth-28||p.y<90||p.y>$('map').clientHeight-50)map.panBy([p.x<28?-3:p.x>$('map').clientWidth-28?3:0,p.y<90?-3:p.y>$('map').clientHeight-50?3:0],{duration:0});
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(point),550);
}
function endDrag(e){if(!drag||drag.pointer!==e.pointerId)return;const selected=candidateAt(e);const cancelled=e.type==='pointercancel';try{drag.el.releasePointerCapture(e.pointerId);}catch{}const anchor=drag.anchor;drag=null;map.dragPan.enable();clearTimeout(searchTimer);if(!state.probe)state.probe=anchor;suppressHandleClickUntil=Date.now()+300;if(cancelled){hideWings();return;}if(selected)addStop(selected);else if(state.probe)search(state.probe);}
function hideWings(){searchSeq++;searchController?.abort();clearTimeout(searchTimer);$('wings').hidden=true;state.probe=null;state.poi=[];wingRenderKey=null;wingPoints=[];hovered=null;placeMarkers.forEach(m=>m.remove());placeMarkers=[];$('search-status').textContent='';if(map?.getSource('drag-link'))map.getSource('drag-link').setData(feature([]));}
async function search(point){if(!validPoint(point))return;if(innerWidth<=760){document.body.classList.add('panel-collapsed');$('toggle-panel').textContent='펼치기 ⌃';}point={lat:point.lat,lng:point.lng};state.follow=false;state.probe=point;state.page=0;const seq=++searchSeq;searchController?.abort();searchController=new AbortController();state.poi=[];showWings();$('search-status').textContent='주변 장소를 찾는 중…';
  try{const items=await nearby(point,state.category,state.radius,searchController.signal);if(seq!==searchSeq)return;state.poi=items;showWings();$('search-status').textContent=`OpenStreetMap 등록 장소 ${items.length}곳 · 기준점 반경 ${formatDistance(state.radius)}${items.length?'':' · 다른 지점이나 반경을 선택해 보세요'}`;}
  catch(e){if(seq!==searchSeq)return;$('search-status').textContent='장소 조회 실패 · 지도를 다시 누르면 재시도합니다.';toast('장소 서버에 연결하지 못했습니다. 위치를 직접 목적지로 지정할 수 있습니다.');state.poi=[];showWings();}
}
function showWings(){
  if(!state.probe)return;
  const center=map.project([state.probe.lng,state.probe.lat]),width=$('map').clientWidth;
  const height=innerWidth<=760&&!document.body.classList.contains('focus-full')?Math.max(160,$('panel').getBoundingClientRect().top-$('map').getBoundingClientRect().top):$('map').clientHeight;
  const items=state.poi.slice(state.page*5,state.page*5+5);
  items.push(coordinateChoice(state.probe));
  const layout=wingLayout(items,center,width,height,map.getBearing());
  const key=JSON.stringify([state.probe.lat,state.probe.lng,state.page,...layout.map(p=>p.id)]);
  const rebuild=key!==wingRenderKey;wingRenderKey=key;
  wingPoints=layout;
  $('wings').hidden=false;$('wings').style.height=`${height}px`;$('wings').classList.toggle('compact-wings',height<400);
  const {x:cx,y:cy}=wingCenter(center,width,height),footer=wingFooter(center,width,height);
  $('wing-cancel').style.left=`${cx}px`;$('wing-cancel').style.top=`${cy}px`;
  if(rebuild){
    $('wing-items').replaceChildren();$('wing-lines').replaceChildren();
    for(const p of wingPoints){
      const b=make('button','');b.dataset.id=p.id;b.append(make('strong','',p.name),make('small','',p.id==='coordinate'?'직접 선택':`직선 ${formatDistance(p.distance)}`));b.title=p.name;
      b.onclick=e=>{e.stopPropagation();addStop(p);};$('wing-items').append(b);
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('stroke','#83c5a3');line.setAttribute('stroke-width','1.5');$('wing-lines').append(line);
    }
    const start=make('button','set-origin','여기서 출발');start.onclick=e=>{e.stopPropagation();const p={...state.probe};state.manualOrigin=true;updateOrigin(p,'선택한 위치에서 출발');hideWings();changed();handle.setLngLat([p.lng,p.lat]);toast('출발지를 변경했습니다.');};$('wing-items').append(start);
    if(state.poi.length>5){const more=make('button','more-places',`다음 장소 ${state.page+1}/${Math.ceil(state.poi.length/5)} →`);more.onclick=e=>{e.stopPropagation();state.page=(state.page+1)%Math.ceil(state.poi.length/5);showWings();};$('wing-items').append(more);}
    placeMarkers.forEach(m=>m.remove());placeMarkers=items.filter(p=>p.id!=='coordinate').map(p=>{const el=make('button','place-pin','·');el.title=p.name;el.onclick=e=>{e.stopPropagation();addStop(p);};return new maps.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map);});
  }
  const buttons=$$('#wing-items button[data-id]'),lines=[...$('wing-lines').children];
  wingPoints.forEach((p,i)=>{const b=buttons[i];if(b){b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;}for(const [k,v] of Object.entries({x1:cx,y1:cy,x2:p.x,y2:p.y}))lines[i]?.setAttribute(k,String(v));});
  const start=$('wing-items').querySelector('.set-origin');if(start){start.style.left=`${footer.x}px`;start.style.top=`${footer.originY}px`;}
  const more=$('wing-items').querySelector('.more-places');if(more){more.style.left=`${footer.x}px`;more.style.top=`${footer.moreY}px`;}
}

async function calculateRoute(){if(!state.stops.length)return;const seq=++routeSeq;routeController?.abort();routeController=new AbortController();hideWings();$('route').disabled=true;$('route').textContent='경로를 계산하는 중…';
  try{const result=await fetchRoutes(state.origin,[...state.stops],$('optimize').checked,routeController.signal);if(seq!==routeSeq)return;state.routes=result.routes.slice(0,3);state.stops=result.stops;state.selected=0;state.nav=false;state.next=0;stepIndex=0;renderStops();renderRoutes();fitRoute();persist();syncNative();toast(state.routes.length>1?`${state.routes.length}개 경로를 비교할 수 있습니다.`:'이 동선에서 제공되는 차량 경로는 1개입니다.');}
  catch(e){if(seq===routeSeq)toast(e.name==='AbortError'?'경로 요청 시간이 초과되었습니다.':e.message);}
  finally{if(seq===routeSeq){$('route').disabled=!state.stops.length;$('route').textContent='경로 다시 탐색 ↗';}}
}
function renderRoutes(){
  $('route-results').replaceChildren();
  for(let i=0;i<3;i++){if(map.getLayer(`route-${i}`))map.removeLayer(`route-${i}`);if(map.getSource(`route-${i}`))map.removeSource(`route-${i}`);}
  // Draw selected route last so overlapping alternatives do not obscure it.
  state.routes.map((r,i)=>({r,i})).sort((a,b)=>(a.i===state.selected?1:0)-(b.i===state.selected?1:0)).forEach(({r,i})=>lineSource(`route-${i}`,r.geometry.coordinates,colors[i],i===state.selected?7:4));
  state.routes.forEach((r,i)=>{const b=make('button',`route-card${i===state.selected?' selected':''}`);b.append(make('strong','',formatDuration(r.duration)),make('small','',formatDistance(r.distance)),make('span','',`${i===0?'기본 경로':`대안 경로 ${i}`} · 차량 / 실시간 교통 미반영`));b.onclick=()=>{state.selected=i;state.nav=false;state.next=0;stepIndex=0;renderRoutes();fitRoute();syncNative();};$('route-results').append(b);});
  $('navigation').hidden=!state.routes.length;$('start-nav').textContent=state.nav?'안내 종료':'안내 시작';updateInstruction();
}
function fitRoute(){const r=state.routes[state.selected];if(!r)return;const b=new maps.LngLatBounds();r.geometry.coordinates.forEach(p=>b.extend(p));const mobile=innerWidth<=760;map.fitBounds(b,{padding:{top:100,bottom:mobile?Math.round($('map').clientHeight*.49):110,left:50,right:65},maxZoom:16,pitch:state.pitch});}
function updateInstruction(){if(!state.routes.length)return;const target=state.stops[state.next];if(!target){$('next-instruction').textContent='모든 목적지를 방문했습니다.';return;}
  const steps=(state.routes[state.selected].legs[state.next]?.steps||[]);if(state.gps&&steps.length){let closest=stepIndex,d=Infinity;for(let i=stepIndex;i<steps.length;i++){const p=steps[i].maneuver.location;const n=distance(state.gps,{lng:p[0],lat:p[1]});if(n<d){d=n;closest=i;}}if(d<70)stepIndex=closest;}
  const step=steps[Math.min(stepIndex+1,Math.max(0,steps.length-1))];$('next-instruction').textContent=`${state.next+1}. ${target.name}${state.gps?' · 직선 '+formatDistance(distance(state.gps,target)):''}${step?' / '+maneuverText(step):''}`;
}
function nativeBridge(){return typeof window.GilchatgiNative!=='undefined';}
function syncNative(){if(!nativeBridge())return;try{window.GilchatgiNative.setJourney(JSON.stringify({active:state.nav,origin:state.origin,stops:state.stops,next:state.next,route:state.routes[state.selected]?.geometry?.coordinates||[],trace:state.trace.slice(-3000)}));}catch{}}
function onPosition(p){if(!validPoint(p))return;state.gps={lat:p.lat,lng:p.lng,accuracy:p.accuracy??30,speed:p.speed??0,time:Date.now()};if(Number.isFinite(p.heading)&&p.speed>1){state.heading=normalize(p.heading);state.hasHeading=true;}
  $('location-status').textContent=originDetails();
  if(!state.manualOrigin&&!state.nav&&state.routes.length===0){updateOrigin(state.gps,'현재 위치');lineSource('plan',[[state.origin.lng,state.origin.lat],...state.stops.map(p=>[p.lng,p.lat])],'#618c76',2,[2,3]);}
  if(!gpsMarker){const el=make('div','gps-marker');el.append(make('span','gps-arrow'));gpsMarker=new maps.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map);}else gpsMarker.setLngLat([p.lng,p.lat]);gpsMarker.setRotation(state.heading);
  if(state.nav){const last=state.trace.at(-1);if(state.gps.accuracy<=60&&(!last||distance({lng:last[0],lat:last[1]},p)>4)){state.trace.push([p.lng,p.lat]);state.trace=state.trace.slice(-3000);updateTrace();persist();syncNative();}
    const target=state.stops[state.next];if(target&&state.gps.accuracy<=50&&distance(p,target)<35){state.next++;stepIndex=0;syncNative();toast(`${target.name} 근처에 도착했습니다.`);if(state.next>=state.stops.length){state.nav=false;$('start-nav').textContent='안내 시작';syncNative();toast('모든 목적지에 도착했습니다.');}}
    const r=state.routes[state.selected];if(state.nav&&r&&state.gps.accuracy<45&&distanceToLine(p,r.geometry.coordinates)>90){offRouteCount++;if(offRouteCount>=3&&Date.now()-rerouteAt>45000){rerouteAt=Date.now();offRouteCount=0;toast('경로를 벗어났습니다. 남은 동선을 다시 계산합니다.');recalculateRemaining();}}else offRouteCount=0;
  }
  if(state.follow)map.easeTo({center:[p.lng,p.lat],bearing:$('north').dataset.follow==='true'?state.heading:0,duration:700});updateInstruction();
}
async function recalculateRemaining(){const remaining=state.stops.slice(state.next);if(!remaining.length)return;state.stops=remaining;state.next=0;state.manualOrigin=false;updateOrigin(state.gps,'현재 위치');invalidateRoute();renderStops();await calculateRoute();if(state.routes.length){state.nav=true;state.follow=true;$('start-nav').textContent='안내 종료';syncNative();}}
function locate(options={}){if(!options.preserveOrigin){state.manualOrigin=false;if(state.gps&&!state.routes.length)updateOrigin(state.gps,'현재 위치');persist();}state.follow=!state.manualOrigin;if(nativeBridge()){window.GilchatgiNative.requestLocation();return;}if(!navigator.geolocation){toast('이 브라우저는 위치 기능을 지원하지 않습니다.');return;}if(watch!==null){if(state.gps)map.flyTo({center:[state.gps.lng,state.gps.lat],zoom:16});return;}
  watch=navigator.geolocation.watchPosition(p=>onPosition({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,heading:p.coords.heading,speed:p.coords.speed}),e=>{$('location-status').textContent=state.manualOrigin?originDetails():'위치를 사용할 수 없습니다 · 지도에서 출발점을 지정하세요';toast(e.code===1?'위치 권한을 허용하면 내 위치에서 출발할 수 있습니다.':'현재 위치를 확인하지 못했습니다. 지도에서 탐색할 수 있습니다.');navigator.geolocation.clearWatch(watch);watch=null;},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});}
window.onNativeJourneyTrace=trace=>{if(Array.isArray(trace)&&trace.length){state.trace=trace.filter(p=>Array.isArray(p)&&validPoint({lng:p[0],lat:p[1]})).slice(-3000);updateTrace();persist();}};
window.onNativeJourneyNext=(next,active)=>{if(state.routes.length){state.next=Math.min(next,state.stops.length);state.nav=active;$('start-nav').textContent=active?'안내 종료':'안내 시작';updateInstruction();}};
window.onNativePosition=p=>onPosition(p);
window.onNativeHeading=h=>{state.heading=normalize(h);state.hasHeading=true;if(gpsMarker)gpsMarker.setRotation(state.heading);};
window.onNativeMessage=message=>toast(message);
async function enableOrientation(){if(orientationListening)return;try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){if(await DeviceOrientationEvent.requestPermission()!=='granted')return;}window.addEventListener('deviceorientationabsolute',onOrientation);window.addEventListener('deviceorientation',onOrientation);orientationListening=true;}catch{toast('방향 센서 권한을 허용해 주세요.');}}
function onOrientation(e){if(state.gps?.speed>1)return;if(Number.isFinite(e.webkitCompassHeading)){state.heading=e.webkitCompassHeading;state.hasHeading=true;}else if(e.absolute&&Number.isFinite(e.alpha)){state.heading=normalize(360-e.alpha);state.hasHeading=true;}}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}$('camera').srcObject=null;$('camera').hidden=true;}
function modeTabs(){ $$('#mode-tabs button').forEach(b=>{const active=b.dataset.mode===state.mode;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));}); }
async function setMode(mode){
  if(mode==='camera'&&!state.stops.length){toast('목적지를 먼저 선택하세요.');return;}
  const seq=++modeSeq;stopCamera();
  if(mode==='map'){state.mode='map';$('hud').hidden=true;modeTabs();return;}
  await enableOrientation();if(seq!==modeSeq)return;
  if(mode==='camera'&&nativeBridge()){if(!state.stops.length){toast('목적지를 먼저 선택하세요.');return;}syncNative();window.GilchatgiNative.openCamera();return;}
  state.mode=mode;$('hud').hidden=false;modeTabs();
  if(mode==='camera'){
    try{const pending=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(seq!==modeSeq){pending.getTracks().forEach(t=>t.stop());return;}stream=pending;$('camera').srcObject=stream;$('camera').hidden=false;await $('camera').play();}
    catch{if(seq!==modeSeq)return;stopCamera();state.mode='radar';toast('카메라를 사용할 수 없어 레이더 HUD로 전환했습니다.');}
  }
  if(seq!==modeSeq)return;
  $('hud-caption').textContent=state.mode==='camera'?'GPS·나침반 기반 방향 안내 · 정밀 AR 아님':'레이더 HUD · 목적지 방향과 직선거리';modeTabs();
}

function drawHUD(){requestAnimationFrame(drawHUD);if(state.mode==='map'||$('hud').hidden)return;const c=$('hud-canvas'),w=c.clientWidth,h=c.clientHeight,dpr=devicePixelRatio||1;if(c.width!==w*dpr||c.height!==h*dpr){c.width=w*dpr;c.height=h*dpr;}const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);const cx=w/2,cy=h*.76;
  if(state.mode==='radar'){g.strokeStyle='#66e5b735';g.lineWidth=1;for(let i=1;i<=5;i++){g.beginPath();g.ellipse(cx,cy,w*.13*i,h*.042*i,0,Math.PI,2*Math.PI);g.stroke();}for(let i=-3;i<=3;i++){g.beginPath();g.moveTo(cx+i*w*.16,h);g.lineTo(cx+i*12,h*.28);g.stroke();}const glow=g.createLinearGradient(0,h*.25,0,h);glow.addColorStop(0,'#1e8f7200');glow.addColorStop(1,'#0c6c5055');g.fillStyle=glow;g.fillRect(0,h*.25,w,h);}
  g.fillStyle='#d8ffec';g.textAlign='center';g.font='600 20px system-ui';g.fillText(`${Math.round(state.heading)}° ${state.hasHeading?'':'· 방향 센서 대기'}`,cx,95);
  const origin=state.gps||state.origin;const targets=state.stops.slice(state.next,state.next+5);
  targets.forEach((p,i)=>{const angle=deltaAngle(bearing(origin,p),state.heading),x=Math.max(70,Math.min(w-70,cx+angle/100*w)),y=h*.35+i*61;g.fillStyle=i===0?'#8aefb6':'#d4e9df';g.font=`${i===0?'700':'500'} 15px system-ui`;g.fillText(`${angle<-55?'← ':angle>55?'→ ':''}${state.next+i+1}. ${p.name.slice(0,17)}`,x,y);g.font='12px system-ui';g.fillText(`직선 ${formatDistance(distance(origin,p))}`,x,y+20);});
  if(!targets.length){g.font='16px system-ui';g.fillText('지도에서 목적지를 먼저 선택하세요',cx,h*.45);}g.fillStyle='#8aefb6';g.beginPath();g.moveTo(cx,cy-23);g.lineTo(cx-13,cy+12);g.lineTo(cx,cy+4);g.lineTo(cx+13,cy+12);g.closePath();g.fill();
}
function init(){if(!window.maplibregl){$('map-loading').textContent='지도 구성 파일을 불러오지 못했습니다. 새로고침해 주세요.';return;}
  try{map=new maps.Map({container:'map',style:CONFIG.style,center:[state.origin.lng,state.origin.lat],zoom:15,pitch:45,maxPitch:65,attributionControl:true});}
  catch(e){if(!window.L){$('map-loading').textContent='지도 초기화 실패 · 브라우저를 업데이트해 주세요.';return;}maps=rasterAdapter();raster=true;state.pitch=0;map=new maps.Map({container:'map',center:[state.origin.lng,state.origin.lat],zoom:15});$('view-mode').textContent='2D';$('view-mode').disabled=true;toast('이 기기는 2D 지도로 탐색합니다.');}
  map.on('load',()=>{$('map-loading').hidden=true;const el=make('div','handle-wrap'),button=make('button','handle','↗');button.setAttribute('aria-label','드래그하여 주변 목적지 찾기');el.append(button,make('span','handle-label','여기서 둘러보기'));button.addEventListener('pointerdown',e=>startDrag(e,button,state.stops.at(-1)||state.origin));button.onclick=()=>{if(!drag&&Date.now()>suppressHandleClickUntil)search(state.probe||state.stops.at(-1)||state.origin);};button.oncontextmenu=e=>e.preventDefault();handle=new maps.Marker({element:el}).setLngLat([state.origin.lng,state.origin.lat]).addTo(map);updateOrigin(state.origin,state.manualOrigin?'선택한 위치에서 출발':'지도 중심에서 출발');renderStops();updateTrace();if(nativeBridge()){$('overlay').hidden=false;window.GilchatgiNative.ready();}else locate({preserveOrigin:true});});
  map.on('error',e=>{if(!map.isStyleLoaded()){$('map-loading').textContent='지도 서버 연결을 확인해 주세요. 인터넷 연결 후 새로고침할 수 있습니다.';}console.warn('지도 오류',e.error?.message);});
  map.on('click',e=>{if(drag||e.originalEvent.target.closest('button'))return;state.follow=false;const p={lat:e.lngLat.lat,lng:e.lngLat.lng};state.probe=p;handle?.setLngLat(e.lngLat);search(p);});
  map.on('dragstart',()=>{if(!drag)state.follow=false;});map.on('move',()=>{if(!$('wings').hidden&&!wingFrame)wingFrame=requestAnimationFrame(()=>{wingFrame=null;showWings();});});
  document.addEventListener('pointermove',moveDrag,{passive:false});document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);
  $('wing-cancel').onclick=hideWings;$('locate').onclick=locate;$('recenter').onclick=locate;
  $('add').onclick=()=>{const p=state.stops.at(-1)||state.origin;state.follow=false;map.flyTo({center:[p.lng,p.lat],zoom:16});search(p);};
  $('clear').onclick=()=>{if(state.stops.length&&!confirm('동선의 모든 목적지를 지울까요?'))return;state.stops=[];hideWings();changed();handle.setLngLat([state.origin.lng,state.origin.lat]);};
  $('route').onclick=calculateRoute;$('optimize').onchange=invalidateRoute;$('overview').onclick=fitRoute;
  $('start-nav').onclick=()=>{if(state.nav){state.nav=false;syncNative();$('start-nav').textContent='안내 시작';return;}if(!state.gps||Date.now()-state.gps.time>30000){locate();toast('현재 위치를 확인한 뒤 안내를 시작해 주세요.');return;}if(distance(state.gps,state.origin)>150){state.manualOrigin=false;updateOrigin(state.gps,'현재 위치');persist();invalidateRoute();renderStops();calculateRoute();toast('현재 위치를 출발지로 경로를 갱신합니다.');return;}state.nav=true;state.next=0;state.follow=true;stepIndex=0;syncNative();$('start-nav').textContent='안내 종료';enableOrientation();toast('GPS 안내를 시작합니다. 이동 궤적이 이 기기에 저장됩니다.');};
  $$('.category-bar button').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;$$('.category-bar button').forEach(x=>x.classList.toggle('selected',x===b));search(state.probe||state.stops.at(-1)||state.gps||state.origin);});
  $('radius').onchange=()=>{state.radius=Number($('radius').value);search(state.probe||state.gps||state.origin);};
  $('view-mode').onclick=()=>{state.pitch=state.pitch===0?45:state.pitch===45?60:0;$('view-mode').textContent=state.pitch===0?'2D':state.pitch===45?'2.5D':'3D';map.easeTo({pitch:state.pitch});if(state.pitch===60&&!map.getLayer('buildings-3d')){const building=map.getStyle().layers.find(l=>l['source-layer']==='building'&&l.type==='fill');if(building)map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:building.source,'source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':'#bbcdbf','fill-extrusion-height':['to-number',['coalesce',['get','render_height'],['get','height']],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.75}});}};
  $('north').onclick=()=>{const follow=$('north').dataset.follow!=='true';$('north').dataset.follow=String(follow);$('north').textContent=follow?'방향 ↑':'N ↑';map.easeTo({bearing:follow?state.heading:0});enableOrientation();};
  $('focus').onclick=()=>{state.focus=(state.focus+1)%3;document.body.classList.toggle('focus-expanded',state.focus===1);document.body.classList.toggle('focus-full',state.focus===2);map.resize();};
  $('toggle-panel').onclick=()=>{document.body.classList.toggle('panel-collapsed');$('toggle-panel').textContent=document.body.classList.contains('panel-collapsed')?'펼치기 ⌃':'접기 ⌄';map.resize();};
  $$('#mode-tabs button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('close-hud').onclick=()=>setMode('map');
  $('overlay').onclick=()=>{if(!state.nav){toast('경로 탐색 후 GPS 안내를 먼저 시작하세요.');return;}syncNative();window.GilchatgiNative.startOverlay();};
  $('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();$('reset-data').onclick=()=>{if(!confirm('이 기기에 저장된 동선과 이동 기록을 삭제할까요?'))return;state.trace=[];state.stops=[];state.manualOrigin=false;state.origin={...(state.gps||fallback)};hideWings();updateOrigin(state.origin,state.gps?'현재 위치':'지도 중심에서 출발');changed();updateTrace();toast('기기 내 기록을 삭제했습니다.');};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideWings();setMode('map');}});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();if(state.mode==='camera')setMode('map');}else if(nativeBridge())window.GilchatgiNative.ready();});
  requestAnimationFrame(drawHUD);
}
init();
