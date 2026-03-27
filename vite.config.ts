import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/didit': {
            target: 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io',
            changeOrigin: true,
            secure: false
          },
          '/api/chat': {
            target: 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io',
            changeOrigin: true,
            secure: false
          },
          '/api/send-email': {
            target: 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io',
            changeOrigin: true,
            secure: false
          },
          '/api/whatsapp': {
            target: 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io',
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [react(), basicSsl()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
