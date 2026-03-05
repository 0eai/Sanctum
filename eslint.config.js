import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.{js,jsx}'],
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                navigator: 'readonly',
                alert: 'readonly',
                prompt: 'readonly',
                confirm: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                fetch: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                crypto: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                Uint8Array: 'readonly',
                ArrayBuffer: 'readonly',
                MediaStream: 'readonly',
                RTCPeerConnection: 'readonly',
                RTCSessionDescription: 'readonly',
                RTCIceCandidate: 'readonly',
                AbortController: 'readonly',
                HTMLAnchorElement: 'readonly',
                HashChangeEvent: 'readonly',
                Headers: 'readonly',
                Response: 'readonly',
                ReadableStream: 'readonly',
                WritableStream: 'readonly',
                TransformStream: 'readonly',
                EventSource: 'readonly',
                Worker: 'readonly',
                structuredClone: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                performance: 'readonly',
                location: 'readonly',
                history: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                indexedDB: 'readonly',
                Image: 'readonly',
                process: 'readonly',
            },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },

    // ──────────────────────────────────────────────────
    // ARCHITECTURAL BOUNDARY: Presentation → Infrastructure
    //
    // .jsx components MUST NOT import directly from lib/crypto or lib/firebase.
    // All crypto/firebase operations must go through the service layer.
    // ──────────────────────────────────────────────────
    {
        files: ['src/apps/*/components/**/*.jsx', 'src/components/**/*.jsx'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    {
                        group: ['**/lib/crypto', '**/lib/crypto/*', '**/lib/firebase'],
                        message: '❌ Architectural violation: Components must not import from lib/crypto or lib/firebase directly. Use your service layer instead.',
                    },
                ],
            }],
        },
    },

    // App root .jsx files (e.g. Notes.jsx) may use services but not crypto/firebase directly
    {
        files: ['src/apps/*/*.jsx'],
        rules: {
            'no-restricted-imports': ['warn', {
                patterns: [
                    {
                        group: ['**/lib/crypto', '**/lib/crypto/*', '**/lib/firebase'],
                        message: '⚠️ Prefer importing from your service layer instead of lib/crypto or lib/firebase directly.',
                    },
                ],
            }],
        },
    },

    { ignores: ['dist/', 'node_modules/', '*.config.js'] },
];
