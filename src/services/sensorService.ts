import { PlatformAccessory, CharacteristicValue, WithUUID, Characteristic, Service } from 'homebridge';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { BaseService } from './baseService';
import { MultiServiceAccessory } from '../multiServiceAccessory';

interface CachedValue {
  value: CharacteristicValue;
  lastUpdated: number;
}

export abstract class SensorService extends BaseService {
  statusFailureCount = 0;
  statusTranslation: (status) => CharacteristicValue | null = () => {
    return null;
  };

  private pollingTimer: NodeJS.Timeout | undefined;
  private cachedValue: CachedValue | undefined;
  private keepFailedServices: boolean;
  private useCache: boolean;
  private cacheDuration: number; // in seconds
  private verboseLogging: boolean;

  characteristic: WithUUID<new () => Characteristic> | undefined;

  constructor(platform: IKHomeBridgeHomebridgePlatform, accessory: PlatformAccessory, componentId: string, capabilities: string[],
    multiServiceAccessory: MultiServiceAccessory,
    name: string, deviceStatus) {
    super(platform, accessory, componentId, capabilities, multiServiceAccessory, name, deviceStatus);

    // Get configuration options with defaults
    this.keepFailedServices = platform.config.KeepDisconnectedDevices === true; // Default: false
    // We default useCache to true if keepFailedServices is on, as that is the intended behavior of the feature
    this.useCache = this.keepFailedServices;
    this.cacheDuration = 300; // Hardcoded default: 300 seconds (5 minutes)
    this.verboseLogging = platform.config.AdvancedDebugging === true; // Default: false
  }

  protected initService(sensorService: WithUUID<typeof Service>, sensorCharacteristic: WithUUID<new () => Characteristic>,
    statusTranslation: (status) => CharacteristicValue) {
    this.statusTranslation = statusTranslation;
    this.setServiceType(sensorService);
    this.characteristic = sensorCharacteristic;

    // Set the event handlers
    this.service.getCharacteristic(sensorCharacteristic)
      .onGet(this.getSensorState.bind(this));

    let pollSensorsSeconds = 10; // default to 10 seconds
    if (this.platform.config.PollSensorsSeconds !== undefined) {
      pollSensorsSeconds = this.platform.config.PollSensorsSeconds;
    }

    if (pollSensorsSeconds > 0) {
      const timerResult = this.multiServiceAccessory.startPollingState(
        pollSensorsSeconds,
        this.getSensorState.bind(this),
        this.service,
        this.platform.Characteristic.MotionDetected,
      );

      if (timerResult && typeof timerResult === 'object') {
        this.pollingTimer = timerResult as NodeJS.Timeout;
      } else {
        this.pollingTimer = undefined;
      }
    }
  }

  // Get the current state of the sensor
  async getSensorState(): Promise<CharacteristicValue> {
    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    this.log.debug('Received getSensorState() event for ' + this.name);

    return new Promise((resolve, reject) => {
      this.getStatus().then(success => {
        if (success) {
          // Get the current component status from multiServiceAccessory
          const component = this.multiServiceAccessory.components.find(c => c.componentId === this.componentId);
          const currentStatus = component?.status || this.deviceStatus.status;

          let value;
          try {
            value = this.statusTranslation(currentStatus);
            this.statusFailureCount = 0;

            // Cache the successful value
            this.cachedValue = {
              value: value,
              lastUpdated: Date.now(),
            };

            this.log.debug(`State for ${this.name}: ${value}`);
            if (this.verboseLogging) {
              this.log.debug(`Status data for ${this.name}: ${JSON.stringify(currentStatus)}`);
            }
            resolve(value);
            return;
          } catch (error) {
            this.statusFailureCount++;

            // Log the actual bad value for debugging
            const badValue = currentStatus;
            this.log.warn(`${this.name} returned bad value for status. Component: ${this.componentId}, Status: ${JSON.stringify(badValue)}, Error: ${error}`);

            // Check if we should keep the service and use cached value
            if (this.keepFailedServices) {
              if (this.useCache && this.cachedValue && this.isCacheValid(this.cachedValue)) {
                this.log.warn(`Using cached value for ${this.name}: ${this.cachedValue.value} (cached ${Math.round((Date.now() - this.cachedValue.lastUpdated) / 1000)}s ago)`);
                resolve(this.cachedValue.value);
                return;
              } else {
                // No valid cache or caching disabled, return a safe default
                const defaultValue = this.getDefaultValue();
                this.log.warn(`No cached value for ${this.name}${!this.useCache ? ' (caching disabled)' : ''}, returning default: ${defaultValue}`);
                resolve(defaultValue);
                return;
              }
            } else {
              // Original behavior: remove service after too many failures
              if (this.statusFailureCount > 5) {
                this.log.error(`Bad status from ${this.name}.  Removing this service.`);
                // Stop polling and remove service
                if (this.pollingTimer) {
                  clearInterval(this.pollingTimer);
                  this.pollingTimer = undefined;
                }
                this.accessory.removeService(this.service);
              } else {
                this.log.warn(`Bad status from ${this.name}.  Ignoring for now.`);
              }
              reject(new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST));
              return;
            }
          }
        } else {
          // API call failed - use cached value if available
          if (this.keepFailedServices) {
            if (this.useCache && this.cachedValue && this.isCacheValid(this.cachedValue)) {
              this.log.warn(`API call failed for ${this.name}, using cached value: ${this.cachedValue.value} (cached ${Math.round((Date.now() - this.cachedValue.lastUpdated) / 1000)}s ago)`);
              resolve(this.cachedValue.value);
              return;
            } else {
              const defaultValue = this.getDefaultValue();
              this.log.warn(`API call failed for ${this.name} and no valid cache${!this.useCache ? ' (caching disabled)' : ''}, returning default: ${defaultValue}`);
              resolve(defaultValue);
              return;
            }
          }
          reject(new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        }
      });
    });
  }

  /**
   * Check if cached value is still valid based on cache duration
   */
  private isCacheValid(cached: CachedValue): boolean {
    const ageSeconds = (Date.now() - cached.lastUpdated) / 1000;
    return ageSeconds < this.cacheDuration;
  }

  /**
   * Get a safe default value for the sensor type
   * Override in subclasses for type-specific defaults
   */
  protected getDefaultValue(): CharacteristicValue {
    // Default: return 0 for numeric sensors, false for boolean sensors
    // This can be overridden in subclasses
    return 0;
  }

  // public processEvent(event: ShortEvent) {
  //   const value = this.statusTranslation(event.value);
  //   if (this.characteristic && value) {
  //     this.log.debug(`Updating value of ${this.name} from event to ${value}`);
  //     this.service.updateCharacteristic(this.characteristic, value);
  //   }
  // }
}