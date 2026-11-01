const $ = s => document.querySelector(s);
let media = null, kind = 'video', busy = false;
const formats = { video: ['mp4','webm','mkv'], audio: ['mp3','m4a','opus','flac','wav'] };
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: {'Content-Type':'application/json'}, signal:AbortSignal.timeout(100000) });
  const data = await response.json();
  if(!response.ok) throw Error(data.error || 'El servidor no pudo completar la solicitud.');
  return data;
}
function notice(text, error=false) { $('#notice').hidden=!text; $('#notice').textContent=text; $('#notice').classList.toggle('error',error); }
function options() {
  $('#format').replaceChildren(...formats[kind].map(f=>new Option(f.toUpperCase(),f)));
  const max=Math.max(...(media?.heights || []),0);
  const qualities=kind==='video'?[['best','Mejor disponible'],...[2160,1440,1080,720,480,360].filter(h=>!max || h<=max).map(h=>[String(h),`Hasta ${h}p`])]:[['320','320 kbps'],['256','256 kbps'],['192','192 kbps'],['128','128 kbps']];
  $('#quality').replaceChildren(...qualities.map(([v,t])=>new Option(t,v)));
  $('#quality-note').textContent=kind==='audio'?'El bitrate de salida no mejora la calidad de la fuente. FLAC y WAV son sin pérdida y ocupan más espacio.':'Se usa la mejor calidad disponible hasta el límite elegido. MP4 prioriza H.264 para mayor compatibilidad.';
}
document.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{
  kind=button.dataset.kind;
  document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}); options();
}));
$('#url').addEventListener('input',()=>{media=null;$('#media').hidden=true;$('#empty-preview').hidden=false;notice('');});
$('#analyze-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(busy) return; busy=true;
  const link=$('#url').value.trim();
  $('#analyze').disabled=true;notice('Analizando el enlace y las calidades disponibles…');
  $('#media').hidden=true;media=null;
  try {
    const result=await api('/api/analyze',{method:'POST',body:JSON.stringify({url:link})});
    if($('#url').value.trim()!==link) return;
    media=result;
    $('#media-title').textContent=media.title;$('#platform').textContent=media.platform || 'CONTENIDO';
    $('#media-meta').textContent=media.author+(media.duration?` · ${Math.floor(media.duration/60)}:${String(Math.floor(media.duration%60)).padStart(2,'0')}`:'');
    $('#thumbnail').hidden=!media.thumbnail;
    if(media.thumbnail) {$('#thumbnail').src=media.thumbnail;$('#thumbnail').onerror=()=>$('#thumbnail').hidden=true;}
    options();$('#media').hidden=false;$('#empty-preview').hidden=true;notice('');
  } catch(e) {notice(e.message,true);} finally {busy=false;$('#analyze').disabled=false;}
});
$('#download').addEventListener('click',async()=>{
  if(!media) return;$('#download').disabled=true;
  try {
    await api('/api/jobs',{method:'POST',body:JSON.stringify({url:media.url,title:media.title,kind,format:$('#format').value,quality:$('#quality').value})});
    notice('Añadido a tu biblioteca. Puedes seguir preparando otros enlaces.');await refresh();
  } catch(e) {notice(e.message,true);} finally {$('#download').disabled=false;}
});
function node(tag,className,text) {const el=document.createElement(tag);if(className) el.className=className;if(text!==undefined) el.textContent=text;return el;}
async function refresh() {
  try {
    const jobs=await api('/api/jobs');$('#count').textContent=jobs.length;
    const container=$('#jobs');
    // Keep controls stable while the user is interacting with them.
    if(container.contains(document.activeElement)) return;
    container.replaceChildren();
    if(!jobs.length) {const empty=node('div','queue-empty');empty.append(node('b','','↓'),node('span','','Aquí vivirán tus favoritos.'),node('p','','Agrega tu primer enlace para empezar.'));container.append(empty);}
    for(const job of jobs) {
      const card=node('article',`job ${job.status}`),head=node('div','job-header'),info=node('div');
      info.append(node('h3','',job.title),node('small','',`${job.format.toUpperCase()} · ${job.kind==='audio'?job.quality+' kbps':job.quality==='best'?'Mejor calidad':job.quality+'p'}${job.size?' · '+(job.size/1048576).toFixed(1)+' MB':''}`));
      const running=['queued','downloading','processing'].includes(job.status);
      const remove=node('button','job-action',running?'×':'⌫');remove.type='button';remove.setAttribute('aria-label',`${running?'Cancelar':'Eliminar'} ${job.title}`);
      remove.addEventListener('click',async()=>{remove.disabled=true;try{await api(`/api/jobs/${job.id}`,{method:'DELETE'});remove.blur();await refresh();}catch(e){notice(e.message,true);remove.disabled=false;}});
      head.append(info,remove);card.append(head,node('p','',job.message));
      if(running) {const progress=node('progress','progress');progress.setAttribute('aria-label','Progreso de descarga');progress.max=100;progress.value=job.progress;card.append(progress);}
      if(job.status==='done') {const save=node('a','save','Guardar archivo ↓');save.href=`/api/jobs/${job.id}/file`;save.download=job.filename;card.append(save);}
      container.append(card);
    }
  } catch {$('#server-state').textContent='Sin conexión con el servidor';}
}
async function health() {
  try {const data=await api('/api/health');$('#server-state').textContent=data.ready?'● Servidor listo':'● Faltan dependencias';if(!data.ready)notice('Abre Iniciar Mediaflow.cmd para instalar yt-dlp y FFmpeg automáticamente, sin Docker ni Python.',true);}
  catch {$('#server-state').textContent='Servidor no disponible';}
}
await refresh();void health();setInterval(refresh,2000);
