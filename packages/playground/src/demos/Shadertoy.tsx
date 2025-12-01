import React, { useEffect, useRef } from 'react';
import { runtime, SharedArray, vec4f, f32, u32, vec2f, vec3f } from "@accelscript/runtime";
import { useCanvas } from '../hooks/useCanvas';

interface Params {
    time: f32;
    width: u32;
    height: u32;
}

const PI = 3.141592654;
const TAU = 6.283185307;

/** @device */
function mod_f(x: f32, y: f32): f32 {
    return x - y * floor(x / y);
}

/** @device */
function mod_v2(x: vec2f, y: vec2f): vec2f {
    return x - y * floor(x / y);
}

/** @device */
function HSV2RGB(c: vec3f): vec3f {
    const K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    return c.z * mix(K.xxx, clamp(abs(fract(vec3(c.x, c.x, c.x) + K.xyz) * 6.0 - K.www) - K.xxx, vec3(0.0), vec3(1.0)), c.y);
}

/** @device */
function alphaBlend4(back: vec4f, front: vec4f): vec4f {
    const w = front.w + back.w * (1.0 - front.w);
    const xyz = (front.xyz * front.w + back.xyz * back.w * (1.0 - front.w)) / w;
    return w > 0.0 ? vec4(xyz, w) : vec4(0.0, 0.0, 0.0, 0.0);
}

/** @device */
function alphaBlend34(back: vec3f, front: vec4f): vec3f {
    return mix(back, front.xyz, front.w);
}

/** @device */
function hash1(co: f32): f32 {
    return fract(sin(co * 12.9898) * 13758.5453);
}

/** @device */
function hash2_1(p: vec2f): f32 {
    const a = dot(p, vec2(127.1, 311.7));
    return fract(sin(a) * 43758.5453123);
}

/** @device */
function vnoise(p: vec2f): f32 {
    const i = floor(p);
    const f = fract(p);
    const u = f * f * (3.0 - 2.0 * f);

    const a = hash2_1(i + vec2(0.0, 0.0));
    const b = hash2_1(i + vec2(1.0, 0.0));
    const c = hash2_1(i + vec2(0.0, 1.0));
    const d = hash2_1(i + vec2(1.0, 1.0));

    const m0 = mix(a, b, u.x);
    const m1 = mix(c, d, u.x);
    const m2 = mix(m0, m1, u.y);

    return m2;
}

/** @device */
function raySphere(ro: vec3f, rd: vec3f, sph: vec4f): vec2f {
    const oc = ro - sph.xyz;
    const b = dot(oc, rd);
    const c = dot(oc, oc) - sph.w * sph.w;
    let h = b * b - c;
    if (h < 0.0) return vec2(-1.0, -1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

/** @device */
function mod1(p: f32, size: f32): vec2f {
    const halfsize = size * 0.5;
    const c = floor((p + halfsize) / size);
    const new_p = mod_f(p + halfsize, size) - halfsize;
    return vec2(c, new_p);
}

/** @device */
function mod2_helper(p: vec2f, size: vec2f): vec4f {
    const c = floor((p + size * 0.5) / size);
    const new_p = mod_v2(p + size * 0.5, size) - size * 0.5;
    return vec4(c.x, c.y, new_p.x, new_p.y);
}

/** @device */
function hash2(p: vec2f): vec2f {
    const p2 = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p2) * 43758.5453123);
}

/** @device */
function hifbm(p: vec2f): f32 {
    const aa = 0.5;
    const pp = 2.0;

    let sum = 0.0;
    let a = 1.0;
    let p_curr = p;

    for (let i = 0; i < 5; i++) {
        sum += a * vnoise(p_curr);
        a *= aa;
        p_curr *= pp;
    }

    return sum;
}

/** @device */
function lofbm(p: vec2f): f32 {
    const aa = 0.5;
    const pp = 2.0;

    let sum = 0.0;
    let a = 1.0;
    let p_curr = p;

    for (let i = 0; i < 2; i++) {
        sum += a * vnoise(p_curr);
        a *= aa;
        p_curr *= pp;
    }

    return sum;
}

