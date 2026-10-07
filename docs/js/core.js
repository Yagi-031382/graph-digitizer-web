export const keys = ['x_min','x_max','y_min','y_max'];
export function validateCalibration(references, values) {
  for (const key of keys) {
    if (!references[key]) throw new Error('軸の基準点をすべて指定する必要がある。');
    if (!references[key].every(Number.isFinite) || !Number.isFinite(values[key])) throw new Error('基準点と軸値は有限の数値で指定する必要がある。');
  }
  if (references.x_min[0] === references.x_max[0]) throw new Error('x軸の基準点は異なる水平位置に指定する必要がある。');
  if (references.y_min[1] === references.y_max[1]) throw new Error('y軸の基準点は異なる垂直位置に指定する必要がある。');
  for (const axis of ['x','y']) if (values[axis+'_max'] <= values[axis+'_min']) throw new Error(axis+'軸の最大値は最小値を超える必要がある。');
}
// Input: source [u,v] in px, references in px, axis values. Output: [x,y] in axis units.
export function toGraph([u,v], refs, values) {
  return [values.x_min+(u-refs.x_min[0])/(refs.x_max[0]-refs.x_min[0])*(values.x_max-values.x_min), values.y_min+(v-refs.y_min[1])/(refs.y_max[1]-refs.y_min[1])*(values.y_max-values.y_min)];
}
// Input: CSV text. Output: finite numeric [x,y] rows, preserving file order.
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const char=text[i];
    if(char==='"') {
      if(quoted&&text[i+1]==='"'){field+='"';i++;}
      else if(quoted){quoted=false;}
      else if(field===''){quoted=true;}
      else throw new Error('CSVの引用符を確認する必要がある。');
    } else if(!quoted&&char===','){row.push(field);field='';}
    else if(!quoted&&(char==='\n'||char==='\r')) {
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];field='';
    }else field+=char;
  }
  if(quoted)throw new Error('CSVの引用符が閉じられていない。');
  row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);
  if(rows.length<2)throw new Error('CSVには列名とデータ行が必要である。');
  const headers=rows.shift().map(x=>x.trim());
  const ix=headers.indexOf('x'),iy=headers.indexOf('y');
  if(ix<0||iy<0)throw new Error('CSVにx列とy列が必要である。');
  if(headers.filter(x=>x==='x').length!==1||headers.filter(x=>x==='y').length!==1)throw new Error('x列とy列の重複がある。');
  const numberPattern=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  return rows.map((r,index)=>{
    const a=(r[ix]??'').trim(),b=(r[iy]??'').trim();
    if(!numberPattern.test(a)||!numberPattern.test(b)||![Number(a),Number(b)].every(Number.isFinite))throw new Error(`データの${index+1}行目に数値以外または空欄がある。`);
    return [Number(a),Number(b)];
  });
}
// Input: graph [x,y] rows. Output: UTF-8 BOM CSV string, x,y columns.
export function makeCSV(points) { return '\uFEFFx,y\r\n'+points.map(p=>p.map(n=>Number(n.toPrecision(12))).join(',')).join('\r\n')+'\r\n'; }
