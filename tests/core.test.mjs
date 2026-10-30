import test from 'node:test';import assert from 'node:assert/strict';
import {distance,bearing,deltaAngle,sanitizeStops,distanceToLine,wingLayout,maneuverText} from '../core.js';
const a={lat:37.5,lng:127};
test('geodesic distance and wrapped heading',()=>{assert.equal(distance(a,a),0);assert.ok(Math.abs(distance({lat:0,lng:0},{lat:0,lng:1})-111195)<2);assert.equal(bearing(a,{lat:38,lng:127}),0);assert.equal(deltaAngle(1,359),2);assert.equal(deltaAngle(359,1),-2);});
test('saved stops reject corrupt coordinates and limit itinerary',()=>{assert.equal(sanitizeStops([{lat:NaN,lng:0},{lat:91,lng:0},a]).length,1);assert.equal(sanitizeStops(Array(20).fill(a)).length,12);assert.deepEqual(sanitizeStops({}),[]);});
test('off-route detection measures segment not only route vertices',()=>{assert.ok(distanceToLine({lat:0,lng:.5},[[0,0],[1,0]])<1);assert.ok(distanceToLine({lat:.001,lng:.5},[[0,0],[1,0]])>100);});
test('wing labels remain visible at viewport edges',()=>{for(const width of [320,390,900])for(const center of [{x:0,y:0},{x:width,y:700}]){const layout=wingLayout(Array.from({length:6},(_,i)=>({id:i,bearing:i*60})),center,width,700);for(const p of layout){assert.ok(p.x>=56&&p.x<=width-56,`x ${p.x}/${width}`);assert.ok(p.y>=26&&p.y<=674);}}});
test('maneuvers have Korean turn labels',()=>{assert.equal(maneuverText({maneuver:{type:'arrive'}}),'목적지 도착');assert.match(maneuverText({name:'중앙로',maneuver:{type:'turn',modifier:'left'}}),/좌회전.*중앙로/);});
