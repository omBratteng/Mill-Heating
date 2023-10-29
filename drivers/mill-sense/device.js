'use strict';

const { Device } = require('homey');
const MillCloud = require('../../lib/millCloud');

class MillSense extends Device {
  async onInit() {
    this.deviceId = this.getData().id;
    //this.millApi = new MillCloud(this.homey.app);
    this.millApi = this.homey.app.getMillApi();
    this.device = this.millApi.getDevice(this.deviceId);

    this.log(`[${this.getName()}] ${this.getClass()} (${this.deviceId}) initialized`);

    // Add new capailities for devices that don't have them yet
    if (!this.hasCapability('measure_temperature')) {
      await this.addCapability('measure_temperature');
    }
    if (!this.hasCapability('measure_humidity')) {
      await this.addCapability('measure_humidity');
    }
    if (!this.hasCapability('measure_co2')) {
      await this.addCapability('measure_co2');
    }
    if (!this.hasCapability('measure_tvoc')) {
      await this.addCapability('measure_tvoc');
    }
    if (!this.hasCapability('measure_battery')) {
      await this.addCapability('measure_battery');
    }
    if (!this.hasCapability('alarm_temperature')) {
      await this.addCapability('alarm_temperature');
    }
    if (!this.hasCapability('alarm_humidity')) {
      await this.addCapability('alarm_humidity');
    }
    if (!this.hasCapability('alarm_co2')) {
      await this.addCapability('alarm_co2');
    }
    if (!this.hasCapability('alarm_tvoc')) {
      await this.addCapability('alarm_tvoc');
    }
    if (!this.hasCapability('alarm_battery')) {
      await this.addCapability('alarm_battery');
    }
    if (!this.hasCapability('alarm_charging_status')) {
      await this.addCapability('alarm_charging_status');
    }

    const capabilities = this.getCapabilities();
    const expectedOrder = [
      'measure_temperature',
      'alarm_temperature',
      'measure_humidity',
      'alarm_humidity',
      'measure_co2',
      'alarm_co2',
      'measure_tvoc',
      'alarm_tvoc',
      'measure_battery',
      'alarm_battery',
      'alarm_charging_status',
    ];

    let j = 0;
    const isInOrder = capabilities.every((item, i) => {
      while (j < expectedOrder.length && expectedOrder[j] !== item) {
        j++;
      }
      return j < expectedOrder.length;
    });

    if (!isInOrder) {
      this.homey.app.dDebug(`Capabilities for ${this.getName()} are not in the correct order. Reordering...`);
      for (const capability of capabilities) {
        if (this.hasCapability(capability)) {
          await this.removeCapability(capability);
        }
      }
      for (const capability of expectedOrder) {
        if (!this.hasCapability(capability)) {
          await this.addCapability(capability);
        }
      }
      this.homey.app.dDebug(`Capabilities for ${this.getName()} are now in the correct order`);
    } else {
      this.homey.app.dDebug(`Capabilities for ${this.getName()} are in the correct order`);
    }

    this.refreshTimeout = null;
    this.refreshState();
  }

  async refreshState() {
    this.log(`[${this.getName()}] Refreshing state`);

    if (this.refreshTimeout) {
      this.homey.clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }

    try {
      if (this.homey.app.isConnected()) {
        await this.refreshMillService();
        this.setAvailable();
      } else {
        this.log(`[${this.getName()}] Mill not connected`);
        this.setUnavailable();
        await this.homey.app.connectToMill().then(() => {
          this.scheduleRefresh(5);
        }).catch((err) => {
          this.homey.app.dError('Error caught while refreshing state', err);
        });
      }
    } catch (e) {
      this.homey.app.dError('Exception caught', e);
    } finally {
      if (this.refreshTimeout === null) {
        this.scheduleRefresh();
      }
    }
  }

  async scheduleRefresh(interval) {
    const refreshInterval = interval || this.homey.settings.get('senseInterval');
    this.refreshTimeout = this.homey.setTimeout(this.refreshState.bind(this), refreshInterval * 1000);
    this.log(`[${this.getName()}] Next refresh in ${refreshInterval} seconds`);
  }

