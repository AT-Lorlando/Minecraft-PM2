// Require Node.js standard library function to spawn a child process
let spawn = require('child_process').spawn;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require("path");
const dotenv = require('dotenv').config( {
    path: path.join(__dirname, '.env')
  } );
const cors = require('cors');
const express = require('express')
const bodyParser = require('body-parser');

let fs = require('fs');
const { response } = require('express');


console.log("Starting Server")
const NODE_ENV_DEV = process.env.dev == 'true' ? true : false;
console.log(NODE_ENV_DEV)

const PORT = process.env.PORT || 3002;
const LOGS = [];
let lastLog = "";

// Create a child process for the Minecraft server using the same java process
// invocation we used manually before

async function setupServer(){
    return new Promise(
        async function(resolve, reject) { 
            if(!fs.existsSync("./server")  && !NODE_ENV_DEV){
                try{
                    console.log("Downloading Server")
                    await exec('mkdir server')
                    await exec('wget -O server/minecraft_server.jar https://piston-data.mojang.com/v1/objects/f69c284232d7c7580bd89a5a4931c3581eae1378/server.jar');
                    await setupJava()
                    await setupEULA()
                    resolve()
                }catch(err){
                    console.log(err)
                    reject()
                }
            }else{
                console.log("On dev mode, skipping server download")
                resolve()
            }
        })
}

function setupJava(){
    return new Promise(
        async function(resolve, reject) { 
            try {
                let firstJavaExec = spawn('java', [
                    '-Xmx512M',
                    '-Xms256M',
                    '-jar',
                    'minecraft_server.jar',
                    'nogui'
                ],{
                    cwd : "server"
                });
                firstJavaExec.stdout.on('data',function (data) {
                    log(data);
                });
                firstJavaExec.on('close', function (code) {
                    console.log("Java First Run Completed")
                    resolve()
                });
                firstJavaExec.stderr.on('error', function (err) {
                    log(err);
                    reject(err)
                });
            } catch (err) {
                reject(err)
            }
        })
}

function setupEULA() {
  fs.readFile('server/eula.txt', 'utf-8', function(err, data){
    if (err) throw err;

    let newValue = data.replace(/false/gim, 'true');

    fs.writeFile('server/eula.txt', newValue, 'utf-8', function (err) {
      if (err) throw err;
      console.log('Eula Setup Complete');
    });
  });
}

function log(data) {
    lastLog = data.toString();
    LOGS.push(lastLog);
    // process.stdout.write(data.toString());
}

function startServer() {
    if(NODE_ENV_DEV){
        console.log("Starting Server on dev")
        
        log("Starting Server on dev")
        return 
    }
    let server = spawn('java', [
        '-Xmx1024M',
        '-Xms1024M',
        '-jar',
        'minecraft_server.jar',
        'nogui'
    ],{
        cwd : "server"
    });
    
    // Listen for events coming from the minecraft server process - in this case,
    // just log out messages coming from the server
    server.stdout.on('data', log);
    server.stderr.on('data', log);

    return server;
}

function onCommand(req, res, server) {
    
    if(NODE_ENV_DEV){
        console.group("Command received")
        console.log(req.body.command);
        console.groupEnd()
        res.sendStatus(200);
        
        return
    }
    // Get the command from the HTTP request and send it to the Minecraft
    // server process
    console.log(req.body);
    let command = req.body.command;
    sendCommand(server, command);

    // buffer output for a quarter of a second, then reply to HTTP request
    let buffer = [];
    let collector = function(data) {
        data = data.toString();
        buffer.push(data.split(']: ')[1]);
    };
    server.stdout.on('data', collector);
    setTimeout(
        function() {
            server.stdout.removeListener('data', collector);
            response.send(buffer.join('')).status(200);
        }
    , 250);
}

async function onStop(req, res, server) {
    if (!server) {
        res.send('Server already stop');
        return;
    }
    if(NODE_ENV_DEV){
        console.log("Stopping Server")
        server = null;
        return
    }
    await sendCommand(server, 'stop').then(buffer => {
        server.kill();
        server = null;
        res.send(buffer).sendStatus(200);
    }).catch(err => {
        console.log(err)
    })
}

function onStart(req, res, server) {
    if (server) {
        res.send('Server already start').sendStatus(400);
        return;
    }
    server = startServer();    

    if(!NODE_ENV_DEV){
        let buffer = [];
        let collector = function(data) {
            data = data.toString();
            buffer.push(data.split(']: ')[1]);
        };
        server.stdout.on('data', collector);
        setTimeout(
            function() {
                server.stdout.removeListener('data', collector);
                res.send(buffer.join('')).sendStatus(200);
            }
        , 250);
    }
}

async function sendCommand(server, command, delay = 250) {
    if(NODE_ENV_DEV){
        console.group("Sending Command")
        console.log(command);
        console.groupEnd()
        return
    }
    write(server, command);
    let buffer = [];
    let collector = function(data) {
        data = data.toString();
        buffer.push(data.split(']: ')[1]);
    };
    server.stdout.on('data', collector);
    setTimeout(
        function() {
            server.stdout.removeListener('data', collector);
            return(buffer.join(''))
        }
    , delay);
}

function write(server, data) {
    server.stdin.write(data+'\n');
}

setupServer().then(data => {
    let minecraftServerProcess = startServer();    
    // Create an express web app that can parse HTTP POST requests
    let app = express();

    app.use(cors());
    app.use(bodyParser.json());

    app.use('/static', express.static(__dirname + '/public'));
    
    // Create a route that will respond to a POST request
    app.post('/command', (req, res) => {
        onCommand(req, res, minecraftServerProcess);
    })

    app.post('/stop', (req, res) => {
        onStop(req, res, minecraftServerProcess);
    })

    app.post('/start', (req, res) => {
        onStart(req, res, minecraftServerProcess);
    })

    app.get('/logs', function(req, res){
        console.log("Getting logs")
        res.send(LOGS).sendStatus(200);
        console.log(LOGS)
        // res.writeHead(200, { "Content-Type": "text/event-stream",
        //                      "Cache-control": "no-cache" });
    
        // let str = ""
        // minecraftServerProcess.stdout.on('data', function (data) {
        //     str += data.toString();
    
        //     // just so we can see the server is doing something
        //     // console.log("data");
    
        //     // Flush out line by line.
        //     let lines = str.split("\n");
        //     for(let i in lines) {
        //         if(i == lines.length - 1) {
        //             str = lines[i];
        //         } else{
        //             // Note: The double-newline is *required*
        //             res.write('data: ' + lines[i] + "\n\n");
        //         }
        //     }
        // });
    
        // minecraftServerProcess.on('close', function (code) {
        //     res.end(str);
        // });
    
        // minecraftServerProcess.stderr.on('data', function (data) {
        //     res.end('stderr: ' + data);
        // });
    });
    
    app.get('/', function(request, response) {
        response.sendStatus(200);
    });
    
    // Listen for incoming HTTP requests on port 3000
    app.listen(PORT, () => {
        console.log(`API listening on ${PORT}`);
    });
})
