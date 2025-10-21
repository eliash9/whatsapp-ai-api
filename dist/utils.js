"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDataUrl = exports.delay = void 0;
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.delay = delay;
function parseDataUrl(dataUrl) {
    try {
        if (!dataUrl || typeof dataUrl !== 'string')
            return null;
        const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (!match)
            return null;
        const mimetype = match[1];
        const b64 = match[2];
        const buffer = Buffer.from(b64, 'base64');
        return { buffer, mimetype };
    }
    catch (_a) {
        return null;
    }
}
exports.parseDataUrl = parseDataUrl;
