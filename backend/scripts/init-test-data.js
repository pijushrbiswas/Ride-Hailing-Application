#!/usr/bin/env node
/**
 * Script to initialize test data with available drivers
 * Run this to populate the system with drivers for testing
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Sample driver data with locations around a central point
const DRIVERS = [
  {
    name: 'John Driver',
    phone: '+1-555-0101',
    latitude: 37.7749,  // San Francisco
    longitude: -122.4194
  },
  {
    name: 'Jane Racer',
    phone: '+1-555-0102',
    latitude: 37.7849,  // Slightly north
    longitude: -122.4094
  },
  {
    name: 'Mike Cabbie',
    phone: '+1-555-0103',
    latitude: 37.7649,  // Slightly south
    longitude: -122.4294
  },
  {
    name: 'Sarah Wheeler',
    phone: '+1-555-0104',
    latitude: 37.7749,  // Slightly east
    longitude: -122.4094
  },
  {
    name: 'Tom Cruiser',
    phone: '+1-555-0105',
    latitude: 37.7849,  // Northeast
    longitude: -122.4194
  }
];

async function createDriver(driver) {
  try {
    const response = await axios.post(`${BASE_URL}/v1/drivers`, driver);
    console.log(`✓ Created driver: ${driver.name} (${response.data.id})`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`⊘ Driver already exists: ${driver.name}`);
    } else {
      console.error(`✗ Failed to create driver ${driver.name}:`, error.message);
    }
    return null;
  }
}

async function setDriverOnline(driverId, driverName) {
  try {
    await axios.patch(`${BASE_URL}/v1/drivers/${driverId}/status`, {
      status: 'AVAILABLE'
    });
    console.log(`✓ Set driver online: ${driverName}`);
  } catch (error) {
    console.error(`✗ Failed to set driver online ${driverName}:`, error.message);
  }
}

async function main() {
  console.log('🚀 Initializing test data...\n');
  console.log(`API URL: ${BASE_URL}\n`);
  
  console.log('Creating drivers...');
  const createdDrivers = [];
  
  for (const driver of DRIVERS) {
    const created = await createDriver(driver);
    if (created) {
      createdDrivers.push(created);
    }
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n✓ Created ${createdDrivers.length} drivers`);
  
  // Set all drivers online
  console.log('\nSetting drivers online...');
  for (const driver of createdDrivers) {
    await setDriverOnline(driver.id, driver.name);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n✅ Test data initialization complete!');
  console.log(`\nAvailable drivers: ${createdDrivers.length}`);
  console.log('\nYou can now create rides and they should be automatically matched.\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
