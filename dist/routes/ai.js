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
const request_validator_1 = __importDefault(require("../middlewares/request-validator"));
const session_validator_1 = __importDefault(require("../middlewares/session-validator"));
const controller = __importStar(require("../controllers/ai"));
const router = (0, express_1.Router)({ mergeParams: true });
router.get('/', session_validator_1.default, controller.getConfig);
router.put('/', (0, express_validator_1.body)('enabled').isBoolean().optional(), (0, express_validator_1.body)('prompt').isString().optional(), (0, express_validator_1.body)('model').isString().optional(), (0, express_validator_1.body)('temp').isNumeric().optional(), request_validator_1.default, session_validator_1.default, controller.upsertConfig);
router.post('/test', (0, express_validator_1.body)('text').isString().notEmpty(), request_validator_1.default, session_validator_1.default, controller.testReply);
// Optional GET testing: /:sessionId/ai/test?text=...
router.get('/test', session_validator_1.default, controller.testReply);
exports.default = router;
