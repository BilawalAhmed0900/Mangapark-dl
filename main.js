const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow, Menu} = electron;

const WINDOW_WIDTH = 800;
const WINDOW_HEIGHT = 510;
const WINDOW_HTML_FILE = 'mainWindow.html';
let mainWindow;

/*
  Called when app is ready to be shown
*/
app.on('ready', () =>
{
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false
  });

  mainWindow.setResizable(false);

  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, WINDOW_HTML_FILE),
      protocol: 'file:',
      slashes: true
    })
  );

  /*
    When our main window is closed, we should close the app too
  */
  mainWindow.on('closed', () =>
  {
    app.quit();
  });

  mainWindow.on('ready-to-show', () =>
  {
    mainWindow.show();
  });

  /*
    There is a bug currently in Electron, due to which, if window is first time moved, after
    rendered, it shortens, so on each move, we resize it back
  */
  /*mainWindow.on('move', () =>
  {
    mainWindow.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
  });*/

  /*
    Construct a main menu from the template below
  */
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

  /*
    Set app's menu to nothing
  */
  Menu.setApplicationMenu(mainMenu);
});

/*
  This is a template, from which the top menu bar will be created
*/
const mainMenuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Quit',
        accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
        click()
        {
          app.quit();
        }
      }
    ]
  }
]

/*
  MacOS needs an empty element at start
*/
if (process.platform === 'darwin')
{
  mainMenuTemplate.unshift({});
}

/*
  If we are in debug mode, we would like to add one more menu, Dev Tools
  which will have basic option useful in debugging
*/
if (process.env.NODE_ENV !== 'production')
{
  mainMenuTemplate.push({
    label: 'Dev Tools',
    submenu: [
      {
        label: 'Toggle Dev Tools',
        click(event, focusedWindow)
        {
          focusedWindow.toggleDevTools();
        }
      },
      {
        // Label will be added automatically, but also can be written
        role: 'reload'
      }
    ]
  });
}