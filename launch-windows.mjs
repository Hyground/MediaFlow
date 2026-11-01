import { spawn } from 'node:child_process';
import { openSync,closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
const url='http://localhost:3000';
async function health() {try{const res=await fetch(url+'/api/health',{signal:AbortSignal.timeout(2000)});return res.ok && (await res.json()).ready;}catch{return false;}}
try {
  if(!await health()) {
    const log=openSync(path.join(root,'.runtime','server.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});
    closeSync(log);
    child.on('error',error=>{console.error(error.message);process.exitCode=1;});
    child.unref();
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){if(await health()){ready=true;break;}await setTimeout(1000);}
    if(!ready) throw Error('El servidor no pudo iniciar. Revisa .runtime/server.log y que el puerto 3000 esté libre.');
  }
  const browser=spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'});
  browser.on('error',()=>console.log('Abre '+url+' en tu navegador.'));
  console.log('Mediaflow está disponible en '+url);
} catch(error) {console.error(error.message);process.exitCode=1;}
