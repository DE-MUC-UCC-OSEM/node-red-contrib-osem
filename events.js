module.exports = function(RED) {
    const { Agent } = require('undici');

    function OSEMEvents(n) {
        RED.nodes.createNode(this,n);
        const node = this;

        const EventType = n.event || 'inventory';

        // Configure Agent for persistent connections and no timeouts
        const agent = new Agent({
            connect: {
                rejectUnauthorized: false,
                timeout: 0, // No connection timeout
                keepAlive: true,
                keepAliveInitialDelay: 1000
            }
        });

        agent.on('connect', () => {
            node.status({fill:'green',shape:'dot',text:'Connected to OSEM events'});
        });
        
        agent.on('disconnect', () => {
            node.status({fill:'red',shape:'dot',text:'Connection closed'});
        });

        node.status({fill:'yellow',shape:'dot',text:'Connecting to OSEM events...'});

        let abortController = new AbortController();

        const connectToStream = () => {
            fetch(`https://localhost/api/v1/server/events?type=${EventType}&language=en`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'User-Agent': 'node-red-contrib-osem',
                    'Authorization': `Bearer ${process.env.OSEM_API_TOKEN}`
                },
                dispatcher: agent,
                signal: abortController.signal,
                // Disable all fetch timeouts
                keepalive: true
            }).then(response => {
                if (!response.ok || !response.body) {
                    node.status({fill:'red',shape:'dot',text:`Connection failed: ${response.status}`});
                    // Retry connection after delay
                    setTimeout(connectToStream, 5000);
                    return;
                }

                node.status({fill:'green',shape:'dot',text:'Connected to OSEM events'});

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                function read() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            console.log('SSE stream closed by server');
                            node.status({fill:'yellow',shape:'dot',text:'Reconnecting...'});
                            // Reconnect after delay
                            setTimeout(connectToStream, 2000);
                            return;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        let parts = buffer.split('\n\n');
                        buffer = parts.pop();

                        parts.forEach(part => {
                            const lines = part.split('\n');
                            let data = '';

                            lines.forEach(line => {
                                if (line.startsWith('data:')) {
                                    data += line.slice(5).trim() + '\n';
                                }
                            });

                            if (data && !data.match(/Pinging!/)) {
                                try {
                                    const parsedData = JSON.parse(data.trim());
                                    node.send({ payload: parsedData });
                                    node.status({fill:'green',shape:'dot',text:`${parsedData.action} event dispatched`});
                                } catch (err) {
                                    console.log(err);
                                    node.send({ payload: data.trim() });
                                    node.status({fill:'green',shape:'dot',text:'Unknown event dispatched'});
                                }
                            }
                        });

                        // Continue reading recursively
                        read();
                    }).catch(err => {
                        if (err.name !== 'AbortError') {
                            console.error('Error reading SSE stream:', err);
                            node.status({fill:'red',shape:'dot',text:'Stream error'});
                            // Reconnect on error
                            setTimeout(connectToStream, 5000);
                        }
                    });
                }

                read();
            }).catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Connection error:', err);
                    node.status({fill:'red',shape:'dot',text:'Connection error'});
                    // Retry connection after delay
                    setTimeout(connectToStream, 5000);
                }
            });
        };

        // Start initial connection
        connectToStream();

        node.on('close', function() {
            node.status({});
            // Abort the fetch request
            abortController.abort();
            // Close the agent
            agent.close();
        });
    }

    RED.nodes.registerType('osem-evt', OSEMEvents);
}
