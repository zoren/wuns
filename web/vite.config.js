import { defineConfig, searchForWorkspaceRoot } from 'vite'
import path from 'path'
export default defineConfig({
  server: {
    fs: {
      allow: [
        // search up for workspace root
        path.join(searchForWorkspaceRoot(process.cwd()), '..'),
      ],
    },
  },
})
