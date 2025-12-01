import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import Triangle from './demos/Triangle.gen'
import Circles from './demos/Circles.gen'
import Lines from './demos/Lines.gen'
import Shadertoy from './demos/Shadertoy.gen'
import RayTracing from './demos/RayTracing.gen'

import Fluid3D from './demos/Fluid3D.gen'

import Rectangles from './demos/Rectangles.gen'
import { PrimitiveDemo } from './demos/PrimitiveDemo'

import './index.css'

function Layout() {
    const [demo, setDemo] = useState<"triangle" | "circles" | "lines" | "shadertoy" | "raytracing" | "rectangles" | "primitives" | "fluid3d">("shadertoy");

    const demos = [
        { id: "triangle", label: "Triangle", description: "Basic graphics rendering" },
        { id: "circles", label: "Circles", description: "Interactive particle system" },
        { id: "rectangles", label: "Rectangles", description: "Rectangle drawing demo" },
        { id: "lines", label: "Lines", description: "Line drawing demo" },
        { id: "shadertoy", label: "Shadertoy", description: "Neonwave sunrise shader port" },
        { id: "raytracing", label: "Ray Tracing", description: "Simple sphere ray tracing" },
        { id: "primitives", label: "Primitives", description: "Primitive rendering demo" },
        { id: "fluid3d", label: "Fluid 3D", description: "SPH Fluid Simulation" },
    ] as const;

    const currentDemo = demos.find(d => d.id === demo);

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-title">
                        ⚡ AccelScript
                    </div>
                </div>
                <nav className="sidebar-nav">
                    {demos.map((d) => (
                        <button
                            key={d.id}
                            onClick={() => setDemo(d.id as any)}
                            className={`nav-button ${demo === d.id ? 'active' : ''}`}
                        >
                            {d.label}
                        </button>
                    ))}
                </nav>
            </aside>
            <main className="main-content">
                <div className="content-wrapper">
                    <header className="demo-header">
                        <a
                            href="https://github.com/yknishidate/AccelScript"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                position: 'absolute',
                                top: '0',
                                right: '0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: 'var(--text-secondary)',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                                border: '1px solid var(--border-color)',
                                transition: 'all 0.2s ease',
                                zIndex: 10
                            }}
                        >
                            <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                            </svg>
                            GitHub
                        </a>
                        <h1 className="demo-title">{currentDemo?.label}</h1>
                        <p className="demo-description">{currentDemo?.description}</p>
                    </header>

                    {demo === "triangle" && <Triangle />}
                    {demo === "circles" && <Circles />}
                    {demo === "rectangles" && <Rectangles />}
                    {demo === "lines" && <Lines />}
                    {demo === "shadertoy" && <Shadertoy />}
                    {demo === "raytracing" && <RayTracing />}
                    {demo === "primitives" && <PrimitiveDemo />}
                    {demo === "fluid3d" && <Fluid3D />}
                </div>
            </main>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Layout />
    </React.StrictMode>,
)
