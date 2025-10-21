import { Router } from 'express';
import { body, query } from 'express-validator';
import * as controller from '../controllers/ticket';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router({ mergeParams: true });

// List tickets should not require active WA session; reads from DB only
router.get(
  '/',
  query('cursor').isNumeric().optional(),
  query('limit').isNumeric().optional(),
  query('status').isString().optional(),
  query('q').isString().optional(),
  validate,
  controller.list,
);

// Detail tickets also reads from DB; do not require session
router.get('/:id', validate, controller.detail);

router.put(
  '/:id',
  body('status').isString().optional(),
  body('subject').isString().optional(),
  body('priority').isString().optional(),
  body('assignedTo').isString().optional(),
  body('slaDueAt').isString().optional(),
  validate,
  validateSession,
  controller.update,
);

router.post(
  '/:id/reply',
  // allow text or media
  body('text').isString().optional(),
  body('image').optional(),
  body('video').optional(),
  body('document').optional(),
  body('assignedTo').isString().optional(),
  validate,
  validateSession,
  controller.reply,
);

router.post(
  '/:id/close',
  validate,
  validateSession,
  controller.close,
);

// Clear ticket messages (only if closed)
router.delete(
  '/:id/messages',
  validate,
  validateSession,
  controller.clearMessages,
);

// Delete ticket (only if closed)
router.delete(
  '/:id',
  validate,
  validateSession,
  controller.remove,
);

router.post(
  '/:id/remind',
  validate,
  validateSession,
  controller.remind,
);

router.post(
  '/:id/escalate',
  validate,
  validateSession,
  controller.escalate,
);

router.post(
  '/:id/read',
  validate,
  validateSession,
  controller.markRead,
);

// Media for ticket messages (images/videos)
router.get(
  '/:id/media/:messagePkId',
  validate,
  validateSession,
  controller.media,
);

router.get(
  '/:id/media/:messagePkId/meta',
  validate,
  validateSession,
  controller.mediaMeta,
);

// Per-ticket AI toggle
router.get(
  '/:id/ai',
  validate,
  validateSession,
  controller.aiGet,
);

router.post(
  '/:id/ai',
  body('enabled').isBoolean(),
  validate,
  validateSession,
  controller.aiSet,
);

export default router;
