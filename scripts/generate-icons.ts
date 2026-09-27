import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateIcons() {
  const svgPath = path.resolve('public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating PWA icons from', svgPath);

  // 1. pwa-512x512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public', 'pwa-512x512.png'));
  console.log('Generated public/pwa-512x512.png');

  // 2. pwa-192x192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public', 'pwa-192x192.png'));
  console.log('Generated public/pwa-192x192.png');

  // 3. apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public', 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png');

  // 4. pwa-maskable-512x512.png (with ~10% safe zone padding)
  // Render icon inside a padded canvas with background color #03151F
  const innerIcon = await sharp(svgBuffer)
    .resize(410, 410)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 7, g: 80, b: 115, alpha: 1 }
    }
  })
    .composite([
      {
        input: innerIcon,
        gravity: 'center'
      }
    ])
    .png()
    .toFile(path.resolve('public', 'pwa-maskable-512x512.png'));
  console.log('Generated public/pwa-maskable-512x512.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
