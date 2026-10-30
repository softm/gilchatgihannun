import test from 'node:test';import assert from 'node:assert/strict';
import {clampPointer,wingLayout,wingCenter} from '../core.js';
const bounds={left:76,right:300,top:118,bottom:330};
test('offscreen pointer remains inside the usable map above the mobile sheet',()=>{const p=clampPointer({x:-1500,y:1000},bounds);assert.deepEqual(p,{x:76,y:330,docked:true});});
test('a visible map pointer keeps its geographic screen position',()=>{assert.deepEqual(clampPointer({x:190,y:240},bounds),{x:190,y:240,docked:false});});
test('initialization without a finite projection still yields a visible handle',()=>{const p=clampPointer({x:NaN,y:Infinity},bounds);assert.ok(p.x>=76&&p.x<=300&&p.y>=118&&p.y<=330);});

test('nearby choices leave the central add button unobstructed',()=>{for(const width of [320,390,900])for(let n=1;n<=5;n++){const center={x:width/2,y:260},height=679,c=wingCenter(center,width,height);const points=wingLayout(Array.from({length:n},(_,id)=>({id,bearing:id*60})),center,width,height);for(const p of points){const half=width<=430?48:56;assert.ok(Math.abs(p.x-c.x)>=71+half||Math.abs(p.y-c.y)>=34+24.5,`${width}: ${n} choices overlap central add`);}}});
