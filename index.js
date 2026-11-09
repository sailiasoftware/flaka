'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const { getExplicitFormat, getOptimizedKey, optimize } = require('./image');


//Get env variables
const MASTER_BUCKET = process.env.MASTER_BUCKET;
const OPTIMIZED_BUCKET = process.env.OPTIMIZED_BUCKET;
const OPTIMIZED_URL = process.env.OPTIMIZED_URL;
const MASTER_URL = process.env.MASTER_URL;
// env.ALLOWED_RESOLUTIONS is comma separated values (can be empty, and can have spaces around commas) e.g. "1920x1080, 1280x720"
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);
const DEFAULT_RESOLUTION = process.env.DEFAULT_RESOLUTION;

const ALLOWED_IMAGE_TYPES = ['image/jpg', 'image/jpeg', 'image/png', 'image/webp'];

/** Bumps when handler behavior changes — check CloudWatch or response header X-Flaka-Build */
const BUILD_ID = 'google-jpeg-2026-11-09a';
console.log('[flaka] build', BUILD_ID);

function withBuildHeaders(headers) {
  return Object.assign({}, headers, { 'X-Flaka-Build': BUILD_ID });
}

exports.handler = async function (event) {
  try {
    return await handleRequest(event);
  } catch (err) {
    console.error('[flaka] unhandled', err && err.stack ? err.stack : err);
    return {
      statusCode: 500,
      headers: withBuildHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      body: JSON.stringify({
        error: 'Internal error',
        build: BUILD_ID,
        ...(process.env.SHOW_LAMBDA_ERRORS === '1' && err && err.message
          ? { message: err.message }
          : {}),
      }),
    };
  }
};

async function handleRequest(event) {
  const query = event.queryStringParameters || {};
  const key = query.key;
  const format = getExplicitFormat(query.format);
  if (format === false) {
    return {
      statusCode: 400,
      headers: withBuildHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      body: 'Unsupported format. Use jpeg or png.',
    };
  }

  // Normalise S3 bucket key to get it in the form "1280x720/test/test0.jpg"
  const keyNormalisationResult = checkAndNormaliseKey(key);
  if (keyNormalisationResult === null) {
    // This may happen if the requested resolution is not allowed
    return {
      statusCode: 403,
      headers: withBuildHeaders({}),
      body: 'Forbidden key. The resolution may not be allowed',
    };
  }
  const optimizedKey = getOptimizedKey(keyNormalisationResult.optimizedKey, format);

  // Check if optimized image already exists at the given resolution in the optimized bucket
  try {
    await S3.headObject({ Bucket: OPTIMIZED_BUCKET, Key: optimizedKey }).promise();
    return {
      statusCode: 301,
      headers: withBuildHeaders({ location: objectUrl(OPTIMIZED_URL, optimizedKey) }),
      body: 'Image already optimized',
    };
  } catch (err) {
    /* The file is not in the optimized bucket yet */
  }

  const keyParts = keyNormalisationResult.keyParts; // keyParts is the differnt sections of key (formed by regex)
  const width = parseInt(keyParts[2], 10);
  const height = parseInt(keyParts[3], 10);
  const masterKey = keyParts[4]; // Key without the resolution. Example: "wind/surfing/test.jpg"

  try {
    // Check if the file is an image
    const objectContentType = getObjectType(masterKey);
    if (!ALLOWED_IMAGE_TYPES.includes(objectContentType)) {
      if (format) {
        return {
          statusCode: 400,
          headers: withBuildHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
          body: 'Unsupported source image for conversion.',
        };
      }
      return {
        statusCode: 301,
        headers: withBuildHeaders({ location: objectUrl(MASTER_URL, masterKey) }),
        body: 'File is not an image. Redirecting to original',
      };
    }

    // The original file is an image. Optimize it...
    const s3Object = await S3.getObject({ Bucket: MASTER_BUCKET, Key: masterKey }).promise();
    const headers = (event.headers && typeof event.headers === 'object' && event.headers) || {};
    const optimizedObject = await optimize(s3Object, width, height, headers, format);

    await S3.putObject({
      Body: optimizedObject.buffer,
      Bucket: OPTIMIZED_BUCKET,
      ContentType: optimizedObject.contentType,
      Key: optimizedKey,
    }).promise();

    return {
      statusCode: 301,
      headers: withBuildHeaders({ location: objectUrl(OPTIMIZED_URL, optimizedKey) }),
      body: 'Optimized image. Redirecting to optimized bucket',
    };
  } catch (error) {
    console.error('[flaka] optimize path', error && error.stack ? error.stack : error);
    // A format-constrained client must never receive an incompatible original.
    if (format) {
      return {
        statusCode: 500,
        headers: withBuildHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
        body: 'Image conversion failed.',
      };
    }
    return {
      statusCode: 301,
      headers: withBuildHeaders({ location: objectUrl(MASTER_URL, masterKey) }),
      body: 'Something went wrong. Redirecting to original',
    };
  }
}


function checkAndNormaliseKey(key) {
  if (typeof key !== 'string' || key === '') {
    return null;
  }
  let match = getMatch(key); // E.g. "600x400/wind.jpg" or "1920x1080/Activities/Surfing.jpg"
  if (!match) {
    // There may be no resolution in the key
    key = DEFAULT_RESOLUTION + '/' + key;
    match = getMatch(key);
  }
  if (!match) {
    return null;
  }
  const resolutionKey = match[1];
  if (ALLOWED_RESOLUTIONS.size > 0 && !ALLOWED_RESOLUTIONS.has(resolutionKey)) {
    return null;
  }
  return { optimizedKey: key, keyParts: match };
}

function getMatch(query) {
  return query.match(/^((\d+)x(\d+))\/(.+)$/);
}

function getObjectType(key) {
  const fileExtension = key.split('.').pop().toLowerCase();
  const contentTypeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };
  return contentTypeMap[fileExtension] || null;
}

function objectUrl(baseUrl, key) {
  return `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
