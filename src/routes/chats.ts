import { Router } from 'express';
import { query } from 'express-validator';
import * as controller from '../controllers/chat';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router({ mergeParams: true });

// Table variant: include contact name/preview, supports search
router.get(
  '/table',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  query('q').isString().optional(),
  validate,
  validateSession,
  controller.listTable,
);

router.get(
  '/',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  validate,
  controller.list,
);

router.get(
  '/:jid',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  validate,
  controller.find,
);

// Table variant: include contact name/preview, supports search
router.get(
  '/table',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  query('q').isString().optional(),
  validate,
  validateSession,
  controller.listTable,
);

export default router;
