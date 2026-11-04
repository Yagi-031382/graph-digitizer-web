export function validateLayer(layer) {
  const {min,max,values}=layer;
  if(![...min,...max,...Object.values(values)].every(Number.isFinite))throw new Error('校正位置と軸値は空欄にせず、有限の数値を指定する必要がある。');
  for(const axis of ['x','y']){
    if(values[axis+'_max']<=values[axis+'_min']||!Number.isFinite(values[axis+'_max']-values[axis+'_min']))throw new Error(axis+'軸の最大値は最小値より大きくする必要がある。');
  }
  if(min[0]===max[0]||min[1]===max[1])throw new Error('2つの交点は水平・垂直とも異なる位置に配置する必要がある。');
}
export function overlayBounds(layers) {
  const bounds={xmin:Infinity,xmax:-Infinity,ymin:Infinity,ymax:-Infinity};
  for(const layer of layers){
    try{validateLayer(layer);}catch(error){throw new Error(layer.name+'：'+error.message);}
    const v=layer.values;bounds.xmin=Math.min(bounds.xmin,v.x_min);bounds.xmax=Math.max(bounds.xmax,v.x_max);bounds.ymin=Math.min(bounds.ymin,v.y_min);bounds.ymax=Math.max(bounds.ymax,v.y_max);
  }
  return layers.length?bounds:{xmin:0,xmax:1,ymin:0,ymax:1};
}
// Independent horizontal/vertical affine scales align graph values, not image dimensions.
export function layerTransform(layer,map) {
  validateLayer(layer);
  const v=layer.values,a=map([v.x_min,v.y_min]),b=map([v.x_max,v.y_max]);
  const sx=(b[0]-a[0])/(layer.max[0]-layer.min[0]),sy=(b[1]-a[1])/(layer.max[1]-layer.min[1]);
  const tx=a[0]-sx*layer.min[0],ty=a[1]-sy*layer.min[1];
  if(![sx,sy,tx,ty].every(Number.isFinite)||sx===0||sy===0)throw new Error('画像の変換倍率を計算できない。校正範囲を広げる必要がある。');
  return {sx,sy,tx,ty};
}
