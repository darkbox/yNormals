// ********** Electron ********** //
const fs = require('fs')
const remote = require('electron').remote

function openImageDialog(){
  remote.dialog.showOpenDialog(
    remote.getCurrentWindow(),
    {
      filters: [
        {name: 'Images', extensions: ['png', 'jpg', 'jpeg']}
      ]
    },
    (filepaths, bookmarks) => {
      if (filepaths.length > 0) {
        loadImageFromDisk(filepaths[0])
      } else {
        console.warn("No image selected from disk!")
      }
      return
    }
  )
}

function loadImageFromDisk(filepath){
  if (filepath) {
    // read image file from disk
    console.log(filepath)
    const imageBase64Str = fs.readFileSync(filepath).toString('base64')

    // Handle loaded image
    const compareImageArea = document.getElementById('image-area')
    dropArea.classList.add('hide')
    compareImageArea.classList.remove('hide')

    let fpath = filepath.replace(/\\/g, '/')
    let fname = fpath.substring(fpath.lastIndexOf('/')+1, fpath.lastIndexOf('.'))
    let fext  = fpath.substring(fpath.lastIndexOf('.')+1, fpath.length)
    let dataType = 'data:image/' + fext + ';base64,'

    if (appState.input) {
      appState.input.filename = filepath
      appState.input.extension = fext
    }

    setSourceBefore(dataType + imageBase64Str)
    setSourceAfter(dataType + imageBase64Str)
    clipComparation(50)
    processImage()
  } else {
    console.error("Could not open the file %s", filepath)
  }
}

function saveImageToDisk(){
  // TODO
  return
}

// ********** DropArea ********** //
const dropArea = document.getElementById('drop-area')

dropArea.addEventListener('dragenter', preventDefaults, false)
dropArea.addEventListener('dragover', preventDefaults, false)
dropArea.addEventListener('dragleave', preventDefaults, false)
dropArea.addEventListener('drop', preventDefaults, false)
dropArea.addEventListener('dragenter', highlight, false)
dropArea.addEventListener('dragover', highlight, false)
dropArea.addEventListener('dragleave', unhighlight, false)
dropArea.addEventListener('drop', unhighlight, false)
dropArea.addEventListener('drop', handleDrop, false)

function preventDefaults (e) {
  e.preventDefault()
  e.stopPropagation()
}

function highlight(e) {
  dropArea.classList.add('highlight')
}

function unhighlight(e) {
  dropArea.classList.remove('highlight')
}

function handleDrop(e) {
  let files = e.dataTransfer.files

  if (files.length > 0){
    loadImageFromDisk(files[0].path)
  } else {
    console.warn("No file selected!")
  }
}

// ********* APP ********* //
let openClearBtn, saveBtn

let isBusy = false
let piWorker = null
let piCanvas = null
let appState = {
  flipChannels: {
    x: false,
    y: false,
    z: false,
  },
  dithering: {
    isActive: false,
    type: 0,
    depth: 1,
  },
  input: {
    filename: '',
    extension: ''
  },
  output: {
    prefix: '',
    sufix: ''
  }
}
init()

