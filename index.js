process.setMaxListeners(1488);
const puppeteer = require('puppeteer');
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { getVideoDurationInSeconds } = require('get-video-duration')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath)
const axios = require('axios');
const fs = require('fs');
ffmpeg.setFfprobePath('./ffprobe');


const state = {
  filepath: '', 
  lang: '',
  filecount: 0,
  linkArray: [],
  subnumber: 1,
  isAudio: false,
  oldPath: '',
  onlySubtitles: true

}

clean()

//540000 - 9 minutes
//10000 - 10 secundes
const eachTime = 571000

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "./preload.js")
    }
  })
  win.on('close', async () => {
    clean()
  })

  ipcMain.handle("log-path", async (_, pathname) => {   
    state.filepath = pathname 
  })

  ipcMain.handle("check", async (_, value) => {  
    console.log(value) 
    state.onlySubtitles = value 
  })

  ipcMain.handle("button-click", async () => {    
    const duration = await getVideoDurationInSeconds(state.filepath)
    const streams = await getStreams(state.filepath)
    state.isAudio = streams.length === 1 && streams[0].codec_type === 'audio'
    state.oldPath = state.filepath
    if (!state.isAudio && state.onlySubtitles) {
      const filedata = path.parse(state.filepath)
      state.filepath = filedata.dir + '/blacked-' + filedata.base
      await createBlackFile(state.oldPath)
    }

    if ((eachTime / 1000) > duration) {
      state.filecount = 1
      await startChrome(state)
    } else {
      await runSplit(state.filepath)
      const arr = await fs.promises.readdir('./files')
      state.filecount = arr.length
      for (let index = 0; index < arr.length; index++) {
        const duration = await getFileDuration(arr[index])
        console.log(duration, arr[index])
        startChrome({
          lang: state.lang,
          filepath: `./files/${arr[index]}`
        })
      }
    }
  })


  ipcMain.handle("select-lang", (_, lang) => {   
    state.lang = lang 
  })

  win.loadFile('index.html')
}


app.on('ready', function () {
  createWindow() 
});


function runSplit(filepath) {
  return new Promise((resolve, r)=>{
    ffmpeg()
    .input(filepath)
    .outputOptions('-c copy')
    .outputOptions('-f segment')
    .outputOptions('-reset_timestamps 1')
    .outputOptions('-map 0')
    .outputOptions(`-segment_time ${msToTime(eachTime, true)}`)
    .save('./files/output_%03d' + path.parse(filepath).ext)
    .on('end', () => {
      resolve()
    })
    .on('error', (e) => {
      r(e)
    })
  })
}


