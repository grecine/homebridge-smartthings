import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { MultiServiceAccessory } from '../multiServiceAccessory';
import { SensorService } from './sensorService';
import { ShortEvent } from '../webhook/subscriptionHandler';

export class TemperatureService extends SensorService {
  private unit = 'F';

  constructor(platform: IKHomeBridgeHomebridgePlatform, accessory: PlatformAccessory, componentId: string, capabilities: string[],
    multiServiceAccessory: MultiServiceAccessory,
    name: string, deviceStatus) {
    super(platform, accessory, componentId, capabilities, multiServiceAccessory, name, deviceStatus);

    // VERIFICATION: This log confirms the modified code is running
    this.log.info(`🔧 MODIFIED CODE v1.0.39 - TemperatureService initialized for ${this.name} (${componentId})`);

    // Check if this component is disabled (check might not have been available during service creation)
    if (multiServiceAccessory.isComponentDisabled(componentId)) {
      this.log.info(`⚠️ Temperature sensor for ${this.name} component "${componentId}" is disabled in SmartThings - service will not function properly`);
      // Note: We can't remove the service here as it's already being created, but we'll log it
      // The service will fail to get temperature values and use defaults
    }

    this.log.debug(`Adding TemperatureService to ${this.name} for component ${componentId}`);



    this.initService(platform.Service.TemperatureSensor, platform.Characteristic.CurrentTemperature, (status) => {
      // Check if this component is disabled - if so, don't try to get temperature
      if (this.multiServiceAccessory.isComponentDisabled(componentId)) {
        this.log.debug(`Component ${componentId} is disabled - temperature sensor will return default value`);
        throw ('Bad Value'); // This will trigger the default value return
      }

      // First, try standard temperatureMeasurement capability
      let tempValue: number | null = null;
      let tempUnit: string | null = null;

      if (status?.temperatureMeasurement?.temperature) {
        tempValue = status.temperatureMeasurement.temperature.value;
        tempUnit = status.temperatureMeasurement.temperature.unit;
      }

      // If standard capability is null/missing, try OCF driver state format (Samsung refrigerators)
      // OCF data is typically only in the main component's status, so we need to check both
      // the current component's status and the main component's status
      if ((tempValue === null || tempValue === undefined || tempUnit === null || tempUnit === undefined) &&
        this.platform.config.ExposeMultiZoneRefrigerator) {
        this.log.debug(`Standard temperatureMeasurement is null for ${this.name} (${componentId}), attempting OCF extraction...`);
        // First try current component's OCF data
        let driverStateValue = null;
        if (status?.samsungce?.driverState?.driverState?.value) {
          driverStateValue = status.samsungce.driverState.driverState.value;
          this.log.debug(`Found OCF data in current component status for ${this.name} (${componentId})`);
        } else {
          // If not in current component, try to get it from main component
          const mainComponent = this.multiServiceAccessory.components.find(c => c.componentId === 'main');
          if (mainComponent?.status && (mainComponent.status as any)?.samsungce?.driverState?.driverState?.value) {
            driverStateValue = (mainComponent.status as any).samsungce.driverState.driverState.value;
            this.log.debug(`Found OCF data in main component status for ${this.name} (${componentId})`);
          } else {
            this.log.debug(`No OCF data found in current or main component for ${this.name} (${componentId})`);
          }
        }

        if (driverStateValue) {
          this.log.debug(`Attempting to extract temperature from OCF data for ${this.name} (${componentId})...`);
          tempValue = this.extractTemperatureFromOcfDriverState(driverStateValue, componentId);
          if (tempValue !== null) {
            tempUnit = 'F'; // OCF format from Samsung uses Fahrenheit
            this.log.info(`✅ Successfully extracted temperature ${tempValue}°F from OCF data for ${this.name} (${componentId})`);
          } else {
            this.log.warn(`OCF data available but temperature extraction failed for ${this.name} (${componentId})`);
            if (this.platform.config.AdvancedDebugging) {
              this.log.debug(`OCF driverStateValue structure: ${JSON.stringify(driverStateValue).substring(0, 200)}...`);
            }
          }
        } else {
          this.log.debug(`No OCF driverStateValue available for ${this.name} (${componentId})`);
        }
      }

      if (tempValue === null || tempValue === undefined || tempUnit === null || tempUnit === undefined) {
        this.log.warn(`${this.name} (${componentId}) returned bad value - value: ${tempValue}, unit: ${tempUnit}`);
        if (this.platform.config.AdvancedDebugging) {
          this.log.debug(`Full status for ${this.name} (${componentId}): ${JSON.stringify(status, null, 2)}`);
        }
        throw ('Bad Value');
      }

      if (tempUnit === 'F') {
        this.unit = 'F';
        this.log.debug(`Converting temp from Fahrenheit to Celsius: ${tempValue}°F`);
        return (tempValue as number - 32) * (5 / 9); // Convert to Celsius
      } else {
        this.unit = 'C';
        return tempValue as number;
      }
    });

    // Update service display name if component-specific
    if (componentId !== 'main') {
      const componentNames: Record<string, string> = {
        'freezer': 'Freezer',
        'flexZone': 'FlexZone',
        'refrigerator': 'Refrigerator',
      };
      const componentName = componentNames[componentId] || componentId;
      this.service.setCharacteristic(platform.Characteristic.Name, `${this.name} ${componentName}`);
    }
  }

