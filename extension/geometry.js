'use strict';
/* Screenshot is always mapped with one device-pixel scale in X and Y.
 * Never derive a separate Y scale from screenshotHeight/innerHeight:
 * captureVisibleTab can clip the viewport without changing pixel density. */
(() => {
  function scaleFor(imageWidth,viewportWidth){
    const scale=imageWidth/viewportWidth;
    if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid screenshot width');
    return scale;
  }
  function rectInImage(rect,scale,imageWidth,imageHeight){
    const x=Math.round(rect.left*scale),y=Math.round(rect.top*scale),
      right=Math.round(rect.right*scale),bottom=Math.round(rect.bottom*scale);
    const width=right-x,height=bottom-y;
    // A clipped popup is unusable. Do not silently crop part of its contents.
    if(x<0||y<0||width<20||height<20||
       right>imageWidth||bottom>imageHeight)return null;
    return {x,y,width,height};
  }
  window.SmartCaptureGeometry={scaleFor,rectInImage};
})();