# `src/games/`

Lifted Phaser scenes from the SolShot repo's per-game branches. **This folder is empty in the scaffold** — game code arrives after JJ + Fish coordinate the lift moment.

## Lift procedure (per game)

1. Check out the SolShot per-game branch locally:
   ```bash
   cd <solshot-repo>
   git checkout arcade/<game-slug>
   ```
2. Copy the game folder into this directory:
   ```bash
   cp -r client/src/games/<game-slug> <arcade-repo>/src/games/<game-slug>
   ```
3. In the arcade repo, you have two options for the `.js` → `.ts` transition:
   - **Quick:** rename files to `.ts`/`.tsx` and add `// @ts-nocheck` at the top of each. Strict mode stays happy, you defer typing.
   - **Proper:** convert types as you go. More work upfront, cleaner long-term.
4. Wire the route component in `src/routes/games/<Game>.tsx` to mount the scene:
   ```tsx
   import { useEffect, useRef } from 'react';
   import Phaser from 'phaser';
   import { sceneConfig } from '@/games/<game-slug>/scene';

   export function <Game>() {
     const containerRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
       if (!containerRef.current) return;
       const game = new Phaser.Game({
         parent: containerRef.current,
         // ...sceneConfig
       });
       return () => game.destroy(true);
     }, []);

     return <div ref={containerRef} style={{ width: '100%', height: '100dvh' }} />;
   }
   ```
5. Server-authoritative scoring stays unchanged. Use `submitScore()` from `@/api/client` to post results to the existing `/api/arcade/score` endpoint.
6. After all games lift, tag-and-archive the per-game SolShot branches:
   ```bash
   cd <solshot-repo>
   git tag arcade-<slug>-final-2026-xx-xx arcade/<game-slug>
   git push origin arcade-<slug>-final-2026-xx-xx
   # branch can be deleted after the tag is pushed
   ```

## Watchdog teardown

Phaser game instances hold their own RAF loop; on route navigation away, the `useEffect` cleanup must call `game.destroy(true)`. Otherwise the scene keeps simulating in the background — was the cause of the basketball "stuck bug" Fish chased for days (per `BALL_GAMES_PLAYBOOK.md`).
