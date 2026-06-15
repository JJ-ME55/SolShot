/**
 * Server-side mirror of Fish's track centerline path.
 *   The-Arcade/src/games/critter-kart/game/logic/trackPath.ts (177 lines)
 *
 * Closed-loop centerline sampled from Catmull-Rom control points (centripetal
 * alpha=0.5 — guaranteed not to cusp or self-intersect). Drives:
 *   - on-track tests (kart on grass slows down)
 *   - lap progress (0..1 around the loop)
 *   - bot racing line (lookahead targets)
 *   - server-side spawn positions (startPose + lateral offset)
 *
 * Framework-free. Pure JS port — no THREE.js, no browser APIs.
 */

const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });

/**
 * Centripetal Catmull-Rom (alpha = 0.5). Returns the point at t∈[0,1] from p1→p2.
 */
function centripetal(p0, p1, p2, p3, t) {
    const tj = (ti, a, b) => ti + Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)) || ti + 1e-4;
    const t0 = 0;
    const t1 = tj(t0, p0, p1);
    const t2 = tj(t1, p1, p2);
    const t3 = tj(t2, p2, p3);
    const T = t1 + t * (t2 - t1);
    const A1 = lerp(p0, p1, (T - t0) / (t1 - t0 || 1));
    const A2 = lerp(p1, p2, (T - t1) / (t2 - t1 || 1));
    const A3 = lerp(p2, p3, (T - t2) / (t3 - t2 || 1));
    const B1 = lerp(A1, A2, (T - t0) / (t2 - t0 || 1));
    const B2 = lerp(A2, A3, (T - t1) / (t3 - t1 || 1));
    return lerp(B1, B2, (T - t1) / (t2 - t1 || 1));
}

/** Sample a smooth closed loop through the control points. */
export function buildClosedPath(control, samplesPerSegment) {
    const n = control.length;
    const out = [];
    for (let i = 0; i < n; i++) {
        const p0 = control[(i - 1 + n) % n];
        const p1 = control[i];
        const p2 = control[(i + 1) % n];
        const p3 = control[(i + 2) % n];
        for (let s = 0; s < samplesPerSegment; s++) {
            out.push(centripetal(p0, p1, p2, p3, s / samplesPerSegment));
        }
    }
    return out;
}

export class TrackPath {
    constructor(def) {
        this.name = def.name;
        this.halfWidth = def.halfWidth;
        this.laps = def.laps;
        this.jumpZone = def.jumpZone;
        this.bridgeZone = def.bridgeZone;
        this.archBridgeZone = def.archBridgeZone;
        this.upperDeckZone = def.upperDeckZone;
        this.skywalk = def.skywalk;
        this.boardwalkZone = def.boardwalkZone;
        this.widthProfile = def.widthProfile;
        this.points = buildClosedPath(def.control, def.samplesPerSegment ?? 24);

        const n = this.points.length;
        this.segLen = new Array(n);
        this.cumLen = new Array(n);
        let acc = 0;
        for (let i = 0; i < n; i++) {
            const a = this.points[i];
            const b = this.points[(i + 1) % n];
            this.cumLen[i] = acc;
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            this.segLen[i] = len;
            acc += len;
        }
        this.totalLength = acc;
    }

    nearest(x, z) {
        const pts = this.points;
        const n = pts.length;
        let best = { segment: 0, t: 0, distance: Infinity, progress: 0, px: 0, pz: 0 };
        for (let i = 0; i < n; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % n];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len2 = dx * dx + dz * dz;
            let t = len2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const px = a.x + dx * t;
            const pz = a.z + dz * t;
            // squared-distance compare, one sqrt at the end — this scan runs
            // ~10-30x per 60Hz tick; hypot-per-segment dominated the budget
            const ox = x - px, oz = z - pz;
            const d2 = ox * ox + oz * oz;
            if (d2 < best.distance) {
                const along = this.cumLen[i] + t * this.segLen[i];
                best = { segment: i, t, distance: d2, progress: along / this.totalLength, px, pz };
            }
        }
        best.distance = Math.sqrt(best.distance);
        return best;
    }

    /** Road half-width at a progress, honoring widthProfile narrowing. MUST be
     *  byte-identical to the client (game/logic/trackPath.ts halfWidthAt). */
    halfWidthAt(progress) {
        if (!this.widthProfile) return this.halfWidth;
        const p = ((progress % 1) + 1) % 1;
        let mult = 1;
        for (const z of this.widthProfile) {
            if (p < z.startProgress || p > z.endProgress) continue;
            const span = z.endProgress - z.startProgress;
            const e = Math.min(0.025, span / 2);
            const tIn = Math.min(p - z.startProgress, z.endProgress - p);
            const k = e > 0 ? Math.min(1, tIn / e) : 1;
            const s = k * k * (3 - 2 * k); // smoothstep
            const m = 1 + (z.halfWidthMult - 1) * s;
            if (m < mult) mult = m; // narrowest wins where zones overlap
        }
        return this.halfWidth * mult;
    }

    isOnTrack(x, z) {
        const q = this.nearest(x, z);
        return q.distance < this.halfWidthAt(q.progress);
    }

    pointAtProgress(progress) {
        const p = ((progress % 1) + 1) % 1;
        const targetArc = p * this.totalLength;
        const n = this.points.length;
        let i = 0;
        while (i < n - 1 && this.cumLen[i + 1] <= targetArc) i++;
        const t = this.segLen[i] > 0 ? (targetArc - this.cumLen[i]) / this.segLen[i] : 0;
        const a = this.points[i];
        const b = this.points[(i + 1) % n];
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }

    startPose() {
        const a = this.points[0];
        const b = this.points[1 % this.points.length];
        return { x: a.x, z: a.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }

    /**
     * Server-only: stagger N karts back from the start line with lateral
     * offset so they don't spawn on top of each other. Returns array of
     * {x, z, heading} per slot index.
     *
     * 6-kart grid: 3 rows of 2, staggered ~6 units apart along the start
     * line, ~5 units back per row. Fits within halfWidth=18 comfortably.
     */
    startGrid(n) {
        const pose = this.startPose();
        // Perpendicular vector (right of facing direction)
        const px = Math.cos(pose.heading);
        const pz = -Math.sin(pose.heading);
        // Backward vector (opposite of facing)
        const bx = -Math.sin(pose.heading);
        const bz = -Math.cos(pose.heading);
        const ROW_SPACING = 5;
        const COL_SPACING = 6;
        const COLS = 2;
        const grid = [];
        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const lateral = (col - (COLS - 1) / 2) * COL_SPACING;
            const back = row * ROW_SPACING;
            grid.push({
                x: pose.x + px * lateral + bx * back,
                z: pose.z + pz * lateral + bz * back,
                heading: pose.heading,
            });
        }
        return grid;
    }
}
