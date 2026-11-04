const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function(page){
  await page.setViewportSize({width:1440,height:1000});await page.locator('#overlayTab').click();
  assert.ok(await page.locator('#overlay').isVisible());assert.ok(await page.locator('#compare').isHidden());
  const files=await page.evaluate(()=>{
    const make=(width,height,paint)=>{const c=document.createElement('canvas');c.width=width;c.height=height;paint(c.getContext('2d'));return c.toDataURL('image/png').split(',')[1];};
    return [make(200,160,ctx=>{ctx.fillStyle='red';ctx.fillRect(55,75,10,10);ctx.fillStyle='#00ff00';ctx.fillRect(135,105,10,10);}),make(400,200,ctx=>{ctx.fillStyle='blue';ctx.fillRect(114,94,12,12);})];
  });
  await page.locator('#overlayFiles').setInputFiles(files.map((data,i)=>({name:'overlay-'+(i+1)+'.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
  await page.waitForFunction(()=>document.querySelectorAll('#overlayList li').length===2);
  assert.equal(await page.locator('#overlayStage .calibration-line').count(),4);
  async function dragLine(key,target,width,height){
    const line=page.locator('#overlay-axis-'+key),handle=line.locator('span');await line.focus();await handle.scrollIntoViewIfNeeded();
    const box=await handle.boundingBox(),canvas=await page.locator('#overlaySource').boundingBox(),vertical=key[0]==='x';
    const current=Number(await line.getAttribute('aria-valuenow')),delta=(target-current)*(vertical?canvas.width/width:canvas.height/height);
    const x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(vertical?delta:0),y+(vertical?0:delta),{steps:5});await page.mouse.up();
    assert.ok(Math.abs(Number(await line.getAttribute('aria-valuenow'))-target)<.1);
  }
  await page.getByRole('button',{name:'overlay-1.png',exact:true}).click();
  await dragLine('x_min',20,200,160);await dragLine('x_max',180,200,160);await dragLine('y_min',140,200,160);await dragLine('y_max',20,200,160);
  const calibrated=await page.locator('#overlayCoordinates').textContent();
  await page.locator('#overlayZoomIn').click();await dragLine('x_max',170,200,160);await dragLine('x_max',180,200,160);
  await page.locator('#overlay-axis-x_min').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
  await page.getByRole('button',{name:'overlay-2.png',exact:true}).click();
  assert.match(await page.locator('#overlayCoordinates').textContent(),/40.00, 180.00/);
  async function pixelAt(x,y,xmax=100,ymax=1){
    return page.evaluate(async({x,y,xmax,ymax})=>{
      const {drawPlot}=await import('./js/plot.js'),real=document.getElementById('overlayPlot'),scratch=document.createElement('canvas');
      Object.assign(scratch.style,{position:'fixed',left:'-10000px',width:real.clientWidth+'px',height:real.clientHeight+'px'});document.body.append(scratch);
      const layout=drawPlot(scratch,[{points:[[0,0],[xmax,ymax]],color:'transparent'}],document.getElementById('overlayXLabel').value,document.getElementById('overlayYLabel').value,{showPoints:false,ranges:{x:{mode:'manual',min:0,max:xmax},y:{mode:'manual',min:0,max:ymax}}});
      const [u,v]=layout.map([x,y]),ratio=devicePixelRatio||1;scratch.remove();
      return [...real.getContext('2d').getImageData(Math.round(u*ratio),Math.round(v*ratio),1,1).data];
    },{x,y,xmax,ymax});
  }
  assert.deepEqual((await pixelAt(25,.5)).slice(0,3),[0,0,255]);
  assert.deepEqual((await pixelAt(75,.25)).slice(0,3),[0,255,0]); // Transparent second image keeps first-image pixels.
  await page.locator('#overlayOpacity').evaluate(n=>{n.value='50';n.dispatchEvent(new Event('input',{bubbles:true}));});
  const blended=await pixelAt(25,.5);assert.ok(blended[0]>120&&blended[0]<135&&blended[2]>120&&blended[2]<135);
  await page.getByRole('checkbox',{name:'overlay-2.pngを表示',exact:true}).uncheck();
  assert.deepEqual((await pixelAt(25,.5)).slice(0,3),[255,0,0]);
  await page.getByRole('checkbox',{name:'overlay-2.pngを表示',exact:true}).check();
  await page.locator('#overlayOpacity').evaluate(n=>{n.value='100';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#overlayXMax').fill('200');assert.deepEqual((await pixelAt(50,.5,200)).slice(0,3),[0,0,255]);
  await page.locator('#overlayXMax').fill('0');assert.ok(await page.locator('#overlayError').isVisible());
  await page.locator('#overlayXMax').fill('');assert.ok(await page.locator('#overlayError').isVisible());
  await page.locator('#overlayXMax').fill('100');assert.ok(await page.locator('#overlayError').isHidden());
  await page.getByRole('button',{name:'overlay-1.png',exact:true}).click();assert.equal(await page.locator('#overlayCoordinates').textContent(),calibrated);
  assert.equal(await page.locator('#overlayXMax').inputValue(),'100');
  await page.locator('#overlayXLabel').fill('Time [s]');await page.locator('#overlayYLabel').fill('Force [N]');
  await page.screenshot({path:path.resolve(__dirname,'../test-results-overlay.png'),fullPage:true});
  await page.locator('#compareTab').click();assert.equal(await page.locator('#curveList li').count(),1);
  await page.locator('#overlayTab').click();assert.equal(await page.locator('#overlayList li').count(),2);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.resolve(__dirname,'../test-results-overlay-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'overlay-1.pngを重ね合わせから除外',exact:true}).click();
  assert.equal(await page.locator('#overlayList li').count(),1);assert.equal(await page.locator('#overlaySelected').textContent(),'overlay-2.png');
  await page.locator('#overlayFiles').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
  assert.ok(await page.locator('#overlayError').isVisible());assert.equal(await page.locator('#overlayList li').count(),1);
  await page.getByRole('button',{name:'overlay-2.pngを重ね合わせから除外',exact:true}).click();
  assert.equal(await page.locator('#overlayList li').count(),0);assert.ok(await page.locator('#overlayXMin').isDisabled());
};
