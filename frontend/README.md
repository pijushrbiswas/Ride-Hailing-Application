# Ride Hailing Frontend

A simple real-time dashboard for the ride-hailing application with live updates.

## Features

- 📍 **Request Rides** - Submit ride requests with pickup/dropoff locations
- 🚕 **Live Ride Tracking** - Real-time updates of active rides
- 👨‍✈️ **Driver Status** - View available drivers in real-time
- 📊 **Activity Log** - Live feed of all system events
- 🔄 **WebSocket Updates** - Automatic updates when rides are created or drivers assigned

## Getting Started

### Prerequisites

- Node.js installed
- Backend server running on `http://localhost:3000`

### Installation

```bash
cd frontend
npm install
```

### Run the Frontend

```bash
npm start
```

The frontend will be available at `http://localhost:8080`

### Seed Test Data

To create test drivers:

```bash
chmod +x seed.sh
./seed.sh
```

## Architecture

### Real-Time Communication

The frontend uses WebSockets to receive live updates from the backend:

- **RIDE_CREATED** - New ride request submitted
- **RIDE_UPDATED** - Ride status changed
- **DRIVER_ASSIGNED** - Driver assigned to a ride
- **DRIVER_STATUS_CHANGED** - Driver status updated

### Components

- **index.html** - Main dashboard UI
- **styles.css** - Modern, responsive styling
- **app.js** - WebSocket client and state management
- **server.js** - Express server to serve static files

## Usage

1. **Start the backend** (from `/backend` directory):
   ```bash
   npm start
   ```

2. **Start the frontend** (from `/frontend` directory):
   ```bash
   npm start
   ```

3. **Open the dashboard**: http://localhost:8080

4. **Request a ride**: Fill in the form and submit

5. **Watch live updates**: See real-time updates in the dashboard

## Development

The frontend uses vanilla JavaScript (no framework) for simplicity:

- **WebSocket** for real-time updates
- **Fetch API** for HTTP requests
- **CSS Grid** for responsive layout
- **Modern ES6+** JavaScript features

## Browser Support

Modern browsers with WebSocket support:
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
