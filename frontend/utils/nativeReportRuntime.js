// Keep the same server report engine, with a DOM image decoder for Android WebViews
// whose createImageBitmap cannot decode the tile Blob. No credentials enter this page.
export const nativePreviewScriptFiles = [
  'report-html-style.js', 'report-marker-layout.js', 'report-map-plan.js', 'report-map.js', 'report-html.js',
];
export const nativeMapScriptFiles = ['report-marker-layout.js', 'report-map-plan.js', 'report-map.js'];

export function nativeReportRuntimeHtml(html, previewScripts) {
  if (typeof html !== 'string' || !html.includes('host.js')) throw new Error('보고서 생성기 파일을 읽지 못했습니다.');
  const nonce = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let result = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'nonce-${nonce}'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'none'; object-src 'none'; base-uri 'none'">`);
  if (previewScripts) {
    // These five trusted same-server modules are pure JS. Bundle them into a
    // single lexical scope so native evaluateJavaScript never needs import().
    const hasTemplate = typeof previewScripts['report-html.js'] === 'string';
    const modules = (hasTemplate ? nativePreviewScriptFiles : nativeMapScriptFiles).map(file => {
      const source = previewScripts[file];
      if (typeof source !== 'string' || !source.trim() || source.length > 1024 * 1024 || /^\s*</.test(source))
        throw new Error(`보고서 양식 파일을 읽지 못했습니다. (${file})`);
      return source.replace(/^import\s+[^\n]*;\s*$/gm, '').replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b)/gm, '');
    }).join('\n');
    const bundle = `(function(){${modules}\nwindow.__pang3PreviewModules={${hasTemplate ? 'template:{renderReportHtml:renderReportHtml},' : ''}createMapRenderer:createMapRenderer};})();`
      .replace(/<\/script/gi, '<\\/script');
    result = result.replace(/<script\s+src=["']host\.js["']\s*>/i,
      () => `<script nonce="${nonce}">${bundle}</script><script src="host.js">`);
  }
  return result;
}

export const nativeReportImageDecoder = `
(function(){
  if(window.__pang3ImageDecoderInstalled)return;
  window.__pang3ImageDecoderInstalled=true;
  var decode=window.createImageBitmap;
  window.createImageBitmap=async function(blob){
    if(typeof decode==='function'){
      try{return await decode.call(window,blob);}catch(error){/* Use the DOM decoder below. */}
    }
    return new Promise(function(resolve,reject){
      var image=new Image(),url=URL.createObjectURL(blob),finished=false;
      var timer=setTimeout(function(){done(new Error('위치도 배경 이미지를 읽는 시간이 초과되었습니다.'));},15000);
      function done(error){
        if(finished)return;finished=true;clearTimeout(timer);image.onload=image.onerror=null;
        if(error){URL.revokeObjectURL(url);reject(error);return;}
        image.width=image.naturalWidth;image.height=image.naturalHeight;
        image.close=function(){URL.revokeObjectURL(url);image.src='';};
        resolve(image);
      }
      image.onload=function(){done();};
      image.onerror=function(){done(new Error('위치도 배경 이미지를 읽지 못했습니다.'));};
      image.src=url;
    });
  };
})();
`;

// Replace only the native HWPX map-asset branch. The original worker and HWPX
// builder still receive the exact same JPEG asset through their fixed receiver.
export const nativeReportMapBridge = `
(function(){
  if(window.__pang3HwpxMapBridge)return;window.__pang3HwpxMapBridge=true;
  var previous=window.pang3ReportReceive,job=null,renderer=null,pending=new Map(),sequence=0;
  var channel='pang3-local-report-v1';
  function send(message){window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({channel:channel,job:job},message)));}
  async function render(message){
    try{
      if(!renderer){
        var modules=window.__pang3PreviewModules;
        if(!modules||!modules.createMapRenderer)throw new Error('HWPX 위치도 생성 코드를 준비하지 못했습니다.');
        renderer=modules.createMapRenderer(function(tile){return new Promise(function(resolve){var index=sequence++;pending.set(index,resolve);send({type:'tile',index:index,z:tile.z,x:tile.x,y:tile.y});});});
      }
      send({type:'progress',message:'HWPX에 넣을 전체 위치도를 만들고 있어요.'});
      var result=await renderer(message.map);
      previous(Object.assign({channel:channel,job:job,type:'asset-result',index:message.index},result));
    }catch(error){
      console.warn('[native HWPX map]',error&&error.message);
      send({type:'error',message:error&&/[가-힣]/.test(error.message)?error.message:'HWPX에 넣을 위치도 이미지를 만들지 못했습니다.'});
    }
  }
  window.pang3ReportReceive=function(message){
    if(message&&message.channel===channel){
      if(message.type==='start')job=message.job;
      if(job&&message.job===job&&message.type==='asset-result'&&message.renderMap){render(message);return;}
      if(job&&message.job===job&&message.type==='tile-result'){
        var resolve=pending.get(message.index);pending.delete(message.index);if(resolve)resolve(message);return;
      }
    }
    previous(message);
  };
})();
`;
