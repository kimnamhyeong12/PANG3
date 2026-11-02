// Injected into both native dashboard and report maps. Camera work waits for
// two equal, usable layout frames; ordinary data redraws do not reset it.
export const stableMapViewportSource = `
function createStableMapViewport(map, box, fit) {
  var frame=0,previous='',measured='',fitted=false,pending=true,touched=false,disposed=false;
  box.style.visibility='hidden';
  function interact(){touched=true;}
  ['touchstart','mousedown','wheel','keydown'].forEach(function(type){box.addEventListener(type,interact,{passive:true});});
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(apply);}
  function apply(){
    frame=0;if(disposed)return;
    var width=box.clientWidth,height=box.clientHeight;
    if(width<160||height<160){measured='';previous='';return;}
    var size=width+'x'+height;
    if(measured!==size){measured=size;schedule();return;}
    var resized=previous!==size;
    if(!pending&&!resized)return;
    var center=map.getCenter(),level=map.getLevel();
    map.relayout();
    if(pending||!fitted||resized&&!touched){
      if(fit()===false)return;
      fitted=true;pending=false;box.style.visibility='visible';
    }else{map.setLevel(level);map.setCenter(center);}
    previous=size;
  }
  function requestFit(){pending=true;schedule();}
  var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
  if(observer)observer.observe(box);
  window.addEventListener('resize',schedule);
  window.addEventListener('pageshow',schedule);
  schedule();
  return {requestFit:requestFit,relayout:schedule,destroy:function(){
    disposed=true;if(frame)cancelAnimationFrame(frame);if(observer)observer.disconnect();
    window.removeEventListener('resize',schedule);window.removeEventListener('pageshow',schedule);
    ['touchstart','mousedown','wheel','keydown'].forEach(function(type){box.removeEventListener(type,interact);});
  }};
}
`;

// The HTML preview uses the same canonical web map script. Apply the same
// lifecycle guard to its initial fit without changing its report template.
export function stabilizeReportHtmlViewport(html) {
  const fit = /if\s*\(\s*data\.length\s*>\s*1\s*\)\s*map\.setBounds\(bounds,\s*72,\s*64,\s*72,\s*64\);/g;
  const guarded = html.replace(fit, () => `createStableMapViewport(map,el,function(){
    if(data.length>1)map.setBounds(bounds,72,64,72,64);
    else if(data.length){map.setLevel(5);map.setCenter(new kakao.maps.LatLng(data[0].lat,data[0].lng));}
  });`);
  return guarded.replace(/<head[^>]*>/i, match => `${match}<script>${stableMapViewportSource}</script>`);
}
