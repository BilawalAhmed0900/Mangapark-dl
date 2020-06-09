const mkdirp = require("mkdirp");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip")
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

  @param responseType: "text" | "blob"
*/
function downloadFromUrl(UrlString, {responseType = "text"} = {})
{
  const request = new XMLHttpRequest();
  request.responseType = responseType;

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
    request.setRequestHeader("Access-Control-Allow-Origin", "*");
    request.setRequestHeader("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
    request.setRequestHeader("Access-Control-Allow-Headers", "Content-Type");
    request.send();
  });
}

/*
  This logs too along with downloadFromUrl
*/
function downloadUrlAndLog(UrlString, logger, 
  {initialSendLog = true, errorLog = true, completedLog = true} = {},
  {responseType = "text"} = {})
{
  return new Promise((resolve, reject) =>
  {
    if (initialSendLog === true)
    {
      writeToLogger(logger, `[GET] Sending GET to ${UrlString}\n`);
    }
    
    downloadFromUrl(UrlString,
      {responseType: responseType}).then(
      ([status, response]) =>
      {
        if (status !== 200 && errorLog === true)
        {
          writeToLogger(logger, `[Error] Status returned: ${String(status)}\n`);
        }
        else if (completedLog === true)
        {
          writeToLogger(logger, `[GET] Completed with ${response.length | response.size} bytes received\n`);
        }
      
        resolve([status, response]);
      }
    )
  });
}

/*
  Sometimes Manga, Manhua, Manhwa, or Webtoon is at the end of the manga or manhua in title
  and sometimes it is not written, checking for both with different regex
*/
function extractTitleAndLog(HTMLPage, logger, {logError = true} = {})
{
  const titleRegex = [
    /\<meta property=\"og:title\" content=\"(.*?) (Manga|Manhua|Manhwa|Webtoon)\" \/\>/,
    /\<meta property=\"og:title\" content=\"(.*?)\" \/\>/
  ];

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
    The version on mangapark is a div by id starting with "stream_"
  */
  const versionArray = document.querySelectorAll("[id^=stream_]");
  
  let longestChapterVolume = [];
  for (const version of versionArray)
  {
    /*
      This regex extracts chapters within version
    */
    const chapterRegex = /\<a class=\"ml-1 visited ch\" href=\"(.*?)\"\>.*?\<\/a\>/g;
    const versionBodyInnerHTML = version.innerHTML.toString();
    const allChapterLinks = [];
    
    while (true)
    {
      /*
        Continue extracting chapters
      */
      const chapterLink = chapterRegex.exec(versionBodyInnerHTML);
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
  const resultantArchiveLocation = `${path.join(directoryName, `Chapter_${("0" + chapterNumber).slice(-4)}.cbz`)}`;
  if (fs.existsSync(resultantArchiveLocation))
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
  const linkArray = normalizeImageLinks(chapterLink, JSON.parse(resultArray[1]));
  const perImageProgress = perChapterProgressBar.max / linkArray.length;
  const imageBlobArray = [];

  for (let index = 0; index < linkArray.length; ++index)
  {
    logger.value = loggerCurrentValue;
    writeToLogger(logger, `downloading panel: ${index+1}/${linkArray.length}\n`);
    const [perStatus, perResponse] = await downloadFromUrl(linkArray[index], {responseType: "blob"});
    if (perStatus === 200)
    {
      imageBlobArray.push(perResponse);
    }
    addToPerChapterProgressBar(perImageProgress);
  }
  
  const zipFile = new AdmZip();
  for (let index = 0; index < imageBlobArray.length; ++index)
  {
    logger.value = loggerCurrentValue;
    writeToLogger(logger, `adding panel to zip: ${index+1}/${imageBlobArray.length}\n`);
    zipFile.addFile(`${("0" + (index + 1)).slice(-3)}.jpeg`, await imageBlobArray[index].arrayBuffer());
  }

  logger.value = loggerCurrentValue;
  writeToLogger(logger, `writing zip\n`);
  zipFile.writeZip(resultantArchiveLocation);

  perChapterProgressBar.value = perChapterProgressBar.max;
}

function normalizeImageLinks(mangaURL, imageLinkArray)
{
  const url = new URL(mangaURL);

  if (imageLinkArray == null || !(imageLinkArray instanceof Array))
  {
    return imageLinkArray;
  }

  return imageLinkArray.map(imageLink =>
  {
    let newLink = `${imageLink["u"].replace("\\/", "/")}`;
    if (newLink.startsWith("\/\/"))
    {
      return `${url.protocol}${newLink}`;
    }
    return newLink;
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
    Now we have to extract <div...></div> from the response,
    easiest way is to add it to current DOM and search for it

    So, only adding <body> from response, as we don't want CSS and JS from that page
  */
  const bodyRegex = /\<body\>(.*?)\<\/body\>/ms;
  const responseBody = bodyRegex.exec(response);
  const htmlAddition = document.createElement("div");
  htmlAddition.innerHTML = responseBody[1];
  htmlAddition.style.display = "none";
  document.body.appendChild(htmlAddition);

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
  console.log(chapterLinks);

  const perChapterProgress = document.getElementById("wholeLinkProgress").max / chapterLinks.length;
  for (let index = 0; index < chapterLinks.length; ++index)
  {
    await downloadChapterAndLog(chapterLinks[index], title, index+1,
      document.getElementById("perChapter"), logger);
    addToWholeLinkProgressBar(perChapterProgress);
  }

  document.getElementById("wholeLinkProgress").value = document.getElementById("wholeLinkProgress").max;
  
  /*
    Removing the added response
  */
  document.body.removeChild(htmlAddition);
}