async function startChrome(innerstate) {
  let lastProcent = null
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
    defaultViewport:null,
    protocolTimeout: 0,
    headless: false,
    args: ["--window-size=1920,1080", "--window-position=0,0"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080});
  await page.goto('https://www.veed.io/new',{timeout: 0});
  console.log('start', innerstate.filepath)
  page.waitForSelector('[role="alert"] div', {timeout:0}).then(async () => {
    const text = await page.evaluate(() => {
      const element = document.querySelector('[role="alert"] div')
      if (element) {
        return element.innerHTML
      }
      return '';
    })
  
    if (text) {
      await browser.close()
      await startChrome(innerstate)
      return
    }
  })
  await page.waitForSelector('[data-testid="@editor/close-btn"]', {timeout:0})
  await page.click('[data-testid="@editor/close-btn"]');
  const elementHandle = await page.$("input[type=file]");
  await elementHandle.uploadFile(innerstate.filepath);
  await page.click('[data-testid="@editor/subtitles"]');
  await page.waitForSelector('[data-testid="@editor/subtitles-option/automatic"]', {timeout:0});

  let button = true
  while (button) {
    await page.click('[data-testid="@editor/subtitles-option/automatic"]');
    button = await page.$('[data-testid="@editor/subtitles-option/automatic"]')
  }

  await page.waitForSelector('[id="react-select-4-input"]', {timeout:0});
  await page.click('[id="react-select-4-input"]')
  await page.keyboard.type(innerstate.lang)
  await page.waitForSelector('[id="react-select-4-listbox"] > div:last-child > div', {timeout:0});
  await page.click('[id="react-select-4-listbox"] > div:last-child > div');
  await page.waitForSelector('[data-testid="@editor/subtitles/create-subtitles-button"]', {timeout:0});
  await page.click('[data-testid="@editor/subtitles/create-subtitles-button"]')

  let interval = null
  
  interval = setInterval(async () => {
    const newFigure = await page.evaluate(() => {
      const element = document.querySelector('figure text')
      if (element) {
        return element.innerHTML
      }
    
      return '';
    })
    if (newFigure) {
      if (newFigure?.includes('%')) {
        if (lastProcent === newFigure) {
          console.log('restart')
          startChrome(innerstate)
          clearInterval(interval)
          await browser.close()
          return
        } else {
          console.log(path.parse(innerstate.filepath).name, 'has new value',newFigure)
          lastProcent = newFigure
        }
      }
    }
  }, 90000)


  await page.waitForFunction(`document.querySelectorAll('[data-testid="@editor/draft-js-editor"] [data-testid="@editor/draft-js-editor/draft-js-row/row-tools"], [data-testid="@editor/subtitles/create-subtitles-button"]').length`, {timeout:0});
  if (await page.$('[data-testid="@editor/subtitles/create-subtitles-button"]')) {
    await page.click('[data-testid="@editor/subtitles/create-subtitles-button"]')
    lastProcent = null
    await page.waitForFunction(`document.querySelectorAll('[data-testid="@editor/draft-js-editor"] [data-testid="@editor/draft-js-editor/draft-js-row/row-tools"], [data-testid="@editor/subtitles/create-subtitles-button"]').length`, {timeout:0});
  }

  clearInterval(interval)
  if (state.onlySubtitles) {
    state.linkArray.push({url: `https://www.veed.io/api/v1/subtitles?projectId=${page.url().split('/')[4]}`, name: path.parse(innerstate.filepath).name, browser})
    console.log('linkpush', path.parse(innerstate.filepath).name, `https://www.veed.io/api/v1/subtitles?projectId=${page.url().split('/')[4]}`, state.linkArray.length ,"/",state.filecount)
    if (state.linkArray.length === state.filecount) {
      for (let index = 0; index < state.linkArray.length; index++) {
        await delay(5000)
        console.log(state.linkArray[index].name, 'start download')
        await downloader(state.linkArray[index].url, state.linkArray[index].name, 0, '.json')
        await state.linkArray[index].browser.close()
        console.log('download success')
      }
      const arr = await fs.promises.readdir('./output')
      const arrVideos = await fs.promises.readdir('./files')
      let timeOffset = 0
      for (let index = 0; index < arr.length; index++) {
        if (index !== 0) {
          timeOffset += await getFileDuration(arrVideos[index - 1])
        }
        console.log(timeOffset, 'timeOffset')
        await createSub(`./output/${arr[index]}`, index, path.parse(state.oldPath).name, timeOffset)
      }
      fs.rename(`./output/` + path.parse(state.oldPath).name + '.srt', path.dirname(state.oldPath) + '/' + path.parse(state.oldPath).name + '.srt', () => clean());
      if (!state.isAudio) {
        await fs.promises.unlink(state.filepath)
      }
      console.log('subtitles created')

    }
    return
  }
  console.log(path.parse(innerstate.filepath).name, 5)
  await page.waitForSelector('[data-testid="@header-controls/publish-button"]', {timeout:0})
  console.log(path.parse(innerstate.filepath).name, 6)
  await page.click('[data-testid="@header-controls/publish-button"]')
  await page.waitForSelector('[data-testid="@export/export-button"]', {timeout:0})
  console.log(path.parse(innerstate.filepath).name, 7)
  await page.click('[data-testid="@export/export-button"]')

  async function videocheck(response) {
    if (response.url().includes('.mp4')) {
      page.off('response', videocheck)
      console.log(response.url())
      browser.close();
      state.linkArray.push({url: response.url(), name: path.basename(innerstate.filepath)})
      if (state.linkArray.length === state.filecount) {
        for (let index = 0; index < state.linkArray.length; index++) {
          console.log(state.linkArray[index].name, 'start download')
          await downloader(state.linkArray[index].url, state.linkArray[index].name,0, '.mp4')
          console.log('download success')
        }
        if (1 !== state.filecount) concat()
      }
    }
  }
  page.on('response', videocheck)
}


