import { PlatformAccessory } from 'homebridge';
import { IKHomeBridgeHomebridgePlatform } from '../platform';
import { SensorService } from './sensorService';
import { MultiServiceAccessory } from '../multiServiceAccessory';
import { ShortEvent } from '../webhook/subscriptionHandler';

export class ContactSensorService extends SensorService {

  constructor(platform: IKHomeBridgeHomebridgePlatform, accessory: PlatformAccessory, componentId: string, capabilities: string[],
    multiServiceAccessory: MultiServiceAccessory,
    name: string, deviceStatus) {
    super(platform, accessory, componentId, capabilities, multiServiceAccessory, name, deviceStatus);

    this.log.debug(`Adding ContactService to ${this.name}`);
    this.initService(platform.Service.ContactSensor, platform.Characteristic.ContactSensorState, (status) => {
      // Check for disabled component
      if (this.multiServiceAccessory.isComponentDisabled(componentId)) {
        this.log.info(`Component ${componentId} is disabled - removing ContactSensor service.`);
        this.accessory.removeService(this.service);
        return this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
      }

      if (status.contactSensor.contact.value === null || status.contactSensor.contact.value === undefined) {
        // Return CONTACT_DETECTED (Closed) as safe default instead of throwing
        return this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
      }
      return status.contactSensor.contact.value === 'closed' ?
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    });
    this.setServiceType(platform.Service.ContactSensor);
  }

  public processEvent(event: ShortEvent): void {
    this.log.debug(`Event updating contactSensor capability for ${this.name} to ${event.value}`);
    this.service.updateCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      event.value === 'closed' ?
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }
}