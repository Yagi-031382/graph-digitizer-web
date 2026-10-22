// Grid positions use source-image pixels, anchored at the minimum-axis intersection.
export function samplingGrid({width,height,references,stepX=10,stepY=10}) {
  for(const step of [stepX,stepY])if(!Number.isSafeInteger(step)||step<1||step>10000)
    throw new Error('格子間隔は縦横それぞれ1～10000 pxの整数で指定する必要がある。');
  const [ox,oy]=[references.x_min[0],references.y_min[1]],endX=references.x_max[0],endY=references.y_max[1];
  if(![ox,oy,endX,endY].every(Number.isFinite))throw new Error('格子の基準座標は有限値で指定する必要がある。');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||[ox,endX].some(x=>x<0||x>width-1)||[oy,endY].some(y=>y<0||y>height-1))throw new Error('格子の基準座標を画像内に設定する必要がある。');
  const positions=(start,end,step,limit)=>{
    const direction=end>=start?1:-1,result=[],count=Math.floor(Math.abs(end-start)/step+1e-10);
    if(count>1000000)throw new Error('格子線が多すぎる。間隔を広げる必要がある。');
    for(let i=0;i<=count;i++){
      const value=start+direction*i*step;
      if(value>=0&&value<=limit-1)result.push(value);
    }
    return result;
  };
  const xs=positions(ox,endX,stepX,width),ys=positions(oy,endY,stepY,height);
  if(xs.length*ys.length>1000000)throw new Error('格子の交点が100万点を超える。間隔を広げる必要がある。');
  return {xs,ys,origin:[ox,oy]};
}
