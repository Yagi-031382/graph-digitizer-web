import {keys,validateCalibration,toGraph,parseCSV,makeCSV} from './core.js';
import {drawPlot,curveColor} from './plot.js';
const $=id=>document.getElementById(id);
const state={image:null,name:'',source:null,references:{},points:[],selected:null,candidates:[],zoom:1,dirty:false,revision:0,curves:new Map(),busy:false};
let worker=null,jobRevision=0,jobId=0;

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function values(){return Object.fromEntries(keys.map(k=>[k,$(k).value.trim()===''?NaN:Number($(k).value)]));}
function calibration(){const v=values();validateCalibration(state.references,v);return v;}
function invalidate(){state.revision++;state.candidates=[];$('candidate').replaceChildren(new Option('未検出',''));}
function graphPoints(){try{const v=calibration();return state.points.map(p=>toGraph(p,state.references,v));}catch{return [];}}
function renderPlot(){drawPlot($('acquirePlot'),[{points:graphPoints(),color:'#1565c0'}],$('xLabel').value,$('yLabel').value,{selected:state.selected});}
function renderImage(){
  if(!state.image)return;
  const canvas=$('imageCanvas'),ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(state.image,0,0);
  const radius=4/state.zoom;ctx.font=`${12/state.zoom}px system-ui`;ctx.lineWidth=1/state.zoom;
  function point([u,v],label,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(u,v,radius,0,Math.PI*2);ctx.fill();if(label)ctx.fillText(label,u+6/state.zoom,v-6/state.zoom);}
  for(const [key,p]of Object.entries(state.references))point(p,key,'#b86a00');
  state.points.forEach((p,index)=>point(p,state.points.length<=80?String(index+1):'','#d500b5'));
}
function renderTable(){
  const graph=graphPoints(),fragment=document.createDocumentFragment();
  state.points.forEach(([u,v],index)=>{
    const row=document.createElement('tr');row.dataset.index=index;row.tabIndex=index===(state.selected??0)?0:-1;
    row.classList.toggle('selected',index===state.selected);row.setAttribute('aria-selected',String(index===state.selected));
    for(const n of [index+1,u,v,...(graph[index]||[null,null])]){const cell=document.createElement('td');cell.textContent=n===null?'—':Number(n.toPrecision(10)).toString();row.append(cell);}
    fragment.append(row);
  });
  $('pointRows').replaceChildren(fragment);$('pointCount').textContent=`${state.points.length} 点`;
  $('tableX').textContent=$('xLabel').value;$('tableY').textContent=$('yLabel').value;
}
function refresh(){
  for(const key of keys)$('ref-'+key).textContent=state.references[key]?`u=${state.references[key][0].toFixed(2)} px, v=${state.references[key][1].toFixed(2)} px`:'未指定';
  renderImage();renderTable();renderPlot();
}
function setZoom(zoom){
  if(!state.image)return;
  state.zoom=Math.max(.01,Math.min(100,zoom));
  const canvas=$('imageCanvas');canvas.style.width=`${canvas.width*state.zoom}px`;canvas.style.height=`${canvas.height*state.zoom}px`;
  $('zoomValue').textContent=`${Math.round(state.zoom*100)} %`;renderImage();
}
function fit(){if(state.image)setZoom(Math.min(($('imageViewport').clientWidth-4)/state.image.naturalWidth,($('imageViewport').clientHeight-4)/state.image.naturalHeight));}
function selectRow(index){
  state.selected=index;
  for(const row of $('pointRows').rows){const selected=Number(row.dataset.index)===index;row.classList.toggle('selected',selected);row.setAttribute('aria-selected',String(selected));row.tabIndex=selected?0:-1;}
  renderPlot();
}
function applyCandidate(){
  const index=Number($('candidate').value),candidate=state.candidates[index];if(!candidate)return;
  if(state.points.length&&!confirm('現在の取得点を選択候補で置き換えるか。'))return;
  state.points=candidate.points.map(p=>[...p]);state.selected=null;state.dirty=true;refresh();
  status(`${state.points.length} 点を取得した。元画像と再描画を確認してからCSVを保存する。`);
}

