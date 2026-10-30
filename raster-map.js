// Leaflet fallback for devices without WebGL. No simulated perspective is shown.
export function rasterAdapter(){
 const L=window.L;
 class Bounds{constructor(){this.points=[];}extend(p){this.points.push([p[1],p[0]]);return this;}}
 class Map{
  constructor(o){document.getElementById(o.container).replaceChildren();this.layers={};this.sources={};this.map=L.map(o.container,{zoomControl:false}).setView([o.center[1],o.center[0]],o.zoom);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(this.map);this.dragPan={disable:()=>this.map.dragging.disable(),enable:()=>this.map.dragging.enable()};}
  on(event,fn){if(event==='load'){setTimeout(fn,0);return this;}if(event==='error')return this;this.map.on(event,e=>fn({...e,...(e.latlng?{lngLat:{lng:e.latlng.lng,lat:e.latlng.lat}}:{})}));return this;}
  isStyleLoaded(){return true;}
  getSource(id){return this.sources[id];}
  addSource(id,o){this.sources[id]={data:o.data,setData:data=>{this.sources[id].data=data;if(this.layers[id])this.layers[id].setLatLngs(data.geometry.coordinates.map(p=>[p[1],p[0]]));}};}
  addLayer(l){if(l.type!=='line')return;const s=this.sources[l.source];this.layers[l.id]=L.polyline((s?.data?.geometry?.coordinates||[]).map(p=>[p[1],p[0]]),{color:l.paint['line-color'],weight:l.paint['line-width'],opacity:l.paint['line-opacity'],dashArray:l.paint['line-dasharray']?'5 6':undefined}).addTo(this.map);}
  getLayer(id){return this.layers[id];}removeLayer(id){this.layers[id]?.remove();delete this.layers[id];}removeSource(id){delete this.sources[id];}
  getStyle(){return {layers:[]};}getBearing(){return 0;}
  project(p){const q=this.map.latLngToContainerPoint([p[1],p[0]]);return {x:q.x,y:q.y};}
  unproject(p){const q=this.map.containerPointToLatLng(p);return {lat:q.lat,lng:q.lng};}
  panBy(p){this.map.panBy(p,{animate:false});}
  flyTo(o){if(o.center)this.map.flyTo([o.center[1],o.center[0]],o.zoom??this.map.getZoom(),{duration:.5});}
  easeTo(o){if(o.center)this.map.panTo([o.center[1],o.center[0]],{animate:false});}
  fitBounds(b,o){if(b.points.length)this.map.fitBounds(b.points,{paddingTopLeft:[o.padding.left,o.padding.top],paddingBottomRight:[o.padding.right,o.padding.bottom],maxZoom:o.maxZoom});}
  resize(){this.map.invalidateSize();}
 }
 class Marker{
  constructor({element}){this.el=element;this.rotation=0;}
  setLngLat(p){this.pos=Array.isArray(p)?[p[1],p[0]]:[p.lat,p.lng];if(this.marker)this.marker.setLatLng(this.pos);return this;}
  addTo(map){this.marker=L.marker(this.pos,{icon:L.divIcon({html:this.el,className:'raster-marker',iconSize:[0,0],iconAnchor:[0,0]}),interactive:true,keyboard:false}).addTo(map.map);L.DomEvent.disableClickPropagation(this.el);return this;}
  getElement(){return this.el;}
  setRotation(a){const arrow=this.el.querySelector('.gps-arrow');if(arrow)arrow.style.transform=`rotate(${a}deg)`;return this;}
  remove(){this.marker?.remove();}
 }
 return {Map,Marker,LngLatBounds:Bounds};
}
