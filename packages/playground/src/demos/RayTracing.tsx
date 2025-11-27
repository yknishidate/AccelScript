import React, { useEffect } from 'react';
import { runtime, SharedArray, vec4f, f32, Camera } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

interface Params {
    radius: f32;
    width: u32;
    height: u32;
    frame: u32;
    cameraPos: vec4; // w unused
    cameraDir: vec4; // w unused
}

/** @device */
function hash(p: vec2): f32 {
    let p2 = fract(p * vec2(123.34, 456.21));
    p2 = p2 + dot(p2, p2 + 45.32);
    return fract(p2.x * p2.y);
}

/** @device */
function randomInUnitSphere(seed: vec2): vec3 {
    let phi = 2.0 * 3.14159 * hash(seed);
    let costheta = 2.0 * hash(seed + vec2(1.0, 1.0)) - 1.0;
    let u = hash(seed + vec2(2.0, 2.0));
    let theta = acos(costheta);
    let r = pow(u, 0.333);

    let x = r * sin(theta) * cos(phi);
    let y = r * sin(theta) * sin(phi);
    let z = r * cos(theta);
    return vec3(x, y, z);
}

/** @device */
function intersectSphere(ro: vec3, rd: vec3, spherePos: vec3, radius: f32): f32 {
    const oc = ro - spherePos;
    const b = dot(oc, rd);
    const c = dot(oc, oc) - radius * radius;
    const h = b * b - c;
    return h >= 0.0 ? -b - sqrt(h) : -1.0;
}

interface HitResult {
    t: f32;
    normal: vec3;
    matType: f32;
    albedo: vec3;
    emissive: vec3;
    roughness: f32;
    pos: vec3;
}

/** @device */
function intersectScene(ro: vec3, rd: vec3): HitResult {
    // @ts-ignore
    let result: HitResult;
    result.t = -1.0;
    result.normal = vec3(0.0, 0.0, 0.0);
    result.matType = -1.0;
    result.albedo = vec3(0.0, 0.0, 0.0);
    result.emissive = vec3(0.0, 0.0, 0.0);
    result.roughness = 0.0;
    result.pos = vec3(0.0, 0.0, 0.0);

    // Sphere 1 (Center, Diffuse)
    let center = vec3(0.0, 0.0, -1.0); // Moved slightly back to be visible
    let t = intersectSphere(ro, rd, center, 0.5);
    if (t > 0.001 && (result.t < 0.0 || t < result.t)) {
        result.t = t;
        result.pos = ro + rd * t;
        result.normal = normalize(result.pos - center);
        result.matType = 0.0; // Diffuse
        result.albedo = vec3(0.8, 0.3, 0.3);
    }

    // Sphere 2 (Ground)
    center = vec3(0.0, -100.5, -1.0);
    t = intersectSphere(ro, rd, center, 100.0);
    if (t > 0.001 && (result.t < 0.0 || t < result.t)) {
        result.t = t;
        result.pos = ro + rd * t;
        result.normal = normalize(result.pos - center);
        result.matType = 0.0; // Diffuse
        result.albedo = vec3(0.8, 0.8, 0.0);
    }

    // Sphere 3 (Left, Metal)
    center = vec3(-1.0, 0.0, -1.0);
    t = intersectSphere(ro, rd, center, 0.5);
    if (t > 0.001 && (result.t < 0.0 || t < result.t)) {
        result.t = t;
        result.pos = ro + rd * t;
        result.normal = normalize(result.pos - center);
        result.matType = 1.0; // Metal
        result.albedo = vec3(0.8, 0.8, 0.8);
        result.roughness = 0.3;
    }

    // Sphere 4 (Right, Emissive)
    center = vec3(1.0, 0.0, -1.0);
    t = intersectSphere(ro, rd, center, 0.5);
    if (t > 0.001 && (result.t < 0.0 || t < result.t)) {
        result.t = t;
        result.pos = ro + rd * t;
        result.normal = normalize(result.pos - center);
        result.matType = 2.0; // Emissive
        result.albedo = vec3(1.0, 1.0, 1.0);
        result.emissive = vec3(1.0, 1.0, 1.0);
    }

    return result;
}