  async refreshMillService() {
    return this.millApi.getDevice(this.deviceId)
      .then(async (device) => {
        this.log(`[${this.getName()}] Mill state refreshed`, {
          temperature: device.lastMetrics.temperature,
          humidity: device.lastMetrics.humidity,
          co2: device.lastMetrics.eco2,
          tvoc: device.lastMetrics.tvoc,
          battery: device.lastMetrics.batteryPercentage,
        });

        if (device.lastMetrics.chargingStatus == 2) {
          await this.setCapabilityValue('alarm_charging_status', true);
          await this.setCapabilityValue('measure_temperature', 0);
          await this.setCapabilityValue('measure_humidity', 0);
          await this.setCapabilityValue('measure_co2', 0);
          await this.setCapabilityValue('measure_tvoc', 0);
          await this.setCapabilityValue('measure_battery', 0);
          await this.setCapabilityValue('alarm_temperature', false);
          await this.setCapabilityValue('alarm_humidity', false);
          await this.setCapabilityValue('alarm_co2', false);
          await this.setCapabilityValue('alarm_tvoc', false);
          if (device.lastMetrics.batteryPercentage < 20) {
            await this.setCapabilityValue('alarm_battery', true);
          } else {
            await this.setCapabilityValue('alarm_battery', false);
          }
        } else {
          await this.setCapabilityValue('measure_temperature', device.lastMetrics.temperature);
          await this.setCapabilityValue('measure_humidity', device.lastMetrics.humidity);
          await this.setCapabilityValue('measure_co2', device.lastMetrics.eco2);
          await this.setCapabilityValue('measure_tvoc', device.lastMetrics.tvoc);
          await this.setCapabilityValue('measure_battery', device.lastMetrics.batteryPercentage);
          await this.setCapabilityValue('alarm_charging_status', false);

          if ((device.lastMetrics.temperature != 0 &&
            device.lastMetrics.temperature <= 5) ||
            device.lastMetrics.temperature >= 35) {
            await this.setCapabilityValue('alarm_temperature', true);
          } else {
            await this.setCapabilityValue('alarm_temperature', false);
          }

          if ((device.lastMetrics.humidity > 0 &&
            device.lastMetrics.humidity <= device.deviceSettings.desired.ens210_ranges.humidity_red_low) ||
            device.lastMetrics.humidity >= device.deviceSettings.desired.ens210_ranges.humidity_red_high) {
            await this.setCapabilityValue('alarm_humidity', true);
          } else {
            await this.setCapabilityValue('alarm_humidity', false);
          }

          if (device.lastMetrics.eco2 > device.deviceSettings.desired.ccs811_ranges.eco2_red) {
            await this.setCapabilityValue('alarm_co2', true);
          } else {
            await this.setCapabilityValue('alarm_co2', false);
          }

          if (device.lastMetrics.tvoc > device.deviceSettings.desired.ccs811_ranges.tvoc_red) {
            await this.setCapabilityValue('alarm_tvoc', true);
          } else {
            await this.setCapabilityValue('alarm_tvoc', false);
          }

          if (device.lastMetrics.batteryPercentage < 20) {
            await this.setCapabilityValue('alarm_battery', true);
          } else {
            await this.setCapabilityValue('alarm_battery', false);
          }
        }
      }).catch((err) => {
        this.homey.app.dError('Error caught while refreshing state', err);
      });
  }

  async onAdded() {
    this.homey.app.dDebug('Device added', this.getState());
  }

  async onDeleted() {
    clearTimeout(this.refreshTimeout);
    this.homey.app.dDebug('Device deleted', this.getState());
  }

  async onSettings(oldSettings, newSettings, changedKeys) {
    this.log('onSettings', oldSettings, newSettings, changedKeys);
    if (changedKeys.includes('username') && changedKeys.includes('password')) {
      this.homey.app.dDebug('Username and password changed');
      this.homey.app.connectToMill();
    }
  }

}

module.exports = MillSense;
