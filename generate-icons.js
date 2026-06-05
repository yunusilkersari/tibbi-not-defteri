// Icon generator script - run with Node.js to generate PNG icons
// Usage: node generate-icons.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - rounded square with gradient
  const radius = size * 0.2;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#0f1117');
  gradient.addColorStop(1, '#1a1d27');

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0, 212, 170, 0.4)';
  ctx.lineWidth = size * 0.04;
  ctx.stroke();

  // Cross symbol (medical)
  const crossSize = size * 0.35;
  const crossWidth = size * 0.12;
  const cx = size / 2;
  const cy = size / 2;

  const crossGrad = ctx.createLinearGradient(cx - crossSize/2, cy - crossSize/2, cx + crossSize/2, cy + crossSize/2);
  crossGrad.addColorStop(0, '#00d4aa');
  crossGrad.addColorStop(1, '#00b894');

  ctx.fillStyle = crossGrad;

  // Vertical bar
  ctx.fillRect(cx - crossWidth/2, cy - crossSize/2, crossWidth, crossSize);
  // Horizontal bar
  ctx.fillRect(cx - crossSize/2, cy - crossWidth/2, crossSize, crossWidth);

  // Small note icon in corner
  if (size >= 32) {
    const noteSize = size * 0.22;
    const noteX = size * 0.65;
    const noteY = size * 0.65;

    ctx.fillStyle = '#6c63ff';
    ctx.fillRect(noteX, noteY, noteSize, noteSize * 1.2);

    // Lines on note
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = Math.max(1, size * 0.02);
    for (let i = 0; i < 3; i++) {
      const ly = noteY + noteSize * 0.3 + i * noteSize * 0.25;
      ctx.beginPath();
      ctx.moveTo(noteX + noteSize * 0.15, ly);
      ctx.lineTo(noteX + noteSize * 0.85, ly);
      ctx.stroke();
    }
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
  console.log(`Generated icon${size}.png`);
});

console.log('All icons generated!');
