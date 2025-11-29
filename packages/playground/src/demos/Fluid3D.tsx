import React, { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec3f, vec4f, f32, Camera, u32, SyncMode } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';
import { useUniforms, UniformControls } from '../hooks/useUniforms';

const uniformsSchema = {
    smoothingRadius: { value: 0.2, min: 0.05, max: 0.5, step: 0.01 },
    restDensity: { value: 100.0, min: 10.0, max: 200.0, step: 10.0 },
    gasConstant: { value: 100.0, min: 10.0, max: 500.0, step: 10.0 },
    viscosity: { value: 3.0, min: 0.0, max: 10.0, step: 0.1 },
    mass: { value: 0.5, min: 0.1, max: 5.0, step: 0.1 },
    dt: { value: 0.01, min: 0.001, max: 0.1, step: 0.001 },
    boundaryLimit: { value: 3.0, min: 0.5, max: 5.0, step: 0.1 },
};

// SPH Parameters
interface Params {
    gravity: vec4f;
    numParticles: u32;
    smoothingRadius: f32;
    restDensity: f32;
    gasConstant: f32;
    viscosity: f32;
    mass: f32;
    dt: f32;
    boundaryLimit: f32;
}

/** @device */
function poly6Kernel(r2: f32, h: f32): f32 {
    if (r2 < 0.0 || r2 > h * h) return 0.0;
    const diff = h * h - r2;
    return (315.0 / (64.0 * 3.14159 * pow(h, 9.0))) * diff * diff * diff;
}

/** @device */
function spikyKernelGrad(r: vec3f, dist: f32, h: f32): vec3f {
    if (dist <= 0.0 || dist > h) return vec3f(0.0, 0.0, 0.0);
    const diff = h - dist;
    const scale = -45.0 / (3.14159 * pow(h, 6.0));
    return r * (scale * diff * diff / dist);
}

/** @device */
function viscosityKernelLap(dist: f32, h: f32): f32 {
    if (dist <= 0.0 || dist > h) return 0.0;
    const diff = h - dist;
    return (45.0 / (3.14159 * pow(h, 6.0))) * diff;
}

/** @kernel @workgroup_size(64) */
async function computeDensityPressure(
    pos: SharedArray<vec3f>,
    density: SharedArray<f32>,
    pressure: SharedArray<f32>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    // @ts-ignore
    const pi = pos[i];
    let d = 0.0;

    for (let j: u32 = 0; j < params.numParticles; j++) {
        // @ts-ignore
        const pj = pos[j];
        const r = pi - pj;
        const r2 = dot(r, r);

        if (r2 < params.smoothingRadius * params.smoothingRadius) {
            d = d + params.mass * poly6Kernel(r2, params.smoothingRadius);
        }
    }

    // @ts-ignore
    density[i] = d;
    // @ts-ignore
    pressure[i] = params.gasConstant * (d - params.restDensity);
}

/** @kernel @workgroup_size(64) */
async function computeForces(
    pos: SharedArray<vec3f>,
    vel: SharedArray<vec3f>,
    density: SharedArray<f32>,
    pressure: SharedArray<f32>,
    force: SharedArray<vec3f>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    // @ts-ignore
    const pi = pos[i];
    // @ts-ignore
    const vi = vel[i];
    // @ts-ignore
    const di = density[i];
    // @ts-ignore
    const pri = pressure[i];

    let pressureForce = vec3f(0.0, 0.0, 0.0);
    let viscosityForce = vec3f(0.0, 0.0, 0.0);

    for (let j: u32 = 0; j < params.numParticles; j++) {
        if (i == j) continue;

        // @ts-ignore
        const pj = pos[j];
        // @ts-ignore
        const vj = vel[j];
        // @ts-ignore
        const dj = density[j];
        // @ts-ignore
        const prj = pressure[j];

        const r = pi - pj;
        const dist = length(r);

        if (dist < params.smoothingRadius) {
            const grad = spikyKernelGrad(r, dist, params.smoothingRadius);
            pressureForce = pressureForce - grad * (params.mass * (pri + prj) / (2.0 * dj));

            const lap = viscosityKernelLap(dist, params.smoothingRadius);
            viscosityForce = viscosityForce + (vj - vi) * (lap * (params.mass / dj));
        }
    }

    viscosityForce = viscosityForce * params.viscosity;

    // @ts-ignore
    force[i] = pressureForce + viscosityForce + params.gravity.xyz * di; // Gravity applied as body force density
}

/** @kernel @workgroup_size(64) */
async function integrate(
    pos: SharedArray<vec3f>,
    vel: SharedArray<vec3f>,
    force: SharedArray<vec3f>,
    density: SharedArray<f32>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    // @ts-ignore
    let p = pos[i];
    // @ts-ignore
    let v = vel[i];
    // @ts-ignore
    const f = force[i];
    // @ts-ignore
    const d = density[i];

    // Update velocity
    if (d > 0.001) {
        v = v + (f / d) * params.dt;
    }

    // Update position
    p = p + v * params.dt;

    // Boundary conditions (Box -1 to 1)
    const limit = params.boundaryLimit;
    const damping = -0.5;

    if (p.x < -limit) { p.x = -limit; v.x = v.x * damping; }
    if (p.x > limit) { p.x = limit; v.x = v.x * damping; }
    if (p.y < -limit) { p.y = -limit; v.y = v.y * damping; }
    if (p.y > limit) { p.y = limit; v.y = v.y * damping; }
    if (p.z < -limit) { p.z = -limit; v.z = v.z * damping; }
    if (p.z > limit) { p.z = limit; v.z = v.z * damping; }

    // @ts-ignore
    pos[i] = p;
    // @ts-ignore
    vel[i] = v;
}