$('imageFile').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(state.dirty&&!confirm('未保存の取得点を破棄して画像を変更するか。'))return;
  if(!/\.(png|jpe?g)$/i.test(file.name)){status('PNGまたはJPEG画像を選択する必要がある。',true);return;}
  const url=URL.createObjectURL(file),image=new Image();
  try {
    image.src=url;await image.decode();
    const original=document.createElement('canvas');original.width=image.naturalWidth;original.height=image.naturalHeight;
    const ctx=original.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,original.width,original.height);ctx.drawImage(image,0,0);
    const source=ctx.getImageData(0,0,original.width,original.height);
    state.image=image;state.source=source;state.name=file.name;state.references={};state.points=[];state.selected=null;state.dirty=false;invalidate();
    const canvas=$('imageCanvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.hidden=false;$('imageEmpty').hidden=true;
    $('imageName').textContent=file.name;$('clickMode').value='x_min';fit();refresh();status('軸値を入力し、x軸最小点から順に目盛位置を指定する。');
  }catch(error){status('画像を読み込めなかった：'+error.message,true);}
  finally{URL.revokeObjectURL(url);}
});
$('imageCanvas').addEventListener('click',event=>{
  if(!state.image)return;
  const rect=event.currentTarget.getBoundingClientRect(),p=[(event.clientX-rect.left)/rect.width*event.currentTarget.width,(event.clientY-rect.top)/rect.height*event.currentTarget.height];
  const mode=$('clickMode').value;
  if(mode==='curve'){
    try{calibration();}catch(error){status(error.message,true);return;}
    state.points.push(p);state.dirty=true;status(`${state.points.length} 点を取得した。`);
  }else {
    state.references[mode]=p;invalidate();state.dirty=state.dirty||!!state.points.length;
    $('clickMode').value=keys[keys.indexOf(mode)+1]||'curve';
    try{calibration();status('校正済み。手動で曲線をクリックするか、「曲線を自動検出」を押す。');}catch{status('次の軸の基準点を指定する。');}
  }
  refresh();
});
keys.forEach(key=>$(key).addEventListener('input',()=>{invalidate();state.dirty=state.dirty||!!state.points.length;refresh();try{calibration();status('軸値を更新した。取得点の座標を再計算した。');}catch(error){status(error.message,true);}}));
for(const id of ['xLabel','yLabel'])$(id).addEventListener('input',refresh);
$('gap').addEventListener('input',invalidate);
$('fitImage').onclick=fit;$('zoomIn').onclick=()=>setZoom(state.zoom*1.2);$('zoomOut').onclick=()=>setZoom(state.zoom/1.2);
$('imageViewport').addEventListener('wheel',event=>{
  if(!state.image)return;event.preventDefault();
  const view=$('imageViewport'),rect=view.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  const sourceX=(view.scrollLeft+x)/state.zoom,sourceY=(view.scrollTop+y)/state.zoom;
  setZoom(state.zoom*(event.deltaY<0?1.2:1/1.2));view.scrollLeft=sourceX*state.zoom-x;view.scrollTop=sourceY*state.zoom-y;
},{passive:false});
$('pointRows').addEventListener('click',event=>{const row=event.target.closest('tr');if(row){selectRow(Number(row.dataset.index));row.focus();}});
$('pointRows').addEventListener('keydown',event=>{
  const row=event.target.closest('tr');if(!row)return;const index=Number(row.dataset.index);
  if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();const next=Math.max(0,Math.min(state.points.length-1,index+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));selectRow(next);$('pointRows').rows[next].focus();$('pointRows').rows[next].scrollIntoView({block:'nearest'});}
  if(event.key==='Escape'){state.selected=null;refresh();}
});
$('undo').onclick=()=>{if(state.points.length){state.points.pop();state.selected=null;state.dirty=true;refresh();status('最後の点を削除した。');}};
$('deletePoint').onclick=()=>{if(state.selected!==null){state.points.splice(state.selected,1);state.selected=null;state.dirty=true;refresh();status('選択点を削除した。');}else status('削除する点を取得点の表で選択する必要がある。',true);};
$('saveCSV').onclick=()=>{
  try {
    const v=calibration();if(!state.points.length)throw new Error('曲線のデータ点を取得する必要がある。');
    const blob=new Blob([makeCSV(state.points.map(p=>toGraph(p,state.references,v)))],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=(state.name.replace(/\.(png|jpe?g)$/i,'')||'curve')+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    state.dirty=false;status('CSVのダウンロードを開始した：'+link.download);
  }catch(error){status(error.message,true);}
};
$('applyCandidate').onclick=applyCandidate;
$('detect').onclick=()=>{
  try {
    const v=calibration();if(!state.source)throw new Error('画像を読み込む必要がある。');
    const gap=Number($('gap').value);if($('gap').value===''||!Number.isInteger(gap)||gap<0||gap>100)throw new Error('接続距離は0～100 pxの整数で指定する必要がある。');
    if(state.busy)return;
    if(!worker) {
      worker=new Worker(new URL('./extraction-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        if(data.id!==jobId)return;state.busy=false;$('detect').disabled=false;
        if(jobRevision!==state.revision){status('画像または軸の設定が変わったため、検出結果を破棄した。再度検出する必要がある。');return;}
        if(data.error){status(data.error,true);return;}
        state.candidates=data.candidates;$('candidate').replaceChildren();
        if(!state.candidates.length){$('candidate').append(new Option('候補なし',''));status('候補が見つからなかった。接続距離や基準点を確認し、手動取得も利用できる。',true);return;}
        state.candidates.forEach((candidate,index)=>$('candidate').append(new Option(candidate.name,index)));
        status(`${state.candidates.length} 候補を検出した。`);applyCandidate();
      };
      worker.onerror=()=>{state.busy=false;$('detect').disabled=false;worker.terminate();worker=null;status('自動検出を実行できなかった。HTTP/HTTPSで開き、対応ブラウザーを確認する必要がある。',true);};
    }
    state.busy=true;$('detect').disabled=true;jobRevision=state.revision;jobId++;status('曲線を検出している…');
    const copy=state.source.data.slice();worker.postMessage({id:jobId,data:copy,width:state.source.width,height:state.source.height,references:state.references,values:v,gap},[copy.buffer]);
  }catch(error){status(error.message,true);}
};

function renderComparison(){
  const curves=[...state.curves.values()].map((c,index)=>({...c,color:curveColor(index,state.curves.size)}));
  drawPlot($('comparePlot'),curves,$('compareX').value,$('compareY').value,{showPoints:$('showPoints').checked});
  $('curveCount').textContent=`${curves.length} 曲線`;$('csvEmpty').hidden=!!curves.length;
  $('curveList').replaceChildren();$('legend').replaceChildren();
  curves.forEach(curve=>{
    const swatch=()=>{const node=document.createElement('i');node.className='swatch';node.style.background=curve.color;return node;};
    const li=document.createElement('li'),name=document.createElement('span'),button=document.createElement('button');name.textContent=curve.name;name.title=`${curve.name} / ${curve.points.length} 点`;button.textContent='除外';button.setAttribute('aria-label',curve.name+'を比較から除外');button.onclick=()=>{state.curves.delete(curve.name);renderComparison();};li.append(swatch(),name,button);$('curveList').append(li);
    const legend=document.createElement('span');legend.append(swatch(),document.createTextNode(curve.name));$('legend').append(legend);
  });
}
$('csvFiles').addEventListener('change',async event=>{
  const files=[...event.target.files];event.target.value='';const errors=[];
  for(const file of files){try{const points=parseCSV(await file.text());state.curves.set(file.name,{name:file.name,points});}catch(error){errors.push(file.name+'：'+error.message);}}
  renderComparison();status(errors.length?errors.join(' / '):`${files.length} ファイルを読み込んだ。`,!!errors.length);
});
for(const id of ['showPoints','compareX','compareY'])$(id).addEventListener(id==='showPoints'?'change':'input',renderComparison);
function switchMode(mode){
  const comparison=mode==='compare';$('acquire').hidden=comparison;$('compare').hidden=!comparison;
  for(const [id,active]of [['acquireTab',!comparison],['compareTab',comparison]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));}
  if(comparison){renderComparison();status('CSVを読み込み、色と凡例で曲線を比較する。');}else{refresh();status('画像の軸の基準点と取得点は保持されている。');}
}
$('acquireTab').onclick=()=>switchMode('acquire');$('compareTab').onclick=()=>switchMode('compare');
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
let resizing=false;new ResizeObserver(()=>{if(resizing)return;resizing=true;requestAnimationFrame(()=>{renderPlot();renderComparison();resizing=false;});}).observe(document.querySelector('main'));
refresh();renderComparison();
