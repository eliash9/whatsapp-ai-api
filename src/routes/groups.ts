import { Router } from 'express';
import { query } from 'express-validator';
import * as controller from '../controllers/group';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router({ mergeParams: true });

router.get(
  '/',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  validate,
  controller.list,
);

router.get('/:jid', validateSession, controller.find);
router.get('/:jid/photo', validateSession, controller.photo);

export default router;