function downloader(url, name, contentRange = 0, format) {
  return new Promise((res, rej) => {

    const headers = {
      referer: 'https://www.veed.io/',
    }
    if (format !== '.json') {
      headers.range = 'bytes=' + contentRange + '-'
    }
    axios({
      method: 'get',
      url,
      responseType: 'stream',
      headers,
      onDownloadProgress: progressEvent => {
        console.log(name, 'completed: ', Math.round(progressEvent.progress * 100), `${progressEvent.total}/${progressEvent.loaded}`)
      }
    })
    .then((response) => {
      const newfilename = `./output/subtitled-${name}${format}`
      const file = fs.createWriteStream(newfilename, {flags: 'a'});
      let isError = false

      response.data.pipe(file)

      response.data.on('error', async (e) => {
        console.log(e, 'stream error', name)
        isError = true
        file.close(async () => {
          await downloader(url, name, fs.readFileSync(newfilename).length, format)
          res()
        })
      })

      file.on('finish', () => {
        if (isError) return
        if (state.filecount === 1 && format !== '.json') {
          fs.rename(newfilename, path.dirname(state.filepath) + '/' + path.basename(newfilename), () => clean());
        }
        console.log('finish', name)
        file.close();
        res()
      })
    })
    .catch(async (error) => {
      console.log(error, 'prom error');
      rej()
    })
  })
}


async function concat() {
  const arr = await fs.promises.readdir('./output')
  const fileList = arr.map((name) => {
    return `./output/${name}`
  }).filter((str) => {
    if (str.includes('.mp4')) {
      return true
    }
    return false
  })
  const f = ffmpeg() 
  fileList.forEach((path) => f.input(path))
  f.mergeToFile(path.dirname(state.filepath) + '/subtitled-' + path.basename(state.filepath))
  .on('end', () => {
    console.log('succeess!')
    clean()
  })
  .on('error', (e) => {
    console.log(2, e)
  })
  .on('progress', (progress) => {
    console.log(progress)
  })
}

async function deleteAllFilesInDir(dirPath) {
  fs.readdir(dirPath, (err, files) => {
    if (err) throw err;
  
    for (const file of files) {
      fs.unlink(path.join(dirPath, file), (err) => {
        if (err) throw err;
      });
    }
  });
}


function clean() {
  state.filepath = ''
  state.filecount = 0
  state.linkArray = []
  state.subnumber = 1
  state.oldPath = ''
  deleteAllFilesInDir('./files')
  deleteAllFilesInDir('./output')
}



async function createSub(path, i, name, timeOffset) {
  return new Promise(async (res, rej) => {
    const jsonString = await fs.promises.readFile(path, "utf8")
    const data = JSON.parse(jsonString)
    if (data.data.length === 0) {
      res()
      return
    }
    const sorted = Object.values(data.data[0].subtitles).sort(((a, b) => a.from - b.from))
    const mapped = sorted.map(({words, from, to}) => {
      from = ((from * 1000) + Math.round(timeOffset * 1000))
      to = ((to * 1000) + Math.round(timeOffset * 1000))
      return {
          words: words.map(({value}) => value).join(' '),
          from:  msToTime(from),
          to: msToTime(to)
      }
    })
    for (let index = 0; index < mapped.length; index++) {
      await fs.promises.appendFile(`./output/${name}.srt`, `${state.subnumber}\n${mapped[index].from} --> ${mapped[index].to}\n${mapped[index].words}\n\n`);
      state.subnumber = state.subnumber + 1
    }
    res() 
  })
}


function msToTime(duration, noMs) {
  var milliseconds = Math.floor((duration % 1000) / 100),
    seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;

  if (noMs) {
    return hours + ":" + minutes + ":" + seconds
  } else {
   return hours + ":" + minutes + ":" + seconds + "," + milliseconds + '00'
  }

}


function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}




function getFileDuration(name) {
  return new Promise((r) => {
    ffmpeg.ffprobe(`./files/${name}`, function(err, metadata) {
      r(metadata.format.duration, name);
    });
  })
}


function getStreams(path) {
  return new Promise((r) => {
    ffmpeg.ffprobe(path, function(err, metadata) {
      r(metadata.streams);
    });
  })
}



function createBlackFile(path) {
  return new Promise((resolve, reject) => {
    ffmpeg()
    .input('./empty.mp4')
    .input(path)
    .outputOptions('-c copy')
    .outputOptions('-map 0:v')
    .outputOptions('-map 1:a')
    .outputOptions('-shortest')
    .save(state.filepath)
    .on('end', () => {
      resolve('ok')
    })
    .on('error', (e) => {
      reject(e)
    })
  })
}