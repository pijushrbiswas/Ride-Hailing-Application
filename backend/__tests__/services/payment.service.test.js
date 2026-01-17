/**
 * Unit tests for payment service
 */

const paymentService = require('../../src/services/payment.service');
const db = require('../../src/db');

jest.mock('../../src/db');
jest.mock('../../src/services/notification.service');

describe('Payment Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
    db.query = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentForTrip', () => {
    it('should create payment successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        trip_id: 'trip-123',
        amount: 25.00,
        status: 'PENDING'
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ total_fare: 25.00 }], rowCount: 1 }) // SELECT trip
        .mockResolvedValueOnce({ rows: [mockPayment] }) // INSERT payment
        .mockResolvedValueOnce() // INSERT outbox
        .mockResolvedValueOnce(); // COMMIT

      const result = await paymentService.createPaymentForTrip('trip-123', 'key-123');

      expect(result).toEqual(mockPayment);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        amount: 25.00,
        status: 'PENDING',
        retry_count: 0
      };

      // Mock Math.random to ensure PSP success (not trigger 20% failure)
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment], rowCount: 1 }) // SELECT
        .mockResolvedValueOnce() // UPDATE to PROCESSING
        .mockResolvedValueOnce(); // COMMIT

      const result = await paymentService.processPayment('payment-123');

      expect(result.success).toBe(true);
      
      Math.random.mockRestore();
    });
  });

  describe('handleWebhook', () => {
    it('should handle webhook successfully', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'payment-123', status: 'PENDING', trip_id: 'trip-123' }], rowCount: 1 }) // SELECT payment
        .mockResolvedValueOnce({ rows: [{ id: 'payment-123', status: 'COMPLETED' }] }) // UPDATE payment
        .mockResolvedValueOnce({ rows: [{ rider_id: 'rider-1' }], rowCount: 1 }); // SELECT trip

      const result = await paymentService.handleWebhook({
        payment_id: 'payment-123',
        status: 'succeeded',
        transaction_id: 'txn-123'
      });

      expect(result.id).toBe('payment-123');
    });
  });
});
