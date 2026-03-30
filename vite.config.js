import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // react-syntax-highlighter (used in MarkdownViewer → PaperAiSection → ResearchApp chunk)
  // has circular ESM dependencies that cause a Temporal Dead Zone crash in Rollup's
  // production build. esbuild pre-bundling handles circular deps correctly, so we force
  // it into optimizeDeps.  The manualChunks entry also isolates it from the main bundle.
  optimizeDeps: {
    include: [
      'react-syntax-highlighter',
      'react-syntax-highlighter/dist/esm/styles/prism',
      '@codemirror/view',
      '@codemirror/state',
      '@codemirror/lang-markdown',
      '@codemirror/commands',
      '@codemirror/language',
    ],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-syntax-highlighter')) return 'vendor-syntax-highlighter';
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'vendor-codemirror';
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('@tiptap') || id.includes('tiptap-markdown')) return 'vendor-tiptap';
          if (id.includes('/yjs/') || id.includes('/lib0/')) return 'vendor-yjs';
        },
      },
    },
  },

  server: {
    host: true,      // This is crucial: listens on all IPs (0.0.0.0)
    strictPort: true,
    port: 5175,
    headers: {
      // Clickjacking protection (meta CSP cannot cover frame-ancestors)
      'X-Frame-Options': 'DENY',
      // Prevent MIME-type sniffing
      'X-Content-Type-Options': 'nosniff',
      // HTTPS-only referrer
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Disable browser features not used by this app
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
    }
  }
})
