import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'walletAddress',
            'wallet',
            'winner',
            'loser',
            'player',
            'p1wallet',
            'p2wallet',
            'winnerAddress',
            'loserAddress',
            '*.walletAddress',
            '*.wallet',
        ],
        censor: '[REDACTED]',
    },
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
});

export default logger;
