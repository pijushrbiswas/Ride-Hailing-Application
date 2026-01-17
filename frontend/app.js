// API Configuration
const API_BASE = 'http://localhost:3000/v1';
const WS_URL = 'ws://localhost:3000';

// State management
let ws = null;
let reconnectInterval = null;
let rides = new Map();
let drivers = new Map();

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const rideForm = document.getElementById('ride-form');
const activeRidesContainer = document.getElementById('active-rides');
const driversContainer = document.getElementById('drivers-list');
const activityLog = document.getElementById('activity-log');
const notification = document.getElementById('notification');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    loadInitialData();
    setupFormHandler();
});

// WebSocket Connection
function initWebSocket() {
    try {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
            updateConnectionStatus(true);
            logActivity('Connected to live updates', 'success');
            clearInterval(reconnectInterval);
        };
        
        ws.onmessage = (event) => {
            handleWebSocketMessage(JSON.parse(event.data));
        };
        
        ws.onclose = () => {
            updateConnectionStatus(false);
            logActivity('Disconnected from server', 'warning');
            attemptReconnect();
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus(false);
        attemptReconnect();
    }
}

function attemptReconnect() {
    reconnectInterval = setInterval(() => {
        console.log('Attempting to reconnect...');
        initWebSocket();
    }, 5000);
}

function updateConnectionStatus(connected) {
    if (connected) {
        statusIndicator.className = 'status-dot connected';
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
    }
}

