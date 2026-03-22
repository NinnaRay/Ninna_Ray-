const { createCanvas, loadImage } = require('canvas');
const nodeCanvas = require('canvas');
const { JSDOM } = require('jsdom');
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

async function cropCenterPhoto(photoPath, outputPath) {
  const img = await loadImage(photoPath);
  const cropSize = Math.min(img.width, img.height * 0.22);
  const cropX = (img.width - cropSize) / 2;
  const cropY = 0;
  const outSize = 400;
  const canvas = createCanvas(outSize, outSize);
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  const r = 30;
  ctx.moveTo(r, 0);
  ctx.lineTo(outSize - r, 0);
  ctx.arcTo(outSize, 0, outSize, r, r);
  ctx.lineTo(outSize, outSize - r);
  ctx.arcTo(outSize, outSize, outSize - r, outSize, r);
  ctx.lineTo(r, outSize);
  ctx.arcTo(0, outSize, 0, outSize - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, outSize, outSize);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

async function generateStyledQR(url, centerPhotoPath, bgPhotoPath, outputPath) {
  let QRCodeStyling;
  try {
    const mod = require('qr-code-styling/lib/qr-code-styling.common.js');
    QRCodeStyling = mod.QRCodeStyling || mod.default || mod;
  } catch (e) {
    console.error('Failed to load qr-code-styling:', e.message);
    process.exit(1);
  }

  const qrSize = 800;
  const qrCode = new QRCodeStyling({
    jsdom: JSDOM,
    nodeCanvas,
    width: qrSize,
    height: qrSize,
    data: url,
    dotsOptions: {
      type: 'dots',
      gradient: {
        type: 'linear',
        rotation: 0,
        colorStops: [
          { offset: 0, color: '#5B6EE1' },
          { offset: 0.35, color: '#9B59B6' },
          { offset: 0.65, color: '#C0507E' },
          { offset: 1, color: '#D94F5C' }
        ]
      }
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      gradient: {
        type: 'linear',
        rotation: 0,
        colorStops: [
          { offset: 0, color: '#5B6EE1' },
          { offset: 0.5, color: '#9B59B6' },
          { offset: 1, color: '#D94F5C' }
        ]
      }
    },
    cornersDotOptions: {
      type: 'dot',
      gradient: {
        type: 'linear',
        rotation: 0,
        colorStops: [
          { offset: 0, color: '#5B6EE1' },
          { offset: 0.5, color: '#9B59B6' },
          { offset: 1, color: '#D94F5C' }
        ]
      }
    },
    backgroundOptions: {
      color: 'transparent'
    },
    qrOptions: {
      errorCorrectionLevel: 'H'
    }
  });

  const qrBuffer = await qrCode.getRawData('png');
  if (!qrBuffer) {
    console.error('Failed to generate QR code');
    process.exit(1);
  }

  const qrImage = await loadImage(qrBuffer);
  const bgPhoto = await loadImage(bgPhotoPath);
  const centerPhoto = await loadImage(centerPhotoPath);

  const cardW = 900;
  const cardH = 900;
  const bgPadX = 80;
  const bgPadTop = 110;
  const bgPadBottom = 110;
  const totalW = cardW + bgPadX * 2;
  const totalH = cardH + bgPadTop + bgPadBottom;

  const canvas = createCanvas(totalW, totalH);
  const ctx = canvas.getContext('2d');

  const bgAspect = bgPhoto.width / bgPhoto.height;
  const canvasAspect = totalW / totalH;
  let dw, dh, dx, dy;
  if (bgAspect > canvasAspect) {
    dh = totalH;
    dw = dh * bgAspect;
    dx = (totalW - dw) / 2;
    dy = 0;
  } else {
    dw = totalW;
    dh = dw / bgAspect;
    dx = 0;
    dy = (totalH - dh) / 2;
  }
  ctx.drawImage(bgPhoto, dx, dy, dw, dh);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fillRect(0, 0, totalW, totalH);

  const cardX = bgPadX;
  const cardY = bgPadTop;
  const cardR = 35;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.moveTo(cardX + cardR, cardY);
  ctx.lineTo(cardX + cardW - cardR, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardR, cardR);
  ctx.lineTo(cardX + cardW, cardY + cardH - cardR);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - cardR, cardY + cardH, cardR);
  ctx.lineTo(cardX + cardR, cardY + cardH);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - cardR, cardR);
  ctx.lineTo(cardX, cardY + cardR);
  ctx.arcTo(cardX, cardY, cardX + cardR, cardY, cardR);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const qrDrawSize = cardW - 80;
  const qrX = cardX + (cardW - qrDrawSize) / 2;
  const qrY = cardY + (cardH - qrDrawSize) / 2;
  ctx.drawImage(qrImage, qrX, qrY, qrDrawSize, qrDrawSize);

  const centerSize = qrDrawSize * 0.28;
  const centerX = qrX + (qrDrawSize - centerSize) / 2;
  const centerY = qrY + (qrDrawSize - centerSize) / 2;

  const bgPad = 12;
  const bgR = 16;
  const bx = centerX - bgPad;
  const by = centerY - bgPad;
  const bw = centerSize + bgPad * 2;
  const bh = centerSize + bgPad * 2;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(bx + bgR, by);
  ctx.lineTo(bx + bw - bgR, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bgR, bgR);
  ctx.lineTo(bx + bw, by + bh - bgR);
  ctx.arcTo(bx + bw, by + bh, bx + bw - bgR, by + bh, bgR);
  ctx.lineTo(bx + bgR, by + bh);
  ctx.arcTo(bx, by + bh, bx, by + bh - bgR, bgR);
  ctx.lineTo(bx, by + bgR);
  ctx.arcTo(bx, by, bx + bgR, by, bgR);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  const clipR = 14;
  ctx.beginPath();
  ctx.moveTo(centerX + clipR, centerY);
  ctx.lineTo(centerX + centerSize - clipR, centerY);
  ctx.arcTo(centerX + centerSize, centerY, centerX + centerSize, centerY + clipR, clipR);
  ctx.lineTo(centerX + centerSize, centerY + centerSize - clipR);
  ctx.arcTo(centerX + centerSize, centerY + centerSize, centerX + centerSize - clipR, centerY + centerSize, clipR);
  ctx.lineTo(centerX + clipR, centerY + centerSize);
  ctx.arcTo(centerX, centerY + centerSize, centerX, centerY + centerSize - clipR, clipR);
  ctx.lineTo(centerX, centerY + clipR);
  ctx.arcTo(centerX, centerY, centerX + clipR, centerY, clipR);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(centerPhoto, centerX, centerY, centerSize, centerSize);
  ctx.restore();

  const finalBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, finalBuffer);
  console.log(`Final QR saved to ${outputPath} (${totalW}x${totalH})`);
}

async function main() {
  const blackQrPath = path.join(__dirname, '..', 'attached_assets', 'IMG_6359_1774209483244.jpeg');
  const photoPath = path.join(__dirname, '..', 'attached_assets', 'IMG_6829_1774208208905.jpeg');
  const centerPhotoPath = path.join(__dirname, '..', 'center_photo.png');
  const outputPath = path.join(__dirname, '..', 'generated_qr.png');

  console.log('Step 1: Decoding URL from black QR code...');
  const url = await decodeQR(blackQrPath);
  if (!url) {
    console.error('Could not decode QR code.');
    process.exit(1);
  }
  console.log(`URL: ${url}`);

  console.log('Step 2: Cropping center photo...');
  await cropCenterPhoto(photoPath, centerPhotoPath);
  console.log('Center photo cropped.');

  console.log('Step 3: Converting center photo to data URL...');
  const photoBuffer = fs.readFileSync(centerPhotoPath);
  const photoDataUrl = 'data:image/png;base64,' + photoBuffer.toString('base64');
  console.log('Step 4: Generating styled QR code...');
  await generateStyledQR(url, photoDataUrl, photoPath, outputPath);
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