/** @device */
function hiheight(p: vec2f): f32 {
    return hifbm(p) - 1.8;
}

/** @device */
function loheight(p: vec2f): f32 {
    return lofbm(p) - 2.15;
}

/** @device */
function plane(ro: vec3f, rd: vec3f, pp: vec3f, npp: vec3f, off: vec3f, n: f32): vec4f {
    const h = hash1(n);
    const s = mix(0.05, 0.25, h);

    const p = (pp - off * 2.0 * vec3(1.0, 1.0, 0.0)).xy;

    const stp = vec2(0.5, 0.33);
    const he = hiheight(vec2(p.x, pp.z) * stp);
    const lohe = loheight(vec2(p.x, pp.z) * stp);

    const d = p.y - he;
    const lod = p.y - lohe;

    const aa = distance(pp, npp) * sqrt(1.0 / 3.0);
    const t = smoothstep(aa, -aa, d);

    const df = exp(-0.1 * (distance(ro, pp) - 2.0));
    const acol = HSV2RGB(vec3(mix(0.9, 0.6, df), 0.9, mix(1.0, 0.0, df)));
    const gcol = HSV2RGB(vec3(0.6, 0.5, tanh(exp(-mix(2.0, 8.0, df) * lod))));

    let col = vec3(0.0, 0.0, 0.0);
    col += acol;
    col += gcol * 0.5;

    return vec4(col, t);
}

/** @device */
function stars(sp: vec2f, hh: f32, time: f32): vec3f {
    const scol0 = HSV2RGB(vec3(0.85, 0.8, 1.0));
    const scol1 = HSV2RGB(vec3(0.65, 0.5, 1.0));
    let col = vec3(0.0, 0.0, 0.0);

    const m = 6.0;

    for (let i = 0.0; i < 6.0; i += 1.0) {
        let pp = sp + 0.5 * i;
        const s = i / (m - 1.0);
        const dim = vec2(mix(0.05, 0.003, s) * PI);

        const mod2_res = mod2_helper(pp, dim);
        const np = vec2(mod2_res.x, mod2_res.y);
        const new_pp = vec2(mod2_res.z, mod2_res.w);
        pp = new_pp;

        const h = hash2(np + 127.0 + i);
        const o = -1.0 + 2.0 * h;
        const y = sin(sp.x);
        pp += o * dim * 0.5;
        pp.y *= y;
        const l = length(pp);

        const h1 = fract(h.x * 1667.0);
        const h2 = fract(h.x * 1887.0);
        const h3 = fract(h.x * 2997.0);

        const scol = mix(8.0 * h2, 0.25 * h2 * h2, s) * mix(scol0, scol1, h1 * h1);

        let ccol = col + exp(-(mix(6000.0, 2000.0, hh) / mix(2.0, 0.25, s)) * max(l - 0.001, 0.0)) * scol;
        ccol *= mix(0.125, 1.0, smoothstep(1.0, 0.99, sin(0.25 * time + TAU * h.y)));

        if (h3 < y) {
            col = ccol;
        }
    }

    return col;
}

/** @device */
function toSpherical(p: vec3f): vec3f {
    const r = length(p);
    const t = acos(p.z / r);
    const ph = atan2(p.y, p.x);
    return vec3(r, t, ph);
}

