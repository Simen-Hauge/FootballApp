const express = require('express');
const router = express.Router();
const controller = require('../controllers/GroupController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/player/:email', controller.getGroupsByPlayerEmail);
router.get('/:id', controller.getGroupById);
router.post('/createGroup', controller.createGroup);
router.post('/join', controller.joinGroupByCode);
router.patch('/:groupId', controller.renameGroup);
router.delete('/:groupId', controller.deleteGroup);
router.post('/:groupId/addPlayer', controller.addPlayerToGroup);
router.post('/:groupId/removePlayer', controller.removePlayerFromGroup);
router.post('/:groupId/transferOwnership', controller.transferOwnership);
router.post('/:groupId/resetPlayerScores', controller.resetPlayerScores);

module.exports = router;