function init(){
  // Tooltips setup
  tippy.setDefaults({
    arrow: true,
    delay: [1000, 40],
  })

  // watch if app is busy
  let isBusyEl = document.getElementById('busy')
  window.setInterval(() => {
    isBusyEl.style.visibility = (isBusy) ? 'visible' : 'hidden'
  }, 500)

  // create hidden canvas
  piCanvas = document.createElement('canvas')

  // open/clear image button
  openClearBtn = document.getElementById('btn-open-clear')
  openClearBtn.addEventListener('click', e => {
    if (appState.input.filename !== ''){
      clearImageArea()
    } else {
      openImageDialog()
    }
  })
  shortcuts.add('ctrl+o', () =>{
    if (appState.input.filename !== ''){
      clearImageArea()
    } else {
      openImageDialog()
    }
  })

  // app about dialog
  let aboutBtn = document.getElementById('btn-about')
  aboutBtn.addEventListener('click', e => {
    const aboutDialog = document.getElementById('info-dialog')
    aboutDialog.classList.remove('hide')
    const infoClose = document.getElementById('info-close')
    infoClose.addEventListener('click', e => {
      aboutDialog.classList.add('hide')
    })
  })

  // toggle channels
  let toggleX, toggleY, toggleZ
  toggleX = document.getElementById('toggle-x')
  toggleY = document.getElementById('toggle-y')
  toggleZ = document.getElementById('toggle-z')

  toggleX.addEventListener('change', e => {onFlipChannelHandler(toggleX, 'x')});
  toggleY.addEventListener('change', e => {onFlipChannelHandler(toggleY, 'y')});
  toggleZ.addEventListener('change', e => {onFlipChannelHandler(toggleZ, 'z')});

  shortcuts.add('x', () =>{
    const e = new Event('change')
    toggleX.checked = !toggleX.checked
    toggleX.dispatchEvent(e)
  })
  shortcuts.add('y', () =>{
    const e = new Event('change')
    toggleY.checked = !toggleY.checked
    toggleY.dispatchEvent(e)
  })
  shortcuts.add('z', () =>{
    const e = new Event('change')
    toggleZ.checked = !toggleZ.checked
    toggleZ.dispatchEvent(e)
  })

  // dither
  let toggleDither
  toggleDither = document.getElementById('toggle-dither')
  selectDither = document.getElementById('select-dither')
  depthDither  = document.getElementById('dithering-depth')

  toggleDither.addEventListener('change', e => {
    appState.dithering.isActive = toggleDither.checked
    console.log("Dithering has been %s.", (appState.dithering.isActive) ? "activated" : "diactivated")
    processImage()
  })

  shortcuts.add('d', () =>{
    const e = new Event('change')
    toggleDither.checked = !toggleDither.checked
    toggleDither.dispatchEvent(e)
  })

  selectDither.addEventListener('change', e => {
    appState.dithering.type = parseInt(selectDither.selectedIndex, 10)
    console.log("Dithering method changed. Current index %d.", appState.dithering.type)
    processImage()
  })

  const sliderDitherDepth = document.getElementById("dithering-depth")
  const valueDitherDepth  = document.getElementById("dithering-value")
  valueDitherDepth.innerHTML = sliderDitherDepth.value

  sliderDitherDepth.oninput = () => {
    valueDitherDepth.innerHTML = sliderDitherDepth.value
    appState.dithering.depth = parseInt(sliderDitherDepth.value, 10)
  }
  sliderDitherDepth.onchange = () => {
    processImage()
  }

  // output fields
  const prefixField = document.getElementById('txt-prefix')
  const sufixField  = document.getElementById('txt-sufix')

  prefixField.addEventListener('input', e => {
    appState.output.prefix = prefixField.value
  })
  sufixField.addEventListener('input', e => {
    appState.output.sufix = sufixField.value
  })

  // save button
  saveBtn = document.getElementById('btn-save')
  saveBtn.addEventListener('click', e => {
    console.log('Save button clicked.')
    saveImage()
  })
  shortcuts.add('ctrl+s', () =>{saveImage()})

  // image compare slider
  const imageCompareSlider = document.getElementById('image-compare-slider')
  imageCompareSlider.addEventListener('input', e => {
    clipComparation(imageCompareSlider.value)
  })

  // clear image area button (remove image)
  // const clearBtn = document.getElementById('btn-clear')
  // clearBtn.addEventListener('click', e =>{
  //   clearImageArea()
  // })

  // read on startup values
  appState.flipChannels.x = toggleX.checked
  appState.flipChannels.y = toggleY.checked
  appState.flipChannels.z = toggleZ.checked
  appState.dithering.isActive = toggleDither.checked
  appState.dithering.type  = parseInt(selectDither.selectedIndex, 10)
  appState.dithering.depth = parseInt(sliderDitherDepth.value, 10)
  appState.output.prefix = prefixField.value
  appState.output.sufix  = sufixField.value

  // Scale image to fit work-area
  window.onresize = function(event) {fitImageInsideContainer()}

  // Initializing workers
  if (window.Worker){
    console.log('Initializing workers...')
    piWorker = new Worker('./assets/js/process-image-worker.js')
    piWorker.addEventListener('message', e => {
      if (e.data.message === 'done'){
        console.log("Updating canvas...")
        const ctx = piCanvas.getContext('2d')
        ctx.putImageData(e.data.imageData, 0, 0);
        setSourceAfter(piCanvas.toDataURL())
        isBusy = false
      }
    })
  }

  // Update UI elements
  updateUI()
}

function updateUI(){
  console.log("Updating UI...")

  // Update open clear button text
  if (openClearBtn){
    if (existImage()){
      openClearBtn.innerHTML = 'Clear'
    } else {
      openClearBtn.innerHTML = 'Open'
    }
  }

  // Update save button state
  if (saveBtn){
    saveBtn.disabled = !existImage()
  }
}

function existImage(){
  return (appState.input.filename !== '' && appState.input.extension !== '')
}

function clearImageArea(){
  console.log('Clearing image area...')

  appState.input.filename = ''

  let compareImageArea = document.getElementById('image-area')
  dropArea.classList.remove('hide')
  compareImageArea.classList.add('hide')

  updateUI()
}

