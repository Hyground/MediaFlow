import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, '.runtime');
async function exists(file) {try {await fs.access(file);return true;}catch{return false;}}
async function response(url) {
  const res = await fetch(url, {headers:{'User-Agent':'Mediaflow-local-setup'},signal:AbortSignal.timeout(300000)});
  if (!res.ok) throw Error(`Descarga rechazada (${res.status}): ${url}`);
  return res;
}
async function download(url, destination) {
  const res=await response(url);
  await pipeline(Readable.fromWeb(res.body),createWriteStream(destination));
}
async function verify(file, expected) {
  if(!/^[a-f0-9]{64}$/i.test(expected || '')) throw Error('No se recibió un checksum válido.');
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if(hash.digest('hex')!==expected.toLowerCase()) throw Error('El archivo no coincide con su checksum. Vuelve a intentarlo.');
}
async function main() {
  if(process.platform!=='win32' || process.arch!=='x64') throw Error('Este instalador portátil requiere Windows de 64 bits (x64).');
  await fs.mkdir(runtime,{recursive:true});
  const ytdlp=path.join(runtime,'yt-dlp.exe');
  if(!await exists(ytdlp)) {
    console.log('Descargando yt-dlp portátil desde su repositorio oficial…');
    const release=await (await response('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json();
    const base=`https://github.com/yt-dlp/yt-dlp/releases/download/${encodeURIComponent(release.tag_name)}`;
    const checksums=await (await response(`${base}/SHA2-256SUMS`)).text();
    const expected=checksums.split(/\r?\n/).find(line=>/\s\*?yt-dlp\.exe$/.test(line))?.split(/\s+/)[0];
    const partial=ytdlp+'.partial';
    await download(`${base}/yt-dlp.exe`,partial);await verify(partial,expected);await fs.rename(partial,ytdlp);
  }
  const bin=path.join(runtime,'ffmpeg');
  if(!await exists(path.join(bin,'ffmpeg.exe')) || !await exists(path.join(bin,'ffprobe.exe'))) {
    console.log('Descargando FFmpeg portátil (aproximadamente 110 MB)…');
    const url='https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    const expected=(await (await response(url+'.sha256')).text()).trim().split(/\s+/)[0];
    const archive=path.join(runtime,'ffmpeg.zip');
    await download(url,archive);await verify(archive,expected);
    console.log('Checksum correcto. Extrayendo FFmpeg…');
    const extracted=path.join(runtime,'ffmpeg-package');
    const quote=value=>"'"+value.replaceAll("'","''")+"'";
    const unzip=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)} -Force`],{windowsHide:true,encoding:'utf8'});
    if(unzip.status!==0) throw Error(unzip.stderr || 'No se pudo extraer FFmpeg.');
    const directory=(await fs.readdir(extracted,{withFileTypes:true})).find(entry=>entry.isDirectory() && entry.name.startsWith('ffmpeg-'));
    if(!directory) throw Error('El paquete de FFmpeg tiene una estructura inesperada.');
    await fs.mkdir(bin,{recursive:true});
    for(const name of ['ffmpeg.exe','ffprobe.exe']) await fs.copyFile(path.join(extracted,directory.name,'bin',name),path.join(bin,name));
    for(const name of ['LICENSE','LICENSE.txt']) {
      const source=path.join(extracted,directory.name,name);
      if(await exists(source)) await fs.copyFile(source,path.join(bin,name));
    }
    await fs.unlink(archive);
  }
  for(const [executable,args] of [[ytdlp,['--version']],[path.join(bin,'ffmpeg.exe'),['-version']],[path.join(bin,'ffprobe.exe'),['-version']]]) {
    const check=spawnSync(executable,args,{windowsHide:true,encoding:'utf8',timeout:30000});
    if(check.status!==0) throw Error(`No se pudo ejecutar ${path.basename(executable)}: ${check.stderr || check.error?.message || 'Error desconocido'}`);
    console.log(path.basename(executable)+': '+check.stdout.split(/\r?\n/)[0]);
  }
  console.log('Listo. Sin Docker, sin Python y sin reiniciar Windows.');
}
main().catch(error=>{console.error('Error: '+error.message+(error.cause?.message?' ('+error.cause.message+')':''));process.exitCode=1;});
