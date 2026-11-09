'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { getExplicitFormat, getOptimizedKey, optimize } = require('../image');

async function source(width, height, format = 'png', alpha = false) {
  return sharp({ create: { width, height, channels: alpha ? 4 : 3,
    background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : '#cc3300' } })
    .toFormat(format).toBuffer();
}

test('explicit formats cannot share legacy or other output-format cache entries', () => {
  const key = '2048x1366/photos/lake.webp';
  assert.equal(getOptimizedKey(key, null), key);
  assert.equal(getOptimizedKey(key, 'jpeg'), 'formats/v1/jpeg/2048x1366/photos/lake.webp.jpg');
  assert.equal(getOptimizedKey(key, 'png'), 'formats/v1/png/2048x1366/photos/lake.webp.png');
  assert.notEqual(getOptimizedKey(key, 'jpeg'), getOptimizedKey('2048x1366/photos/lake.jpg', 'jpeg'));
});

test('unsupported explicit formats cannot silently use browser negotiation', () => {
  assert.equal(getExplicitFormat(undefined), null);
  assert.equal(getExplicitFormat('jpg'), 'jpeg');
  assert.equal(getExplicitFormat('jpeg'), 'jpeg');
  assert.equal(getExplicitFormat('png'), 'png');
  for (const value of ['', 'webp', 'gif', 'JPEG', 42]) assert.equal(getExplicitFormat(value), false);
});

test('JPEG mode converts WebP bytes despite a WebP Accept header and resizes inside bounds', async () => {
  const input = await source(3000, 2000, 'webp');
  const result = await optimize({ Body: input }, 2048, 1366, { accept: 'image/webp' }, 'jpeg');
  const meta = await sharp(result.buffer).metadata();
  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(meta.format, 'jpeg');
  assert.deepEqual([meta.width, meta.height], [2048, 1365]);
  assert.equal(meta.hasAlpha, false);
});

test('JPEG mode uses a white background for transparency and does not enlarge', async () => {
  const input = await source(40, 20, 'png', true);
  const result = await optimize({ Body: input }, 2048, 1366, {}, 'jpeg');
  const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [40, 20, 3]);
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
});

test('EXIF orientation is applied before calculating the resized output bounds', async () => {
  const input = await sharp(await source(300, 100, 'jpeg')).withMetadata({ orientation: 6 }).toBuffer();
  const result = await optimize({ Body: input }, 200, 150, {}, 'jpeg');
  const meta = await sharp(result.buffer).metadata();
  assert.deepEqual([meta.width, meta.height], [50, 150]);
  assert.equal(meta.orientation, undefined);
});

test('PNG mode converts WebP and preserves transparency', async () => {
  const input = await source(60, 40, 'webp', true);
  const result = await optimize({ Body: input }, 2048, 1366, { accept: 'image/webp' }, 'png');
  const meta = await sharp(result.buffer).metadata();
  assert.equal(result.contentType, 'image/png');
  assert.equal(meta.format, 'png');
  assert.equal(meta.hasAlpha, true);
});

test('ordinary browser conversion and source-format responses still have matching bytes and MIME', async () => {
  const input = await source(60, 40);
  const webp = await optimize({ Body: input }, 2048, 1366, { Accept: 'image/webp' }, null);
  const png = await optimize({ Body: input }, 2048, 1366, {}, null);
  assert.equal(webp.contentType, 'image/webp');
  assert.equal((await sharp(webp.buffer).metadata()).format, 'webp');
  assert.equal(png.contentType, 'image/png');
  assert.equal((await sharp(png.buffer).metadata()).format, 'png');
});

test('failed explicit conversion rejects rather than returning incompatible input', async () => {
  await assert.rejects(optimize({ Body: Buffer.from('not an image') }, 2048, 1366, {}, 'jpeg'));
});
