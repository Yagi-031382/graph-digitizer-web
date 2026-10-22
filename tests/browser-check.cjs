// Optional browser verification: npm install --no-save playwright; npx playwright install chromium.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'../docs');

(async()=>{
  const server=http.createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/graph-digitizer-web\//,'/');
      const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!filename.startsWith(root+path.sep))throw Error('Invalid path');
      res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':'application/octet-stream');
      res.end(await fs.readFile(filename));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/graph-digitizer-web/`);
    const image=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.strokeStyle='black';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(60,60);ctx.lineTo(60,420);ctx.lineTo(580,420);ctx.stroke();ctx.fillStyle='black';
      for(let x=80;x<=560;x++)if((x-80)%20<14){ctx.beginPath();ctx.arc(x,370-(x-80)*.5,1,0,Math.PI*2);ctx.fill();}
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#imageFile').setInputFiles({name:'論文.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
    await page.locator('#imageCanvas').waitFor({state:'visible'});
    await page.locator('#x_max').fill('40');await page.locator('#y_max').fill('6');
    async function clickPixel(u,v){await page.locator('#imageCanvas').scrollIntoViewIfNeeded();const box=await page.locator('#imageCanvas').boundingBox();await page.mouse.click(box.x+u/640*box.width,box.y+v/480*box.height);}
    assert.equal(await page.locator('#axisOverlay button').count(),4);
    async function dragAxis(key,target){
      const line=page.locator('#axis-'+key),handle=line.locator('span');
      await line.focus();await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox(),canvas=await page.locator('#imageCanvas').boundingBox();
      const current=Number(await line.getAttribute('aria-valuenow')),vertical=key.startsWith('x');
      const delta=(target-current)*(vertical?canvas.width/640:canvas.height/480);
      const x=box.x+box.width/2,y=box.y+box.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(vertical?delta:0),y+(vertical?0:delta),{steps:8});await page.mouse.up();
      assert.ok(Math.abs(Number(await line.getAttribute('aria-valuenow'))-Math.max(0,Math.min(vertical?639:479,target)))<.05,`${key}: expected ${target}, got ${await line.getAttribute('aria-valuenow')}`);
    }
    // Background clicks do not calibrate or acquire points in line-editing mode.
    await clickPixel(320,240);assert.equal(await page.locator('#pointRows tr').count(),0);
    await dragAxis('y_min',-50);await dragAxis('y_max',-50);
    assert.ok(await page.locator('#status').evaluate(node=>node.classList.contains('error')));
    for(const [key,target] of [['x_min',60],['x_max',580],['y_min',420],['y_max',60]])await dragAxis(key,target);
    assert.match(await page.locator('#ref-x_min').textContent(),/u=60.00 px, v=420.00 px/);
    assert.match(await page.locator('#ref-y_min').textContent(),/u=60.00 px, v=420.00 px/);
    assert.match(await page.locator('#ref-x_max').textContent(),/u=580.00 px, v=420.00 px/);
    assert.match(await page.locator('#ref-y_max').textContent(),/u=60.00 px, v=60.00 px/);
    await page.locator('#axis-x_min').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
    await page.locator('#axis-y_max').focus();await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Shift+ArrowUp');
    await page.locator('#clickMode').selectOption('curve');
    await clickPixel(320,240);await clickPixel(450,180);
    assert.equal(await page.locator('#pointRows tr').count(),2);
    const cells=await page.locator('#pointRows tr').first().locator('td').allTextContents();
    assert.ok(Math.abs(Number(cells[3])-20)<.15);assert.ok(Math.abs(Number(cells[4])-3)<.03);
    await page.locator('#pointRows tr').first().click();
    const orange=await page.evaluate(()=>{const c=document.getElementById('acquirePlot'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]===255&&p[i+1]===140&&p[i+2]===0)count++;return count;});
    assert.ok(orange>20);
    await page.locator('#zoomIn').click();
    await page.locator('#clickMode').selectOption('axes');
    await dragAxis('x_max',560);
    const recalculated=await page.locator('#pointRows tr').first().locator('td').allTextContents();assert.ok(Math.abs(Number(recalculated[3])-20.8)<.15);
    assert.equal(await page.locator('#pointRows tr').count(),2);
    await dragAxis('x_max',580);
    await page.locator('#clickMode').selectOption('curve');await clickPixel(320,240);
    const zoomed=await page.locator('#pointRows tr').last().locator('td').allTextContents();assert.ok(Math.abs(Number(zoomed[3])-20)<.15);
    await page.locator('#fitImage').click();
    await page.locator('#clickMode').selectOption('axes');
    await page.screenshot({path:path.resolve(__dirname,'../test-results-calibration.png'),fullPage:true});
    await page.locator('#clickMode').selectOption('curve');
    const downloadPromise=page.waitForEvent('download');await page.locator('#saveCSV').click();const download=await downloadPromise;
    const text=await fs.readFile(await download.path(),'utf8');assert.ok(text.startsWith('\uFEFFx,y'));assert.equal(text.trim().split('\n').length,4);
    await page.locator('#detect').click();
    await page.waitForFunction(()=>document.getElementById('pointRows').rows.length>150,{timeout:15000});
    assert.ok(await page.locator('#candidate option').count()>=1);
    const automaticDownload=page.waitForEvent('download');await page.locator('#saveCSV').click();const autoCSV=await fs.readFile(await (await automaticDownload).path(),'utf8');
    await page.locator('#clickMode').selectOption('axes');
    await page.locator('#axis-x_min').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#candidate option').count(),1);assert.equal(await page.locator('#candidate').inputValue(),'');
    assert.ok(await page.locator('#pointRows tr').count()>150);
    await page.keyboard.press('ArrowLeft');
    await page.locator('#compareTab').click();
    await page.locator('#csvFiles').setInputFiles([{name:'H1.csv',mimeType:'text/csv',buffer:Buffer.from(autoCSV)},{name:'H2.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n0,1\n20,3\n40,5\n')}]);
    await page.waitForFunction(()=>document.getElementById('curveList').children.length===2);
    assert.equal(await page.locator('#legend span').count(),2);
    const colors=await page.locator('#legend .swatch').evaluateAll(nodes=>nodes.map(n=>n.style.background));assert.notEqual(colors[0],colors[1]);
    const before=await page.locator('#comparePlot').evaluate(c=>c.toDataURL());await page.locator('#showPoints').check();const after=await page.locator('#comparePlot').evaluate(c=>c.toDataURL());assert.notEqual(before,after);
    await page.locator('#showPoints').uncheck();
    await page.locator('#csvFiles').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\nNaN,2\n')});
    await page.waitForFunction(()=>document.getElementById('status').classList.contains('error'));assert.equal(await page.locator('#curveList li').count(),2);
    await page.locator('#curveList button').first().click();assert.equal(await page.locator('#curveList li').count(),1);
    await page.locator('#acquireTab').click();assert.ok(await page.locator('#pointRows tr').count()>150);
    await page.locator('#compareTab').click();
    assert.equal(await page.locator('#compareXMode').inputValue(),'auto');
    assert.equal(await page.locator('#compareYMode').inputValue(),'auto');
    assert.ok(await page.locator('#compareXMin').isEnabled());
    assert.ok(await page.locator('#compareXMax').isEnabled());
    await page.locator('#curveList button').first().click();
    await page.locator('#csvFiles').setInputFiles({name:'bounds.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n-10,-10\n0,0\n10,10\n20,20\n')});
    // Enter all four bounds with real keyboard events, directly from automatic mode.
    async function typeBound(id,value){
      const input=page.locator('#'+id);assert.ok(await input.isEnabled());
      await input.focus();await input.press('ControlOrMeta+A');await input.pressSequentially(value);
      assert.equal(await input.inputValue(),value);assert.ok(await input.evaluate(node=>node===document.activeElement));
    }
    await typeBound('compareXMin','2');assert.equal(await page.locator('#compareXMode').inputValue(),'manual');
    assert.equal(await page.locator('#compareYMode').inputValue(),'auto');
    await typeBound('compareXMax','8');await typeBound('compareYMin','1');await typeBound('compareYMax','9');
    assert.equal(await page.locator('#compareYMode').inputValue(),'manual');
    assert.ok(await page.locator('#rangeError').isHidden());
    const verifyBounds=async ranges=>page.evaluate(async ranges=>{
      const {drawPlot}=await import('./js/plot.js');
      const canvas=document.getElementById('comparePlot'),actual=canvas.toDataURL();
      const layout=drawPlot(canvas,[{points:[[-10,-10],[0,0],[10,10],[20,20]],color:'#1565c0'}],document.getElementById('compareX').value,document.getElementById('compareY').value,{showPoints:document.getElementById('showPoints').checked,ranges});
      const same=actual===canvas.toDataURL();
      const ratio=devicePixelRatio||1,data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let inside=0,outside=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const i=(y*canvas.width+x)*4;
        if(data[i]===21&&data[i+1]===101&&data[i+2]===192){
          if(x/ratio<layout.left||x/ratio>layout.right||y/ratio<layout.top||y/ratio>layout.bottom)outside++;else inside++;
        }
      }
      return {same,inside,outside,bounds:layout.bounds};
    },ranges);
    const manual=await verifyBounds({x:{mode:'manual',min:2,max:8},y:{mode:'manual',min:1,max:9}});
    assert.ok(manual.same);assert.ok(manual.inside>10);assert.equal(manual.outside,0);
    await page.locator('#showPoints').check();
    assert.equal((await verifyBounds({x:{mode:'manual',min:2,max:8},y:{mode:'manual',min:1,max:9}})).outside,0);
    for(const axis of ['X','Y']){
      const min=page.locator('#compare'+axis+'Min'),zero=page.locator('#compare'+axis+'Zero');
      const previous=await min.inputValue();await zero.check();assert.ok(await min.isDisabled());assert.equal(await min.inputValue(),'0');
      assert.ok((await verifyBounds({x:{mode:'manual',min:2,max:8,zero:axis==='X'},y:{mode:'manual',min:1,max:9,zero:axis==='Y'}})).same);
      await zero.uncheck();assert.ok(await min.isEnabled());assert.equal(await min.inputValue(),previous);
    }
    for(const axis of ['X','Y']){
      const max=page.locator('#compare'+axis+'Max'),min=page.locator('#compare'+axis+'Min'),previous=await max.inputValue();
      for(const invalid of [await min.inputValue(),'0','', '1e309']){
        await max.fill(invalid);assert.ok(await page.locator('#rangeError').isVisible());assert.match(await page.locator('#rangeError').textContent(),new RegExp(axis.toLowerCase()+'軸'));
      }
      await max.fill(previous);await min.fill('');assert.ok(await page.locator('#rangeError').isVisible());
      await page.locator('#compare'+axis+'Zero').check();assert.ok(await page.locator('#rangeError').isHidden());
      await page.locator('#compare'+axis+'Zero').uncheck();assert.equal(await min.inputValue(),'');assert.ok(await page.locator('#rangeError').isVisible());
      await min.fill(axis==='X'?'2':'1');assert.ok(await page.locator('#rangeError').isHidden());
    }
    await page.locator('#compareX').fill('Time [s]');await page.locator('#compareY').fill('Force [N]');
    assert.ok((await verifyBounds({x:{mode:'manual',min:2,max:8},y:{mode:'manual',min:1,max:9}})).same);
    for(const axis of ['X','Y'])await page.locator('#compare'+axis+'Mode').selectOption('auto');
    assert.ok((await verifyBounds({})).same);assert.ok(await page.locator('#rangeError').isHidden());
    await page.locator('#compareXZero').check();assert.ok((await verifyBounds({x:{mode:'auto',zero:true}})).same);
    await page.locator('#compareXZero').uncheck();
    await typeBound('compareXMin','-2.5');
    assert.equal(await page.locator('#compareXMode').inputValue(),'manual');
    assert.equal(await page.locator('#compareYMode').inputValue(),'auto');
    assert.ok((await verifyBounds({x:{mode:'manual',min:-2.5,max:8}})).same);
    await page.locator('#compareXMode').selectOption('auto');
    assert.ok((await verifyBounds({})).same);
    await page.locator('#acquireTab').click();assert.ok(await page.locator('#pointRows tr').count()>150);
    await page.locator('#compareTab').click();assert.equal(await page.locator('#curveList li').count(),1);
    await page.screenshot({path:path.resolve(__dirname,'../test-results-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.locator('#compareTab').click();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.resolve(__dirname,'../test-results-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});await page.locator('#acquireTab').click();
    const gridImage=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');
      ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.strokeStyle='red';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(58,422);ctx.lineTo(422,58);ctx.stroke();
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#imageFile').setInputFiles({name:'格子検証.png',mimeType:'image/png',buffer:Buffer.from(gridImage,'base64')});
    await page.waitForFunction(()=>document.getElementById('imageName').textContent==='格子検証.png');
    for(const [key,target] of [['x_min',60],['x_max',580],['y_min',420],['y_max',50]])await dragAxis(key,target);
    await page.locator('#extractionMode').selectOption('grid');
    assert.ok(await page.locator('#gridControls').isVisible());assert.ok(await page.locator('#gap').isDisabled());
    await page.locator('#gridStepX').fill('20');await page.locator('#gridStepY').fill('20');
    const preview=await page.locator('#imageCanvas').evaluate(c=>c.toDataURL());
    await page.locator('#gridPreview').uncheck();
    assert.notEqual(await page.locator('#imageCanvas').evaluate(c=>c.toDataURL()),preview);
    await page.locator('#gridPreview').check();await page.locator('#zoomIn').click();
    await page.locator('#detect').click();
    await page.waitForFunction(()=>!document.getElementById('detect').disabled);
    assert.equal(await page.locator('#pointRows tr').count(),19,await page.locator('#status').textContent()+' / '+await page.locator('#candidate').textContent());
    const gridRows=await page.locator('#pointRows tr').evaluateAll(rows=>rows.map(row=>[...row.cells].slice(1).map(c=>Number(c.textContent))));
    assert.ok(gridRows.some(([u,v,x,y])=>Math.abs(u-60)<.05&&Math.abs(v-420)<.05&&Math.abs(x)<1e-8&&Math.abs(y)<1e-8));
    for(const [u,v] of gridRows){assert.ok(Math.abs((u-60)/20-Math.round((u-60)/20))<.01);assert.ok(Math.abs((420-v)/20-Math.round((420-v)/20))<.01);}
    assert.match(await page.locator('#candidate option').first().textContent(),/赤.*格子/);
    const gridDownload=page.waitForEvent('download');await page.locator('#saveCSV').click();
    const gridCSV=await fs.readFile(await (await gridDownload).path(),'utf8');assert.ok(gridCSV.startsWith('\uFEFFx,y'));assert.equal(gridCSV.trim().split('\n').length,20);
    await page.locator('#gridStepX').fill('');assert.ok(await page.locator('#gridError').isVisible());
    assert.equal(await page.locator('#candidate').inputValue(),'');
    await page.locator('#detect').click();assert.ok(await page.locator('#status').evaluate(n=>n.classList.contains('error')));
    await page.locator('#gridStepX').fill('10');assert.ok(await page.locator('#gridError').isHidden());
    await page.locator('#detect').click();await page.waitForFunction(()=>!document.getElementById('detect').disabled&&document.getElementById('pointRows').rows.length===19);
    // Horizontal spacing 10 and vertical spacing 20 still sample only their shared red intersections.
    await page.locator('#gridStepY').fill('10');await page.locator('#detect').click();
    await page.waitForFunction(()=>!document.getElementById('detect').disabled&&document.getElementById('pointRows').rows.length===37);
    await page.locator('#fitImage').click();
    await page.screenshot({path:path.resolve(__dirname,'../test-results-grid.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#extractionMode').selectOption('auto');
    assert.ok(await page.locator('#gridControls').isHidden());assert.ok(await page.locator('#gap').isEnabled());
    assert.deepEqual(errors,[]);console.log('Browser checks passed: image, draggable calibration lines, intersection coordinates, keyboard adjustment, recalibration after zoom, zoom, selected orange point, CSV, auto extraction, comparison, toggle, invalid CSV, responsive layout, keyboard entry from automatic mode, manual/automatic axis bounds, zero toggles, validation, clipping, custom units, grid preview, origin sampling, independent grid spacing, grid CSV, grid validation.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
