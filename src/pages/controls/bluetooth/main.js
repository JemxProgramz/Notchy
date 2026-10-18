module.exports = function registerBluetooth({ handleIpc, scanBluetoothDevices, pairBluetoothDevice }) {
  handleIpc('notch:wireless:bluetooth:scan', scanBluetoothDevices);
  handleIpc('notch:wireless:bluetooth:pair', async (_event, deviceId) => pairBluetoothDevice(deviceId));
};
