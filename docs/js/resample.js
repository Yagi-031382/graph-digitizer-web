export function validateSampling({smoothing=0,sampleStep=1}={}) {
  if(smoothing!==0&&(!Number.isInteger(smoothing)||smoothing<3||smoothing>51||smoothing%2!==1))
    throw new Error('平滑化幅は3～51 pxの奇数で指定する必要がある。');
  if(!Number.isInteger(sampleStep)||sampleStep<1||sampleStep>100)
    throw new Error('出力間隔は1～100 pxの整数で指定する必要がある。');
}

// Local linear regression reduces pixel quantization without joining missing columns.
// Input and output are source-image coordinates; the input array is never modified.
export function resampleCurve(points,{smoothing=0,sampleStep=1}={}) {
  validateSampling({smoothing,sampleStep});
  const sorted=points.map(p=>[...p]).sort((a,b)=>a[0]-b[0]),output=[];
  for(let start=0;start<sorted.length;){
    let end=start+1;
    while(end<sorted.length&&sorted[end][0]-sorted[end-1][0]<=1.000001)end++;
    const segment=sorted.slice(start,end),radius=(smoothing-1)/2;
    const fitted=segment.map(([x,y],i)=>{
      if(!smoothing||i===0||i===segment.length-1)return [x,y];
      let n=0,sx=0,sy=0,sxx=0,sxy=0,low=Infinity,high=-Infinity;
      for(let j=Math.max(0,i-radius);j<=Math.min(segment.length-1,i+radius);j++){
        const dx=segment[j][0]-x,v=segment[j][1];
        n++;sx+=dx;sy+=v;sxx+=dx*dx;sxy+=dx*v;low=Math.min(low,v);high=Math.max(high,v);
      }
      const denominator=n*sxx-sx*sx;
      const estimate=denominator?(sy*sxx-sx*sxy)/denominator:y;
      return [x,Math.max(low,Math.min(high,estimate))];
    });
    let last=-Infinity;
    fitted.forEach((point,i)=>{
      if(i===0||i===fitted.length-1||point[0]-last>=sampleStep){output.push(point);last=point[0];}
    });
    start=end;
  }
  return output;
}
