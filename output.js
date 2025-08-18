const util = require('node:util');

const payload = {}

function toStringSafe(value) {
    return typeof value === "string" ? value : util.inspect(value, { depth: null, colors: false });
}

module.exports = function (RED) {
    function TextDisplayNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        payload[node.id] = '';

        node.on('input', function (msg) {
            payload[node.id] = msg.payload || '';
            node.status({fill:'green',shape:'dot',text:`Received ${toStringSafe(payload[node.id]).length} characters`});
            node.send(msg);
        });

        RED.httpAdmin.get(`/osem-out/${node.id}`, RED.auth.needsPermission("osem-out.read"), function(req, res) {
            console.log(`GET /osem-out/${node.id}`);
            res.end(toStringSafe(payload[node.id]));
        });
    
        node.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType('osem-out', TextDisplayNode);
};
