/**
 * Unit tests for assignment service with driver matching
 */

const assignmentService = require('../../src/services/assignment.service');
const db = require('../../src/db');
const notificationService = require('../../src/services/notification.service');

jest.mock('../../src/db');
jest.mock('../../src/services/notification.service');

describe('Assignment Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignDriver', () => {
    it('should assign driver to ride successfully', async () => {
      const mockRide = {
        id: 'ride-123',
        rider_id: 'rider-1',
        status: 'MATCHING',
        driver_name: 'John Driver',
        driver_phone: '+1234567890',
        driver_rating: 4.8,
        driver_status: 'AVAILABLE'
      };

      const mockDriver = {
        id: 'driver-1',
        status: 'AVAILABLE'
      };

      const updatedRide = {
        id: 'ride-123',
        driver_id: 'driver-1',
        status: 'DRIVER_ASSIGNED'
      };

      const updatedDriver = {
        id: 'driver-1',
        status: 'ON_TRIP'
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [mockRide], rowCount: 1 }) // SELECT ride and driver FOR UPDATE
        .mockResolvedValueOnce({ rows: [updatedDriver], rowCount: 1 }) // UPDATE driver
        .mockResolvedValueOnce({ rows: [updatedRide], rowCount: 1 }) // UPDATE ride
        .mockResolvedValueOnce({ rows: [{ id: 'trip-123' }], rowCount: 1 }) // INSERT trip
        .mockResolvedValueOnce(); // COMMIT

      notificationService.notifyRideAssigned.mockResolvedValue();

      const result = await assignmentService.assignDriver('ride-123', 'driver-1');

      expect(result.success).toBe(true);
      expect(result.ride).toEqual(updatedRide);
      expect(result.trip.id).toBe('trip-123');
      expect(result.driver.status).toBe('ON_TRIP');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(notificationService.notifyRideAssigned).toHaveBeenCalledWith('rider-1', expect.any(Object));
    });

    it('should prevent concurrent assignment with row-level locking', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // Ride already assigned
          rows: [{
            id: 'ride-123',
            driver_id: 'driver-2',
            status: 'DRIVER_ASSIGNED',
            driver_status: 'ON_TRIP'
          }],
          rowCount: 1
        });

      await expect(assignmentService.assignDriver('ride-123', 'driver-1'))
        .rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should prevent assigning busy driver', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // Ride OK, but driver busy
          rows: [{
            status: 'MATCHING',
            rider_id: 'rider-1',
            driver_status: 'ON_TRIP' // Driver is busy
          }],
          rowCount: 1
        });

      await expect(assignmentService.assignDriver('ride-123', 'driver-1'))
        .rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(assignmentService.assignDriver('ride-123', 'driver-1'))
        .rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
