import type { BaileysEventEmitter } from '@adiwajshing/baileys';
export default function contactHandler(sessionId: string, event: BaileysEventEmitter): {
    listen: () => void;
    unlisten: () => void;
};
