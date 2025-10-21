import type { BaileysEventEmitter } from '@adiwajshing/baileys';
export default function messageHandler(sessionId: string, event: BaileysEventEmitter): {
    listen: () => void;
    unlisten: () => void;
};
