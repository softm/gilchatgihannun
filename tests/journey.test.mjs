import test from 'node:test';import assert from 'node:assert/strict';
import {restoreJourney,journeySnapshot,wingLayout,wingFooter,wingCenter,coordinateChoice} from '../core.js';
const fallback={lat:37.4785,lng:126.854};
test('null or primitive saved JSON does not prevent startup',()=>{for(const value of [null,3,'bad',[],false])assert.deepEqual(restoreJourney(value,fallback),{origin:fallback,manualOrigin:false,stops:[],trace:[]});});
test('manual departure survives reload while ordinary GPS departure is not persisted',()=>{const state={origin:{lat:37.49,lng:126.88},manualOrigin:true,stops:[],trace:[]};assert.deepEqual(restoreJourney(journeySnapshot(state),fallback).origin,state.origin);assert.equal(restoreJourney(journeySnapshot({...state,manualOrigin:false}),fallback).manualOrigin,false);assert.equal(journeySnapshot({...state,manualOrigin:false}).origin,undefined);});
test('invalid saved departure falls back without accepting nonfinite coordinates',()=>{assert.deepEqual(restoreJourney({manualOrigin:true,origin:{lat:Infinity,lng:126}},fallback).origin,fallback);});
test('radial labels and central actions do not overlap in portrait layouts',()=>{
 for(const [width,height] of [[320,575],[390,607],[900,700]])for(let n=1;n<=5;n++){
  const center={x:width/2,y:height-10},c=wingCenter(center,width,height),f=wingFooter(center,width,height);
  const boxes=wingLayout(Array.from({length:n},(_,id)=>({id,bearing:id*60})),center,width,height).map(p=>({...p,w:width<=430?96:112,h:49}));
  boxes.push({x:c.x,y:c.y,w:142,h:68},{x:f.x,y:f.originY,w:90,h:30},{x:f.x,y:f.moreY,w:124,h:30},{x:f.x,y:f.closeY,w:48,h:28});
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.y-b.y)>=(a.h+b.h)/2,`${width}/${n}: overlap ${i}/${j}`);}
 }
});

test('next-place coordinate option never inherits the previous destination identity',()=>{const choice=coordinateChoice({lat:37.5,lng:127,id:'previous-stop',name:'이전 장소',kind:'카페'});assert.equal(choice.id,'coordinate');assert.equal(choice.name,'지도에서 선택한 위치');assert.equal(choice.kind,'지정 위치');assert.equal(choice.lat,37.5);});