/** @kernel @workgroup_size(8, 8) */
async function compute(image: SharedArray<vec4f>, params: Params) {
    const x = global_invocation_id.x;
    const y = global_invocation_id.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    const idx = y * params.width + x;
    // Use frame count in seed to vary noise each frame
    const seed = vec2(f32(x) / f32(params.width), f32(y) / f32(params.height)) * (f32(params.frame) * 0.1);

    const resolution = vec2(f32(params.width), f32(params.height));
    const uv = vec2(f32(x) / resolution.x, f32(y) / resolution.y);
    const aspect = resolution.x / resolution.y;

    const screenSize = vec2(0.5, 0.5);
    // Jitter for anti-aliasing (optional, but good for accumulation)
    const jitter = (vec2(hash(seed), hash(seed + 1.0)) - 0.5) / resolution;
    const p = vec2(((uv.x + jitter.x) * 2.0 - 1.0) * aspect, (uv.y + jitter.y) * 2.0 - 1.0) * screenSize;

    // Camera
    const ro = params.cameraPos.xyz;
    const camDir = normalize(params.cameraDir.xyz);
    const camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camDir));
    const camUp = cross(camDir, camRight);

    const rd = normalize(p.x * camRight + p.y * camUp + camDir);

    let col = vec3(0.0, 0.0, 0.0);
    let curAtten = vec3(1.0, 1.0, 1.0);
    let curRo = ro;
    let curRd = rd;

    // Path tracing loop
    for (let i = 0; i < 4; i++) {
        let hitResult = intersectScene(curRo, curRd);

        if (hitResult.t < 0.0) {
            // Sky
            let t = 0.5 * (curRd.y + 1.0);
            let sky = (1.0 - t) * vec3(1.0, 1.0, 1.0) + t * vec3(0.5, 0.7, 1.0);
            col = col + curAtten * sky;
            break;
        }

        if (hitResult.matType == 2.0) { // Emissive
            col = col + curAtten * hitResult.emissive;
            break;
        }

        let scatterDir = vec3(0.0, 0.0, 0.0);
        if (hitResult.matType == 0.0) { // Diffuse
            scatterDir = hitResult.normal + randomInUnitSphere(seed + vec2(f32(i), f32(i)));
            // @ts-ignore
            if (length(scatterDir) < 0.001) scatterDir = hitResult.normal;
        } else if (hitResult.matType == 1.0) { // Metal
            let reflected = reflect(curRd, hitResult.normal);
            scatterDir = reflected + hitResult.roughness * randomInUnitSphere(seed + vec2(f32(i), f32(i)));
        }

        curRo = hitResult.pos;
        curRd = normalize(scatterDir);
        curAtten = curAtten * hitResult.albedo;
    }

    // Accumulation
    let finalColor = col;
    if (params.frame > 1) {
        // @ts-ignore
        let prevColor = image[idx];
        // Convert back to linear space (undo gamma)
        let prevLinear = vec3(prevColor.x * prevColor.x, prevColor.y * prevColor.y, prevColor.z * prevColor.z);
        // Mix
        let weight = 1.0 / f32(params.frame);
        finalColor = mix(prevLinear, col, weight);
    }

    // Gamma correction
    finalColor = sqrt(finalColor);

    // @ts-ignore
    image[idx] = vec4(finalColor.x, finalColor.y, finalColor.z, 1.0);
}

export default function RayTracing() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;
        let frameCount = 1;

        const camera = new Camera();
        const canvas = canvasRef.current;
        if (canvas) {
            camera.attach(canvas);
        }

        camera.onChange(() => {
            frameCount = 1;
        });

        const init = async () => {
            const width = 800;
            const height = 600;

            const params = {
                radius: 1.0,
                width: u32(width),
                height: u32(height),
                frame: u32(1),
                cameraPos: vec4f(0, 0, 0, 0),
                cameraDir: vec4f(0, 0, 0, 0)
            };

            const image = new SharedArray(vec4f, [height, width]);

            const render = async () => {
                if (!animating) return;

                params.cameraPos = camera.pos;
                params.cameraDir = camera.dir;
                params.frame = u32(frameCount);

                // Dispatch kernel
                // 800 / 8 = 100, 600 / 8 = 75
                // @ts-ignore
                await compute<[100, 75, 1]>(image, params);

                // Display image
                // @ts-ignore
                await runtime.showImage(image);

                frameCount++;
                requestAnimationFrame(render);
            };

            render();
        };
        init();

        return () => {
            animating = false;
            camera.detach();
        };
    }, [isReady]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{ width: "100%", height: "100%", display: "block" }}
            />
        </div>
    );
}
