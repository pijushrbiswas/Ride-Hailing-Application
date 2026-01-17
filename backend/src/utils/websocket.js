const WebSocket = require('ws');
const logger = require('../config/logger');

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws);
      logger.info({ clientsCount: this.clients.size }, 'WebSocket client connected');

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info({ clientsCount: this.clients.size }, 'WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        logger.error({ error: error.message }, 'WebSocket error');
        this.clients.delete(ws);
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'CONNECTED',
        payload: { message: 'Connected to ride-hailing service' }
      });
    });

    logger.info('WebSocket server initialized');
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
          sentCount++;
        } catch (error) {
          logger.error({ error: error.message }, 'Failed to send WebSocket message');
        }
      }
    });

    logger.debug({ type: message.type, clients: sentCount }, 'Broadcast message sent');
  }

  sendToClient(client, message) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to send message to client');
      }
    }
  }

  // Broadcast ride created event
  broadcastRideCreated(ride) {
    this.broadcast({
      type: 'RIDE_CREATED',
      payload: ride
    });
  }

  // Broadcast ride updated event
  broadcastRideUpdated(ride) {
    this.broadcast({
      type: 'RIDE_UPDATED',
      payload: ride
    });
  }

  // Broadcast driver assigned event
  broadcastDriverAssigned(rideId, driverId, driverName) {
    this.broadcast({
      type: 'DRIVER_ASSIGNED',
      payload: { rideId, driverId, driverName }
    });
  }

  // Broadcast driver status change
  broadcastDriverStatusChanged(driver) {
    this.broadcast({
      type: 'DRIVER_STATUS_CHANGED',
      payload: driver
    });
  }

  // Broadcast driver location update event
  broadcastLocationUpdate(driver) {
    this.broadcast({
      type: 'DRIVER_LOCATION_UPDATED',
      payload: driver
    });
  }

  // Broadcast driver created event
  broadcastDriverCreated(driver) {
    this.broadcast({
      type: 'DRIVER_CREATED',
      payload: driver
    });
  }

  // Broadcast trip started event
  broadcastTripStarted(trip) {
    this.broadcast({
      type: 'TRIP_STARTED',
      payload: trip
    });
  }

  // Broadcast trip ended event
  broadcastTripEnded(trip) {
    this.broadcast({
      type: 'TRIP_ENDED',
      payload: trip
    });
  }

  // Broadcast trip receipt event
  broadcastTripReceipt(receipt) {
    this.broadcast({
      type: 'TRIP_RECEIPT',
      payload: receipt
    });
  }
}

module.exports = new WebSocketManager();
