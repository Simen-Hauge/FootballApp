const express = require('express');
const router = express.Router();
const controller = require('../controllers/TournamentResultController');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');

router.use(requireAuth);

// Read access is open to any authenticated user — they need to see the
// outcome once it's finalized. Write access is admin-only.
router.get('/', controller.get);
router.put('/', requireAdmin, controller.upsertManual);

module.exports = router;
