import http from 'node:http';import {existsSync,appendFileSync} from 'node:fs';
let offline=false;
http.createServer(async(req,res)=>{
 if(offline){req.socket.destroy();return;}
 if(req.url==='/api/review-axles'&&req.method==='POST'&&existsSync('/tmp/roadstar-native-arm-offline')){offline=true;appendFileSync('/tmp/roadstar-native-proxy-events.jsonl',JSON.stringify({at:new Date().toISOString(),action:'interrupted-before-upstream',key:req.headers['idempotency-key']})+'\n');req.socket.destroy();return;}
 const upstream=http.request({hostname:'127.0.0.1',port:4010,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:4010'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
}).listen(4011,'127.0.0.1');
http.createServer((req,res)=>{offline=false;res.end('online');}).listen(4012,'127.0.0.1');
