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

// Display limits affect the plot only; source CSV points remain untouched.
import {resolvePlotBounds} from '../docs/js/plot.js';
test('manual display bounds, automatic fallback and independent zero minima',()=>{
  const series=[{points:[[-10,-5],[10,15]]}],original=JSON.stringify(series);
  const automatic=resolvePlotBounds(series);
  assert.deepEqual(automatic,{xmin:-11,xmax:11,ymin:-6,ymax:16,hasData:true});
  assert.deepEqual(resolvePlotBounds(series,{x:{mode:'manual',min:2,max:8},y:{mode:'manual',min:-2,max:9,zero:true}}),
    {xmin:2,xmax:8,ymin:0,ymax:9,hasData:true});
  assert.equal(resolvePlotBounds(series,{x:{mode:'auto',zero:true}}).xmin,0);
  assert.equal(JSON.stringify(series),original);
});
test('display bounds reject empty/nonfinite, equal, reversed and overflowing ranges',()=>{
  for(const [min,max] of [[NaN,1],[0,NaN],[0,Infinity],[-Infinity,1],[1,1],[2,1],[-1e308,1e308]])
    assert.throws(()=>resolvePlotBounds([],{x:{mode:'manual',min,max}}),/x軸/);
  assert.throws(()=>resolvePlotBounds([],{y:{mode:'manual',min:NaN,max:0,zero:true}}),/y軸/);
  assert.equal(resolvePlotBounds([],{y:{mode:'manual',min:NaN,max:2,zero:true}}).ymin,0);
});

import {resampleCurve,validateSampling} from '../docs/js/resample.js';
test('local linear sampling reduces quantization error and preserves fractional CSV values',()=>{
  for(const slope of [.12,.37]){
    const truth=x=>20+slope*x,raw=Array.from({length:201},(_,x)=>[x,Math.round(truth(x))]);
    const saved=JSON.stringify(raw),smooth=resampleCurve(raw,{smoothing:7});
    const rmse=points=>Math.sqrt(points.reduce((sum,[x,y])=>sum+(y-truth(x))**2,0)/points.length);
    assert.ok(rmse(smooth)<rmse(raw)*.5,`${slope}: ${rmse(smooth)} vs ${rmse(raw)}`);
    assert.equal(smooth.length,raw.length);assert.deepEqual(smooth[0],raw[0]);assert.deepEqual(smooth.at(-1),raw.at(-1));
    assert.ok(smooth.some(([,y])=>!Number.isInteger(y)));
    assert.deepEqual(parseCSV(makeCSV(smooth)),smooth.map(p=>p.map(n=>Number(n.toPrecision(12)))));
    assert.equal(JSON.stringify(raw),saved);
  }
});
test('sampling retains endpoints and straight trends, and never smooths across missing columns',()=>{
  const points=[...Array.from({length:5},(_,x)=>[x,2*x]),...Array.from({length:5},(_,i)=>[10+i,100+2*i])];
  assert.deepEqual(resampleCurve(points,{smoothing:51}),points);
  assert.deepEqual(resampleCurve(points,{smoothing:7,sampleStep:3}),[points[0],points[3],points[4],points[5],points[8],points[9]]);
  assert.deepEqual(resampleCurve([],{smoothing:7}),[]);
  assert.deepEqual(resampleCurve([[2,3]],{smoothing:7}),[[2,3]]);
  const peak=[[0,0],[1,0],[2,5],[3,0],[4,0]];
  assert.deepEqual(resampleCurve(peak),peak);
  const fitted=resampleCurve(peak,{smoothing:7});assert.ok(fitted.every(([,y])=>y>=0&&y<=5));
});
test('extraction applies sampling settings per curve and keeps graph order for reversed calibration',()=>{
  const sample=image({dashed:true}),raw=extractCurves(sample)[0].points;
  const smoothed=extractCurves({...sample,smoothing:7,sampleStep:3})[0].points;
  assert.deepEqual(smoothed,resampleCurve(raw,{smoothing:7,sampleStep:3}));
  const available=new Set(raw.map(([x])=>x));assert.ok(smoothed.every(([x])=>available.has(x)));
  const refs={...references,x_min:references.x_max,x_max:references.x_min};
  const reversed=extractCurves({...sample,references:refs,smoothing:7,sampleStep:3})[0].points;
  assert.deepEqual(reversed,[...smoothed].reverse());
  for(const smoothing of [NaN,2,4,53,-1])assert.throws(()=>validateSampling({smoothing}),/平滑化/);
  for(const sampleStep of [NaN,0,1.5,101])assert.throws(()=>validateSampling({sampleStep}),/出力間隔/);
});
