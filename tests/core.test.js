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

import {samplingGrid} from '../docs/js/sampling-grid.js';
function latticeImage(){
  const width=41,height=41,data=new Uint8ClampedArray(width*height*4).fill(255);
  const references={x_min:[5,35],x_max:[35,35],y_min:[5,35],y_max:[5,5]};
  const dot=(x,y,color)=>{const i=(y*width+x)*4;data.set([...color,255],i);};
  for(const [x,y] of [[5,35],[15,25],[25,15],[35,5],[20,20]])dot(x,y,[255,0,0]);
  dot(15,15,[0,0,255]);dot(25,25,[0,0,255]);
  return {data,width,height,references,values,mode:'grid',stepX:10,stepY:10,dot};
}
test('grid sampling includes ink at origin, exact intersections and separate colors without interpolating',()=>{
  const sample=latticeImage(),before=sample.data.slice(),result=extractCurves(sample);
  const red=result.find(c=>c.name.startsWith('赤')),blue=result.find(c=>c.name.startsWith('青'));
  assert.deepEqual(red.points,[[5,35],[15,25],[25,15],[35,5]]);
  assert.deepEqual(blue.points,[[15,15],[25,25]]);
  assert.deepEqual(toGraph(red.points[0],sample.references,values),[0,0]);
  assert.deepEqual(sample.data,before);
  const dense=extractCurves({...sample,stepX:5,stepY:5}).find(c=>c.name.startsWith('赤'));
  assert.ok(dense.points.some(([u,v])=>u===20&&v===20));
  sample.data.fill(255);assert.deepEqual(extractCurves(sample),[]);
});
test('grid steps are independent, support reversed/subpixel calibration, and omit off-grid maxima',()=>{
  const sample=latticeImage(),grid=samplingGrid({...sample,stepX:12,stepY:7});
  assert.deepEqual(grid.xs,[5,17,29]);assert.deepEqual(grid.ys,[35,28,21,14,7]);
  const reversed={x_min:[35,5],x_max:[5,5],y_min:[35,5],y_max:[35,35]};
  assert.deepEqual(samplingGrid({...sample,references:reversed}).xs,[35,25,15,5]);
  const refs={x_min:[5.2,34.8],x_max:[35.2,34.8],y_min:[5.2,34.8],y_max:[5.2,4.8]};
  const red=extractCurves({...sample,references:refs}).find(c=>c.name.startsWith('赤'));
  assert.deepEqual(red.points[0],[5.2,34.8]);
  assert.ok(red.points.every(([x,y])=>Math.abs((x-5.2)/10-Math.round((x-5.2)/10))<1e-8&&Math.abs((34.8-y)/10-Math.round((34.8-y)/10))<1e-8));
});
test('grid rejects invalid spacing and excessive samples; black origin survives axis removal',()=>{
  const sample=latticeImage();
  for(const step of [0,-1,1.5,NaN,Infinity,10001]){
    assert.throws(()=>extractCurves({...sample,stepX:step}),/格子間隔/);
    assert.throws(()=>extractCurves({...sample,stepY:step}),/格子間隔/);
  }
  assert.throws(()=>samplingGrid({width:2000,height:2000,references:{x_min:[0,1999],x_max:[1999,1999],y_min:[0,1999],y_max:[0,0]},stepX:1,stepY:1}),/100万/);
  sample.data.fill(255);
  for(let i=5;i<=35;i++){sample.dot(i,35,[0,0,0]);sample.dot(5,i,[0,0,0]);}
  assert.deepEqual(extractCurves(sample)[0].points,[[5,35]]);
});
