import {distance,bearing,validPoint} from './core.js?v=20261031.1';
export const CONFIG={style:'https://tiles.openfreemap.org/styles/liberty',overpass:'https://overpass-api.de/api/interpreter',overpassFallback:'https://overpass.private.coffee/api/interpreter',routing:'https://router.project-osrm.org'};
const selectors={all:'["name"][~"^(amenity|tourism|leisure|shop)$"~"."]',food:'["amenity"~"^(restaurant|fast_food|food_court)$"]["name"]',cafe:'["amenity"="cafe"]["name"]',fuel:'["amenity"="fuel"]',parking:'["amenity"="parking"]',shop:'["shop"="convenience"]',park:'["leisure"="park"]'};
const kinds={restaurant:'음식점',fast_food:'간편식',food_court:'푸드코트',cafe:'카페',fuel:'주유소',parking:'주차장',convenience:'편의점',park:'공원',pharmacy:'약국',clinic:'의원',hospital:'병원',dentist:'치과',bank:'은행',atm:'현금인출기',school:'학교',toilets:'화장실',hotel:'호텔',supermarket:'마트',bakery:'빵집',hairdresser:'미용실'};
const cache=new Map();
export async function fetchJSON(url,options={}){
  const {timeoutMs=28000,...init}=options;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const external=options.signal; const abort=()=>controller.abort();external?.addEventListener('abort',abort,{once:true});
  if(external?.aborted)controller.abort();
  try{const r=await fetch(url,{...init,signal:controller.signal});if(!r.ok)throw new Error(`서버 응답 ${r.status}`);return await r.json();}
  finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
export async function nearby(point,category,radius,signal){
  if(!validPoint(point))throw new Error('올바른 지도 위치가 아닙니다.');
  const key=`${point.lat.toFixed(4)},${point.lng.toFixed(4)},${category},${radius}`;
  const hit=cache.get(key);if(hit&&Date.now()-hit.time<300000)return hit.data;
  const query=`[out:json][timeout:20];nwr(around:${radius},${point.lat.toFixed(6)},${point.lng.toFixed(6)})${selectors[category]||selectors.all};out center tags 100;`;
  let data;
  try{data=await fetchJSON(CONFIG.overpass,{timeoutMs:12000,method:'POST',body:new URLSearchParams({data:query}),signal});}
  catch(error){if(signal?.aborted)throw error;data=await fetchJSON(CONFIG.overpassFallback,{timeoutMs:20000,method:'POST',body:new URLSearchParams({data:query}),signal});}
  if(data.remark)throw new Error('장소 서버가 혼잡합니다. 잠시 후 다시 탐색해 주세요.');
  const items=(data.elements||[]).map(e=>{const t=e.tags||{},p={lat:e.lat??e.center?.lat,lng:e.lon??e.center?.lon};return {...p,id:`osm-${e.type}-${e.id}`,name:t['name:ko']||t.name||t.brand||({'fuel':'주유소','parking':'주차장','convenience':'편의점','park':'공원'}[t.amenity||t.shop||t.leisure])||'주변 장소',kind:kinds[t.amenity||t.shop||t.leisure||t.tourism]||'주변 장소',address:[t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),phone:t.phone||'',website:t.website||'',distance:distance(point,p),bearing:bearing(point,p)};}).filter(validPoint).filter(p=>p.distance<=radius).sort((a,b)=>a.distance-b.distance);
  cache.set(key,{time:Date.now(),data:items});if(cache.size>40)cache.delete(cache.keys().next().value);return items;
}
export async function routes(origin,stops,optimize=false,signal){
  if(!validPoint(origin)||!stops.length||stops.some(p=>!validPoint(p)))throw new Error('출발지와 목적지를 확인해 주세요.');
  const points=[origin,...stops], coords=points.map(p=>`${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const service=optimize?'trip':'route';
  const params=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true'});
  if(optimize){params.set('source','first');params.set('destination','last');params.set('roundtrip','false');}else params.set('alternatives','true');
  const data=await fetchJSON(`${CONFIG.routing}/${service}/v1/driving/${coords}?${params}`,{signal});
  if(data.code!=='Ok')throw new Error(data.code==='NoRoute'?'연결되는 차량 경로가 없습니다.':'경로를 계산하지 못했습니다.');
  let ordered=stops;
  if(optimize)ordered=data.waypoints.map((w,i)=>({point:points[i],index:w.waypoint_index})).filter(x=>x.point!==origin).sort((a,b)=>a.index-b.index).map(x=>x.point);
  const result=(optimize?data.trips:data.routes)||[];
  if(!result.length)throw new Error('경로가 없습니다.');
  return {routes:result,stops:ordered};
}
