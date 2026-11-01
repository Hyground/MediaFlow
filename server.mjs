import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'downloads');
const jobs = new Map();
const processes = new Map();
function stop(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide:true});
    killer.on('error', () => child.kill());
  } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const portable = path.join(ROOT, '.runtime', 'yt-dlp.exe');
const downloader = process.env.YTDLP || (process.platform === 'win32' && existsSync(portable) ? portable : null);
const ffmpegDir = path.join(ROOT, '.runtime', 'ffmpeg');
if (process.platform === 'win32' && existsSync(path.join(ffmpegDir, 'ffmpeg.exe'))) process.env.PATH = ffmpegDir + path.delimiter + process.env.PATH;
const BASE = [...(downloader ? [] : ['-m', 'yt_dlp']), '--ignore-config', '--no-playlist', '--no-colors', '--socket-timeout', '20', '--retries', '2', '--js-runtimes', `node:${process.execPath}`];
let active = 0, analyzing = 0;

export function publicAddress(ip) {
  if (isIP(ip) === 6) return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0):/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const [a,b] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
}
export async function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Introduce un enlace válido.');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw Error('Solo se permiten enlaces públicos HTTP o HTTPS.');
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw Error('No se permiten direcciones de red privadas.');
  return url.href;
}
export function formatArgs({kind, format, quality}) {
  if (kind === 'audio') {
    if (!['mp3','m4a','opus','flac','wav'].includes(format) || !['128','192','256','320'].includes(String(quality))) throw Error('Formato o calidad de audio inválidos.');
    return ['-f','bestaudio/best','-x','--audio-format',format,'--audio-quality',`${quality}K`];
  }
  if (kind !== 'video' || !['mp4','webm','mkv'].includes(format) || !['best','360','480','720','1080','1440','2160'].includes(String(quality))) throw Error('Formato o calidad de video inválidos.');
  const cap = quality === 'best' ? '' : `[height<=${quality}]`;
  const codec = format === 'mp4' ? '[vcodec^=avc1]' : format === 'webm' ? '[ext=webm]' : '';
  const audio = format === 'mp4' ? '[ext=m4a]' : format === 'webm' ? '[ext=webm]' : '';
  // Prefer native compatible streams; remux/recode only when required by the source.
  return ['-f',`bestvideo${cap}${codec}+bestaudio${audio}/best${cap}/bestvideo${cap}+bestaudio`, '--merge-output-format',format, '--recode-video',format];
}
function run(args, { timeout = 90000, id, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(downloader || python, [...BASE, ...args], {windowsHide: true, shell: false, detached:process.platform !== 'win32'});
    if (id) processes.set(id, child);
    let output = '', errors = '', pending = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop(child); }, timeout);
    child.stdout.on('data', data => {
      output = (output + data).slice(-8_000_000);
      pending += data;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) onLine?.(line);
    });
    child.stderr.on('data', data => { errors = (errors + data).slice(-12000); });
    child.on('error', () => { clearTimeout(timer); if(id) processes.delete(id); reject(Error('No se pudo ejecutar yt-dlp. Abre Iniciar Mediaflow.cmd para instalar las dependencias portátiles.')); });
    child.on('close', code => {
      clearTimeout(timer); if(id) processes.delete(id);
      if (timedOut) reject(Error('La operación superó el tiempo máximo. Prueba una calidad menor.'));
      else if (code !== 0) reject(Error(errors.includes('Sign in') || errors.includes('bot') ? 'La plataforma exige verificación o inicio de sesión; este enlace no se puede descargar.' : (errors.match(/ERROR: (.+)/)?.[1] || 'No se pudo procesar el enlace. Comprueba que sea público y compatible.').slice(0,600)));
      else resolve(output);
    });
  });
}
async function work(job) {
  active++;
  job.status = 'downloading'; job.message = 'Conectando con la fuente…';
  const dir = path.join(DATA, job.id);
  try {
    await fs.mkdir(dir, {recursive:true});
    if (job.status === 'cancelled') return;
    await run([...formatArgs(job), '--newline', '--progress', '--progress-template', 'download:PROGRESS:%(progress._percent_str)s', '--max-filesize','2G', '--restrict-filenames', '-o', path.join(dir,'%(title).120s.%(ext)s'), '--', job.url], {
      id:job.id, timeout:1800000, onLine(line) {
        if (job.status === 'cancelled') return;
        if (line.startsWith('PROGRESS:')) { job.progress = Math.min(99, parseFloat(line.split(':')[1]) || 0); job.message = 'Descargando…'; }
        else if (/Merger|ExtractAudio|VideoConvertor|VideoRemuxer/.test(line)) { job.status='processing'; job.message='Preparando el archivo final…'; }
      }
    });
    if (job.status === 'cancelled') return;
    const files = (await fs.readdir(dir)).filter(f => /\.(mp4|webm|mkv|mp3|m4a|opus|flac|wav)$/.test(f));
    if (files.length !== 1) throw Error('No se generó un archivo final válido.');
    job.filename = files[0]; job.size = (await fs.stat(path.join(dir,files[0]))).size;
    job.status='done'; job.progress=100; job.message='Tu archivo está listo.';
  } catch(e) { if(job.status !== 'cancelled') { job.status='error'; job.message=e.message; } }
  finally { active--; if(job.status !== 'done') await fs.rm(dir,{recursive:true,force:true}); pump(); }
}
function pump() { for(const job of jobs.values()) { if(active >= 2) break; if(job.status==='queued') void work(job); } }
function json(res, status, data) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let text=''; for await(const part of req) { text+=part; if(text.length>8192) throw Error('Solicitud demasiado grande.'); }
  return JSON.parse(text);
}
export const server = http.createServer(async(req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const host=req.headers.host || '';
    const allowed=(process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',');
    if(!allowed.includes(host.replace(/:\d+$/,''))) return json(res,403,{error:'Host no permitido.'});
    if(req.headers.origin && req.headers.origin !== `http://${host}` && req.headers.origin !== `https://${host}`) return json(res,403,{error:'Origen no permitido.'});
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET' && url.pathname==='/api/health') {
      const results=await Promise.allSettled([run(['--version'],{timeout:10000}),new Promise((resolve,reject)=>{const p=spawn('ffmpeg',['-version'],{windowsHide:true});p.on('error',reject);p.on('close',c=>c===0?resolve():reject());})]);
      return json(res,200,{ready:results.every(r=>r.status==='fulfilled'),ytDlp:results[0].status==='fulfilled',ffmpeg:results[1].status==='fulfilled'});
    }
    if(req.method==='POST' && url.pathname==='/api/analyze') {
      if(analyzing>=2) return json(res,429,{error:'Hay varios enlaces en análisis. Inténtalo en unos segundos.'});
      analyzing++;
      try {
        const input=await body(req), link=await validateUrl(input.url);
        const raw=JSON.parse(await run(['--dump-single-json','--skip-download','--',link]));
        if(raw.is_live || raw._type==='playlist') throw Error('Elige un video individual que no esté en directo.');
        const heights=[...new Set((raw.formats||[]).filter(f=>f.vcodec && f.vcodec!=='none' && f.height).map(f=>f.height))].sort((a,b)=>b-a);
        return json(res,200,{url:link,title:raw.title || 'Video',author:raw.uploader || raw.channel || 'Fuente original',duration:raw.duration,thumbnail:raw.thumbnail?.startsWith('https://')?raw.thumbnail:null,platform:raw.extractor_key,heights});
      } finally {analyzing--;}
    }
    if(req.method==='GET' && url.pathname==='/api/jobs') return json(res,200,[...jobs.values()].map(({url,...j})=>j).reverse());
    if(req.method==='POST' && url.pathname==='/api/jobs') {
      if([...jobs.values()].filter(j=>['queued','downloading','processing'].includes(j.status)).length>=8) return json(res,429,{error:'La cola está llena. Espera a que termine una descarga.'});
      const input=await body(req); formatArgs(input);
      const link=await validateUrl(input.url);
      const job={id:randomUUID(),url:link,title:String(input.title||'Descarga').slice(0,200),kind:input.kind,format:input.format,quality:String(input.quality),status:'queued',progress:0,message:'Esperando turno…',created:Date.now()};
      jobs.set(job.id,job); pump(); return json(res,202,{id:job.id});
    }
    const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})(\/file)?$/);
    if(match) {
      const job=jobs.get(match[1]); if(!job) return json(res,404,{error:'Descarga no encontrada.'});
      if(req.method==='DELETE' && !match[2]) {
        if(['queued','downloading','processing'].includes(job.status)) {job.status='cancelled';job.message='Descarga cancelada.';stop(processes.get(job.id));}
        else {jobs.delete(job.id);await fs.rm(path.join(DATA,job.id),{recursive:true,force:true});}
        return json(res,200,{ok:true});
      }
      if(req.method==='GET' && match[2] && job.status==='done') {
        const file=path.join(DATA,job.id,job.filename); const stat=await fs.stat(file);
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':stat.size,'Content-Disposition':`attachment; filename="${job.filename}"`,'Cache-Control':'no-store'});
        const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
    }
    if(req.method==='GET') {
      const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];
      if(file) {res.setHeader('Content-Type',file.endsWith('css')?'text/css':file.endsWith('js')?'text/javascript':'text/html; charset=utf-8');return res.end(await fs.readFile(path.join(ROOT,'public',file)));}
    }
    json(res,404,{error:'Ruta no encontrada.'});
  } catch(e) {json(res,400,{error:e.message || 'No se pudo completar la solicitud.'});}
});
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await fs.mkdir(DATA,{recursive:true});
  // Previous jobs cannot resume after a restart; remove their orphaned files.
  for(const entry of await fs.readdir(DATA)) if(/^[a-f0-9-]{36}$/.test(entry)) await fs.rm(path.join(DATA,entry),{recursive:true,force:true});
  server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>console.log('Mediaflow disponible en http://localhost:'+(process.env.PORT || 3000)));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{ for(const child of processes.values()) stop(child); server.close(); process.exit(0); });
  setInterval(async()=>{for(const [id,job] of jobs) if(Date.now()-job.created>86400000 && !['queued','downloading','processing'].includes(job.status)){jobs.delete(id);await fs.rm(path.join(DATA,id),{recursive:true,force:true});}},60000).unref();
}
