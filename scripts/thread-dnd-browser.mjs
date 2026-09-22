// Exercise the library's mouse sensor, including activation and animation frames.
export async function dragThread(page,source,target){
 source=source.and(page.locator('[data-rfd-drag-handle-draggable-id]'));
 await source.scrollIntoViewIfNeeded();
 const from=await source.boundingBox();
 if(!from)throw Error('Drag source is not visible');
 const x=from.x+from.width/2,y=from.y+from.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+8,y,{steps:3});await page.clock.runFor(50);
 await target.scrollIntoViewIfNeeded();
 const to=await target.boundingBox();
 if(!to)throw Error('Drop target is not visible');
 await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});
 await page.clock.runFor(100);
 await page.mouse.up();await page.clock.runFor(500);
}

export async function touchThread(page,source,target){
 source=source.and(page.locator('[data-rfd-drag-handle-draggable-id]'));
 await source.scrollIntoViewIfNeeded();
 const from=await source.boundingBox(),to=await target.boundingBox();
 if(!from||!to)throw Error('Touch source or target is not visible');
 const session=await page.context().newCDPSession(page);
 const x=from.x+from.width/2,y=from.y+from.height/2;
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.clock.runFor(250);
  await page.locator('.thread-dragging').waitFor();
  for(let step=1;step<=12;step++){
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(to.x+to.width/2-x)*step/12,y:y+(to.y+to.height/2-y)*step/12}]});await page.clock.runFor(20);
  }
  // Sticky detach targets can move as the touch sensor scrolls the document.
  const destination=await target.boundingBox();
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:destination.x+destination.width/2,y:destination.y+destination.height/2}]});await page.clock.runFor(20);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(500);
 }finally{await session.detach();}
}
