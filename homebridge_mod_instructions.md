# Samsung Refrigerator Support - Modification Instructions

## Project Goal
Modify the homebridge-smartthings-oauth plugin to properly support Samsung Family Hub refrigerators (model: RF29DB9600QLA) by preventing service removal on errors and supporting multiple temperature sensors.

## Current Problems

### 1. Services Being Removed
The plugin currently removes services that return "bad values" with the error pattern:
```
[Smartthings Plug (IK)] Refrigerator returned bad value for status
[Smartthings Plug (IK)] Bad status from Refrigerator. Ignoring for now.
[Smartthings Plug (IK)] Bad status from Refrigerator. Removing this service.
```

**Impact:** Temperature sensors, Power Cool/Freeze switches, and other capabilities disappear after a few failed polls.

### 2. Single Temperature Sensor
The plugin only exposes ONE temperature sensor, but Samsung refrigerators have multiple temperature zones:
- Fridge temperature (35°F)
- Freezer temperature (-4°F)
- FlexZone temperature (varies by mode)

**Current behavior:** Whichever temperature sensor responds first becomes the only exposed sensor. The others fail and get removed.

### 3. Inconsistent Service Availability
On each restart, different services appear/disappear randomly depending on which SmartThings API calls succeed first.

## Required Modifications

### Modification 1: Prevent Service Removal on Errors

**Objective:** Keep all services registered even when they temporarily fail to respond.

**Changes needed:**
1. Find the code that logs "Removing this service"
2. Replace removal logic with retry/fallback logic:
   - Keep the service registered in HomeKit
   - Return last known good value (cache it)
   - If no cached value, return a safe default or "No Response" state
   - Continue polling in the background
   - Update value when API calls succeed again

**Implementation approach:**
- Add a `lastKnownValues` cache object for each accessory
- On successful poll, update cache
- On failed poll, return cached value instead of removing service
- Add configurable retry intervals (e.g., 30s, 1m, 5m with exponential backoff)

### Modification 2: Support Multiple Temperature Sensors

**Objective:** Create separate HomeKit temperature sensor services for each temperature zone.

**Samsung RF29DB9600QLA has:**
- Main refrigerator compartment temperature
- Freezer compartment temperature  
- FlexZone drawer temperature

**Changes needed:**
1. Detect all temperature-related capabilities from SmartThings API
2. Create separate TemperatureSensor services for each:
   - Service name: "Refrigerator Temperature", "Freezer Temperature", "FlexZone Temperature"
3. Map each service to the correct SmartThings attribute/capability
4. Poll and update each temperature independently

**SmartThings API mapping:**
The device likely exposes temperature through multiple component IDs or attributes. Need to:
- Examine the full device capabilities response
- Identify which attributes map to which zones
- Create a service for each distinct temperature attribute

### Modification 3: Better Error Handling & Logging

**Objective:** Provide clear diagnostic information about what's failing and why.

