import { defineConfig } from 'vite';
import path from 'node:path';

// Dev-only "art studio": renders 3D models (art-src/) into sprite atlases and
// background layers under public/assets/. Not part of the game bundle.
export default defineConfig({
    root: path.resolve('tools/bake'),
    publicDir: path.resolve('art-src'),
    logLevel: 'warn',
    server: {
        port: 8090,
        strictPort: true,
        fs: { allow: [path.resolve('.')] }
    }
});
