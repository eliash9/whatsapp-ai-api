"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const controller = __importStar(require("../controllers/ticket"));
const request_validator_1 = __importDefault(require("../middlewares/request-validator"));
const session_validator_1 = __importDefault(require("../middlewares/session-validator"));
const router = (0, express_1.Router)({ mergeParams: true });
// List tickets should not require active WA session; reads from DB only
router.get('/', (0, express_validator_1.query)('cursor').isNumeric().optional(), (0, express_validator_1.query)('limit').isNumeric().optional(), (0, express_validator_1.query)('status').isString().optional(), (0, express_validator_1.query)('q').isString().optional(), request_validator_1.default, controller.list);
// Detail tickets also reads from DB; do not require session
router.get('/:id', request_validator_1.default, controller.detail);
router.put('/:id', (0, express_validator_1.body)('status').isString().optional(), (0, express_validator_1.body)('subject').isString().optional(), (0, express_validator_1.body)('priority').isString().optional(), (0, express_validator_1.body)('assignedTo').isString().optional(), (0, express_validator_1.body)('slaDueAt').isString().optional(), request_validator_1.default, session_validator_1.default, controller.update);
router.post('/:id/reply', 
// allow text or media
(0, express_validator_1.body)('text').isString().optional(), (0, express_validator_1.body)('image').optional(), (0, express_validator_1.body)('video').optional(), (0, express_validator_1.body)('document').optional(), (0, express_validator_1.body)('assignedTo').isString().optional(), request_validator_1.default, session_validator_1.default, controller.reply);
router.post('/:id/close', request_validator_1.default, session_validator_1.default, controller.close);
// Clear ticket messages (only if closed)
router.delete('/:id/messages', request_validator_1.default, session_validator_1.default, controller.clearMessages);
// Delete ticket (only if closed)
router.delete('/:id', request_validator_1.default, session_validator_1.default, controller.remove);
router.post('/:id/remind', request_validator_1.default, session_validator_1.default, controller.remind);
router.post('/:id/escalate', request_validator_1.default, session_validator_1.default, controller.escalate);
router.post('/:id/read', request_validator_1.default, session_validator_1.default, controller.markRead);
// Media for ticket messages (images/videos)
router.get('/:id/media/:messagePkId', request_validator_1.default, session_validator_1.default, controller.media);
router.get('/:id/media/:messagePkId/meta', request_validator_1.default, session_validator_1.default, controller.mediaMeta);
// Per-ticket AI toggle
router.get('/:id/ai', request_validator_1.default, session_validator_1.default, controller.aiGet);
router.post('/:id/ai', (0, express_validator_1.body)('enabled').isBoolean(), request_validator_1.default, session_validator_1.default, controller.aiSet);
exports.default = router;
