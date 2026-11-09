# AWS Image Optimizer

Maintained by [Sailia](https://sailia.com), booking and management software for activity and experience businesses.

This is a Lambda function that is used to decrease the network traffic and loading times for images hosted in an S3 bucket.

[![JCRnMG9.md.png](https://iili.io/JCRnMG9.md.png)](https://freeimage.host/i/JCRnMG9)

#### Process when an image is requested:
1) User makes request to API Gateway in the form "https://apiurl.com/image-optimizer?key=1280x720/path/to/file.jpg"
2) API invokes Lambda function. The string query "key" is used to determine the location of the requested object
3) Lambda function checks if an optimized version of the requested image exists in the optimized bucket (at the requested resolution).  (3.5) If The optimized image does not exist, the lambda function grabs the image from the master bucket and optimizes the image
4) The user is redirected to the location of the file. If the image has been optimized successfully, the redirection will be to the object in the optimized bucket.

The lambda function checks the file extension of the requested object. If it is not an accepted file format, then the user is redirected to the object in the master bucket.

### File types
PNG, JPEG/JPG and WebP files can be optimized.

### What happens during optimization?
Images are resized inside the requested bounds without enlargement. Ordinary browser requests negotiate WebP when supported; format-constrained requests explicitly encode JPEG or PNG.

### Resizing
- If a resolution is not specified (e.g. request url looks like "https://apiurl.com/image-optimizer?key=/path/to/file.jpg", then the default resolution (specified in ENV) is used
- If the requested resolution is greater than the original resolution of the image, then the image will not be resized
- **The requested resolution is a maximum bound that the resized image will fit inside of**. This means that it will keep the aspect ratio of the original image
- The requested resolution must be in the allowed resolutions (stored in ENV)

## Environment Variables
- ALLOWED_RESOLUTIONS - List of resolutions in the form "1280x720,1920x1080,800x600,2048x1366,1024x683"
- DEFAULT_RESOLUTION - String in the form "1280x720"
- MASTER_BUCKET - String. The aws name of the master bucket
- MASTER_URL - String. The url of the master bucket
- OPTIMIZED_BUCKET - String. The aws name of the optimized bucket
- OPTIMIZED_URL - String. The url of the optimized bucket

## Format-constrained exports

Use `?key=2048x1366%2Fpath%2Fphoto.webp&format=jpeg` for Google Things to do and other clients that require JPEG. `format=jpg` is an alias; `format=png` is also supported. This overrides the Accept header.

These requests use separate `formats/v1/jpeg/...original.webp.jpg` or `formats/v1/png/...original.webp.png` S3 cache keys, so an existing browser WebP cannot satisfy a JPEG request. Source names are retained in the key to avoid collisions. JPEG conversion uses quality 90 and flattens transparency onto white. EXIF orientation is applied before resizing, and metadata is removed. A photo whose pixels are sideways without EXIF information still needs manual correction.

Unsupported explicit formats or source types return 400. Failed explicit conversion returns 500, rather than redirecting to an incompatible original. Ordinary requests retain their existing cache paths and original-file fallback. Missing/invalid resolutions return 403. `X-Flaka-Build` identifies the deployed handler.

## Tests

Run `npm ci` and `npm test`. Tests generate image buffers locally and exercise conversion, dimensions, transparency, orientation and cache separation; no AWS calls are made.

## Manual deployment

This repository does not automatically deploy. The production function is `image-optimizer` in `eu-west-2`, currently Node.js 18 on Linux x86_64, with handler `index.handler`. Build dependencies for that platform, not from a macOS `node_modules` folder.

For this source-only update, the deployment archive was assembled from a backup of the deployed Lambda archive, replacing `index.js` and adding `image.js`. Its existing Linux dependencies were retained. The repository's lockfile was recovered from that same archive. This also preserves the deployed async-return fixes that had not yet been committed to the repository.

Before updating, save the deployed archive and current CodeSha256/RevisionId. Use `aws lambda update-function-code` with `--revision-id` to avoid overwriting a concurrent change, wait for the update to succeed, then verify both the handler build header and actual image bytes through the public URL. Check an already cached JPEG request with a WebP Accept header as well. To roll back, upload the saved original archive with the current revision ID. No runtime, environment or routing changes are needed for this update.
