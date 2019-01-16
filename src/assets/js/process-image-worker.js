self.addEventListener('message', async e => {
  if (e.data === 'do work'){
    console.log('Worker is doing some work.')
    self.postMessage({message: 'result'})
  }

  if (e.data.action === 'processImage'){

    e.data.payload.imageData = await flipChannels(
      e.data.payload.imageData,
      e.data.payload.appState.flipChannels.x,
      e.data.payload.appState.flipChannels.y,
      e.data.payload.appState.flipChannels.z,
    )

    if (e.data.payload.appState.dithering.isActive){
      e.data.payload.imageData = await dither(
        e.data.payload.imageData,
        e.data.payload.appState.dithering.type,
        e.data.payload.appState.dithering.depth
      )
    }

    self.postMessage({message: 'done', imageData: e.data.payload.imageData})
  }
})

// Matrix
const threshold_map_4x4 = [
  [  1,  9,  3, 11 ],
  [ 13,  5, 15,  7 ],
  [  4, 12,  2, 10 ],
  [ 16,  8, 14,  6 ]
];

const threshold_map_8x8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42], /* 8x8 Bayer ordered dithering */
  [48, 16, 56, 24, 50, 18, 58, 26], /* pattern. Each input pixel */
  [12, 44,  4, 36, 14, 46,  6, 38], /* is scaled to the 0..63 range */
  [60, 28, 52, 20, 62, 30, 54, 22], /* before looking in this table */
  [ 3, 35, 11, 43,  1, 33,  9, 41], /* to determine the action. */
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];

const threshold_map_8x8_alt = [
  [ 0, 48, 12, 60,  3, 51, 15, 63], /* 8x8 Bayer ordered dithering */
  [32, 16, 44, 28, 35, 19, 47, 31], /* pattern. Each input pixel */
  [ 8, 56,  4, 52, 11, 59,  7, 55], /* is scaled to the 0..63 range */
  [40, 24, 36, 20, 43, 27, 39, 23], /* before looking in this table */
  [ 2, 50, 14, 62,  1, 49, 13, 61], /* to determine the action. */
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58,  6, 54,  9, 57,  5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21]
];

function flipChannels(imageData, x, y, z){
  let pixel = imageData.data
  return new Promise((resolve, reject) => {
    for(let p = 0, len = pixel.length; p < len; p+=4) {
      if (x) pixel[p]   = 255 - pixel[p];   // invert R channel
      if (y) pixel[p+1] = 255 - pixel[p+1]; // invert G channel
      if (z) pixel[p+2] = 255 - pixel[p+2]; // invert B channel
      // alpha channel (p+3) is ignored
    }

    resolve(imageData)
  })
}

function dither(imageData, type, depth){
  const width  = imageData.width
  const height = imageData.height
  let pixel = imageData.data
  let x, y, a, b

  return new Promise((resolve, reject) => {
    for ( x=0; x<width; x++ ) {
      for ( y=0; y<height; y++ ) {

        switch(type){
          case 2: // 8x8
            a = ( x * height + y ) * 8;
            b = threshold_map_8x8[ x%8 ][ y%8 ];
            break;
          case 3: // 8x8 ALT
            a = ( x * height + y ) * 8;
            b = threshold_map_8x8_alt[ x%8 ][ y%8 ];
            break;
          case 0: // 4x4
          case 1:
          default:
            a = ( x * height + y ) * 4;
            b = threshold_map_4x4[ x%4 ][ y%4 ];
        }

        pixel[ a + 0 ] = ( (pixel[ a + 0 ]+ b) / depth | 0 ) * depth; // R channel
        pixel[ a + 1 ] = ( (pixel[ a + 1 ]+ b) / depth | 0 ) * depth; // G channel
        pixel[ a + 2 ] = ( (pixel[ a + 2 ]+ b) / depth | 0 ) * depth; // B channel
        //pixel[ a + 3 ] = ( (pixel[ a + 3 ]+ b) / depth | 3 ) * depth; // aplha channel
      }
    }

    resolve(imageData)
  })
}
