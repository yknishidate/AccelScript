import React, { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec3f, vec4f, vec4i, f32, i32, u32, Camera, SyncMode, Atomic } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';
import { useUniforms, UniformControls } from '../hooks/useUniforms';

const uniformsSchema = {
    smoothingRadius: { value: 0.4, min: 0.2, max: 1.0, step: 0.05 },
    restDensity: { value: 70.0, min: 10.0, max: 200.0, step: 10.0 },
    gasConstant: { value: 100.0, min: 10.0, max: 500.0, step: 10.0 },
    viscosity: { value: 30.0, min: 0.0, max: 60.0, step: 0.1 },
    mass: { value: 0.5, min: 0.1, max: 5.0, step: 0.1 },
    dt: { value: 0.02, min: 0.01, max: 0.03, step: 0.001 },
    boundaryX: { value: 8.0, min: 0.5, max: 20.0, step: 0.1 },
    boundaryY: { value: 6.0, min: 0.5, max: 20.0, step: 0.1 },
    boundaryZ: { value: 2.5, min: 0.5, max: 20.0, step: 0.1 },
    plateSpeed: { value: 2.0, min: 0.0, max: 10.0, step: 0.1 },
    plateWidth: { value: 4.0, min: 0.1, max: 10.0, step: 0.1 },
    plateThickness: { value: 0.2, min: 0.05, max: 1.0, step: 0.05 },
};

// SPH Parameters
interface Params {
    gravity: vec4f;
    boundaryLimit: vec4f;
    gridRes: vec4i;
    cellSize: f32;
    numParticles: u32;
    smoothingRadius: f32;
    restDensity: f32;
    gasConstant: f32;
    viscosity: f32;
    mass: f32;
    dt: f32;
    plateSpeed: f32;
    plateAngle: f32;
    plateSize: vec4f;
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

/** @device */
function getCellIndex(pos: vec3f, cellSize: f32, gridRes: vec4i, offset: vec3f): i32 {
    const cellX = i32(floor((pos.x + offset.x) / cellSize));
    const cellY = i32(floor((pos.y + offset.y) / cellSize));
    const cellZ = i32(floor((pos.z + offset.z) / cellSize));

    // Clamp to grid bounds
    const cx = clamp(cellX, 0, gridRes.x - 1);
    const cy = clamp(cellY, 0, gridRes.y - 1);
    const cz = clamp(cellZ, 0, gridRes.z - 1);

    return cx + cy * gridRes.x + cz * gridRes.x * gridRes.y;
}

/** @kernel @workgroup_size(4, 4, 4) */
async function resetGrid(
    gridHead: SharedArray<Atomic<i32>>,
    params: Params
) {
    const x = global_invocation_id.x;
    const y = global_invocation_id.y;
    const z = global_invocation_id.z;

    if (x >= u32(params.gridRes.x) || y >= u32(params.gridRes.y) || z >= u32(params.gridRes.z)) return;

    const index = x + y * u32(params.gridRes.x) + z * u32(params.gridRes.x) * u32(params.gridRes.y);
    atomicStore(gridHead[index], -1);
}

/** @kernel @workgroup_size(64) */
async function updateGrid(
    pos: SharedArray<vec3f>,
    gridHead: SharedArray<Atomic<i32>>,
    gridNext: SharedArray<i32>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    const p = pos[i];
    const cellIndex = getCellIndex(p, params.cellSize, params.gridRes, params.boundaryLimit.xyz);

    const next = atomicExchange(gridHead[cellIndex], i32(i));
    gridNext[i] = next;
}

/** @kernel @workgroup_size(64) */
async function computeDensityPressure(
    pos: SharedArray<vec3f>,
    gridHead: SharedArray<Atomic<i32>>,
    gridNext: SharedArray<i32>,
    density: SharedArray<f32>,
    pressure: SharedArray<f32>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    const pi = pos[i];
    let d = 0.0;

    const cellIndex = getCellIndex(pi, params.cellSize, params.gridRes, params.boundaryLimit.xyz);
    const cx = cellIndex % params.gridRes.x;
    const cy = (cellIndex / params.gridRes.x) % params.gridRes.y;
    const cz = cellIndex / (params.gridRes.x * params.gridRes.y);

    for (let z = -1; z <= 1; z++) {
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                const nx = cx + x;
                const ny = cy + y;
                const nz = cz + z;

                if (nx >= 0 && nx < params.gridRes.x &&
                    ny >= 0 && ny < params.gridRes.y &&
                    nz >= 0 && nz < params.gridRes.z) {

                    const neighborCellIndex = nx + ny * params.gridRes.x + nz * params.gridRes.x * params.gridRes.y;
                    let j = atomicLoad(gridHead[neighborCellIndex]);

                    while (j != -1) {
                        const pj = pos[j];
                        const r = pi - pj;
                        const r2 = dot(r, r);

                        if (r2 < params.smoothingRadius * params.smoothingRadius) {
                            d = d + params.mass * poly6Kernel(r2, params.smoothingRadius);
                        }

                        j = gridNext[j];
                    }
                }
            }
        }
    }

    density[i] = d;
    pressure[i] = params.gasConstant * (d - params.restDensity);
}

