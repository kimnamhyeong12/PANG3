// Native HTML preview uses the canonical web template, but decodes photos with
// DOM Image rather than requiring ImageBitmap support for every photo format.
// The receiver only accepts the guarded session's descriptors and asset replies.
export function nativeReportPreviewBridge(runtimeUrl) {
  const base = JSON.stringify(new URL('.', runtimeUrl).href).replace(/</g, '\\u003c');
  return `
(function(){
  if(window.__pang3HtmlPreviewBridge)return;
  window.__pang3HtmlPreviewBridge=true;
  var previous=window.pang3ReportReceive,job=null,assets=new Map(),tiles=new Map(),tileIndex=0;
  var base=${base},channel='pang3-local-report-v1';
  function send(message){window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({channel:channel,job:job},message)));}
  function photo(data){
    return new Promise(function(resolve,reject){
      var binary=atob(data||''),bytes=new Uint8Array(binary.length);
      for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      var mime=bytes[0]===137&&bytes[1]===80?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===82&&bytes[1]===73?'image/webp':'application/octet-stream';
      var url=URL.createObjectURL(new Blob([bytes],{type:mime})),image=new Image(),done=false;
      var timer=setTimeout(function(){finish(new Error('미리보기 사진을 읽는 시간이 초과되었습니다.'));},15000);
      function finish(error,value){
        if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;
        URL.revokeObjectURL(url);image.src='';
        if(error)reject(error);else resolve(value);
      }
      image.onerror=function(){finish(new Error('미리보기 사진 형식을 읽지 못했습니다.'));};
      image.onload=function(){
        var canvas=document.createElement('canvas');
        try{
          var w=image.naturalWidth,h=image.naturalHeight;
          if(!w||!h||w*h>24000000)throw new Error('미리보기 사진 해상도가 너무 큽니다.');
          var scale=Math.min(1,960/Math.max(w,h));
          canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
          var context=canvas.getContext('2d');
          if(!context)throw new Error('미리보기 이미지를 그릴 수 없습니다.');
          context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
          context.drawImage(image,0,0,canvas.width,canvas.height);
          var value=canvas.toDataURL('image/jpeg',0.7);
          if(value.indexOf('data:image/jpeg;base64,')!==0)throw new Error('미리보기 사진을 변환하지 못했습니다.');
          finish(null,value);
        }catch(error){finish(error);}finally{canvas.width=canvas.height=0;}
      };
      image.src=url;
    });
  }
  async function build(descriptor){
    var images=new Map(),total=0,stage='보고서 양식을 불러오지 못했습니다.';
    try{
      var modules=window.__pang3PreviewModules;
      if(!modules||!modules.template)throw new Error('앱의 보고서 양식을 준비하지 못했습니다.');
      var template=modules.template;
      for(var index=0;index<descriptor.assets.length;index++){
        stage='미리보기 사진과 위치도를 불러오지 못했습니다.';
        send({type:'progress',message:'미리보기 사진·위치도를 준비하고 있어요. ('+(index+1)+'/'+descriptor.assets.length+')'});
        var response=await new Promise(function(resolve){assets.set(index,resolve);send({type:'asset',index:index});});
        if(response.error)throw new Error(response.error);
        if(response.empty&&descriptor.assets[index].optional)continue;
        if(typeof response.data!=='string'||response.data.length>20971520)throw new Error('미리보기 사진 용량이 너무 큽니다.');
        var value=await photo(response.data);total+=value.length;
        if(total>64*1024*1024)throw new Error('미리보기 용량이 큽니다. 보고서를 나누어 주세요.');
        images.set(descriptor.assets[index].path,value);
      }
      stage='보고서 미리보기 양식을 구성하지 못했습니다.';
      send({type:'progress',message:'HTML 미리보기를 만들고 있어요.'});
      // Some Android WebViews expose Intl but lack dateStyle/timeStyle options.
      // The shared template uses these only for its Korean-time footer.
      var Formatter=Intl.DateTimeFormat,patched=false,html;
      try{new Formatter('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date());}
      catch(error){
        Intl.DateTimeFormat=function(locale,options){
          if(locale==='sv-SE'&&options&&options.timeZone==='Asia/Seoul'&&options.dateStyle){
            return {format:function(value){
              var d=new Date(new Date(value).getTime()+9*60*60*1000),pad=function(n){return String(n).padStart(2,'0');};
              return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());
            }};
          }
          return new Formatter(locale,options);
        };patched=true;
      }
      try{html=template.renderReportHtml(descriptor.payload,images);}
      finally{if(patched)Intl.DateTimeFormat=Formatter;}
      if(new Blob([html]).size>64*1024*1024)throw new Error('미리보기 용량이 너무 큽니다.');
      var count=Math.ceil(html.length/65536);
      for(var part=0;part<count;part++)send({type:'html-chunk',index:part,count:count,data:html.slice(part*65536,(part+1)*65536)});
      send({type:'done',size:html.length});
    }catch(error){
      console.warn('[native HTML preview]',stage,error&&error.message);
      send({type:'error',message:error&&/[가-힣]/.test(error.message)?error.message:stage});
    }finally{images.clear();}
  }
  var renderer;
  async function map(message){
    if(!renderer){
      var module=window.__pang3PreviewModules;
      if(!module||!module.createMapRenderer)throw new Error('미리보기 위치도 양식을 준비하지 못했습니다.');
      renderer=module.createMapRenderer(function(tile){return new Promise(function(resolve){var index=tileIndex++;tiles.set(index,resolve);send({type:'tile',index:index,z:tile.z,x:tile.x,y:tile.y});});});
    }
    var result=await renderer(message.map),resolve=assets.get(message.index);
    assets.delete(message.index);if(resolve)resolve(Object.assign({index:message.index},result));
  }
  window.pang3ReportReceive=function(message){
    if(message&&message.channel===channel&&message.type==='start'&&message.descriptor&&message.descriptor.format==='html'){
      if(job)return;job=message.job;build(message.descriptor);return;
    }
    if(job&&message&&message.channel===channel&&message.job===job){
      if(message.type==='asset-result'){
        if(message.renderMap)map(message).catch(function(error){send({type:'error',message:error&&/[가-힣]/.test(error.message)?error.message:'미리보기 위치도를 만들지 못했습니다.'});});
        else {var resolve=assets.get(message.index);assets.delete(message.index);if(resolve)resolve(message);}
      }else if(message.type==='tile-result'){var resolve=tiles.get(message.index);tiles.delete(message.index);if(resolve)resolve(message);}
      return;
    }
    if(previous)previous(message);
  };
})();
`;
}
