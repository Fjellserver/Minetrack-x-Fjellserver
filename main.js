const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const App = require('./lib/app');
const ServerRegistration = require('./lib/servers');
const logger = require('./lib/logger');
const config = require('./config');

const app = new App();

// URL of the JSON data from config
const serversUrl = config.serversUrl;

// Path to the local servers.json file
const localServersPath = path.resolve(__dirname, 'servers.json');

// Interval for reloading the app in milliseconds
const RELOAD_INTERVAL = config.reloadInterval || 5 * 60 * 1000; // Default to 5 minutes if not specified

function loadServersFromUrl(url) {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response.json();
    });
}

function loadServersFromLocalFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      try {
        resolve(JSON.parse(data));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function initializeApp() {
  const loadServers = serversUrl ? loadServersFromUrl(serversUrl) : loadServersFromLocalFile(localServersPath);

  loadServers
    .then(servers => {
      logger.log('info', `Loading servers from ${serversUrl || 'local servers.json'}`);

      app.serverRegistrations = []; // Clear existing registrations

      servers.forEach((server, serverId) => {
        // Assign a generated color for each server entry if not manually defined
        if (!server.color) {
          let hash = 0;
          for (let i = server.name.length - 1; i >= 0; i--) {
            hash = server.name.charCodeAt(i) + ((hash << 5) - hash);
          }

          const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777216)).toString(16);
          server.color = '#' + Array(6 - color.length + 1).join('0') + color;
        }

        // Init a ServerRegistration instance of each entry
        app.serverRegistrations.push(new ServerRegistration(app, serverId, server));
      });

      if (!config.serverGraphDuration) {
        logger.log('warn', '"serverGraphDuration" is not defined in config.json - defaulting to 3 minutes!');
        config.serverGraphDuration = 3 * 60 * 1000;
      }

      if (!config.logToDatabase) {
        logger.log('warn', 'Database logging is not enabled. You can enable it by setting "logToDatabase" to true in config.json. This requires sqlite3 to be installed.');

        app.handleReady();
      } else {
        app.loadDatabase(() => {
          app.handleReady();
        });
      }
    })
    .catch(error => {
      logger.log('error', `Failed to load servers: ${error.message}`);
    });
}

// Log initial reload interval and start the app
logger.log('info', `App started. Reloading every ${RELOAD_INTERVAL / 1000} seconds.`);
initializeApp();

// Reload the app based on the interval specified in config
setInterval(() => {
  logger.log('info', `Reloading app after ${RELOAD_INTERVAL / 1000} seconds...`);
  initializeApp(); // Re-initialize the app with fresh data
}, RELOAD_INTERVAL);
