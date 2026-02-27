const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const healthData = {
      status: 'ok',
      connectedClients: clients.size,
      activeReminders: activeReminders.size,
      uptime: process.uptime()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthData));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PopTime WebSocket Server Running');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients with their userId
const clients = new Map(); // userId -> WebSocket
const activeReminders = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      switch (data.type) {
        case 'register':
          // Register user
          userId = data.userId;
          clients.set(userId, ws);
          console.log(`User ${userId} (${data.userName}) registered. Total clients: ${clients.size}`);
          
          // Send confirmation
          ws.send(JSON.stringify({
            type: 'confirmation',
            message: 'Connected to PopTime server!'
          }));
          break;

        case 'popcorn_request':
          console.log(`Request from ${data.fromUserId} to ${data.toUserId}`);
          
          // Send ONLY to the recipient
          const recipientWs = clients.get(data.toUserId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify({
              type: 'popcorn_request',
              fromUserId: data.fromUserId,
              fromUserName: data.fromUserName
            }));
            console.log(`✅ Request sent to ${data.toUserId}`);
          } else {
            console.log(`❌ Recipient ${data.toUserId} not connected`);
            // Notify sender that recipient is offline
            ws.send(JSON.stringify({
              type: 'confirmation',
              message: 'Recipient is not connected'
            }));
          }
          break;

        case 'popcorn_response':
          console.log(`Response from ${data.fromUserId} (${data.fromUserName}) to ${data.toUserId}: ${data.response}`);
          console.log(`Current clients: ${Array.from(clients.keys()).join(', ')}`);
          
          // Send ONLY to the recipient
          const requesterWs = clients.get(data.toUserId);
          if (requesterWs && requesterWs.readyState === WebSocket.OPEN) {
            requesterWs.send(JSON.stringify({
              type: 'popcorn_response',
              fromUserId: data.fromUserId,
              fromUserName: data.fromUserName,
              response: data.response
            }));
            console.log(`✅ Response sent to ${data.toUserId}`);
          } else {
            console.log(`❌ Requester ${data.toUserId} not connected or connection closed`);
            console.log(`  Client exists: ${clients.has(data.toUserId)}`);
            if (clients.has(data.toUserId)) {
              console.log(`  WebSocket state: ${clients.get(data.toUserId).readyState}`);
            }
            // Notify sender that recipient is offline
            ws.send(JSON.stringify({
              type: 'confirmation',
              message: 'Recipient is not connected'
            }));
          }
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`User ${userId} disconnected. Remaining clients: ${clients.size}`);
    } else {
      console.log('Unregistered client disconnected');
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`🍿 PopTime server running on port ${PORT}`);
});

// Cleanup inactive connections every 30 seconds
setInterval(() => {
  clients.forEach((ws, userId) => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(`Removing inactive client: ${userId}`);
      clients.delete(userId);
    }
  });
}, 30000);
