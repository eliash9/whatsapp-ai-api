import { Router } from 'express';
import { body, query } from 'express-validator';
import * as controller from '../controllers/contact';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router({ mergeParams: true });

router.get(
  '/',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  validate,
  validateSession,
  controller.list,
);

router.get('/blocklist', validateSession, controller.listBlocked);

router.post(
  '/blocklist/update',
  body('jid').isString().notEmpty(),
  body('action').isString().isIn(['block', 'unblock']).optional(),
  validate,
  validateSession,
  controller.updateBlock,
);

router.get('/:jid', validateSession, controller.check);
router.get('/:jid/photo', validateSession, controller.photo);

export default router;