export default function Fluid3D() {
    const { canvasRef, isReady } = useCanvas();
    const fpsRef = useRef<HTMLDivElement>(null);
    const { uniforms, uiValues, setUniform, schema } = useUniforms(uniformsSchema);

    useEffect(() => {
        if (!isReady) return;

        let animating = true;
        const camera = new Camera();
        const canvas = canvasRef.current;
        if (canvas) {
            camera.attach(canvas);
            camera.distance = 12;
            camera.azimuth = 0.2;
            camera.center = vec3f(-uniforms.current.boundaryLimit * 0.25, 0, 0);
            camera.update();
        }

        const init = async () => {
            const NUM_PARTICLES = 4096;
            const pos = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const vel = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const force = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const density = new SharedArray(f32, NUM_PARTICLES, SyncMode.None);
            const pressure = new SharedArray(f32, NUM_PARTICLES, SyncMode.None);
            const sizes = new SharedArray(vec3f, NUM_PARTICLES);
            const colors = new SharedArray(vec3f, NUM_PARTICLES);

            // Initialize particles in a block (Dam Break)
            const bounds = uniforms.current.boundaryLimit;
            const spacing = 0.2; // Fixed spacing for liquid behavior

            // Start from the corner of the boundary
            const startX = -bounds + spacing / 2;
            const startY = -bounds + spacing / 2;
            const startZ = -bounds + spacing / 2;

            // Calculate dimensions of the dam column (Left 25% of width)
            const damWidth = (bounds * 2) * 0.25;
            const countX = Math.floor(damWidth / spacing);
            const countZ = Math.floor((bounds * 2) / spacing);

            for (let i = 0; i < NUM_PARTICLES; i++) {
                const iz = i % countZ;
                const ix = Math.floor(i / countZ) % countX;
                const iy = Math.floor(i / (countZ * countX));

                const px = startX + ix * spacing;
                const py = startY + iy * spacing;
                const pz = startZ + iz * spacing;

                pos.set(i, [
                    px + (Math.random() - 0.5) * 0.01,
                    py + (Math.random() - 0.5) * 0.01,
                    pz + (Math.random() - 0.5) * 0.01
                ]);

                vel.set(i, [0.0, 0.0, 0.0]);
                force.set(i, [0.0, 0.0, 0.0]);

                sizes.set(i, [0.07, 0.07, 0.07]);
                colors.set(i, [0.2, 0.5, 1.0]);
            }

            // Manually sync to device since we used SyncMode.None
            if (runtime.device) {
                await pos.syncToDevice(runtime.device);
                await vel.syncToDevice(runtime.device);
                await force.syncToDevice(runtime.device);
                // density and pressure are computed on GPU, no need to sync
            }

            let frameCount = 0;
            let lastFpsTime = performance.now();

            const animate = async () => {
                if (!animating) return;

                // FPS Calculation
                const now = performance.now();
                frameCount++;
                if (now - lastFpsTime >= 1000) {
                    const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
                    if (fpsRef.current) {
                        fpsRef.current.innerText = `FPS: ${fps}`;
                    }
                    frameCount = 0;
                    lastFpsTime = now;
                }

                // Update params from uniforms
                const currentParams = {
                    gravity: vec4f(0.0, -9.8, 0.0, 0.0),
                    numParticles: u32(NUM_PARTICLES),
                    smoothingRadius: f32(uniforms.current.smoothingRadius),
                    restDensity: f32(uniforms.current.restDensity),
                    gasConstant: f32(uniforms.current.gasConstant),
                    viscosity: f32(uniforms.current.viscosity),
                    mass: f32(uniforms.current.mass),
                    dt: f32(uniforms.current.dt),
                    boundaryLimit: f32(uniforms.current.boundaryLimit)
                };

                // Simulation steps
                const groupCount: u32 = Math.ceil(currentParams.numParticles / 64);
                // @ts-ignore
                await computeDensityPressure<[groupCount, 1, 1]>(pos, density, pressure, currentParams);
                // @ts-ignore
                await computeForces<[groupCount, 1, 1]>(pos, vel, density, pressure, force, currentParams);
                // @ts-ignore
                await integrate<[groupCount, 1, 1]>(pos, vel, force, density, currentParams);

                // Render
                runtime.clear([0.1, 0.1, 0.1, 1.0], 1.0);
                runtime.spheres(pos, sizes, colors, { camera });

                requestAnimationFrame(animate);
            };

            animate();
        };

        init();

        return () => {
            animating = false;
            camera.detach();
        };
    }, [isReady, uiValues]); // Re-run when uiValues change (reset)

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={fpsRef}
                style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    color: 'white',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    zIndex: 10
                }}
            >
                FPS: 0
            </div>
            <UniformControls
                schema={schema}
                values={uiValues}
                onChange={setUniform}
                // style={{ left: 'auto', right: '10px' }}
                style={{ left: '10px', top: '60px' }}
            />
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{ width: "100%", height: "100%", display: "block" }}
            />
        </div>
    );
}
