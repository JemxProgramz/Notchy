module.exports = function registerWallpaper({ handleIpc, pickWallpaper, applyWallpaper, fs, path, app }) {
  handleIpc('notch:wallpaper:pick', pickWallpaper);
  handleIpc('notch:wallpaper:apply', (_event, file) => applyWallpaper(file));
  handleIpc('notch:wallpaper:applyDataUrl', async (_event, value) => {
    if (typeof value !== 'string' || value.length > 16 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('Invalid wallpaper image');
    const file = path.join(app.getPath('userData'), 'wallpaper.png');
    fs.writeFileSync(file, Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'));
    await applyWallpaper(file);
  });
  handleIpc('notch:wallpaper:preview', async (_event, file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (stat.size > 25 * 1024 * 1024) return null;
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  });
};