// Handle WebSocket Messages
function handleWebSocketMessage(data) {
    console.log('WebSocket message received:', data.type, data.payload);
    
    switch (data.type) {
        case 'RIDE_CREATED':
            handleRideCreated(data.payload);
            break;
        case 'RIDE_UPDATED':
            handleRideUpdated(data.payload);
            break;
        case 'DRIVER_ASSIGNED':
            handleDriverAssigned(data.payload);
            break;
        case 'DRIVER_CREATED':
            handleDriverCreated(data.payload);
            break;
        case 'DRIVER_STATUS_CHANGED':
            handleDriverStatusChanged(data.payload);
            break;
        case 'TRIP_STARTED':
            handleTripStarted(data.payload);
            break;
        case 'TRIP_ENDED':
            handleTripEnded(data.payload);
            break;
        case 'TRIP_RECEIPT':
            handleTripReceipt(data.payload);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

function handleRideCreated(ride) {
    rides.set(ride.id, ride);
    renderRides();
    logActivity(`🚗 New ride requested from (${ride.pickup_latitude.toFixed(4)}, ${ride.pickup_longitude.toFixed(4)})`, 'info');
    showNotification(`Ride ${ride.id.substring(0, 8)} created`, 'success');
}

function handleRideUpdated(ride) {
    rides.set(ride.id, ride);
    renderRides();
    logActivity(`📍 Ride ${ride.id.substring(0, 8)} status: ${ride.status}`, 'info');
}

function handleDriverAssigned(data) {
    const ride = rides.get(data.rideId);
    if (ride) {
        ride.status = 'DRIVER_ASSIGNED';
        ride.assigned_driver_id = data.driverId;
        ride.driver_name = data.driverName;
        rides.set(data.rideId, ride);
        renderRides();
        logActivity(`✅ Driver ${data.driverName} assigned to ride ${data.rideId.substring(0, 8)}`, 'success');
        showNotification(`Driver ${data.driverName} assigned!`, 'success');
    }
}

function handleDriverStatusChanged(driver) {
    drivers.set(driver.id, driver);
    renderDrivers();
}

function handleDriverCreated(driver) {
    drivers.set(driver.id, driver);
    renderDrivers();
    logActivity(`🚕 New driver joined: ${driver.name} (${driver.status})`, 'success');
    showNotification(`Driver ${driver.name} is now available!`, 'success');
}

function handleTripStarted(trip) {
    logActivity(`🏁 Trip ${trip.id.substring(0, 8)} started for ride ${trip.ride_id.substring(0, 8)}`, 'success');
    showNotification(`Trip started!`, 'success');
}

function handleTripEnded(trip) {
    console.log('Handling trip ended:', trip);
    const fare = trip.total_fare || trip.fare_breakdown?.total || 'N/A';
    const distance = trip.distance_km ? parseFloat(trip.distance_km).toFixed(2) + ' km' : 'N/A';
    logActivity(`🏁 Trip ${trip.id.substring(0, 8)} ended - ${distance}, $${fare}`, 'success');
    showNotification(`Trip completed! Fare: $${fare}`, 'success');
    
    // Remove the ride from active rides after trip ends
    if (trip.ride_id && rides.has(trip.ride_id)) {
        rides.delete(trip.ride_id);
        renderRides();
    }
}

function handleTripReceipt(receipt) {
    const fare = receipt.fare_breakdown?.total || 'N/A';
    const distance = receipt.trip_details?.distance_km?.toFixed(2) || 'N/A';
    const driver = receipt.driver?.name || 'Unknown';
    logActivity(`🧾 Receipt generated for trip ${receipt.trip_id.substring(0, 8)} - Driver: ${driver}, ${distance} km, $${fare}`, 'info');
}

// Load Initial Data
async function loadInitialData() {
    try {
        // Load active rides
        const ridesRes = await fetch(`${API_BASE}/rides`);
        if (ridesRes.ok) {
            const ridesData = await ridesRes.json();
            if (Array.isArray(ridesData)) {
                ridesData.forEach(ride => rides.set(ride.id, ride));
                renderRides();
            }
        }
        
        // Load available drivers
        const driversRes = await fetch(`${API_BASE}/drivers?status=AVAILABLE`);
        if (driversRes.ok) {
            const driversData = await driversRes.json();
            if (Array.isArray(driversData)) {
                driversData.forEach(driver => drivers.set(driver.id, driver));
                renderDrivers();
            }
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
        logActivity('Failed to load initial data', 'warning');
    }
}

// Form Handler
function setupFormHandler() {
    rideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const rideData = {
            rider_id: generateUUID(), // In real app, use authenticated user
            pickup_latitude: parseFloat(document.getElementById('pickup-lat').value),
            pickup_longitude: parseFloat(document.getElementById('pickup-lng').value),
            drop_latitude: parseFloat(document.getElementById('dropoff-lat').value),
            drop_longitude: parseFloat(document.getElementById('dropoff-lng').value),
            tier: document.getElementById('tier').value,
            payment_method: document.getElementById('payment-method').value
        };
        
        try {
            const response = await fetch(`${API_BASE}/rides`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'idempotency-key': generateIdempotencyKey()
                },
                body: JSON.stringify(rideData)
            });
            
            if (response.ok) {
                const ride = await response.json();
                showNotification('Ride requested successfully!', 'success');
                logActivity(`📝 Ride request submitted: ${ride.id.substring(0, 8)}`, 'success');
            } else {
                const error = await response.json();
                showNotification('Failed to request ride: ' + (error.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error requesting ride:', error);
            showNotification('Failed to request ride', 'error');
        }
    });
}

// Render Functions
function renderRides() {
    const activeRides = Array.from(rides.values()).filter(r => 
        r.status !== 'CANCELLED' && r.status !== 'EXPIRED' && r.status !== 'COMPLETED'
    );
    
    document.getElementById('active-count').textContent = activeRides.length;
    
    if (activeRides.length === 0) {
        activeRidesContainer.innerHTML = '<div class="empty-state">No active rides</div>';
        return;
    }
    
    activeRidesContainer.innerHTML = activeRides.map(ride => `
        <div class="ride-item">
            <div class="ride-header">
                <span class="ride-id">Ride: ${ride.id.substring(0, 8)}</span>
                <span class="status-badge ${ride.status.toLowerCase()}">${ride.status}</span>
            </div>
            <div class="ride-details">
                <div class="detail-row">
                    <span>📍 From:</span>
                    <span>${ride.pickup_latitude.toFixed(4)}, ${ride.pickup_longitude.toFixed(4)}</span>
                </div>
                <div class="detail-row">
                    <span>🎯 To:</span>
                    <span>${ride.drop_latitude.toFixed(4)}, ${ride.drop_longitude.toFixed(4)}</span>
                </div>
                <div class="detail-row">
                    <span>🚗 Tier:</span>
                    <span>${ride.tier}</span>
                </div>
                ${ride.driver_name ? `
                    <div class="detail-row">
                        <span>👨‍✈️ Driver:</span>
                        <span>${ride.driver_name}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderDrivers() {
    const availableDrivers = Array.from(drivers.values()).filter(d => d.status === 'AVAILABLE');
    
    document.getElementById('driver-count').textContent = availableDrivers.length;
    
    if (availableDrivers.length === 0) {
        driversContainer.innerHTML = '<div class="empty-state">No drivers online</div>';
        return;
    }
    
    driversContainer.innerHTML = availableDrivers.map(driver => `
        <div class="driver-item">
            <div class="driver-header">
                <span><strong>${driver.name}</strong></span>
                <span class="status-badge ${driver.status.toLowerCase()}">${driver.status}</span>
            </div>
            <div class="driver-details">
                <div class="detail-row">
                    <span>📱 Phone:</span>
                    <span>${driver.phone}</span>
                </div>
                <div class="detail-row">
                    <span>⭐ Rating:</span>
                    <span>${driver.rating || '5.0'}</span>
                </div>
                ${driver.latitude && driver.longitude ? `
                    <div class="detail-row">
                        <span>📍 Location:</span>
                        <span>${driver.latitude.toFixed(4)}, ${driver.longitude.toFixed(4)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function logActivity(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `
        <div class="log-timestamp">${timestamp}</div>
        <div>${message}</div>
    `;
    
    activityLog.insertBefore(entry, activityLog.firstChild);
    
    // Keep only last 50 entries
    while (activityLog.children.length > 50) {
        activityLog.removeChild(activityLog.lastChild);
    }
}

function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Utility Functions
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate idempotency key for request deduplication
function generateIdempotencyKey() {
    return `${Date.now()}-${generateUUID()}`;
}

// Periodic refresh (fallback when WebSocket is not available)
setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        loadInitialData();
    }
}, 10000);
