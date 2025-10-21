import { Router } from 'express';
import { body } from 'express-validator';
import * as controller from '../controllers/session';
import validate from '../middlewares/request-validator';
import validateSession from '../middlewares/session-validator';

const router = Router();

router.get('/', controller.list);
router.get('/:sessionId', validateSession, controller.find);
router.get('/:sessionId/status', validateSession, controller.status);
router.post('/add', body('sessionId').isString().notEmpty(), validate, controller.add);
router.get('/:sessionId/add-sse', controller.addSSE);
router.delete('/:sessionId', validateSession, controller.del);

export default router;

