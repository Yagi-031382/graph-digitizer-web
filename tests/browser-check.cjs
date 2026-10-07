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
    await page.waitForFunction(()=>!document.getElementById('imageCanvas').hidden);
    await page.locator('#x_max').fill('40');await page.locator('#y_max').fill('6');
    async function clickPixel(u,v){await page.locator('#imageCanvas').scrollIntoViewIfNeeded();const box=await page.locator('#imageCanvas').boundingBox();await page.mouse.click(box.x+u/640*box.width,box.y+v/480*box.height);}
    for(const p of [[60,420],[580,420],[60,420],[60,60]])await clickPixel(...p);
    await clickPixel(320,240);await clickPixel(450,180);
    assert.equal(await page.locator('#pointRows tr').count(),2);
    const cells=await page.locator('#pointRows tr').first().locator('td').allTextContents();
    assert.ok(Math.abs(Number(cells[3])-20)<.15);assert.ok(Math.abs(Number(cells[4])-3)<.03);
    await page.locator('#pointRows tr').first().click();
    const orange=await page.evaluate(()=>{const c=document.getElementById('acquirePlot'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]===255&&p[i+1]===140&&p[i+2]===0)count++;return count;});
    assert.ok(orange>20);
    await page.locator('#zoomIn').click();await clickPixel(320,240);
    const zoomed=await page.locator('#pointRows tr').last().locator('td').allTextContents();assert.ok(Math.abs(Number(zoomed[3])-20)<.15);
    await page.locator('#fitImage').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#saveCSV').click();const download=await downloadPromise;
    const text=await fs.readFile(await download.path(),'utf8');assert.ok(text.startsWith('\uFEFFx,y'));assert.equal(text.trim().split('\n').length,4);
    await page.locator('#detect').click();
    await page.waitForFunction(()=>document.getElementById('pointRows').rows.length>150,{timeout:15000});
    assert.ok(await page.locator('#candidate option').count()>=1);
    const automaticDownload=page.waitForEvent('download');await page.locator('#saveCSV').click();const autoCSV=await fs.readFile(await (await automaticDownload).path(),'utf8');
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
    await page.screenshot({path:path.resolve(__dirname,'../test-results-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.locator('#compareTab').click();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.resolve(__dirname,'../test-results-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('Browser checks passed: image, calibration, zoom, selected orange point, CSV, auto extraction, comparison, toggle, invalid CSV, responsive layout.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
