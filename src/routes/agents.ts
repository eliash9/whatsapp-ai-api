import { Router } from 'express';
import * as controller from '../controllers/agent';

const router = Router({ mergeParams: true });

router.get('/', controller.list);

export default router;

