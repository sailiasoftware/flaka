'use strict';

const sharp = require('sharp');

// null preserves the ordinary browser path; false denotes an invalid request.
function getExplicitFormat(value) {
  if (value === undefined || value === null) return null;
  if (value === 'jpg' || value === 'jpeg') return 'jpeg';
  if (value === 'png') return 'png';
  return false;
}

function getOptimizedKey(key, format) {
  if (!format) return key;
  const extension = format === 'jpeg' ? 'jpg' : 'png';
  // Keep legacy/browser variants out of the format-constrained cache.
  return `formats/v1/${format}/${key}.${extension}`;
}

function clientAcceptsWebp(headers) {
  const raw = headers.accept || headers.Accept;
  const accept = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(',') : '';
  return accept.includes('image/webp');
}

async function optimize(s3Object, width, height, headers, format) {
  const image = sharp(s3Object.Body);
  if (format) image.rotate(); // Apply EXIF orientation before resizing.
  image.resize({ fit: sharp.fit.inside, width, height, withoutEnlargement: true });

  let contentType;
  if (format === 'jpeg') {
    image.flatten({ background: '#ffffff' }).jpeg({ quality: 90 });
    contentType = 'image/jpeg';
  } else if (format === 'png') {
    image.png();
    contentType = 'image/png';
  } else if (clientAcceptsWebp(headers)) {
    image.webp();
    contentType = 'image/webp';
  } else {
    // Sharp otherwise preserves the input format, so label it from its bytes.
    const metadata = await sharp(s3Object.Body).metadata();
    contentType = `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}`;
  }

  return { buffer: await image.toBuffer(), contentType };
}

module.exports = { getExplicitFormat, getOptimizedKey, optimize };
