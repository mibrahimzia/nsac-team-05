import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const [owner, repository] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
const isUserSite = repository?.toLowerCase() === `${owner?.toLowerCase()}.github.io`
const base = process.env.GITHUB_ACTIONS === 'true' && repository && !isUserSite
  ? `/${repository}/`
  : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
