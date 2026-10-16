import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // Retain Vite's default private-file exclusions, plus local source captures
      // and QA history that can contain the original unredacted game account.
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.screenshots.local/**', '**/.taste-skill/**', '**/src/assets/cutouts/**',
        '**/运行日志-dark.png', '**/排班编辑-dark.png', '**/排版编辑-light.png',
      ],
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
