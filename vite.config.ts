import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Experimental editorial layout generator.
// base: './' keeps asset URLs relative so a production build can be opened from any path.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    open: false,
  },
})
