const mkdirp = require("mkdirp");
const jimp = require("jimp");
const path = require("path");
const fs = require("fs");
const mergeImg = require("merge-img");
const ENTER_KEY = 13;
const MAX_JPEG_HEIGHT = 65000;

/*
  Add event to download button to start downloading the url
*/
document.getElementById("downloadButton").addEventListener("click", downloadButtonClick);

/*
  If "enter" is pressed inside the input, send it as a click to the downloading button
*/
document.getElementById("downloadURL").addEventListener("keyup", (event) =>
{
  if (event.keyCode === ENTER_KEY)
  {
    event.preventDefault();
    document.getElementById("downloadButton").click();
  }
});

function scrollLoggerToEnd(logger)
{
  logger.scrollTop = logger.scrollHeight;
}

function writeToLogger(logger, message)
{
  logger.value += message;
  scrollLoggerToEnd(logger);
}

function resetProgressBars()
{
  document.getElementById("perChapter").value = 0;
  document.getElementById("wholeLinkProgress").value = 0;
}

function setToPerChapterProgressBar(value)
{
  document.getElementById("perChapter").value = value;
}

function setToWholeLinkProgressBar(value)
{
  document.getElementById("wholeLinkProgress").value = value;
}

function addToPerChapterProgressBar(value)
{
  document.getElementById("perChapter").value += value;
}

function addToWholeLinkProgressBar(value)
{
  document.getElementById("wholeLinkProgress").value += value;
}

function downloadButtonClick(event)
{
  event.preventDefault();

  document.getElementById("downloadURL").readOnly = true;
  document.getElementById("downloadButton").disabled = true;

  /*
    Had to convert all the async stack to sync one
  */
  downloadManga(document.getElementById("downloadURL").value).then(() =>
  {
    document.getElementById("downloadURL").readOnly = false;
    document.getElementById("downloadButton").disabled = false;
  });
}

/*
  Returns a Promise, that will only resolve, 
  containing [status code, response (text, blob, etc...)]
*/
function downloadFromUrl(UrlString)
{
  const request = new XMLHttpRequest();

  return new Promise((resolve, reject) =>
  {
    const simpleResolve = function()
    {
      resolve([request.status, request.response]);
    };
  
    /*
      On error or success, we just return our array
    */
    request.onload = simpleResolve;
    request.ontimeout = simpleResolve;
    request.onerror = simpleResolve;
    
    /*
      true for async mode
    */
    request.open("GET", UrlString, true);
    request.send(null);
  });
}

/*
  This logs too along with downloadFromUrl
*/
function downloadUrlAndLog(UrlString, logger, 
  {initialSendLog = true, errorLog = true, completedLog = true} = {})
{
  return new Promise((resolve, reject) =>
  {
    if (initialSendLog === true)
    {
      writeToLogger(logger, `[GET] Sending GET to ${UrlString}\n`);
    }
    
    downloadFromUrl(UrlString).then(
      ([status, response]) =>
      {
        if (status !== 200 && errorLog === true)
        {
          writeToLogger(logger, `[Error] Status returned: ${String(status)}\n`);
        }
        else if (completedLog === true)
        {
          writeToLogger(logger, `[GET] Completed with ${String(response.length)} bytes received\n`);
        } 
      
        resolve([status, response]);
      }
    );
  });
}

