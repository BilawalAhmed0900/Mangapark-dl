const ENTER_KEY = 13;

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

function addToPerChapterProgressBar(howMuch)
{
  document.getElementById("perChapter").value += howMuch;
}

function addToWholeLinkProgressBar(howMuch)
{
  document.getElementById("wholeLinkProgress").value += howMuch;
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
async function downloadFromUrl(UrlString)
{
  const request = new XMLHttpRequest();

  return new Promise(async(resolve, reject) =>
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
async function downloadAndLog(UrlString, logger, 
  {initialSendLog = true, errorLog = true, completedLog = true} = {})
{
  return new Promise(async(resolve, reject) =>
  {
    if (initialSendLog === true)
    {
      writeToLogger(logger, `[GET] Sending GET to ${UrlString}\n`);
    }
    
    const [status, response] = await downloadFromUrl(UrlString);
    if (status !== 200 && errorLog === true)
    {
      writeToLogger(logger, `[Error] Status returned: ${String(status)}\n`);
    }
    else if (completedLog === true)
    {
      writeToLogger(logger, `[GET] Completed with ${String(response.length)} bytes received\n`);
    } 
  
    resolve([status, response]);
  });
}

/*
  Matches /\<meta property=\"og:title\" content=\"(.*)? (Manga|Manhua)\" \/\>/
  and returns result[1] or ""
*/
function extractTitleAndLog(HTMLPage, logger, {logError = true} = {})
{
  const titleRegex = /\<meta property=\"og:title\" content=\"(.*)? (Manga|Manhua)\" \/\>/;

  const titleArray = titleRegex.exec(HTMLPage);
  if (titleArray === null)
  {
    if (logError === true)
    {
      writeToLogger(logger, "[Error] Cannot match for title\n");
    }
    return "";
  }

  return String(titleArray[1]);
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
  const hostName = url.hostname; // ABC.XYZ

  return chapterLinks.map(link =>
  {
    return `${protocol}//${hostName}${link.substr(0, link.length - 2)}`;
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
  const [status, response] = await downloadAndLog(mangaUrlString, logger);
  if (status !== 200)
  {
    return;
  }

  const title = extractTitleAndLog(String(response), logger);
  if (title.length === 0)
  {
    return;
  }

  writeToLogger(logger, `[Manga] Downloading ${title}\n`);
  const chapterLinks = extractChapterLinksAndLog(mangaUrlString, String(response));
  writeToLogger(logger, `[Manga] Found chapters ${chapterLinks.length}\n`);
}