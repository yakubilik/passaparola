// `node --test test/` runs this folder as a single file (Node resolves it to
// index.js), so load every suite from here. `npm test` globs them directly.
const fs = require('fs');
const path = require('path');

fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()
  .forEach(f => require(path.join(__dirname, f)));