/** @device */
function moon(ro: vec3f, rd: vec3f, time: f32): vec4f {
    const mdim = vec4(0.0, 0.4 * 100000.0, 1.0 * 100000.0, 20000.0);
    const mcol0 = HSV2RGB(vec3(0.75, 0.7, 1.0));
    const mcol3 = HSV2RGB(vec3(0.75, 0.55, 1.0));

    const lpos = vec3(0.0, -0.15 * 1000000.0, 1.0 * 1000000.0);
    const ldir = normalize(lpos);

    const md = raySphere(ro, rd, mdim);
    const mpos = ro + rd * md.x;
    const mnor = normalize(mpos - mdim.xyz);
    const mdif = max(dot(ldir, mnor), 0.0);
    const mf = smoothstep(0.0, 10000.0, md.y - md.x);
    const mfre = 1.0 + dot(rd, mnor);
    const imfre = 1.0 - mfre;

    let col = mdif * mcol0 * 4.0;

    let fcol = vec3(0.0);
    let msp = toSpherical(-mnor.zxy).yz;
    let omsp = msp;
    let msf = sin(msp.x);
    msp.x -= PI * 0.5;
    const mszy = (TAU / (4.0)) * 0.125;
    let msny = mod1(msp.y, mszy);
    msp.y = msny.y * msf;

    const limit: i32 = 1;
    for (let i = -limit; i <= limit; i++) {
        let pp = msp + vec2(0.0, mszy * f32(i));
        let d0 = abs(pp.y);
        let fft = 0.1;
        let d1 = length(pp) - 0.05 * fft;
        let h = mix(0.66, 0.99, fft);
        let mcol1 = HSV2RGB(vec3(h, 0.55, 1.0));
        let mcol2 = HSV2RGB(vec3(h, 0.85, 1.0));
        fcol += mcol1 * 0.5 * tanh(0.0025 / max(d0, 0.0)) * imfre * pow(msf, mix(100.0, 10.0, fft));
        fcol += mcol2 * 5.0 * tanh(0.00025 / (max(d1, 0.0) * max(d1, 0.0))) * imfre * msf;
    }
    let d0 = abs(msp.x);
    fcol += mcol3 * 0.5 * tanh(0.0025 / max(d0, 0.0)) * imfre;
    col += fcol * smoothstep(18.0, 18.0 + 6.0 + 2.0 * abs(omsp.y), time);

    return vec4(col, mf);
}

/** @device */
function skyColor(ro: vec3f, rd: vec3f, time: f32): vec3f {
    const acol = HSV2RGB(vec3(0.6, 0.9, 0.075));
    const lpos = vec3(0.0, -0.15 * 1000000.0, 1.0 * 1000000.0);
    const ldir = normalize(lpos);
    const lcol = HSV2RGB(vec3(0.75, 0.8, 1.0));

    const sp = toSpherical(vec3(rd.x, rd.z, rd.y)).yz;

    const lf = pow(max(dot(ldir, rd), 0.0), 80.0);
    const li = 0.02 * mix(1.0, 10.0, lf) / (abs((rd.y + 0.055)) + 0.025);
    const lz = step(-0.055, rd.y);

    const mcol = moon(ro, rd, time);

    let col = vec3(0.0, 0.0, 0.0);
    col += stars(sp, 0.25, time) * smoothstep(0.5, 0.0, li) * lz;
    col = mix(col, mcol.xyz, mcol.w);
    col += smoothstep(-0.4, 0.0, (sp.x - PI * 0.5)) * acol;
    col += lcol * tanh(li);

    return col;
}

/** @device */
function color(ww: vec3f, uu: vec3f, vv: vec3f, ro: vec3f, p: vec2f, time: f32, resolution: vec2f): vec3f {
    const np = p + 2.0 / resolution.y;
    const rdd = 2.0;

    const rd = normalize(p.x * uu + p.y * vv + rdd * ww);
    const nrd = normalize(np.x * uu + np.y * vv + rdd * ww);

    const planeDist = 1.0;
    const furthest = 12;
    const fadeFrom = max(furthest - 2, 0);

    const fadeDist = planeDist * f32(fadeFrom);
    const maxDist = planeDist * f32(furthest);
    const nz = floor(ro.z / planeDist);

    const skyCol = skyColor(ro, rd, time);

    let acol = vec4(0.0, 0.0, 0.0, 0.0);
    const cutOff = 0.95;
    let cutOut = false;

    for (let i = 1; i <= 12; i++) {
        const pz = planeDist * nz + planeDist * f32(i);
        const pd = (pz - ro.z) / rd.z;

        const pp = ro + rd * pd;

        if (pp.y < 0.0 && pd > 0.0 && acol.w < cutOff) {
            const npp = ro + nrd * pd;
            const off = vec3(0.0, 0.0, 0.0);

            let pcol = plane(ro, rd, pp, npp, off, nz + f32(i));

            const fadeIn = smoothstep(maxDist, fadeDist, pd);
            pcol = vec4(mix(skyCol, pcol.xyz, fadeIn), pcol.w);
            pcol = clamp(pcol, vec4(0.0), vec4(1.0));

            acol = alphaBlend4(pcol, acol);
        } else {
            cutOut = true;
            if (acol.w > cutOff) {
                acol = vec4(acol.xyz, 1.0);
            }
            break;
        }
    }

    return alphaBlend34(skyCol, acol);
}

