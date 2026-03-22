const { createCanvas, loadImage } = require('canvas');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const fs = require('fs');
const path = require('path');

async function decodeQR(imagePath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code ? code.data : null;
}

function getGradientColor(nx, ny) {
  const r1 = 85, g1 = 105, b1 = 215;
  const r2 = 165, g2 = 85, b2 = 175;
  const r3 = 210, g3 = 70, b3 = 85;

  let r, g, b;
  if (nx < 0.5) {
    const t = nx * 2;
    r = r1 + (r2 - r1) * t;
    g = g1 + (g2 - g1) * t;
    b = b1 + (b2 - b1) * t;
  } else {
    const t = (nx - 0.5) * 2;
    r = r2 + (r3 - r2) * t;
    g = g2 + (g3 - g2) * t;
    b = b2 + (b3 - b2) * t;
  }

  const yShift = 0.92 + 0.08 * ny;
  r = Math.min(255, Math.round(r * yShift));
  g = Math.min(255, Math.round(g * yShift));
  b = Math.min(255, Math.round(b * yShift));

  return `rgb(${r}, ${g}, ${b})`;
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawFinderPattern(ctx, cx, cy, moduleSize, nx, ny) {
  const outerSize = 7 * moduleSize;
  const middleSize = 5 * moduleSize;
  const innerSize = 3 * moduleSize;

  const color = getGradientColor(nx, ny);

  const outerRadius = moduleSize * 1.8;
  const middleRadius = moduleSize * 1.2;
  const innerRadius = moduleSize * 0.9;

  ctx.fillStyle = color;
  drawRoundedRect(ctx, cx - outerSize / 2, cy - outerSize / 2, outerSize, outerSize, outerRadius);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, cx - middleSize / 2, cy - middleSize / 2, middleSize, middleSize, middleRadius);
  ctx.fill();

  ctx.fillStyle = color;
  drawRoundedRect(ctx, cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, innerRadius);
  ctx.fill();
}

async function generateStyledQR(url, photoPath, outputPath) {
  const qrData = await QRCode.create(url, { errorCorrectionLevel: 'H' });
  const modules = qrData.modules;
  const moduleCount = modules.size;
  const moduleSize = 18;
  const qrPadding = moduleSize * 3;
  const qrPixelSize = moduleCount * moduleSize;
  const qrTotalSize = qrPixelSize + qrPadding * 2;

  const cardPadding = 50;
  const cardWidth = qrTotalSize + cardPadding * 2;
  const cardHeight = qrTotalSize + cardPadding * 2;

  const bgPadX = 70;
  const bgPadTop = 100;
  const bgPadBottom = 100;
  const totalWidth = cardWidth + bgPadX * 2;
  const totalHeight = cardHeight + bgPadTop + bgPadBottom;

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  const photo = await loadImage(photoPath);

  const photoAspect = photo.width / photo.height;
  const canvasAspect = totalWidth / totalHeight;
  let drawW, drawH, drawX, drawY;
  if (photoAspect > canvasAspect) {
    drawH = totalHeight;
    drawW = drawH * photoAspect;
    drawX = (totalWidth - drawW) / 2;
    drawY = 0;
  } else {
    drawW = totalWidth;
    drawH = drawW / photoAspect;
    drawX = 0;
    drawY = (totalHeight - drawH) / 2;
  }
  ctx.drawImage(photo, drawX, drawY, drawW, drawH);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const cardX = bgPadX;
  const cardY = bgPadTop;
  const cardRadius = 35;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const qrOriginX = cardX + cardPadding + qrPadding;
  const qrOriginY = cardY + cardPadding + qrPadding;

  const isFinderPattern = (row, col) => {
    if (row < 7 && col < 7) return true;
    if (row < 7 && col >= moduleCount - 7) return true;
    if (row >= moduleCount - 7 && col < 7) return true;
    return false;
  };

  const centerPhotoModules = 11;
  const centerStart = Math.floor(moduleCount / 2) - Math.floor(centerPhotoModules / 2);
  const centerEnd = centerStart + centerPhotoModules;
  const isCenterArea = (row, col) => {
    return row >= centerStart && row < centerEnd && col >= centerStart && col < centerEnd;
  };

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (isFinderPattern(row, col)) continue;
      if (isCenterArea(row, col)) continue;

      if (modules.get(row, col)) {
        const x = qrOriginX + col * moduleSize;
        const y = qrOriginY + row * moduleSize;
        const nx = col / moduleCount;
        const ny = row / moduleCount;
        const color = getGradientColor(nx, ny);

        ctx.fillStyle = color;
        ctx.beginPath();
        const dotRadius = moduleSize * 0.38;
        ctx.arc(x + moduleSize / 2, y + moduleSize / 2, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const finderPositions = [
    { row: 3.5, col: 3.5 },
    { row: 3.5, col: moduleCount - 3.5 },
    { row: moduleCount - 3.5, col: 3.5 },
  ];

  for (const fp of finderPositions) {
    const cx = qrOriginX + fp.col * moduleSize;
    const cy = qrOriginY + fp.row * moduleSize;
    const nx = fp.col / moduleCount;
    const ny = fp.row / moduleCount;
    drawFinderPattern(ctx, cx, cy, moduleSize, nx, ny);
  }

  const photoAreaSize = centerPhotoModules * moduleSize;
  const photoCx = qrOriginX + (moduleCount * moduleSize) / 2;
  const photoCy = qrOriginY + (moduleCount * moduleSize) / 2;
  const photoDrawX = photoCx - photoAreaSize / 2;
  const photoDrawY = photoCy - photoAreaSize / 2;

  const bgPad = moduleSize * 0.7;
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(
    ctx,
    photoDrawX - bgPad,
    photoDrawY - bgPad,
    photoAreaSize + bgPad * 2,
    photoAreaSize + bgPad * 2,
    14
  );
  ctx.fill();

  ctx.save();
  const clipR = 12;
  drawRoundedRect(ctx, photoDrawX, photoDrawY, photoAreaSize, photoAreaSize, clipR);
  ctx.clip();

  const cropH = photo.height * 0.22;
  const cropW = cropH;
  const cropX = (photo.width - cropW) / 2;
  const cropY = photo.height * 0.02;
  ctx.drawImage(photo, cropX, cropY, cropW, cropH, photoDrawX, photoDrawY, photoAreaSize, photoAreaSize);
  ctx.restore();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`QR code saved to ${outputPath} (${totalWidth}x${totalHeight})`);
  return outputPath;
}

async function main() {
  const blackQrPath = path.join(__dirname, '..', 'attached_assets', 'IMG_6359_1774209483244.jpeg');
  const photoPath = path.join(__dirname, '..', 'attached_assets', 'IMG_6829_1774208208905.jpeg');
  const outputPath = path.join(__dirname, '..', 'generated_qr.png');

  console.log('Decoding QR code from black QR image...');
  const url = await decodeQR(blackQrPath);

  if (!url) {
    console.error('Could not decode QR code. Using fallback URL.');
    process.exit(1);
  }

  console.log(`Decoded URL: ${url}`);
  console.log('Generating styled QR code...');
  await generateStyledQR(url, photoPath, outputPath);
  console.log('Done!');
}

main().catch(console.error);
