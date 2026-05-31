import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any subpath (e.g. GitHub Pages
  // project site `username.github.io/<repo>/`, served from the /docs folder).
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
