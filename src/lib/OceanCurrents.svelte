<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    InstancedMesh,
    MeshBasicMaterial,
    Object3D,
  } from 'three';

  let {
    centerX = 0,
    centerZ = 0,
    headingX = 0,
    headingZ = -1,
    y = 0.5,
    radius = 25,
    count = 70,
    speed = 0.6,
  }: {
    centerX?: number;
    centerZ?: number;
    // Ambient current direction in world XZ. Particles drift in the OPPOSITE
    // direction. Read ONCE at mount — this is a fixed ambient current, not
    // tied to the submarine's live heading.
    headingX?: number;
    headingZ?: number;
    y?: number;
    // Half-extent of the particle field around (centerX, centerZ). Particles
    // that exit through the trailing edge get recycled to the leading edge.
    radius?: number;
    count?: number;
    speed?: number;
  } = $props();

  // Normalize heading + compute its perpendicular for lateral spread. Read
  // ONCE at mount: the ambient current is fixed for the session, so capturing
  // the initial prop values is the intended behavior (no per-frame churn).
  // svelte-ignore state_referenced_locally
  const hLen = Math.hypot(headingX, headingZ) || 1;
  // svelte-ignore state_referenced_locally
  const hX = headingX / hLen;
  // svelte-ignore state_referenced_locally
  const hZ = headingZ / hLen;
  const pX = -hZ;
  const pZ = hX;

  // Y-rotation so each triangle's local +Z aligns with the WORLD drift
  // direction (i.e., -heading). Computed once — heading is fixed for the
  // session, so re-rotating per-frame would be wasted work.
  const driftAngle = Math.atan2(-hX, -hZ);

  // Per-particle state in WORLD coords. Storing world (wx, wz) means the
  // field doesn't get dragged along as the follow-camera moves — particles
  // stay glued to their patch of sea, exactly like the wave-bobbing tiles.
  // We only consult (centerX, centerZ) to recycle particles that have
  // wandered out of the visible window around the submarine.
  type Particle = { wx: number; wz: number };
  const particles: Particle[] = [];
  // svelte-ignore state_referenced_locally
  const initialCount = count;
  // svelte-ignore state_referenced_locally
  const initialRadius = radius;
  // svelte-ignore state_referenced_locally
  const seedX = centerX;
  // svelte-ignore state_referenced_locally
  const seedZ = centerZ;
  for (let i = 0; i < initialCount; i++) {
    const fwd = (Math.random() * 2 - 1) * initialRadius;
    const lat = (Math.random() * 2 - 1) * initialRadius;
    particles.push({
      wx: seedX + fwd * hX + lat * pX,
      wz: seedZ + fwd * hZ + lat * pZ,
    });
  }

  // Tiny elongated triangle — narrow base, longer tip in +Z (which after
  // driftAngle rotation points in the world drift direction, so the tip
  // leads the motion). Reads as a foam streak rather than a wedge object.
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        -0.06, 0, 0,
         0.06, 0, 0,
         0,    0, 0.28,
      ]),
      3
    )
  );
  // depthWrite off so adjacent foam streaks don't z-fight against the wave
  // peaks of the hex tops. Soft icy-blue blends with the ocean palette.
  const material = new MeshBasicMaterial({
    color: '#dceefa',
    transparent: true,
    opacity: 0.45,
    side: DoubleSide,
    depthWrite: false,
  });

  // $state.raw: three.js mutates InstancedMesh.instanceMatrix internals on
  // every setMatrixAt — a deep $state Proxy would treat each mutation as
  // reactive and infinite-loop the useTask.
  let meshRef = $state.raw<InstancedMesh | undefined>(undefined);
  const dummy = new Object3D();
  dummy.rotation.set(0, driftAngle, 0);

  useTask((delta) => {
    const mesh = meshRef;
    if (!mesh) return;
    const drift = speed * delta;
    // World-space drift step (opposite to the ambient current heading).
    const dx = -hX * drift;
    const dz = -hZ * drift;
    // Recycle window — anything outside this sub-relative box gets
    // teleported to the leading edge. The lateral margin is a bit looser
    // than the forward one because a fast sub can shove every particle to
    // one side at once.
    const fwdLim = radius;
    const latLim = radius * 1.25;
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.wx += dx;
      p.wz += dz;
      // Project the particle's offset from the submarine onto the heading
      // basis to decide if it's still inside the visible window.
      const rx = p.wx - centerX;
      const rz = p.wz - centerZ;
      const fwd = rx * hX + rz * hZ;
      const lat = rx * pX + rz * pZ;
      if (fwd < -fwdLim || fwd > fwdLim || lat < -latLim || lat > latLim) {
        // Respawn at the leading edge with a fresh lateral offset.
        const newLat = (Math.random() * 2 - 1) * radius;
        p.wx = centerX + fwdLim * hX + newLat * pX;
        p.wz = centerZ + fwdLim * hZ + newLat * pZ;
      }
      dummy.position.set(p.wx, y, p.wz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
</script>

<T.InstancedMesh
  bind:ref={meshRef}
  args={[geometry, material, count]}
  renderOrder={1}
/>
