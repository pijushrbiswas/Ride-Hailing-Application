# Ride-Hailing Application 🚗

A production-ready ride-hailing system (like Uber/Ola) built with Node.js, Express, PostgreSQL, and Redis.

## Features

### Core Functionality
- ✅ Real-time driver location updates (1-2 per second via Redis GeoSpatial)
- ✅ Rider requests with pickup, destination, tier, and payment method
- ✅ Driver-rider matching within 1s p95 (5km radius, max 5 drivers)
- ✅ Complete trip lifecycle (start, pause, end, fare calculation)
- ✅ Payment processing via external PSPs with retries
- ✅ Push notifications for key ride events
- ✅ Receipt generation with detailed fare breakdown

### Technical Features
- ✅ Idempotency for critical operations
- ✅ State machine for rides, drivers, and trips
- ✅ Exponential backoff retry logic (3 attempts: 30s, 2m, 8m)
- ✅ Webhook handling for PSP callbacks
- ✅ Outbox pattern for exactly-once processing
- ✅ Comprehensive observability with New Relic
- ✅ Docker & Docker Compose ready
- ✅ Database migrations

## API Endpoints

### Rides
- `GET /v1/rides` - Get all rides (with optional status filter)
- `POST /v1/rides` - Create a ride request
- `GET /v1/rides/:id` - Get ride status

### Drivers
- `GET /v1/drivers` - Get all drivers (with optional status filter)
- `POST /v1/drivers` - Create a new driver
- `POST /v1/drivers/:id/location` - Update driver location
- `POST /v1/drivers/:id/accept` - Accept ride assignment

### Trips
- `POST /v1/trips/:id/start` - Start a trip
- `POST /v1/trips/:id/pause` - Pause a trip
- `POST /v1/trips/:id/end` - End trip and calculate fare
- `GET /v1/trips/:id/receipt` - Get trip receipt

### Payments
- `POST /v1/payments` - Create payment for trip
- `GET /v1/payments/:id` - Get payment status
- `POST /v1/payments/webhooks/psp` - PSP webhook callback

## Architecture

```
┌─────────────┐       ┌──────────────┐       ┌────────────┐
│   Client    │──────▶│   API Server │──────▶│ PostgreSQL │
│ (Mobile App)│       │  (Express)   │       │  (Primary) │
└─────────────┘       └──────────────┘       └────────────┘
                             │
                             │
                      ┌──────┴──────┐
                      │             │
                ┌─────▼────┐  ┌─────▼──────┐
                │  Redis   │  │   Outbox   │
                │ (Cache + │  │   Worker   │
                │   Geo)   │  │ (Payments) │
                └──────────┘  └────────────┘
                                     │
                              ┌──────▼───────┐
                              │ PSP (Stripe/ │
                              │  Braintree)  │
                              └──────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: PostgreSQL 15 + PostGIS
- **Cache**: Redis 7
- **Observability**: New Relic
- **Containerization**: Docker & Docker Compose

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)

### 1. Clone and Setup
```bash
git clone <repository>
cd Ride-Hailing-Application
cp .env.example .env  # Update with your credentials
```

### 2. Start Services
```bash
cd infra
docker-compose up -d
```

This starts:
- API server on port 3000
- PostgreSQL on port 5432
- Redis on port 6379
- Outbox worker (background)

### 3. Run Migrations
```bash
docker exec -i postgres psql -U appuser -d rides < postgres/migrations/001_initial_schema.sql
docker exec -i postgres psql -U appuser -d rides < postgres/migrations/002_payment_retry_fields.sql
docker exec -i postgres psql -U appuser -d rides < postgres/migrations/003_add_tier_payment_method.sql
```

### 4. Verify Health
```bash
curl http://localhost:3000/health
# Response: {"status":"ok"}
```

### 5. Start the Frontend Dashboard (Optional)

```bash
cd frontend
npm install
node server.js
```

Access the **live dashboard** at: http://localhost:8080

The dashboard provides:
- 📍 **Ride Request Form** - Submit ride requests
- 🚕 **Live Ride Tracking** - Real-time status updates
- 👨‍✈️ **Driver Monitor** - View available drivers
- 📊 **Activity Log** - Live event stream
- 🔄 **WebSocket Updates** - Instant notifications

See [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) for detailed documentation.

## Usage Examples

### Create a Ride
```bash
curl -X POST http://localhost:3000/v1/rides \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ride-$(date +%s)" \
  -d '{
    "rider_id": "rider-uuid",
    "pickup_latitude": 37.7749,
    "pickup_longitude": -122.4194,
    "drop_latitude": 37.8049,
    "drop_longitude": -122.4294,
    "tier": "PREMIUM",
    "payment_method": "CARD"
  }'
