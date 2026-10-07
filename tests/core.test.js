import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCalibration,toGraph,parseCSV,makeCSV} from '../docs/js/core.js';
import {extractCurves} from '../docs/js/extraction.js';
const references={x_min:[20,220],x_max:[320,220],y_min:[20,220],y_max:[20,20]};
const values={x_min:0,x_max:30,y_min:0,y_max:4};
test('calibration, midpoint and invalid references',()=>{
  validateCalibration(references,values);
  assert.deepEqual(toGraph([170,120],references,values),[15,2]);
  assert.throws(()=>validateCalibration({},values));
  assert.throws(()=>validateCalibration({...references,x_max:[20,220]},values));
  assert.throws(()=>validateCalibration(references,{...values,y_max:0}));
});
test('CSV BOM, scientific notation, quoted fields, click order and roundtrip',()=>{
  const points=[[.2,3],[.1,1]];
  assert.deepEqual(parseCSV(makeCSV(points)),points);
  assert.deepEqual(parseCSV('\uFEFFy,x\r\n"2","1e-1"\r\n'),[[.1,2]]);
  for(const text of ['x,y\n','a,b\n1,2','x,y\n,2','x,y\nInfinity,1','x,y\n"1,2','x,y\nNaN,2'])assert.throws(()=>parseCSV(text));
});
function image({dashed=false,color=[0,0,0],blue=false}={}){
  const width=340,height=240,data=new Uint8ClampedArray(width*height*4).fill(255);
  function dot(x,y,c){const p=(y*width+x)*4;data[p]=c[0];data[p+1]=c[1];data[p+2]=c[2];}
  for(let y=20;y<=220;y++)dot(20,y,[0,0,0]);for(let x=20;x<=320;x++)dot(x,220,[0,0,0]);
  for(let x=40;x<=290;x++) {
    if(!dashed||(x-40)%20<14){const y=Math.round(190-(x-40)*.5);dot(x,y,color);dot(x,y+1,color);}
    if(blue)dot(x,Math.round(60+(x-40)*.12),[0,0,255]);
  }
  return {data,width,height,references,values,gap:12};
}
test('black solid and broken curve, absent columns are not synthesized',()=>{
  for(const dashed of [false,true]){
    const result=extractCurves(image({dashed}));assert.ok(result.length>0);
    const points=result[0].points;assert.ok(points.length>160);
    for(const [x,y] of points)assert.ok(Math.abs(y-(190-(x-40)*.5))<=1);
    if(dashed)assert.ok(points.some((p,i)=>i&&p[0]-points[i-1][0]>1));
  }
});
test('red and blue separated; blank image has no candidates',()=>{
  const result=extractCurves(image({color:[255,0,0],blue:true}));
  assert.equal(result.length,2);assert.ok(result.some(c=>c.name.startsWith('赤')));assert.ok(result.some(c=>c.name.startsWith('青')));
  const blank=image();blank.data.fill(255);assert.deepEqual(extractCurves(blank),[]);
});
test('connected fragments respect gap setting and extraction grid removal',()=>{
  const sample=image({dashed:true});assert.ok(extractCurves({...sample,gap:0}).length>1);
  assert.equal(extractCurves(sample).length,1);
  const grid=image();for(let x=20;x<=320;x++){const p=(100*grid.width+x)*4;grid.data[p]=grid.data[p+1]=grid.data[p+2]=130;}
  assert.equal(extractCurves(grid).length,1);
});
