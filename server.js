const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients with their user info
const clients = new Map();

// Store pending reminders
const reminders = new Map();

console.log('🍿 PopTime Server Starting...');

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('📱 New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Received:', data);
      
      switch(data.type) {
        case 'register':
          handleRegister(ws, data);
          break;
        case 'popcorn_request':
          handlePopcornRequest(data);
          break;
        case 'popcorn_response':
          handlePopcornResponse(data);
          break;
        case 'confirmation':
          handleConfirmation(data);
          break;
        case 'cancel_reminder':
          handleCancelReminder(data);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    // Remove client from map
    for (let [userId, client] of clients.entries()) {
      if (client.ws === ws) {
        console.log(`📱 Client disconnected: ${userId}`);
        clients.delete(userId);
        break;
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Register a client with their user ID
function handleRegister(ws, data) {
  const { userId, userName } = data;
  clients.set(userId, { ws, userName });
  console.log(`✅ Registered: ${userName} (${userId})`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'registered',
    userId: userId,
    message: 'Successfully connected to PopTime server! 🍿'
  }));
}

// Handle popcorn request from either user
function handlePopcornRequest(data) {
  const { fromUserId, toUserId, fromUserName } = data;
  
  const recipient = clients.get(toUserId);
  
  if (recipient) {
    console.log(`🍿 Sending popcorn request from ${fromUserName} to ${toUserId}`);
    recipient.ws.send(JSON.stringify({
      type: 'popcorn_request',
      fromUserId: fromUserId,
      fromUserName: fromUserName,
      message: `${fromUserName} is asking if you want popcorn! 🍿`,
      timestamp: Date.now()
    }));
  } else {
    console.log(`❌ Recipient ${toUserId} not connected`);
    // Send error back to requester
    const sender = clients.get(fromUserId);
    if (sender) {
      sender.ws.send(JSON.stringify({
        type: 'error',
        message: 'The other person is not connected right now. Make sure they have the app open!'
      }));
    }
  }
}

// Handle response to popcorn request
function handlePopcornResponse(data) {
  const { fromUserId, toUserId, response, fromUserName } = data;
  
  const recipient = clients.get(toUserId);
  
  if (recipient) {
    console.log(`📨 Sending response "${response}" from ${fromUserName} to ${toUserId}`);
    recipient.ws.send(JSON.stringify({
      type: 'popcorn_response',
      fromUserId: fromUserId,
      fromUserName: fromUserName,
      response: response,
      message: getResponseMessage(response, fromUserName),
      timestamp: Date.now()
    }));
    
    // If "not yet", schedule a reminder
    if (response === 'not_yet') {
      scheduleReminder(fromUserId, toUserId, fromUserName);
    }
  } else {
    console.log(`❌ Recipient ${toUserId} not connected`);
  }
}

// Handle confirmation message
function handleConfirmation(data) {
  const { fromUserId, toUserId, message, fromUserName } = data;
  
  const recipient = clients.get(toUserId);
  
  if (recipient) {
    console.log(`✅ Sending confirmation from ${fromUserName} to ${toUserId}`);
    recipient.ws.send(JSON.stringify({
      type: 'confirmation',
      fromUserId: fromUserId,
      fromUserName: fromUserName,
      message: message,
      timestamp: Date.now()
    }));
  }
}

// Schedule a reminder for 1 hour
function scheduleReminder(fromUserId, toUserId, fromUserName) {
  const reminderId = `${fromUserId}_${toUserId}_${Date.now()}`;
  
  const timeout = setTimeout(() => {
    const recipient = clients.get(toUserId);
    if (recipient) {
      console.log(`⏰ Sending reminder to ${toUserId}`);
      recipient.ws.send(JSON.stringify({
        type: 'reminder',
        fromUserId: fromUserId,
        fromUserName: fromUserName,
        message: `Hey! Still want to make popcorn for ${fromUserName}? 🍿`,
        timestamp: Date.now()
      }));
    }
    reminders.delete(reminderId);
  }, 60 * 60 * 1000); // 1 hour in milliseconds
  
  reminders.set(reminderId, timeout);
  console.log(`⏰ Reminder scheduled for 1 hour (${reminderId})`);
}

// Cancel a reminder
function handleCancelReminder(data) {
  const { fromUserId, toUserId } = data;
  
  // Find and cancel any matching reminders
  for (let [key, timeout] of reminders.entries()) {
    if (key.includes(fromUserId) && key.includes(toUserId)) {
      clearTimeout(timeout);
      reminders.delete(key);
      console.log(`❌ Cancelled reminder: ${key}`);
    }
  }
}

// Get friendly response message
function getResponseMessage(response, userName) {
  switch(response) {
    case 'yes':
      return `${userName} says: Yes! I would love some popcorn! 🍿😊`;
    case 'no':
      return `${userName} says: No thank you, not right now 😊`;
    case 'not_yet':
      return `${userName} says: Not yet, maybe later! I'll get a reminder in 1 hour ⏰`;
    default:
      return `${userName} responded`;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connectedClients: clients.size,
    activeReminders: reminders.size,
    uptime: process.uptime()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🍿 PopTime Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});
