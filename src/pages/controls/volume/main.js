module.exports = function registerVolume({ handleIpc, setAudioVolume, audioVolume }) {
  handleIpc('notch:controls:volume', async (_event, value) => setAudioVolume(value));
  handleIpc('notch:controls:mute', async (_event, muted) => audioVolume('mute', !!muted));
};
