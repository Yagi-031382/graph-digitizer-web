import {drawPlot} from './plot.js';
import {overlayBounds,layerTransform} from './overlay-core.js';
const $=id=>document.getElementById(id),layers=[];
let selected=null,zoom=1,nextId=0,loadError='';
const fields={overlayXMin:'x_min',overlayXMax:'x_max',overlayYMin:'y_min',overlayYMax:'y_max'};
const active=()=>layers.find(layer=>layer.id===selected);
function report(message=''){$('overlayError').textContent=message;$('overlayError').hidden=!message;}
function renderList(){
  $('overlayList').replaceChildren();
  for(const layer of layers){
    const li=document.createElement('li'),visible=document.createElement('input'),select=document.createElement('button'),remove=document.createElement('button');
    visible.type='checkbox';visible.checked=layer.visible;visible.setAttribute('aria-label',layer.name+'を表示');
    visible.onchange=()=>{layer.visible=visible.checked;renderComposite();};
    select.textContent=layer.name;select.setAttribute('aria-pressed',String(selected===layer.id));select.onclick=()=>selectLayer(layer.id);
    remove.textContent='除外';remove.setAttribute('aria-label',layer.name+'を重ね合わせから除外');remove.onclick=()=>{
      layers.splice(layers.indexOf(layer),1);if(selected===layer.id)selectLayer(layers[0]?.id??null);else{renderList();renderComposite();}
    };
    li.append(visible,select,remove);$('overlayList').append(li);
  }
}
function selectLayer(id){
  selected=id;const layer=active();$('overlayCalibration').disabled=!layer;$('overlayStage').hidden=!layer;
  $('overlaySelected').textContent=layer?layer.name:'画像を追加する';
  if(layer){
    for(const [id,key]of Object.entries(fields))$(id).value=String(layer.values[key]);
    $('overlayOpacity').value=String(Math.round(layer.opacity*100));$('overlayOpacityValue').textContent=$('overlayOpacity').value+' %';fit();
  }else $('overlayCoordinates').textContent='画像を追加して校正する。';
  renderList();renderOverlay();
}
function fit(){
  const layer=active();if(!layer)return;
  zoom=Math.min(($('overlayViewport').clientWidth-4)/layer.width,416/layer.height);setZoom(zoom);
  $('overlayViewport').scrollLeft=0;$('overlayViewport').scrollTop=0;
}
function setZoom(value){zoom=Math.max(.01,Math.min(20,value));renderSource();}
function renderSource(){
  const layer=active();if(!layer)return;
  const canvas=$('overlaySource');canvas.width=layer.width;canvas.height=layer.height;
  canvas.style.width=layer.width*zoom+'px';canvas.style.height=layer.height*zoom+'px';
  $('overlayStage').style.width=canvas.style.width;$('overlayStage').style.height=canvas.style.height;
  canvas.getContext('2d').drawImage(layer.image,0,0);
  for(const key of ['x_min','x_max','y_min','y_max']){
    const vertical=key[0]==='x',position=(key.endsWith('min')?layer.min:layer.max)[vertical?0:1],line=$('overlay-axis-'+key);
    line.style[vertical?'left':'top']=position*zoom+'px';line.title=position.toFixed(2)+' px';
    line.setAttribute('role','slider');line.setAttribute('aria-orientation',vertical?'horizontal':'vertical');
    line.setAttribute('aria-valuemin','0');line.setAttribute('aria-valuemax',String((vertical?layer.width:layer.height)-1));line.setAttribute('aria-valuenow',String(position));
  }
  $('overlayCoordinates').textContent=`最小交点：(${layer.min.map(n=>n.toFixed(2)).join(', ')}) px ／ 最大交点：(${layer.max.map(n=>n.toFixed(2)).join(', ')}) px`;
}
function renderComposite(){
  const canvas=$('overlayPlot'),visible=layers.filter(layer=>layer.visible);
  $('overlayCount').textContent=`${visible.length} / ${layers.length} 画像`;
  try{
    const b=overlayBounds(visible),series=visible.map(layer=>({points:[[layer.values.x_min,layer.values.y_min],[layer.values.x_max,layer.values.y_max]],color:'transparent'}));
    const layout=drawPlot(canvas,series,$('overlayXLabel').value,$('overlayYLabel').value,{showPoints:false,ranges:{x:{mode:'manual',min:b.xmin,max:b.xmax},y:{mode:'manual',min:b.ymin,max:b.ymax}}});
    const ctx=canvas.getContext('2d'),ratio=window.devicePixelRatio||1;
    for(const layer of visible){
      const transform=layerTransform(layer,layout.map),v=layer.values,a=layout.map([v.x_min,v.y_min]),z=layout.map([v.x_max,v.y_max]);
      ctx.save();ctx.beginPath();ctx.rect(a[0],z[1],z[0]-a[0],a[1]-z[1]);ctx.clip();ctx.globalAlpha=layer.opacity;
      ctx.setTransform(ratio*transform.sx,0,0,ratio*transform.sy,ratio*transform.tx,ratio*transform.ty);ctx.drawImage(layer.image,0,0);ctx.restore();
    }
    report(loadError);
  }catch(error){canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);report([loadError,error.message].filter(Boolean).join(' / '));}
}
export function renderOverlay(){if(!$('overlay').hidden){renderSource();renderComposite();}}
export function initOverlay(){
  $('overlayFiles').addEventListener('change',async event=>{
    const files=[...event.target.files];event.target.value='';const errors=[];loadError='';
    for(const file of files){
      let url;
      try{
        if(!/\.(png|webp)$/i.test(file.name))throw new Error('PNG・WebPを選択する必要がある。');
        url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
        if(image.naturalWidth<2||image.naturalHeight<2)throw new Error('縦横2 px以上の画像を選択する必要がある。');
        layers.push({id:++nextId,name:file.name,image,width:image.naturalWidth,height:image.naturalHeight,min:[image.naturalWidth*.1,image.naturalHeight*.9],max:[image.naturalWidth*.9,image.naturalHeight*.1],values:{x_min:0,x_max:100,y_min:0,y_max:1},opacity:1,visible:true});
      }catch(error){errors.push(file.name+'：'+error.message);}finally{if(url)URL.revokeObjectURL(url);}
    }
    loadError=errors.join(' / ');selectLayer(layers.at(-1)?.id??null);
  });
  for(const [id,key]of Object.entries(fields))$(id).addEventListener('input',()=>{
    const layer=active();if(!layer)return;layer.values[key]=$(id).value.trim()===''?NaN:Number($(id).value);renderComposite();
  });
  $('overlayOpacity').addEventListener('input',()=>{const layer=active();if(!layer)return;layer.opacity=Number($('overlayOpacity').value)/100;$('overlayOpacityValue').textContent=$('overlayOpacity').value+' %';renderComposite();});
  for(const id of ['overlayXLabel','overlayYLabel'])$(id).addEventListener('input',renderComposite);
  $('overlayZoomIn').onclick=()=>setZoom(zoom*1.2);$('overlayZoomOut').onclick=()=>setZoom(zoom/1.2);$('overlayFit').onclick=fit;
  for(const key of ['x_min','x_max','y_min','y_max']){
    const line=$('overlay-axis-'+key),vertical=key[0]==='x',index=vertical?0:1;let drag=null;
    const move=position=>{
      const layer=active();if(!layer)return;
      (key.endsWith('min')?layer.min:layer.max)[index]=Math.max(0,Math.min((vertical?layer.width:layer.height)-1,position));renderSource();renderComposite();
    };
    line.addEventListener('pointerdown',event=>{
      if(event.button!==0||!active())return;event.preventDefault();line.focus();line.setPointerCapture(event.pointerId);
      drag={id:event.pointerId,layer:selected,client:vertical?event.clientX:event.clientY,position:(key.endsWith('min')?active().min:active().max)[index]};
    });
    line.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId||drag.layer!==selected)return;
      const rect=$('overlaySource').getBoundingClientRect(),scale=vertical?active().width/rect.width:active().height/rect.height;
      move(drag.position+((vertical?event.clientX:event.clientY)-drag.client)*scale);
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])line.addEventListener(name,event=>{
      if(drag?.id===event.pointerId){drag=null;if(line.hasPointerCapture(event.pointerId))line.releasePointerCapture(event.pointerId);}
    });
    line.addEventListener('keydown',event=>{
      const negative=vertical?'ArrowLeft':'ArrowUp',positive=vertical?'ArrowRight':'ArrowDown';
      if(!active()||![negative,positive].includes(event.key))return;event.preventDefault();
      move((key.endsWith('min')?active().min:active().max)[index]+(event.key===negative?-1:1)*(event.shiftKey?10:1));
    });
  }
}
