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

async function downloadAndLog(UrlString, logger, 
  {initialSendLog = true, errorLog = true, completedLog = true} = {})
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

  return [status, response];
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
}