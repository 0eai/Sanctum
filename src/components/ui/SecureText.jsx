/**
 * SecureText — renders sensitive values onto a <canvas> element.
 *
 * Browser extensions that scrape credentials read DOM text nodes via
 * element.innerText / textContent. Canvas pixel data is NOT accessible
 * through those APIs, so the rendered value is invisible to DOM scanners.
 *
 * Accessibility: users copy via the explicit Copy button; a descriptive
 * aria-label is provided for screen readers.
 */
import React, { useEffect, useRef } from 'react';

const SecureText = ({
    value,
    font = '13px monospace',
    color = '#374151',
    className = '',
    height = 28,
    ariaLabel = 'Sensitive value — use the copy button to copy',
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const ctx = canvas.getContext('2d');

        // Measure text width at the target DPR
        ctx.font = font;
        const textWidth = ctx.measureText(value || '').width;
        const logicalWidth = Math.max(textWidth + 24, 80); // 12px horizontal padding each side

        // Set canvas logical and physical size
        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = height + 'px';
        canvas.width = Math.ceil(logicalWidth * dpr);
        canvas.height = Math.ceil(height * dpr);

        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, logicalWidth, height);

        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.fillText(value || '', 12, height / 2);
    }, [value, font, color, height]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            aria-label={ariaLabel}
            role="img"
        />
    );
};

export default SecureText;