function fitImageInsideContainer(){
  if (appState.input.filename == ''){
    return
  }

  const bb = document.getElementById('image-compare-before')
  const ba = document.getElementById('image-compare-after')
  const wr = document.getElementById('image-area')
  const cw = document.getElementById('image-compare')
  const scale = Math.min(
    wr.offsetWidth / bb.naturalWidth,
    wr.offsetHeight / bb.naturalHeight
  );

  const width = Math.abs(bb.naturalWidth * scale)
  const height = Math.abs(bb.naturalHeight * scale)

  bb.style.width = width + 'px'
  bb.style.height = height + 'px'
  ba.style.width = width + 'px'
  ba.style.height = height + 'px'
  ba.style.top = '-' + (height + 2) + 'px'

  cw.style.width = width + 'px'
  cw.style.height = height + 'px'
}

function clipComparation(percent){
  const ica = document.getElementById('image-compare-after')

  percent = (percent <= 0) ? 0 : percent
  percent = (percent >= 100)? 100: percent

  ica.style.clipPath = "polygon(0% 0%, 0% 100%, " + percent + "% 100%, " + percent + "% 0%)"
}

function setSourceBefore(src){
  let imgElm = document.getElementById('image-compare-before')
  imgElm.src = src
  imgElm.onload = function (){
    fitImageInsideContainer()
    updateUI()
  }
}

function setSourceAfter(src){
  let imgElm = document.getElementById('image-compare-after')
  imgElm.src = src
}

function saveImage(){
  if (!existImage()){
    console.warn("No image to save!")
    return
  }

  console.log("Saving image to disk...")

  let fpath = appState.input.filename.replace(/\\/g, '/')
  let fname = fpath.substring(fpath.lastIndexOf('/')+1, fpath.lastIndexOf('.'))
  let fext  = fpath.substring(fpath.lastIndexOf('.')+1, fpath.length)

  let finalFileName = appState.output.prefix
  finalFileName += fname
  finalFileName += appState.output.sufix
  finalFileName += '.png' // + fext

  const base64Str = document.getElementById('image-compare-after').src

  // console.log("Final filename: %s", finalFileName)
  // console.log("base64 string: %s", base64Str)

  decodeBase64Image(base64Str).then((result) => {
    console.log(result)

    if (result.data){
      saveDecodedImageToDisk(finalFileName, result.data).then((result) => {
        // Show native notification
        const myNotification = new Notification('Title', {
          body: 'Image saved at (' + result + ')'
        })
      })
    } else {
      // Show native notification
      const myNotification = new Notification('Title', {
        body: 'Error saving image'
      })
    }
  })

  // downloadBase64AsFile(base64Str, finalFileName)
}

// function downloadBase64AsFile(base64, fileName) {
//   const link = document.createElement("a");
//
//   link.setAttribute("href", base64);
//   link.setAttribute("download", fileName);
//   link.style.display = 'none'
//
//   document.body.appendChild(link)
//
//   link.click();
// }

function decodeBase64Image(base64Str) {
  return new Promise((resolve, reject) => {
    let matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
    let response = {}

    if (matches.length !== 3) {
      reject('Invalid input string')
    }

    response.type = matches[1]
    response.data = new Buffer(matches[2], 'base64')

    resolve(response)
  })
}

function saveDecodedImageToDisk(filename, data){
  return new Promise((resolve, reject) => {
    try {
      fs.writeFile(filename, data, () => {resolve(filename)})
    } catch(error) {
      reject(error)
    }
  })
}

function onFlipChannelHandler(ctx, channel){

  console.log("Channel %s toggled.", channel)

  switch(channel){
    case 'x':
      appState.flipChannels.x = ctx.checked
      break;
    case 'y':
      appState.flipChannels.y = ctx.checked
      break;
    case 'z':
      appState.flipChannels.z = ctx.checked
      break;
  }

  processImage()
}

function processImage(){
  if (isBusy || !existImage())
    return

  const imgEl = document.getElementById('image-compare-before')

  if (imgEl){
    isBusy = true
    const img  = new Image()
    img.src    = imgEl.src
    img.onload = () => {
      console.log(
        "Image loaded (w: %d, h: %d)",
        img.naturalWidth,
        img.naturalHeight)

      const ctx = piCanvas.getContext('2d')
      const width  = img.naturalWidth
      const height = img.naturalHeight
      piCanvas.width  = width
      piCanvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      piWorker.postMessage({
        action: 'processImage',
        payload: {
          imageData: ctx.getImageData(0, 0, width, height),
          appState: appState
        }
      })
      console.log('Processing image...')
    }
  } else {
    console.warning('No image element found')
  }
}
