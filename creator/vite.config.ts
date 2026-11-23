import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// O Criador roda em /creator dentro do admin (iframe da página /criador) e o build vai para ../public/creator.
export default defineConfig({
  plugins: [react()],
  base: '/creator/',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { chunkSizeWarningLimit: 1500, outDir: '../public/creator', emptyOutDir: true },
})
