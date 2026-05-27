const express = require('express');
const router = express.Router();
const controller = require('../controllers/TournamentPredictionController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', controller.getMine);
router.put('/', controller.upsert);

module.exports = router;
