module.exports = function(RED) {
    const https = require('node:https');
    const VarType = Object.freeze({
        string: 'string',
        array: 'array',
        object: 'object'
    });
    
    const TYPES = Object.freeze({
        '[object String]': VarType.string,
        '[object Array]': VarType.array,
        '[object Object]': VarType.object,
    });
    
    function varType (v) {
        return TYPES[Object.prototype.toString.call(v)];
    }

    function encodePath (path) {
        const url = new URL(path, 'https://localhost');
        const params = []
        for (const [key, value] of url.searchParams) {
            params.push(`${key}=${encodeURIComponent(value)}`);
        }
        return `${url.pathname}${params.length > 0 ? '?' + params.join('&') : ''}`;
    }

    function OSEMApiCall(n) {
        RED.nodes.createNode(this,n);
        const DefaultMethod = n.method || 'GET';
        const DefaultPath = n.path || '/clients';

        const node = this;

        this.on('input', function(msg, send, done) {
            const method = msg.method || DefaultMethod;
            const path = encodePath(msg.path || DefaultPath);
            node.status({fill:'yellow',shape:'dot',text:`${method} ${path}`});
            const options = {
                rejectUnauthorized: false,
                timeout: 32000,
                hostname: 'localhost',
                port: 443,
                path: path.match(/^\x2F/) ? `/api/v1${path}` : `/api/v1/${path}`,
                method,
                headers: {
                    'User-Agent': 'node-red-contrib-osem',
                    'Authorization': `Bearer: ${process.env.OSEM_API_TOKEN}`
                }
            };

            if (varType(msg.payload) === VarType.object || varType(msg.payload) === VarType.array) {
                msg.payload = JSON.stringify(msg.payload);
            }
            if (varType(msg.payload) === VarType.string) {
                options.headers['Content-Type'] = 'application/json'
                options.headers['Content-Length'] = msg.payload.length
            }

            const req = https.request(options, (res) => {
                const responseBody = [];
                res.on('data', (chunk) => responseBody.push(chunk));
                res.on('error', (error) => {
                    node.log(`error reading response: ${error.message}`);
                    node.status({fill:'red',shape:'dot',text:error.message});
                });
                res.on('end', () => {
                    node.status({fill:'green',shape:'dot',text:`${method} ${path}`});
                    try {
                        msg.payload = JSON.parse(Buffer.concat(responseBody).toString());
                    } catch(err) {
                        node.log('Error parsing response data, returning as buffer');
                        msg.payload = Buffer.concat(responseBody);
                    }
                    node.send(msg);
                    done();
                });
            });
                
            req.on('error', (error) => {
                node.log(`error sending request: ${error.message}`);
                node.status({fill:'red',shape:'dot',text:error.message});
                done();
            });
            req.on('timeout', () => {
                node.log('timeout sending request');
                node.status({fill:'red',shape:'dot',text:'timeout sending request'});
                done();
            });

            varType(msg.payload) === VarType.string && req.write(msg.payload);
            req.end();
        });

        this.on('close',function() {
            node.status({});
        });
    }

    RED.nodes.registerType('osem-api', OSEMApiCall);
}
