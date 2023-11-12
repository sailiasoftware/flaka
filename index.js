'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const sharp = require('sharp');
const util = require('util');


//Get env variables
const MASTER_BUCKET = process.env.MASTER_BUCKET;
const OPTIMIZED_BUCKET = process.env.OPTIMIZED_BUCKET;
const OPTIMIZED_URL = process.env.OPTIMIZED_URL;
const MASTER_URL = process.env.MASTER_URL;
// env.ALLOWED_RESOLUTIONS is comma separated values (can be empty, and can have spaces around commas) e.g. "1920x1080, 1280x720"
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([]);
const DEFAULT_RESOLUTION = process.env.DEFAULT_RESOLUTION;

const ALLOWED_IMAGE_TYPES = ['image/jpg', 'image/jpeg', 'image/png'];


exports.handler = async function(event, context, callback) {

  // Normalise S3 bucket key to get it in the form "1280x720/test/test0.jpg"
  const keyNormalisationResult = checkAndNormaliseKey(event.queryStringParameters.key);
  const optimizedKey = keyNormalisationResult.optimizedKey;
  if (optimizedKey === null) {
    // This may happen if the requested resolution is not allowed
    callback(null, {
      statusCode: '403',
      headers: {},
      body: 'Forbidden key. The resolution may not be allowed',
    }); 
    return "(debugging return) Invalid key";
  }

  // Check if optimized image already exists at the given resolution in the optimized bucket
  try {
    let test = await S3.headObject({Bucket: OPTIMIZED_BUCKET, Key: optimizedKey}).promise()
    callback(null, {
      statusCode: '301',
      headers: {'location': `${OPTIMIZED_URL}/${optimizedKey}`},
      body: 'Image already optimized',
    });
    return "(debugging return) Optimized file found";
  } catch (err) { /* The file is not in the optimized bucket yet */ }

  const keyParts = keyNormalisationResult.keyParts; // keyParts is the differnt sections of key (formed by regex)
  const width = parseInt(keyParts[2], 10);
  const height = parseInt(keyParts[3], 10);
  const masterKey = keyParts[4]; // Key without the resolution. Example: "wind/surfing/test.jpg"

  try {
    // Check if the file is an image
    const objectContentType = getObjectType(masterKey);
    if (!ALLOWED_IMAGE_TYPES.includes(objectContentType)) {
      callback(null, {
        statusCode: '301',
        headers: {'location': `${MASTER_URL}/${masterKey}`},
        body: 'File is not an image. Redirecting to original',
      });
      return "(debugging return) Original file is not an image";
    } else {
      //The original file is an image. Optimize it...
      const s3Object = await S3.getObject({Bucket: MASTER_BUCKET, Key: masterKey}).promise();
      const optimizedObject = await optimize(s3Object, width, height, event.headers);

      // Save the image to the optimized bucket
      let response = await S3.putObject({ 
        Body: optimizedObject.buffer, 
        Bucket: OPTIMIZED_BUCKET, 
        ContentType: optimizedObject.contentType, 
        Key: optimizedKey, 
      }).promise();
      callback(null, {
        statusCode: '301',
        headers: {'location': `${OPTIMIZED_URL}/${optimizedKey}`},
        body: 'Optimized image. Redirecting to optimized bucket',
      });
      return "(debugging return) Image optimized";
    }
  } catch (error) {
    callback(null, {
      statusCode: '301',
      headers: {'location': `${MASTER_URL}/${masterKey}`},
      body: 'Something went wrong. Redirecting to original',
    });
    return "(debugging return) ERROR";
  }
}


function checkAndNormaliseKey(key) {
  let match = getMatch(key); // E.g. "600x400/wind.jpg" or "1920x1080/Activities/Surfing.jpg"
  if (!match) {
    // There may be no resolution in the key
    key = DEFAULT_RESOLUTION + '/' + key;
    match = getMatch(key);
  }
  //Check if requested resolution is forbidden
  if( (ALLOWED_RESOLUTIONS.size > 0) && (!ALLOWED_RESOLUTIONS.has(match[1])) ) {
    callback(null, forbidden);
    return null;
  }
  return { optimizedKey: key, keyParts: match };
}

function getMatch(query) {
  return query.match(/((\d+)x(\d+))\/(.*)/); 
}

function getObjectType(key) {
  const fileExtension = key.split('.').pop().toLowerCase();
  const contentTypeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
  };
  return contentTypeMap[fileExtension] || null;
}

async function optimize (s3Object, width, height, headers) {
  let newContentType = null;
  const sharpImage = await sharp(s3Object.Body);

  await sharpImage.resize({
      fit: sharp.fit.inside,
      width: width,
      height: height,
      withoutEnlargement: true
  })

  // If webp is supported
  if (headers['accept'] && headers['accept'].includes('image/webp')) {
      await sharpImage.webp();
      newContentType = 'image/webp';
  }

  return { 
      buffer: await sharpImage.toBuffer(),
      contentType: newContentType
  };
}


if (require.main === module) {
  console.log("THIS IS A TEST");
  exports.handler();
}