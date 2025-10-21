import { Router } from 'express';

import chats from './chats';
import contacts from './contacts';
import groups from './groups';
import messages from './messages';
import sessions from './sessions';
import ai from './ai';
import agents from './agents';
import tickets from './tickets';
import quickReplies from './quickreplies';

const router = Router();

router.use('/sessions', sessions);
router.use('/:sessionId/chats', chats);
router.use('/:sessionId/contacts', contacts);
router.use('/:sessionId/groups', groups);
router.use('/:sessionId/messages', messages);
router.use('/:sessionId/ai', ai);
router.use('/agents', agents);
router.use('/:sessionId/tickets', tickets);
// API prefix to avoid collision with static dashboard folder
router.use('/api/quick-replies', quickReplies);

export default router;
