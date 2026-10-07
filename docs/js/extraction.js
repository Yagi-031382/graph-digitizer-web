import {validateCalibration,toGraph} from './core.js';

function otsu(histogram,total) {
  let sum=0;for(let i=0;i<256;i++)sum+=i*histogram[i];
  let lower=0,weight=0,best=-1,threshold=0;
  for(let i=0;i<256;i++) {
    weight+=histogram[i];if(!weight)continue;if(weight===total)break;
    lower+=i*histogram[i];
    const difference=lower/weight-(sum-lower)/(total-weight);
    const score=weight*(total-weight)*difference*difference;
    if(score>best){best=score;threshold=i;}
  }
  return Math.min(threshold,200);
}

function removeGrid(mask,w,h) {
  const output=mask.slice(),minimumWidth=Math.max(10,Math.floor(w*.8)),minimumHeight=Math.max(10,Math.floor(h*.8));
  for(let y=0;y<h;y++) {
    let start=-1;
    for(let x=0;x<=w;x++) {
      if(x<w&&mask[y*w+x]){if(start<0)start=x;}
      else if(start>=0){if(x-start>=minimumWidth)output.fill(0,y*w+start,y*w+x);start=-1;}
    }
  }
  for(let x=0;x<w;x++) {
    let start=-1;
    for(let y=0;y<=h;y++) {
      if(y<h&&mask[y*w+x]){if(start<0)start=y;}
      else if(start>=0){if(y-start>=minimumHeight)for(let r=start;r<y;r++)output[r*w+x]=0;start=-1;}
    }
  }
  return output;
}

// Square dilation with linear-time sliding windows, used only to group fragments.
function dilate(mask,w,h,gap) {
  if(gap===0)return mask;
  const before=Math.floor(gap/2),after=gap-before;
  const horizontal=new Uint8Array(w*h),output=new Uint8Array(w*h);
  for(let y=0;y<h;y++) {
    let count=0;for(let x=0;x<=Math.min(w-1,after);x++)count+=mask[y*w+x];
    for(let x=0;x<w;x++) {
      horizontal[y*w+x]=count>0;
      if(x-before>=0)count-=mask[y*w+x-before];
      if(x+after+1<w)count+=mask[y*w+x+after+1];
    }
  }
  for(let x=0;x<w;x++) {
    let count=0;for(let y=0;y<=Math.min(h-1,after);y++)count+=horizontal[y*w+x];
    for(let y=0;y<h;y++) {
      output[y*w+x]=count>0;
      if(y-before>=0)count-=horizontal[(y-before)*w+x];
      if(y+after+1<h)count+=horizontal[(y+after+1)*w+x];
    }
  }
  return output;
}

function components(mask,w,h) {
  const labels=new Int32Array(w*h),queue=new Int32Array(w*h);let label=0;
  for(let start=0;start<mask.length;start++) {
    if(!mask[start]||labels[start])continue;
    label++;let head=0,tail=1;queue[0]=start;labels[start]=label;
    while(head<tail) {
      const p=queue[head++],x=p%w,y=Math.floor(p/w);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
        const next=ny*w+nx;if(mask[next]&&!labels[next]){labels[next]=label;queue[tail++]=next;}
      }
    }
  }
  return labels;
}

// Input: RGBA bytes, image dimensions in px, calibration, gap in px.
// Output: candidates with source [u,v] px points; no points are invented in missing columns.
export function extractCurves({data,width,height,references,values,gap=12}) {
  validateCalibration(references,values);
  if(!Number.isInteger(gap)||gap<0||gap>100)throw new Error('接続距離は0～100 pxの整数で指定する必要がある。');
  const [x0,x1]=[references.x_min[0],references.x_max[0]].sort((a,b)=>a-b);
  const [y0,y1]=[references.y_min[1],references.y_max[1]].sort((a,b)=>a-b);
  const left=Math.max(0,Math.ceil(x0)+3),right=Math.min(width,Math.floor(x1)-2);
  const top=Math.max(0,Math.ceil(y0)+3),bottom=Math.min(height,Math.floor(y1)-2);
  const w=right-left,h=bottom-top;if(w<10||h<10)throw new Error('抽出範囲が不足している。軸の基準点を確認する必要がある。');
  const n=w*h,gray=new Uint8Array(n),kind=new Uint8Array(n),histogram=new Uint32Array(256);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,offset=((y+top)*width+x+left)*4;
    const alpha=data[offset+3]/255;
    const r=data[offset]*alpha+255*(1-alpha),g=data[offset+1]*alpha+255*(1-alpha),b=data[offset+2]*alpha+255*(1-alpha);
    gray[i]=Math.round(.299*r+.587*g+.114*b);histogram[gray[i]]++;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,saturation=max?delta/max*255:0;
    if(saturation<60){kind[i]=0;continue;}
    let hue=delta===0?0:max===r?60*((g-b)/delta%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);
    if(hue<0)hue+=360;
    kind[i]=1+Math.floor(((hue+30)%360)/60);
  }
  const threshold=otsu(histogram,n),names=['黒・灰色','赤','黄','緑','水色','青','紫'],candidates=[];
  for(let color=0;color<7;color++) {
    let mask=new Uint8Array(n),present=false;
    for(let i=0;i<n;i++)if(kind[i]===color&&gray[i]<=(color===0?threshold:244)){mask[i]=1;present=true;}
    if(!present)continue;
    if(color===0)mask=removeGrid(mask,w,h);
    const labels=components(dilate(mask,w,h,gap),w,h),groups=new Map();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=y*w+x;if(!mask[i])continue;
      const label=labels[i];let group=groups.get(label);
      if(!group){group={columns:new Map(),count:0,min:w,max:0};groups.set(label,group);}
      let rows=group.columns.get(x);if(!rows){rows=[];group.columns.set(x,rows);}
      rows.push(y);group.count++;group.min=Math.min(group.min,x);group.max=Math.max(group.max,x);
    }
    for(const group of groups.values()) {
      const span=group.max-group.min+1;if(group.count<20||span<Math.max(12,Math.floor(w*.05)))continue;
      const points=[];
      for(const [x,rows] of group.columns) {
        const middle=Math.floor(rows.length/2),y=rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;
        points.push([left+x,top+y]);
      }
      points.sort((a,b)=>toGraph(a,references,values)[0]-toGraph(b,references,values)[0]);
      candidates.push({name:`${names[color]} / ${span} px / ${points.length} 点`,points,span});
    }
  }
  candidates.sort((a,b)=>b.span-a.span||b.points.length-a.points.length);
  return candidates;
}
