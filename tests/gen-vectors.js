'use strict';

// The frozen reference computes day keys in local time; pin the zone so vectors are reproducible.
process.env.TZ = 'UTC';

const { main } = require('./gen/main.js');

main();
