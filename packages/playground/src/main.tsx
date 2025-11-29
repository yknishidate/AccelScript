import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import VectorCompute from './demos/VectorCompute.gen'
import Triangle from './demos/Triangle.gen'
import Circles from './demos/Circles.gen'
import Lines from './demos/Lines.gen'
import ImageDemo from './demos/ImageDemo.gen'
import MouseDemo from './demos/MouseDemo.gen'
import RayTracing from './demos/RayTracing.gen'

import Rectangles from './demos/Rectangles.gen'
import { SphereDemo } from './demos/SphereDemo'
import { PrimitiveDemo } from './demos/PrimitiveDemo'

import './index.css'

function Layout() {
    const [demo, setDemo] = useState<"vector" | "triangle" | "circles" | "lines" | "image" | "mouse" | "raytracing" | "rectangles" | "spheres" | "primitives">("primitives");

    const demos = [
        { id: "mouse", label: "Mouse", description: "Mouse interaction demo" },
        { id: "vector", label: "Vector Compute", description: "Basic vector operations on GPU" },
        { id: "triangle", label: "Triangle", description: "Basic graphics rendering" },
        { id: "circles", label: "Circles", description: "Interactive particle system" },
        { id: "rectangles", label: "Rectangles", description: "Rectangle drawing demo" },
        { id: "lines", label: "Lines", description: "Line drawing demo" },
        { id: "image", label: "Image Processing", description: "Image manipulation filters" },
        { id: "raytracing", label: "Ray Tracing", description: "Simple sphere ray tracing" },
        { id: "spheres", label: "Spheres", description: "3D Sphere Renderer" },
        { id: "primitives", label: "Primitives", description: "Primitive rendering demo" },
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
                        <h1 className="demo-title">{currentDemo?.label}</h1>
                        <p className="demo-description">{currentDemo?.description}</p>
                    </header>

                    {demo === "vector" && <VectorCompute />}
                    {demo === "triangle" && <Triangle />}
                    {demo === "circles" && <Circles />}
                    {demo === "rectangles" && <Rectangles />}
                    {demo === "lines" && <Lines />}
                    {demo === "image" && <ImageDemo />}
                    {demo === "mouse" && <MouseDemo />}
                    {demo === "raytracing" && <RayTracing />}
                    {demo === "spheres" && <SphereDemo />}
                    {demo === "primitives" && <PrimitiveDemo />}
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
