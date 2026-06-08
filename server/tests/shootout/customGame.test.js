/**
 * Tests for the SHOOTOUT /customgame Telegram wizard (Phase 4,
 * 2026-06-08). Pure-function tests on the configFlow state machine
 * and the lobbyCard formatters — the Telegraf handlers in
 * customGame/index.js are exercised by manual bot testing.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    beginConfig, getConfig, updateConfig, endConfig, nextStep, _clearAll,
} from '../../services/games/shootout/customGame/configFlow.js';
import {
    wizardCard, lobbyCard, cancelledCard,
} from '../../services/games/shootout/customGame/lobbyCard.js';

// ── configFlow ─────────────────────────────────────────────────────

test('configFlow: beginConfig stores state keyed by chatId-userId', () => {
    _clearAll();
    const { state } = beginConfig(-1001, 5952074323);
    assert.equal(state.chatId, -1001);
    assert.equal(state.userId, 5952074323);
    assert.equal(state.step, 'mode');
    assert.equal(state.mode, null);
    assert.equal(state.gameType, null);
    assert.ok(state.lastTouchedAt);
});

test('configFlow: getConfig returns null for an unknown user', () => {
    _clearAll();
    assert.equal(getConfig(-1001, 1), null);
});

test('configFlow: updateConfig patches + refreshes lastTouchedAt', () => {
    _clearAll();
    beginConfig(-1001, 1);
    const t0 = getConfig(-1001, 1).lastTouchedAt;
    // Sleep 5ms — node:test mock timers would interfere with real time
    // so this is just a 'large enough' delta to be reliable.
    const end = Date.now() + 5;
    while (Date.now() < end) { /* spin */ }
    const w = updateConfig(-1001, 1, { mode: '1v1' });
    assert.equal(w.mode, '1v1');
    assert.ok(w.lastTouchedAt > t0);
});

test('configFlow: same user in two chats has independent state', () => {
    _clearAll();
    beginConfig(-1001, 5, null);
    beginConfig(-2002, 5, null);
    updateConfig(-1001, 5, { mode: '1v1' });
    updateConfig(-2002, 5, { mode: '2v2' });
    assert.equal(getConfig(-1001, 5).mode, '1v1');
    assert.equal(getConfig(-2002, 5).mode, '2v2');
});

test('configFlow: endConfig removes the user from the wizard map', () => {
    _clearAll();
    beginConfig(-1001, 1);
    endConfig(-1001, 1);
    assert.equal(getConfig(-1001, 1), null);
});

test('configFlow: nextStep walks mode -> wager -> review', () => {
    assert.equal(nextStep({ mode: null, gameType: null }),       'mode');
    assert.equal(nextStep({ mode: '1v1', gameType: null }),       'wager');
    assert.equal(nextStep({ mode: '1v1', gameType: 'friendly' }), 'review');
    assert.equal(nextStep({ mode: '2v2', gameType: 'wager' }),    'review');
});

// ── lobbyCard / wizardCard ─────────────────────────────────────────

test('wizardCard: mode step shows 1v1 + 2v2 buttons', () => {
    const card = wizardCard({ mode: null, gameType: null });
    assert.match(card.text, /Pick a mode/);
    const buttons = card.keyboard.inline_keyboard.flat();
    const datas = buttons.map(b => b.callback_data);
    assert.ok(datas.includes('sg_cfg_mode_1v1'));
    assert.ok(datas.includes('sg_cfg_mode_2v2'));
});

test('wizardCard: wager step shows friendly + wager + back', () => {
    const card = wizardCard({ mode: '1v1', gameType: null });
    assert.match(card.text, /Mode:\s*<b>1v1<\/b>/);
    const buttons = card.keyboard.inline_keyboard.flat();
    const datas = buttons.map(b => b.callback_data);
    assert.ok(datas.includes('sg_cfg_wager_friendly'));
    assert.ok(datas.includes('sg_cfg_wager_wager'));
    assert.ok(datas.includes('sg_cfg_back'));
});

test('wizardCard: review step shows back + create', () => {
    const card = wizardCard({ mode: '2v2', gameType: 'friendly' });
    assert.match(card.text, /Ready to create the lobby/);
    const buttons = card.keyboard.inline_keyboard.flat();
    const datas = buttons.map(b => b.callback_data);
    assert.ok(datas.includes('sg_cfg_back'));
    assert.ok(datas.includes('sg_create'));
});

test('lobbyCard: renders code + members + Join URL deep-link', () => {
    const lobby = {
        lobbyId: 'L1', code: 'ABCDEF', mode: '1v1', cap: 2,
        gameType: 'friendly',
        members: [
            { telegramUserId: 1, displayName: '@host', isHost: true },
            { telegramUserId: 2, displayName: '@joiner' },
        ],
    };
    const card = lobbyCard(lobby, 'TheArcadegg_bot');
    assert.match(card.text, /<code>ABCDEF<\/code>/);
    assert.match(card.text, /@host/);
    assert.match(card.text, /@joiner/);
    assert.match(card.text, /Slots:\s*<b>2\/2<\/b>/);
    const joinBtn = card.keyboard.inline_keyboard[0][0];
    assert.match(joinBtn.url, /^https:\/\/t\.me\/TheArcadegg_bot\?start=sg_ABCDEF$/);
    const cancelBtn = card.keyboard.inline_keyboard[1][0];
    assert.equal(cancelBtn.callback_data, 'sg_cancel_ABCDEF');
});

test('lobbyCard: missing botUsername falls back to callback_data button', () => {
    const lobby = { lobbyId: 'L1', code: 'XYZ123', mode: '1v1', cap: 2, gameType: 'friendly', members: [] };
    const card = lobbyCard(lobby, null);
    const joinBtn = card.keyboard.inline_keyboard[0][0];
    assert.equal(joinBtn.url, undefined);
    assert.equal(joinBtn.callback_data, 'sg_join_XYZ123');
});

test('lobbyCard: wager type rendered as Wagered (v2)', () => {
    const lobby = { lobbyId: 'L1', code: 'WAGE01', mode: '2v2', cap: 4, gameType: 'wager', members: [] };
    const card = lobbyCard(lobby, 'bot');
    assert.match(card.text, /Type:\s*<b>Wagered \(v2\)<\/b>/);
});

test('cancelledCard: marks cancelled + no keyboard', () => {
    const card = cancelledCard({ code: 'ABCDEF' });
    assert.match(card.text, /Cancelled by host/);
    assert.equal(card.keyboard, null);
});
