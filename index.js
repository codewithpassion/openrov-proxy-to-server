var fs = require('fs');
var app = require('http').createServer(handler);
var io = require('socket.io-client');
var fs = require('fs');
var url = require('url');
var exec = require('child_process').exec;
var BinaryClient = require('binaryjs').BinaryClient;
var currentClient = null;
var request = 0;

var socket = io('http://rovproxy.openrov.com:3001');
currentClient = new BinaryClient('ws://rovproxy.openrov.com:3011');
currentClient.on('open', function(){
  console.log("Connection to proxy server is open");
});

app.addListener('connect', function (req, socket, head) {
  proxyReq(req, socket, head);
});

function handler (req,res){
  console.log("Process Request:" + req.url);
  if (url.parse(req.url).hostname !== null){
    if (currentClient === null){
      res.statusCode = 503;
      res.end();
      return;
    }

    proxyReq(req, res);
    return;
  }
  res.statusCode = 400;
  res.end();
};

app.listen(4000);
console.log('Server is listening');
// This function acts as a HTTP proxy.
// The request looks something like: GET HTTP://www.google.com
// We pass this on to to our proxy on the internet and they download it for us.
function proxyReq(req, res, head) {
  console.log('Proxing : ' + req.url);
  if (currentClient !== null) {
    var ssl = req.method === 'CONNECT';
    var url = (ssl ? 'https://' : '') + req.url;
    var streamid = request;
    request++;
    var stream = currentClient.createStream(JSON.stringify({
        version: 1,
        head: head,
        url: url,
        ssl: ssl
      }));
    console.log('Created stream for: ' + url);
    var headers_set = false;
    var response_parsed = false;
    for (var h in res.headers) {
      res.removeHeader(h);
    }
    if (ssl) {
      headers_set = true;
      response_parsed = true;
      stream.pipe(res);
      req.socket.pipe(stream);
    }
    req.on('close', function () {
      console.log("detected requester closed socket");
      stream.close();
    });
    req.on('end', function () {
      console.log("detected requester ended socket");
      stream.end();
    });
    stream.on('data', function (data) {
      if (!headers_set) {
        if (data == '\r\n' || data == '\n') {
          headers_set = true;
          // this is where some of the magic happens.
          // We sent the url to the proxy and the proxy starts a download
          // of a file and pipes the response to us.
          // Thanks to JavaScript streams, we can just pipe the data on towards our
          // client.
          stream.pipe(res);
          req.socket.pipe(stream);
        } else {
          var headerparts = data.split(/:(.+)?/);
          if (response_parsed) {
            headerparts[0] = headerparts[0].charAt(0).toUpperCase() + headerparts[0].slice(1);
            res.setHeader(headerparts[0], headerparts[1]);
          } else {
            res.statusCode = data.split(' ')[1];
            res.statusMessage = data.split(' ')[2];
            response_parsed = true;
          }
        }
      }
    });
    stream.on('end', function () {
      // When the proxy tells us everything was sent, we end the response to the client.
      res.end();
    });
    stream.on('close', function () {
      // When the proxy tells us everything was sent, we end the response to the client.
      res.end();
    });
  } else {
    console.log('No client connected!');
    res.statusCode = 500;
    res.end('No client connected!');
  }
}
