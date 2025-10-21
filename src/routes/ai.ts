import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';
import * as controller from '../controllers/ai';

const router = Router({ mergeParams: true });

router.get('/', validateSession, controller.getConfig);
router.put(
  '/',
  body('enabled').isBoolean().optional(),
  body('prompt').isString().optional(),
  body('model').isString().optional(),
  body('temp').isNumeric().optional(),
  validate,
  validateSession,
  controller.upsertConfig,
);
router.post('/test', body('text').isString().notEmpty(), validate, validateSession, controller.testReply);
// Optional GET testing: /:sessionId/ai/test?text=...
router.get('/test', validateSession, controller.testReply);

export default router;
