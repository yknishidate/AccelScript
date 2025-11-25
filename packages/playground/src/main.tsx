import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import VectorCompute from './demos/VectorCompute.gen'
import Triangle from './demos/Triangle.gen'
import Tests from './demos/Tests.gen'
import Circles from './demos/Circles.gen'
import Lines from './demos/Lines.gen'
import ImageDemo from './demos/ImageDemo.gen'

function Layout() {
    const [demo, setDemo] = useState<"vector" | "triangle" | "tests" | "circles" | "lines" | "image">("vector");

    return (
        <div style={{ fontFamily: 'sans-serif' }}>
            <nav style={{ padding: 10, borderBottom: '1px solid #ccc', marginBottom: 20 }}>
                <button
                    onClick={() => setDemo("vector")}
                    style={{ marginRight: 10, fontWeight: demo === "vector" ? 'bold' : 'normal' }}
                >
                    Vector Compute
                </button>
                <button
                    onClick={() => setDemo("triangle")}
                    style={{ marginRight: 10, fontWeight: demo === "triangle" ? 'bold' : 'normal' }}
                >
                    Triangle (Graphics)
                </button>
                <button
                    onClick={() => setDemo("circles")}
                    style={{ marginRight: 10, fontWeight: demo === "circles" ? 'bold' : 'normal' }}
                >
                    Circles (Drawing)
                </button>
                <button
                    onClick={() => setDemo("lines")}
                    style={{ marginRight: 10, fontWeight: demo === "lines" ? 'bold' : 'normal' }}
                >
                    Lines (Drawing)
                </button>
                <button
                    onClick={() => setDemo("image")}
                    style={{ marginRight: 10, fontWeight: demo === "image" ? 'bold' : 'normal' }}
                >
                    Image Demo
                </button>
                <button
                    onClick={() => setDemo("tests")}
                    style={{ fontWeight: demo === "tests" ? 'bold' : 'normal' }}
                >
                    Tests
                </button>
            </nav>
            <main>
                {demo === "vector" && <VectorCompute />}
                {demo === "triangle" && <Triangle />}
                {demo === "circles" && <Circles />}
                {demo === "lines" && <Lines />}
                {demo === "image" && <ImageDemo />}
                {demo === "tests" && <Tests />}
            </main>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Layout />
    </React.StrictMode>,
)
