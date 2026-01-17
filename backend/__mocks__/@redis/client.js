/**
 * Comprehensive Redis client mock for testing
 */

// Create a mock Redis client with all necessary methods
const createMockClient = () => {
  const storage = new Map();
  const geoStorage = new Map();

  return {
    // Key-value operations
    get: jest.fn(async (key) => {
      return storage.get(key) || null;
    }),

    set: jest.fn(async (key, value) => {
      storage.set(key, value);
      return 'OK';
    }),

    setEx: jest.fn(async (key, seconds, value) => {
      storage.set(key, value);
      // In a real implementation, would set expiry
      setTimeout(() => storage.delete(key), seconds * 1000);
      return 'OK';
    }),

    del: jest.fn(async (key) => {
      const existed = storage.has(key);
      storage.delete(key);
      return existed ? 1 : 0;
    }),

    // Geospatial operations
    geoAdd: jest.fn(async (key, longitude, latitude, member) => {
      if (!geoStorage.has(key)) {
        geoStorage.set(key, []);
      }
      const locations = geoStorage.get(key);
      // Remove existing entry for this member
      const filtered = locations.filter(loc => loc.member !== member);
      filtered.push({ member, longitude, latitude });
      geoStorage.set(key, filtered);
      return 1;
    }),

    geoSearch: jest.fn(async (key, from, by, options = {}) => {
      const locations = geoStorage.get(key) || [];
      
      // Simple distance calculation (Haversine would be more accurate)
      const results = locations.map(loc => {
        const latDiff = Math.abs(loc.latitude - from.latitude);
        const lonDiff = Math.abs(loc.longitude - from.longitude);
        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111; // Rough km conversion
        
        return {
          member: loc.member,
          distance: distance.toFixed(1)
        };
      });

      // Filter by radius if specified
      let filtered = results;
      if (by && by.radius) {
        filtered = results.filter(r => parseFloat(r.distance) <= by.radius);
      }

      // Sort by distance
      filtered.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

      // Limit results if COUNT is specified
      if (options.COUNT) {
        filtered = filtered.slice(0, options.COUNT);
      }

      return filtered;
    }),

    // Connection management
    connect: jest.fn(async () => {
      return true;
    }),

    disconnect: jest.fn(async () => {
      storage.clear();
      geoStorage.clear();
      return true;
    }),

    quit: jest.fn(async () => {
      storage.clear();
      geoStorage.clear();
      return 'OK';
    }),

    // Event handlers
    on: jest.fn((event, handler) => {
      // Mock event listener
      return true;
    }),

    // Ping
    ping: jest.fn(async () => {
      return 'PONG';
    }),

    // Helper to clear storage in tests
    __clearStorage: () => {
      storage.clear();
      geoStorage.clear();
    },

    // Helper to inspect storage in tests
    __getStorage: () => storage,
    __getGeoStorage: () => geoStorage
  };
};

// Export mock client instance
const mockClient = createMockClient();

// Mock the createClient function
const createClient = jest.fn(() => mockClient);

module.exports = {
  createClient,
  mockClient,
  __mockClient: mockClient // Export for direct access in tests
};