/*
  Sometimes Manga or Manhua is at the end of the manga or manhua in title
  and sometimes it is not written, checking for both with different regex
*/
function extractTitleAndLog(HTMLPage, logger, {logError = true} = {})
{
  const titleRegex = [
    /\<meta property=\"og:title\" content=\"(.*?) (Manga|Manhua)\" \/\>/,
    /\<meta property=\"og:title\" content=\"(.*?)\" \/\>/];

  for (let index = 0; index < titleRegex.length; ++index)
  {
    const titleArray = titleRegex[index].exec(HTMLPage);
    if (titleArray !== null)
    {
      return String(titleArray[1]);
    }
  }

  if (logError === true)
  {
    writeToLogger(logger, "[Error] Cannot match for title\n");
  }
  return "";
}

/*
  Search for chapters.
  Mangapark has multiple version of chapters.

  We have to select which contains most number of chapters
*/
function extractChapterLinksAndLog(mangaUrlLink, HTMLPage)
{
  /*
    This regex, extracts whole version of chapter
  */
  const chapterVolumeRegex = /\<ul class=\"chapter\"\>(.*?)\<\/ul\>/gms;

  let longestChapterVolume = [];
  while (1)
  {
    /*
      Continue searching for volumes
    */
    const returnedArray = chapterVolumeRegex.exec(HTMLPage);
    if (returnedArray === null)
    {
      break;
    }

    if (returnedArray.length >= 2)
    {
      /*
        This regex extracts chapters within version
      */
      const chapterRegex = /\<a class=\"ml-1 visited ch\"  href=\"(.*?)\"\>.*?\<\/a\>/g;
      const allChapterLinks = [];

      while (true)
      {
        /*
          Continue extracting chapters
        */
        const chapterLink = chapterRegex.exec(returnedArray[1]);
        if (chapterLink === null)
        {
          break;
        }

        if (chapterLink.length >= 2)
        {
          allChapterLinks.push(chapterLink[1]);
        }
      }
      
      /*
        Check largest array
      */
      if (allChapterLinks.length > longestChapterVolume.length)
      {
        longestChapterVolume = allChapterLinks;
      }
    }
  }

  longestChapterVolume.reverse();
  return appendDomainAndRemove1(mangaUrlLink, longestChapterVolume);
}

/*
  mangaUrlLink gives us domain

  This function appends mangapark domain in-front of all chapter links and remove /1
  chapter links extracted are in form

  /manga/ABC/XYZ/v3/c5/1

  The last '/1' is not needed
*/
function appendDomainAndRemove1(mangaUrlLink, chapterLinks)
{
  const url = new URL(mangaUrlLink);
  const protocol = url.protocol; // https: or http:
  const hostName = url.hostname; // abc.xyz

  return chapterLinks.map(link =>
  {
    /* link has '/' in front so no, '/' after hostName */
    return `${protocol}//${hostName}${link.substr(0, link.length - 2)}`;
  });
}

async function downloadChapterAndLog(chapterLink, directoryName, chapterNumber,
  perChapterProgressBar, logger, 
  {errorLog = true} = {})
{
  const resultantImageLocation = `${path.join(directoryName, `Chapter_${("0" + chapterNumber).slice(-4)}.jpeg`)}`;
  if (fs.existsSync(resultantImageLocation))
  {
    /*
      Chapter is only saved when completely downloaded
    */
    return;
  }

  const [status, response] = await downloadUrlAndLog(chapterLink, logger,
    {completedLog: false, errorLog: errorLog});
  if (status !== 200)
  {
    return;
  }
  const responseText = String(response);
  const linkRegex = /var _load_pages = (.*?);/gms;

  writeToLogger(logger, `[Manga] Downloading chapter ${chapterNumber}, `);
  /*
    To imitate, \r in console, storing current value, and every new write will be
    setting value to this and then write
  */
  const loggerCurrentValue = logger.value;

  const resultArray = linkRegex.exec(responseText);
  if (resultArray === null || resultArray.length < 2)
  {
    if (errorLog === true)
    {
      writeToLogger(logger, "[Error] Cannot extract images link\n");
      return;
    }
  }
  
  perChapterProgressBar.value = 0;
  const linkArray = normalizeImageLinks(JSON.parse(resultArray[1]));
  const perImageProgress = perChapterProgressBar.max / linkArray.length;
  const jimpImageArray = [];

  for (let index = 0; index < linkArray.length; ++index)
  {
    try
    {
      logger.value = loggerCurrentValue;
      writeToLogger(logger, `downloading panel: ${index+1}/${linkArray.length}\n`);
      jimpImageArray.push(await jimp.read(linkArray[index]));
    }
    catch (error)
    {
      if (errorLog === true)
      {
        writeToLogger(logger, `[Error] Cannot identify image at ${linkArray[index]}\n`);
      }
    }
    addToPerChapterProgressBar(perImageProgress);
  }
  perImageProgress.value = 0;

  if (jimpImageArray.length === 0)
  {
    return;
  }
  
  let combinedHeight = 0.0;
  for (let index = 0; index < jimpImageArray.length; ++index)
  {
    combinedHeight += jimpImageArray[index].getHeight();
  }

  /*
    JPEG has maximum height of 65000 + something,
    We will resize every image so combined height is 65000
  */
  if (combinedHeight >= MAX_JPEG_HEIGHT)
  {
    const scaleFactor = MAX_JPEG_HEIGHT / combinedHeight;
    for (let index = 0; index < jimpImageArray.length; ++index)
    {
      logger.value = loggerCurrentValue;
      writeToLogger(logger, `resizing panel: ${index+1}/${jimpImageArray.length}\n`);

      jimpImageArray[index] = jimpImageArray[index].resize(jimp.AUTO, 
        jimpImageArray[index].getHeight() * scaleFactor);
      addToPerChapterProgressBar(perImageProgress);
    }
  }
  perImageProgress.value = 0;

  /* 
    Getting width of most wide image
  */
  let maxWidth = 0.0;
  for (let index = 0; index < jimpImageArray.length; ++index)
  {
    if (jimpImageArray[index].getWidth() > maxWidth)
    {
      maxWidth = jimpImageArray[index].getWidth();
    }
  }

  /*
    Now resizing every image to have width of maxWidth
  */
  for (let index = 0; index < jimpImageArray.length; ++index)
  {
    if (jimpImageArray[index].getWidth() !== maxWidth)
    {
      jimpImageArray[index] = jimpImageArray[index].resize(maxWidth, jimp.AUTO);
    }
    addToPerChapterProgressBar(perImageProgress);
  }
  perImageProgress.value = 0;

  const bufferArray = [];
  for (let index = 0; index < jimpImageArray.length; ++index)
  {
    logger.value = loggerCurrentValue;
    writeToLogger(logger, `Getting buffer of panel: ${index+1}/${jimpImageArray.length}\n`);
    const element = await jimpImageArray[index].getBufferAsync(jimp.MIME_JPEG);
    bufferArray.push(element);
    addToPerChapterProgressBar(perImageProgress);
  }
  jimpImageArray.length = 0;

  // resultantImage should be free-d for file to be released
  let resultantImage = await mergeImg(bufferArray,
  {
    direction: true
  });
  bufferArray.length = 0;

  /*
    Save as jpeg, for now
  */
  logger.value = loggerCurrentValue;
  writeToLogger(logger, `writing chapter\n`);
  resultantImage.write(resultantImageLocation);
  resultantImage = null;

  perChapterProgressBar.value = perChapterProgressBar.max;
}

function normalizeImageLinks(imageLinkArray)
{
  if (imageLinkArray == null || !(imageLinkArray instanceof Array))
  {
    return imageLinkArray;
  }

  return imageLinkArray.map(imageLink =>
  {
    return `${imageLink["u"].replace("\\/", "/")}`;
  });
}

/*
  async for:
    downloadFromUrl
*/
async function downloadManga(mangaUrlString)
{
  if (typeof mangaUrlString !== 'string' || mangaUrlString.length === 0)
  {
    return;
  }

  const logger = document.getElementById("loggingTextArea");
  if (!mangaUrlString.startsWith("http://") && !mangaUrlString.startsWith("https://"))
  {
    writeToLogger(logger, `[URL] Invalid Url: ${mangaUrlString}\n`);
    return;
  }

  resetProgressBars();
  const [status, response] = await downloadUrlAndLog(mangaUrlString, logger);
  if (status !== 200)
  {
    return;
  }

  /*
    Legal characters in directory name are
    a-Z
    A-Z
    0-9
    -
    (space)
  */
  const title = extractTitleAndLog(String(response), logger).replace(/[^a-zA-Z0-9\-\ ]/g, "");
  if (title.length === 0)
  {
    return;
  }

  const titleDir = mkdirp.sync(title);

  writeToLogger(logger, `[Manga] Downloading ${title}\n`);
  const chapterLinks = extractChapterLinksAndLog(mangaUrlString, String(response));
  writeToLogger(logger, `[Manga] Found ${chapterLinks.length} chapters\n`);

  const perChapterProgress = document.getElementById("wholeLinkProgress").max / chapterLinks.length;
  for (let index = 0; index < chapterLinks.length; ++index)
  {
    await downloadChapterAndLog(chapterLinks[index], title, index+1,
      document.getElementById("perChapter"), logger);
    addToWholeLinkProgressBar(perChapterProgress);
  }

  document.getElementById("wholeLinkProgress").value = document.getElementById("wholeLinkProgress").max;
}