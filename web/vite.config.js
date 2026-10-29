import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 개발 중 /api 요청은 로컬 백엔드(application.yml server.port=8081)로 프록시
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../backend/src/main/resources', import.meta.url))] },
    proxy: {
      '/api': 'http://localhost:8081',
      '/report-runtime': 'http://localhost:8081',
    },
  },
});