```

### Driver Accepts Ride
```bash
curl -X POST http://localhost:3000/v1/drivers/driver-uuid/accept \
  -H "Content-Type: application/json" \
  -d '{"ride_id": "ride-uuid"}'
```

### Start Trip
```bash
curl -X POST http://localhost:3000/v1/trips/trip-uuid/start
```

### End Trip
```bash
curl -X POST http://localhost:3000/v1/trips/trip-uuid/end \
  -H "Content-Type: application/json" \
  -d '{
    "distance_km": 12.5,
    "duration_sec": 1200
  }'
```

### Get Receipt
```bash
curl http://localhost:3000/v1/trips/trip-uuid/receipt
```

## Fare Calculation

Fares are calculated based on ride tier:

| Tier    | Base Fare | Per KM | Per Minute |
|---------|-----------|--------|------------|
| ECONOMY | $5.00     | $1.50  | $0.25      |
| PREMIUM | $8.00     | $2.50  | $0.40      |
| LUXURY  | $15.00    | $4.00  | $0.60      |

**Formula**: `Total = (Base + Distance×Rate + Time×Rate) × Surge`

## Notification Events

The system sends notifications for:
- 📍 Ride assigned (driver details, ETA)
- 🚀 Trip started
- ⏸️ Trip paused
- ✅ Trip completed (fare details)
- 💳 Payment successful
- ❌ Payment failed

## Project Structure

```
backend/
├── src/
│   ├── app.js                    # Express app setup
│   ├── server.js                 # Server entry point
│   ├── config/                   # Configuration files
│   ├── controllers/              # Request handlers
│   ├── services/                 # Business logic
│   │   ├── ride.service.js
│   │   ├── driver.service.js
│   │   ├── trip.service.js
│   │   ├── payment.service.js
│   │   ├── assignment.service.js
│   │   ├── matching.service.js
│   │   └── notification.service.js
│   ├── routes/                   # API routes
│   ├── middlewares/              # Custom middleware
│   ├── db/                       # Database client
│   ├── utils/                    # Utilities
│   └── workers/                  # Background workers
│       └── outbox.worker.js
├── Dockerfile                    # API container
├── Dockerfile.worker             # Worker container
└── package.json

infra/
├── docker-compose.yml            # Service orchestration
└── postgres/
    ├── schema.sql                # Database schema
    └── migrations/               # Migration scripts
```

## Observability

### New Relic Metrics

**Payment Metrics**:
- `Custom/Payment/Created`
- `Custom/Payment/Success`
- `Custom/Payment/Failure`
- `Custom/Payment/Retry`
- `Custom/Payment/WebhookReceived`

**Trip Metrics**:
- `Custom/Trip/Started`
- `Custom/Trip/Ended`
- `Custom/Trip/Fare`

**Notification Metrics**:
- `Custom/Notification/RIDE_ASSIGNED`
- `Custom/Notification/TRIP_STARTED`
- `Custom/Notification/PAYMENT_COMPLETED`

**Worker Metrics**:
- `Custom/Worker/Heartbeat`
- `Custom/Outbox/ProcessedSuccess`
- `Custom/Retry/PaymentsDue`

### View Metrics
```sql
SELECT count(*) FROM Metric 
WHERE metricName LIKE 'Custom/%' 
SINCE 1 hour ago 
FACET metricName
```

## Testing

Run the payment integration tests:
```bash
./test-payments.sh
```

## Development

### Local Development
```bash
cd backend
npm install
npm run dev  # Starts with nodemon
```

### View Logs
```bash
# API logs
docker-compose logs -f api

# Worker logs
docker-compose logs -f outbox-worker

# Database logs
docker-compose logs -f postgres
```

## Production Considerations

1. **PSP Integration**: Replace mock PSP with Stripe/Braintree
2. **Notification Service**: Integrate FCM/SNS for real push notifications
3. **Load Balancing**: Run multiple API instances
4. **Database**: Enable replication, configure backups
5. **Monitoring**: Set up alerts for failure rates, latency
6. **Security**: Add authentication, rate limiting, API keys
7. **Scaling**: Consider message queues (RabbitMQ/Kafka) for high throughput

## Documentation

- [Payment Features](PAYMENT_FEATURES.md) - Detailed payment system docs
- API Documentation - Generate with Swagger/OpenAPI

## License

MIT

## Support

For issues or questions, check logs:
```bash
docker-compose logs -f
```