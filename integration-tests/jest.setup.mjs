// const dotenv = require('dotenv');
// const path = require('node:path');

// IMPORTANT: Its mock nodejs timers
// jest.useFakeTimers();

jest.setTimeout(90000);

afterAll(() => {
  ['SIGINT','SIGTERM','beforeExit','exit','uncaughtException','unhandledRejection','message']
    .forEach((ev) => process.removeAllListeners(ev));
});
