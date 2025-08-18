const util = require('node:util');

let payload = '';

function toStringSafe(value) {
  return typeof value === "string" ? value : util.inspect(value, { depth: null, colors: false });
}

module.exports = function (RED) {
    function TextDisplayNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on('input', function (msg) {
            payload = msg.payload || '';
            node.status({fill:'green',shape:'dot',text:`Received ${toStringSafe(payload).length} characters`});
            node.send(msg);
        });

        RED.httpAdmin.get("/osem-out/get-data", RED.auth.needsPermission("osem-out.read"), function(req, res) {
            res.end(toStringSafe(payload));
        });
    
        node.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType('osem-out', TextDisplayNode);
};
