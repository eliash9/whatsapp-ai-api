import type { BaileysEventEmitter } from '@adiwajshing/baileys';
export default function chatHandler(sessionId: string, event: BaileysEventEmitter): {
    listen: () => void;
    unlisten: () => void;
};
