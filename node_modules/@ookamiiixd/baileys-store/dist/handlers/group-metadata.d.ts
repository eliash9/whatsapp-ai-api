import type { BaileysEventEmitter } from '@adiwajshing/baileys';
export default function groupMetadataHandler(sessionId: string, event: BaileysEventEmitter): {
    listen: () => void;
    unlisten: () => void;
};
