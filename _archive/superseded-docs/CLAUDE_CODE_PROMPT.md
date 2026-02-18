You are working on SolShot — a browser-based multiplayer artillery game on Solana. The codebase is a fork of pocket-tanks (Phaser.js + React + Express + Socket.IO).

## CRITICAL: Read these files FIRST before writing ANY code

1. Read `SOLSHOT_GSD_SPEC.md` in the repo root — this is your master execution plan
2. Read `SOLSHOT_BUILD_DOC.md` if present — this is the full design document

## Context

- Repo: github.com/JJ-ME55/SolShot
- Branch: `dev` (always work on dev, never push to main)
- Stack: React 18 + Phaser 3.55 (client), Express + Socket.IO (server), MongoDB Atlas (database)
- The game currently works as a basic relay — server passes messages, all physics run client-side
- We are converting it to a server-authoritative architecture for real-money wagering

## Your Task

Execute the GSD spec starting at **Phase 1, Task 1.1**. Work through tasks sequentially. For each task:

1. Read the task description in the spec
2. Implement it
3. Test it works (run the server/client if needed)
4. Commit with message format: `Phase 1.X: <description>`
5. Move to the next task

## Key Rules

- NEVER delete weapon classes from Standard.js — only trim imports in array.js
- Keep all existing Socket.IO events working while adding new ones
- Server physics must match client physics exactly — extract, don't approximate
- All Gold/economy logic is server-side only, client just displays
- Wallet address = user identity, no emails or passwords
- Keep existing Phaser scene flow (Scene1→2→3→4→5→Main)
- Test multiplayer with 2 browser tabs (localhost:3000, create room tab 1, join tab 2)

## Environment

- MongoDB connection string is in `server/.env` as MONGODB_URI
- Solana devnet wallet at `~/.config/solana/solshot-dev.json`
- Server runs on port 5001 (`cd server && npm start`)
- Client runs on port 3000 (`cd client && npm start`)

## Weapon Roster (13 for launch)

IDs to keep in array.js: 0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 15, 16
All other weapon IDs removed from array.js imports only (classes stay in Standard.js)

5 additional prestige-only weapons for later: IDs 21, 24, 26, 27, 29

Start now. Read the spec, then begin Task 1.1.
