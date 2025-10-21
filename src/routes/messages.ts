import { Router } from 'express';
import { body, query } from 'express-validator';
import * as controller from '../controllers/message';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router({ mergeParams: true });

router.get(
  '/',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  query('direction').isString().optional(),
  validate,
  validateSession,
  controller.list,
);

router.get(
  '/stats',
  validate,
  validateSession,
  controller.stats,
);

router.get(
  '/stats/7d',
  validate,
  validateSession,
  controller.stats7d,
);

router.get(
  '/table',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  query('direction').isString().optional(),
  query('jid').isString().optional(),
  query('q').isString().optional(),
  validate,
  validateSession,
  controller.listTable,
);

router.post(
  '/send',
  body('jid').isString().notEmpty(),
  body('type').isString().isIn(['group', 'number']).optional(),
  body('message').isObject().notEmpty(),
  body('options').isObject().optional(),
  validate,
  validateSession,
  controller.send,
);

router.post(
  '/send/bulk',
  body().isArray().notEmpty(),
  validate,
  validateSession,
  controller.sendBulk,
);

router.post(
  '/download',
  body().isObject().notEmpty(),
  validate,
  validateSession,
  controller.download,
);

export default router;
