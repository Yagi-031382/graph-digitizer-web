export const palette=['#1565c0','#d64535','#008577','#854ab5','#b57205','#007eaa','#cc327b','#596c00','#75523f','#59677a','#1e958e','#ba5a76','#783eb8','#275e81','#9a561b','#4f7437','#a33d54','#4c58a8','#727b20','#17774b'];
export function curveColor(index,count){return count<=20?palette[index%20]:`hsl(${index*360/count} 65% 40%)`;}
function tickValues(min,max,target=5) {
  if(min===max){const margin=Math.abs(min)*.1||1;min-=margin;max+=margin;}
  const rough=(max-min)/target,base=10**Math.floor(Math.log10(rough)),fraction=rough/base;
  const step=(fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*base;
  const first=Math.ceil(min/step)*step,ticks=[];
  for(let value=first;value<=max+step*.00001&&ticks.length<30;value+=step)ticks.push(Math.abs(value)<step*.00001?0:value);
  return ticks;
}
const format=value=>Number(value.toPrecision(5)).toString();
// Input: canvas, named graph-coordinate series, axis labels, marker flag, selected row.
// Output: chart drawing and selected orange marker; returns layout coordinates for verification.
export function drawPlot(canvas,series,xLabel,yLabel,{showPoints=true,selected=null}={}) {
  const width=Math.max(250,canvas.clientWidth),height=Math.max(180,canvas.clientHeight),ratio=window.devicePixelRatio||1;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const curve of series)for(const [x,y] of curve.points){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  const hasData=Number.isFinite(xmin);
  if(!hasData){xmin=0;xmax=1;ymin=0;ymax=1;}
  const dx=(xmax-xmin)||Math.abs(xmin)*.2||1,dy=(ymax-ymin)||Math.abs(ymin)*.2||1;
  if(xmin===xmax){xmin-=dx/2;xmax+=dx/2;}else{xmin-=dx*.05;xmax+=dx*.05;}
  if(ymin===ymax){ymin-=dy/2;ymax+=dy/2;}else{ymin-=dy*.05;ymax+=dy*.05;}
  const xticks=tickValues(xmin,xmax),yticks=tickValues(ymin,ymax);
  ctx.font='12px system-ui';
  const left=Math.max(55,...yticks.map(v=>ctx.measureText(format(v)).width+20));
  const right=width-18,top=20,bottom=height-47;
  const map=([x,y])=>[left+(x-xmin)/(xmax-xmin)*(right-left),bottom-(y-ymin)/(ymax-ymin)*(bottom-top)];
  ctx.lineWidth=1;ctx.strokeStyle='#e0e7f0';ctx.fillStyle='#43546b';
  for(const y of yticks){const [,v]=map([xmin,y]);ctx.beginPath();ctx.moveTo(left,v);ctx.lineTo(right,v);ctx.stroke();ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(format(y),left-8,v);}
  for(const x of xticks){const [u]=map([x,ymin]);ctx.beginPath();ctx.moveTo(u,top);ctx.lineTo(u,bottom);ctx.stroke();ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(format(x),u,bottom+7);}
  ctx.strokeStyle='#879ab2';ctx.strokeRect(left,top,right-left,bottom-top);
  ctx.font='14px system-ui';ctx.fillStyle='#182c44';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(xLabel,(left+right)/2,height-2);
  ctx.save();ctx.translate(15,(top+bottom)/2);ctx.rotate(-Math.PI/2);ctx.textBaseline='middle';ctx.fillText(yLabel,0,0);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  series.forEach((curve,index)=>{
    const color=curve.color||curveColor(index,series.length);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.7;ctx.beginPath();
    curve.points.forEach((p,i)=>{const [u,v]=map(p);if(i===0)ctx.moveTo(u,v);else ctx.lineTo(u,v);});ctx.stroke();
    if(showPoints)for(const p of curve.points){const [u,v]=map(p);ctx.beginPath();ctx.arc(u,v,2.6,0,Math.PI*2);ctx.fill();}
  });
  if(selected!==null&&series[0]?.points[selected]) {
    const [u,v]=map(series[0].points[selected]);ctx.fillStyle='#ff8c00';ctx.strokeStyle='#663900';ctx.lineWidth=1;ctx.beginPath();ctx.arc(u,v,5.5,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  ctx.restore();
  if(!hasData){ctx.fillStyle='#56677b';ctx.font='14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('データを取得・読み込みすると表示される。',(left+right)/2,(top+bottom)/2);}
  return {map,width,height};
}
