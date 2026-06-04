import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { createLogger } from 'vite'

const rendererLogger = createLogger()
const _warn = rendererLogger.warn.bind(rendererLogger)
rendererLogger.warn = (msg, opts) => {
  if (msg.includes('Failed to load source map') && msg.includes('@mediapipe')) return
  _warn(msg, opts)
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['electron', 'electron-store', /^node:/],
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        external: ['electron', /^node:/],
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    customLogger: rendererLogger,
    optimizeDeps: {
      exclude: ['@mediapipe/tasks-vision']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