**Changes needed:**
1. Add detailed logging for SmartThings API responses
2. Log the actual "bad value" that's causing failures (currently not shown)
3. Differentiate between:
   - Network/API errors (retry immediately)
   - Invalid data format errors (log warning, use cached value)
   - Missing capabilities (one-time warning, don't retry)
4. Add configuration option to enable verbose debugging for troubleshooting

## Technical Implementation Details

### Files to Modify

Look for these key areas in the codebase:

1. **Accessory/Device Handler** - Where individual SmartThings devices are managed
   - Search for: "Removing this service"
   - Search for: "bad value"
   - Search for: "Poll failure"

2. **Service Creation** - Where HomeKit services are registered
   - Search for: "TemperatureSensor"
   - Search for: "addService"
   - Look for service initialization logic

3. **Status Polling** - Where device status is fetched from SmartThings
   - Search for: "getStatus" or "pollDevice"
   - Search for: error handling around API calls

4. **Configuration Schema** - Add new options
   - `keepFailedServices`: boolean (default: true)
   - `verboseLogging`: boolean (default: false)
   - `statusCacheDuration`: number in seconds (default: 300)

### Suggested Code Structure

```javascript
// Example: Service persistence with caching
class SmartThingsAccessory {
  constructor() {
    this.serviceCache = new Map(); // key: serviceUUID, value: {lastValue, lastUpdated}
    this.config = {
      keepFailedServices: true,
      statusCacheDuration: 300, // seconds
      maxRetries: 10,
      retryBackoff: [30, 60, 300, 600] // seconds
    };
  }

  handleStatusError(service, error) {
    if (this.config.keepFailedServices) {
      // Return cached value instead of removing service
      const cached = this.serviceCache.get(service.UUID);
      if (cached && this.isCacheValid(cached)) {
        this.log.warn(`Using cached value for ${service.displayName}`);
        return cached.lastValue;
      }
      // No valid cache, return safe default
      this.log.warn(`No cached value for ${service.displayName}, returning default`);
      return this.getDefaultValue(service);
    } else {
      // Original behavior: remove service
      this.removeService(service);
    }
  }

  updateServiceValue(service, value) {
    // Cache successful values
    this.serviceCache.set(service.UUID, {
      lastValue: value,
      lastUpdated: Date.now()
    });
    return value;
  }
}
```

### Temperature Sensor Creation

```javascript
// Example: Multiple temperature sensors
createTemperatureSensors(device) {
  const tempCapabilities = this.findTemperatureCapabilities(device);
  
  // Create a service for each temperature zone
  tempCapabilities.forEach(capability => {
    const service = this.accessory.addService(
      this.Service.TemperatureSensor,
      capability.name, // "Refrigerator", "Freezer", "FlexZone"
      capability.id
    );
    
    service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .on('get', (callback) => this.getTemperature(capability.attribute, callback));
  });
}

findTemperatureCapabilities(device) {
  // Parse SmartThings device capabilities
  // Return array of: [{name, id, attribute}, ...]
  // This needs actual SmartThings API response structure
}
```

## Testing Plan

### Test Case 1: Service Persistence
1. Start Homebridge with modified plugin
2. Verify all refrigerator services appear in HomeKit
3. Simulate API failure (disconnect from internet briefly)
4. Verify services remain in HomeKit with last known values
5. Reconnect internet
6. Verify services update with current values

### Test Case 2: Multiple Temperatures
1. Check HomeKit for multiple temperature sensors
2. Verify each shows different values (35°F fridge, -4°F freezer)
3. Change temperature in SmartThings app
4. Verify correct sensor updates in HomeKit

### Test Case 3: Error Recovery
1. Monitor logs during normal operation
2. Verify detailed error messages when failures occur
3. Verify retry logic works (services recover after temporary failures)
4. Check cache expiration works correctly

## Debug Information Needed

When troubleshooting, we need to see:

1. **Full SmartThings API Response** for the refrigerator device
   - All capabilities
   - All components
   - All attributes
   - Current values

2. **Exact "bad value"** that's causing failures
   - Current code only logs "returned bad value" but not WHAT the value is

3. **Service UUIDs and Types** being created
   - To understand which services are being removed

Add logging like:
```javascript
this.log.debug('SmartThings API Response:', JSON.stringify(response, null, 2));
this.log.debug('Received value:', value, 'Expected type:', expectedType);
this.log.debug('Services registered:', this.accessory.services.map(s => s.displayName));
```

## Configuration Options to Add

Add to `config.schema.json`:

```json
{
  "refrigerator": {
    "keepFailedServices": {
      "title": "Keep Failed Services",
      "type": "boolean",
      "default": true,
      "description": "Keep services in HomeKit even when they fail to update"
    },
    "useCache": {
      "title": "Use Cached Values",
      "type": "boolean", 
      "default": true,
      "description": "Return cached values when API calls fail"
    },
    "cacheDuration": {
      "title": "Cache Duration (seconds)",
      "type": "number",
      "default": 300,
      "description": "How long to use cached values before marking as stale"
    },
    "exposeAllTemperatures": {
      "title": "Expose All Temperature Zones",
      "type": "boolean",
      "default": true,
      "description": "Create separate sensors for fridge, freezer, and FlexZone temperatures"
    }
  }
}
```

## SmartThings Device Capabilities Reference

Based on the Samsung RF29DB9600QLA, expected capabilities:
- `temperatureMeasurement` - Temperature sensors (multiple components)
- `contactSensor` - Door sensors (3: fridge, freezer, FlexZone)
- `switch` - Various switches (Power Cool, Power Freeze, AutoFill, Cubed Ice, Ice Bites)
- `custom.rapidCooling` - Power Cool capability
- `custom.rapidFreezing` - Power Freeze capability  
- `custom.flexZoneMode` - FlexZone mode selection

The refrigerator likely uses SmartThings "components" to separate these capabilities:
- `main` - Primary refrigerator
- `freezer` - Freezer compartment
- `flexZone` - FlexZone drawer

## Success Criteria

The modification is successful when:

1. ✅ All refrigerator services remain visible in HomeKit after startup
2. ✅ Services don't disappear after API errors
3. ✅ At least 2 temperature sensors are exposed (fridge + freezer minimum)
4. ✅ Cached values are used when API temporarily fails
5. ✅ Services recover and update when API calls succeed again
6. ✅ Logs clearly show what's failing and why
7. ✅ Configuration options work as expected

## Additional Context

- User is running homebridge-smartthings-oauth v1.0.39
- Device manufacturer: Samsung Electronics
- Platform: HomeBridgeSmartThings
- Current behavior: Services appear briefly on startup, then get removed
- Logs show repeated "Poll failure" with HAP Status Error: -70410

## Questions for AI Agent

When implementing, consider:

1. Where does the plugin currently create HomeKit services from SmartThings capabilities?
2. What triggers the "Removing this service" action?
3. How does the plugin currently map SmartThings attributes to HomeKit characteristics?
4. Is there existing retry/cache logic we can extend?
5. How are device components (main, freezer, flexZone) currently handled?
