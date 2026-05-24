const express = require('express');
const router = express.Router();
const playerController = require('../controllers/PlayerController');
const { requireAuth } = require('../middleware/auth');

// All `/api/account` routes operate on the caller's own account — identity
// comes from the JWT, never the URL. Mounted separately from `/api/players/:id`
// because account-level actions (delete, future export) don't take an id.
router.use(requireAuth);

router.delete('/', playerController.deleteAccount);

module.exports = router;
