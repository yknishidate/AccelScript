import React, { useState, useRef, useCallback } from 'react';

export type UniformConfig = {
    value: number;
    min: number;
    max: number;
    step?: number;
};

export type UniformsSchema = Record<string, UniformConfig>;

export function useUniforms<T extends UniformsSchema>(schema: T) {
    // Initialize state from schema
    const [values, setValues] = useState(() => {
        const initial: Record<string, number> = {};
        for (const key in schema) {
            initial[key] = schema[key].value;
        }
        return initial;
    });

    // Ref for access in render loop without dependencies
    const valuesRef = useRef(values);

    const handleChange = useCallback((key: string, newValue: number) => {
        setValues(prev => {
            const next = { ...prev, [key]: newValue };
            valuesRef.current = next;
            return next;
        });
    }, []);

    return {
        uniforms: valuesRef,
        uiValues: values,
        setUniform: handleChange,
        schema // Return schema for Controls
    };
}

export const UniformControls = ({
    schema,
    values,
    onChange
}: {
    schema: UniformsSchema,
    values: Record<string, number>,
    onChange: (key: string, val: number) => void
}) => {
    return (
        <div style={{
            position: 'absolute', top: 10, left: 10,
            color: 'white', zIndex: 10,
            background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '4px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            fontFamily: 'monospace'
        }}>
            {Object.entries(schema).map(([key, config]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{key}</span>
                        <span>{values[key].toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min={config.min}
                        max={config.max}
                        step={config.step || 0.1}
                        value={values[key]}
                        onChange={(e) => onChange(key, parseFloat(e.target.value))}
                    />
                </label>
            ))}
        </div>
    );
};
