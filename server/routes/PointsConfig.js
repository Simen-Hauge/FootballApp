const express = require('express');
const router = express.Router();
const POINTS_CONFIG = require('../utils/pointsConfig');

// Public, unauthenticated read of the point values used everywhere. The
// mobile client fetches this once on startup to keep the "How points work"
// popup synchronized with the server's actual scoring logic.
router.get('/', (req, res) => {
  res.json(POINTS_CONFIG);
});

module.exports = router;