/** @device */
function effect(p: vec2f, q: vec2f, time: f32, resolution: vec2f): vec3f {
    const tm = time * 0.25;
    const ro = vec3(0.0, 0.0, tm);
    const dro = normalize(vec3(0.0, 0.09, 1.0));
    const ww = normalize(dro);
    const uu = normalize(cross(normalize(vec3(0.0, 1.0, 0.0)), ww));
    const vv = normalize(cross(ww, uu));

    return color(ww, uu, vv, ro, p, time, resolution);
}

/** @device */
function sRGB(t: f32): f32 {
    return mix(1.055 * pow(t, 1.0 / 2.4) - 0.055, 12.92 * t, step(t, 0.0031308));
}

/** @device */
function sRGB3(c: vec3f): vec3f {
    return vec3(sRGB(c.x), sRGB(c.y), sRGB(c.z));
}

/** @device */
function aces_approx(v: vec3f): vec3f {
    let v_clamped = max(v, vec3(0.0));
    v_clamped *= 0.6;
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return clamp((v_clamped * (a * v_clamped + b)) / (v_clamped * (c * v_clamped + d) + e), vec3(0.0), vec3(1.0));
}

/** @kernel @workgroup_size(8, 8) */
async function generateImage(image: SharedArray<vec4f>, params: Params) {
    const x = global_invocation_id.x;
    const y = global_invocation_id.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    const idx = y * params.width + x;
    const resolution = vec2(f32(params.width), f32(params.height));

    const fragCoord = vec2(f32(x), f32(y));

    const q = fragCoord / resolution;
    let p = -1.0 + 2.0 * q;
    p.x *= resolution.x / resolution.y;

    let col = effect(p, q, params.time, resolution);
    col *= smoothstep(0.0, 8.0, params.time - abs(q.y));
    col = aces_approx(col);
    col = sRGB3(col);

    image[idx] = vec4(col.xyz, 1.0);
}

export default function Shadertoy() {
    const { canvasRef, isReady } = useCanvas();

    useEffect(() => {
        if (!isReady) return;

        let animating = true;

        const init = async () => {
            const width = 800;
            const height = 600;

            const params = {
                time: 0.0,
                width: u32(width),
                height: u32(height),
            };
            // SharedArray<vec4f> with shape [height, width]
            // The kernel uses 1D index: y * width + x.
            const image = new SharedArray(vec4f, [height, width]);

            const startTime = performance.now();

            // Animation loop
            const animate = async () => {
                if (!animating) return;

                params.time = (performance.now() - startTime) / 1000.0;

                // Dispatch kernel
                // 800 / 8 = 100, 600 / 8 = 75
                await generateImage<[100, 75, 1]>(image, params);

                // Display image
                await runtime.showImage(image);

                requestAnimationFrame(animate);
            };

            animate();
        };

        init();

        return () => {
            animating = false;
        };
    }, [isReady]);

    return (
        <div>
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{ width: "100%", height: "100%", display: "block" }}
            />
            <div style={{ paddingTop: "1em" }}>
                <p>Ported from <a href="https://www.shadertoy.com/view/7dyyRy" target="_blank" rel="noopener noreferrer" style={{ color: "white" }}>https://www.shadertoy.com/view/7dyyRy</a></p>
            </div>
        </div>
    );
}
