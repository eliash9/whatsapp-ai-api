import { Router } from 'express';
import * as controller from '../controllers/quickreply';

const router = Router({ mergeParams: true });

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

export default router;

