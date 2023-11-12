# AWS Image Optimizer

This is a Lambda function that is used to decrease the network traffic and loading times for images hosted in an S3 bucket.

[![JCRnMG9.md.png](https://iili.io/JCRnMG9.md.png)](https://freeimage.host/i/JCRnMG9)

#### Process when an image is requested:
1) User makes request to API Gateway in the form "https://apiurl.com/image-optimizer?key=1280x720/path/to/file.jpg"
2) API invokes Lambda function. The string query "key" is used to determine the location of the requested object
3) Lambda function checks if an optimized version of the requested image exists in the optimized bucket (at the requested resolution).  (3.5) If The optimized image does not exist, the lambda function grabs the image from the master bucket and optimizes the image
4) The user is redirected to the location of the file. If the image has been optimized successfully, the redirection will be to the object in the optimized bucket

The lambda function checks the file extenstion of the requested object. If it is not a png, jpeg, jpg or gif, then the user is redirected to the object in the master bucket.

### File types
Png, jpeg, jpg files will all be optimized

### What happens during optimization?
When a file is optimized, it is first resized to the requested resolution (this only occurs if the requested resolution is less than the original resolution). It is then converted into a more efficient webp file format.

### Resizing
- If a resolution is not specified (e.g. request url looks like "https://apiurl.com/image-optimizer?key=/path/to/file.jpg", then the default resolution (specified in ENV) is used
- If the requested resolution is greater than the original resolution of the image, then the image will not be resized
- **The requested resolution is a maximum bound that the resized image will fit inside of**. This means that it will keep the aspect ratio of the original image
- The requested resolution must be in the allowed resolutions (stored in ENV)

## Environment Variables
- ALLOWED_RESOLUTIONS - List of resolutions in the form "1280x720,1920x1080,800x600"
- DEFAULT_RESOLUTION - String in the form "1280x720"
- MASTER_BUCKET - String. The aws name of the master bucket
- MASTER_URL - String. The url of the master bucket
- OPTIMIZED_BUCKET - String. The aws name of the optimized bucket
- OPTIMIZED_URL - String. The url of the optimized bucket