/** @kernel @workgroup_size(64) */
async function computeForces(
    pos: SharedArray<vec3f>,
    vel: SharedArray<vec3f>,
    gridHead: SharedArray<Atomic<i32>>,
    gridNext: SharedArray<i32>,
    density: SharedArray<f32>,
    pressure: SharedArray<f32>,
    force: SharedArray<vec3f>,
    params: Params
) {
    const i = global_invocation_id.x;
    if (i >= params.numParticles) return;

    const pi = pos[i];
    const vi = vel[i];
    const di = density[i];
    const pri = pressure[i];

    let pressureForce = vec3f(0.0, 0.0, 0.0);
    let viscosityForce = vec3f(0.0, 0.0, 0.0);

    const cellIndex = getCellIndex(pi, params.cellSize, params.gridRes, params.boundaryLimit.xyz);
    const cx = cellIndex % params.gridRes.x;
    const cy = (cellIndex / params.gridRes.x) % params.gridRes.y;
    const cz = cellIndex / (params.gridRes.x * params.gridRes.y);

    for (let z = -1; z <= 1; z++) {
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                const nx = cx + x;
                const ny = cy + y;
                const nz = cz + z;

                if (nx >= 0 && nx < params.gridRes.x &&
                    ny >= 0 && ny < params.gridRes.y &&
                    nz >= 0 && nz < params.gridRes.z) {

                    const neighborCellIndex = nx + ny * params.gridRes.x + nz * params.gridRes.x * params.gridRes.y;
                    let j = atomicLoad(gridHead[neighborCellIndex]);

                    while (j != -1) {
                        if (i == u32(j)) {
                            j = gridNext[j];
                            continue;
                        }

                        const pj = pos[j];
                        const vj = vel[j];
                        const dj = density[j];
                        const prj = pressure[j];

                        const r = pi - pj;
                        const dist = length(r);

                        if (dist < params.smoothingRadius) {
                            const grad = spikyKernelGrad(r, dist, params.smoothingRadius);
                            pressureForce = pressureForce - grad * (params.mass * (pri + prj) / (2.0 * dj));

                            const lap = viscosityKernelLap(dist, params.smoothingRadius);
                            viscosityForce = viscosityForce + (vj - vi) * (lap * (params.mass / dj));
                        }

                        j = gridNext[j];
                    }
                }
            }
        }
    }

    viscosityForce = viscosityForce * params.viscosity;

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

    let p = pos[i];
    let v = vel[i];
    const f = force[i];
    const d = density[i];

    // Update velocity
    if (d > 0.001) {
        v = v + (f / d) * params.dt;
    }

    // Update position
    p = p + v * params.dt;

    // Boundary conditions (Box)
    const limit = params.boundaryLimit;
    const damping = -0.5;

    if (p.x < -limit.x) { p.x = -limit.x; v.x = v.x * damping; }
    if (p.x > limit.x) { p.x = limit.x; v.x = v.x * damping; }
    if (p.y < -limit.y) { p.y = -limit.y; v.y = v.y * damping; }
    // if (p.y > limit.y) { p.y = limit.y; v.y = v.y * damping; } // Open top
    if (p.z < -limit.z) { p.z = -limit.z; v.z = v.z * damping; }
    if (p.z > limit.z) { p.z = limit.z; v.z = v.z * damping; }

    // Plate Collision
    const plateAngle = params.plateAngle;
    const cosA = cos(plateAngle);
    const sinA = sin(plateAngle);

    const localX = p.x * cosA + p.y * sinA;
    const localY = -p.x * sinA + p.y * cosA;
    const localZ = p.z;

    const halfW = params.plateSize.x * 0.5; // Width (local X)
    const halfH = params.plateSize.y * 0.5; // Thickness (local Y)
    const halfD = params.plateSize.z * 0.5; // Depth (local Z) - boundsZ

    if (localX > -halfW && localX < halfW &&
        localY > -halfH && localY < halfH &&
        localZ > -halfD && localZ < halfD) {

        const signY = sign(localY);
        const pushY = signY * (halfH + 0.01); // Push slightly outside

        // New local position
        const newLocalX = localX;
        const newLocalY = pushY;
        const newLocalZ = localZ;

        p.x = newLocalX * cosA - newLocalY * sinA;
        p.y = newLocalX * sinA + newLocalY * cosA;
        p.z = newLocalZ;

        const omega = params.plateSpeed;
        const plateVelX = -omega * p.y;
        const plateVelY = omega * p.x;
        const plateVelZ = 0.0;

        const normalX = -sinA * signY;
        const normalY = cosA * signY;

        // Set to plate velocity + push
        v.x = plateVelX + normalX * 2.0;
        v.y = plateVelY + normalY * 2.0;
        v.z = plateVelZ;
    }

    pos[i] = p;
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
            camera.distance = 30;
            camera.azimuth = 0.2;
            camera.center = vec3f(-uniforms.current.boundaryX * 0.25, 0, 0);
            camera.update();
        }

        const init = async () => {
            const NUM_PARTICLES = 100000;
            const pos = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const vel = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const force = new SharedArray(vec3f, NUM_PARTICLES, SyncMode.None);
            const density = new SharedArray(f32, NUM_PARTICLES, SyncMode.None);
            const pressure = new SharedArray(f32, NUM_PARTICLES, SyncMode.None);
            const sizes = new SharedArray(vec3f, NUM_PARTICLES);
            const colors = new SharedArray(vec3f, NUM_PARTICLES);

            // Grid Initialization
            const boundsX = uniforms.current.boundaryX;
            const boundsY = uniforms.current.boundaryY;
            const boundsZ = uniforms.current.boundaryZ;
            const CELL_SIZE = uniforms.current.smoothingRadius; // Should match smoothingRadius
            const GRID_RES_X = Math.ceil((boundsX * 2.0) / CELL_SIZE);
            const GRID_RES_Y = Math.ceil((boundsY * 2.0) / CELL_SIZE);
            const GRID_RES_Z = Math.ceil((boundsZ * 2.0) / CELL_SIZE);
            const NUM_CELLS = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

            // Atomic<i32> for grid head, initialized to -1
            const gridHead = new SharedArray(i32, NUM_CELLS, SyncMode.None);
            const gridNext = new SharedArray(i32, NUM_PARTICLES, SyncMode.None);

            // Initialize gridHead to -1
            for (let i = 0; i < NUM_CELLS; i++) {
                gridHead.set(i, [-1]);
            }

            // Initialize particles in a block (Dam Break)
            const spacing = 0.15; // Fixed spacing for liquid behavior

            // Start from the corner of the boundary
            const startX = -boundsX + spacing / 2;
            const startY = -boundsY + spacing / 2;
            const startZ = -boundsZ + spacing / 2;

            // Calculate dimensions of the dam column (Left 25% of width)
            const damWidth = (boundsX * 2) * 0.33;
            const countX = Math.floor(damWidth / spacing);
            const countZ = Math.floor((boundsZ * 2) / spacing);

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
                if (i < NUM_PARTICLES * 0.5) {
                    colors.set(i, [1.0, 0.5, 0.2]);
                } else {
                    colors.set(i, [0.2, 0.5, 1.0]);
                }

                gridNext.set(i, [-1]);
            }

            // Manually sync to device since we used SyncMode.None
            if (runtime.device) {
                await pos.syncToDevice(runtime.device);
                await vel.syncToDevice(runtime.device);
                await force.syncToDevice(runtime.device);
                await gridHead.syncToDevice(runtime.device);
                await gridNext.syncToDevice(runtime.device);
            }

            let frameCount = 0;
            let lastFpsTime = performance.now();
            let currentPlateAngle = 0.0;

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

                // Update plate angle
                const dt = uniforms.current.dt;
                currentPlateAngle += uniforms.current.plateSpeed * dt;

                // Update params from uniforms
                const currentParams = {
                    gravity: vec4f(0.0, -9.8, 0.0, 0.0),
                    boundaryLimit: vec4f(uniforms.current.boundaryX, uniforms.current.boundaryY, uniforms.current.boundaryZ, 0.0),
                    gridRes: vec4i(GRID_RES_X, GRID_RES_Y, GRID_RES_Z, 0),
                    cellSize: f32(CELL_SIZE),
                    numParticles: u32(NUM_PARTICLES),
                    smoothingRadius: f32(uniforms.current.smoothingRadius),
                    restDensity: f32(uniforms.current.restDensity),
                    gasConstant: f32(uniforms.current.gasConstant),
                    viscosity: f32(uniforms.current.viscosity),
                    mass: f32(uniforms.current.mass),
                    dt: f32(dt),
                    plateSpeed: f32(uniforms.current.plateSpeed),
                    plateAngle: f32(currentPlateAngle),
                    plateSize: vec4f(uniforms.current.plateWidth * 2.0, uniforms.current.plateThickness * 2.0, uniforms.current.boundaryZ * 2.0, 0.0)
                };

                // Simulation steps
                const groupCountParticles: u32 = Math.ceil(currentParams.numParticles / 64);
                const groupCountX: u32 = Math.ceil(GRID_RES_X / 4);
                const groupCountY: u32 = Math.ceil(GRID_RES_Y / 4);
                const groupCountZ: u32 = Math.ceil(GRID_RES_Z / 4);

                await resetGrid<[groupCountX, groupCountY, groupCountZ]>(gridHead, currentParams);
                await updateGrid<[groupCountParticles, 1, 1]>(pos, gridHead, gridNext, currentParams);
                await computeDensityPressure<[groupCountParticles, 1, 1]>(pos, gridHead, gridNext, density, pressure, currentParams);
                await computeForces<[groupCountParticles, 1, 1]>(pos, vel, gridHead, gridNext, density, pressure, force, currentParams);
                await integrate<[groupCountParticles, 1, 1]>(pos, vel, force, density, currentParams);

                runtime.clear([0.1, 0.1, 0.1, 1.0], 1.0);
                runtime.spheres(pos, sizes, colors, { camera });

                // Render Plate
                runtime.box(
                    [0, 0, 0],
                    [uniforms.current.plateWidth, uniforms.current.plateThickness, boundsZ * 2.0],
                    [0.8, 0.8, 0.8, 1.0],
                    { camera, rotation: [0, 0, currentPlateAngle] }
                );

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
                style={{ left: '10px', top: '50px' }}
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
