import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {server, publicAddress, validateUrl, formatArgs} from '../server.mjs';

test('rechaza URLs privadas, protocolos y credenciales', async()=>{
  for(const url of ['file:///etc/passwd','http://127.0.0.1/a','http://[::1]/','http://user:pass@example.com','http://localhost/','https://example.com:8080']) await assert.rejects(validateUrl(url));
});
test('filtra rangos locales IPv4 e IPv6',()=>{
  for(const ip of ['10.0.0.1','192.168.1.1','172.16.0.1','169.254.169.254','100.64.0.1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1']) assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('selección limita resolución y prioriza codecs MP4 compatibles',()=>{
  const args=formatArgs({kind:'video',format:'mp4',quality:'720'});
  assert.match(args[1],/height<=720/);assert.match(args[1],/vcodec\^=avc1/);
  assert.equal(args.at(-1),'mp4');
});
test('audio aplica bitrate y evita parámetros arbitrarios',()=>{
  assert.deepEqual(formatArgs({kind:'audio',format:'mp3',quality:'192'}),['-f','bestaudio/best','-x','--audio-format','mp3','--audio-quality','192K']);
  for(const input of [{kind:'video',format:'mp4',quality:'720];evil'},{kind:'audio',format:'--exec',quality:'320'},{kind:'other',format:'mp4',quality:'best'}]) assert.throws(()=>formatArgs(input));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>new Promise(resolve=>server.close(resolve)));
test('API e interfaz sirven cabeceras y estados correctos',async()=>{
  let res=await fetch(base);assert.equal(res.status,200);assert.match(await res.text(),/mediaflow/);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  res=await fetch(base+'/api/jobs');assert.deepEqual(await res.json(),[]);
  res=await fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'video',format:'evil',quality:'best'})});assert.equal(res.status,400);
  res=await fetch(base+'/api/jobs',{method:'POST',headers:{Origin:'https://attacker.example'}});assert.equal(res.status,403);
  res=await fetch(base+'/missing');assert.equal(res.status,404);
  res=await fetch(base+'/api/jobs',{method:'POST',body:'{bad json'});assert.equal(res.status,400);
  res=await fetch(base+'/api/jobs',{method:'POST',body:'x'.repeat(9000)});assert.equal(res.status,400);
});