  /**
   * Extract temperature from OCF driver state format (used by Samsung refrigerators)
   * @param driverStateValue - The driverState.value from samsungce.driverState (can be object with "device/0" key or direct array)
   * @param componentId - The component ID to find the temperature for
   * @returns Temperature in Fahrenheit, or null if not found
   */
  private extractTemperatureFromOcfDriverState(driverStateValue: any, componentId: string): number | null {
    // Handle nested structure: driverState.value can be {"device/0": [array]} or direct array
    let itemsArray: any[] | null = null;

    if (Array.isArray(driverStateValue)) {
      itemsArray = driverStateValue;
    } else if (driverStateValue && typeof driverStateValue === 'object') {
      // Try to find array in "device/0" key first (most common structure)
      if (driverStateValue['device/0'] && Array.isArray(driverStateValue['device/0'])) {
        itemsArray = driverStateValue['device/0'];
      } else {
        // Try any key that contains an array
        const keys = Object.keys(driverStateValue);
        for (const key of keys) {
          if (Array.isArray(driverStateValue[key])) {
            itemsArray = driverStateValue[key];
            this.log.debug(`Found OCF array in key "${key}" for ${this.name} (${componentId})`);
            break;
          }
        }
      }
    }

    if (!itemsArray || !Array.isArray(itemsArray)) {
      if (this.platform.config.AdvancedDebugging) {
        this.log.debug(`OCF driverStateValue structure for ${this.name} (${componentId}): ${JSON.stringify(driverStateValue)}`);
      }
      return null;
    }

    if (this.platform.config.AdvancedDebugging) {
      this.log.debug(`OCF extraction: Found ${itemsArray.length} items in driver state for ${this.name} (${componentId})`);
    }

    // Map component IDs to OCF temperature paths
    const temperaturePaths: Record<string, string[]> = {
      'main': ['/temperature/current/cooler/0', '/temperatures/vs/0'], // Fridge temperature
      'freezer': ['/temperature/current/freezer/0', '/temperatures/vs/0'], // Freezer temperature
      'cvroom': ['/temperature/current/cooler/0'], // FlexZone might use cooler temp
      'flexZone': ['/temperature/current/cooler/0'],
    };

    const paths = temperaturePaths[componentId] || ['/temperatures/vs/0'];

    if (this.platform.config.AdvancedDebugging) {
      this.log.debug(`OCF extraction: Searching for paths ${paths.join(', ')} for ${this.name} (${componentId})`);
      const availableHrefs = itemsArray.map((entry: any) => entry.href).filter((href: any) => href);
      this.log.debug(`OCF extraction: Available hrefs: ${availableHrefs.join(', ')}`);
    }

    for (const path of paths) {
      const item = itemsArray.find((entry: any) => entry.href === path);
      if (item && item.rep) {
        if (this.platform.config.AdvancedDebugging) {
          this.log.debug(`OCF extraction: Found item for path ${path}, rep keys: ${Object.keys(item.rep).join(', ')}`);
        }

        // Try direct temperature field first
        if (item.rep.temperature !== undefined && item.rep.temperature !== null) {
          const temp = item.rep.temperature as number;
          this.log.debug(`OCF extraction: Found direct temperature ${temp}°F from ${path} for ${this.name} (${componentId})`);
          return temp;
        }

        // Try items array format (for /temperatures/vs/0)
        if (item.rep['x.com.samsung.da.items'] && Array.isArray(item.rep['x.com.samsung.da.items'])) {
          const items = item.rep['x.com.samsung.da.items'];

          // For main component, look for "Fridge" (id: 1)
          if (componentId === 'main') {
            const fridgeItem = items.find((i: any) =>
              i['x.com.samsung.da.id'] === '1' ||
              i['x.com.samsung.da.description'] === 'Fridge',
            );
            if (fridgeItem && fridgeItem['x.com.samsung.da.current']) {
              const temp = parseFloat(fridgeItem['x.com.samsung.da.current']);
              this.log.debug(`OCF extraction: Found fridge temperature ${temp}°F from items array for ${this.name} (${componentId})`);
              return temp;
            }
          }

          // For freezer component, look for "Freezer" (id: 0)
          if (componentId === 'freezer') {
            const freezerItem = items.find((i: any) =>
              i['x.com.samsung.da.id'] === '0' ||
              i['x.com.samsung.da.description'] === 'Freezer',
            );
            if (freezerItem && freezerItem['x.com.samsung.da.current']) {
              const temp = parseFloat(freezerItem['x.com.samsung.da.current']);
              this.log.debug(`OCF extraction: Found freezer temperature ${temp}°F from items array for ${this.name} (${componentId})`);
              return temp;
            }
          }
        }
      } else {
        if (this.platform.config.AdvancedDebugging) {
          this.log.debug(`OCF extraction: No item found for path ${path}`);
        }
      }
    }

    if (this.platform.config.AdvancedDebugging) {
      this.log.debug(`OCF extraction: Could not find temperature for ${this.name} (${componentId}) in any of the paths`);
    }
    return null;
  }

  /**
   * Override to return a safe default temperature (20°C / 68°F)
   */
  protected getDefaultValue(): CharacteristicValue {
    return 20; // 20°C is a reasonable default room temperature
  }

  public processEvent(event: ShortEvent): void {
    this.log.debug(`Event updating temperature measurement for ${this.name} to ${event.value}`);
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentTemperature,
      this.unit === 'F' ? (event.value as number - 32) * (5 / 9) : event.value as number);
  }
}