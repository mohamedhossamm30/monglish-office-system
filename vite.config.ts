import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const suppressHmrPlugin: Plugin = {
  name: 'suppress-hmr-logs',
  transformIndexHtml: {
    order: 'pre',
    handler() {
      return [
        {
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `
(function() {
  function isViteHmr(arg) {
    if (!arg) return false;
    var s = typeof arg === 'string' ? arg : (arg.message || arg.stack || String(arg));
    return s.indexOf('[vite]') !== -1 || s.indexOf('WebSocket') !== -1 || s.indexOf('vite:') !== -1;
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function(method) {
    var orig = console[method];
    console[method] = function() {
      for (var i = 0; i < arguments.length; i++) {
        if (isViteHmr(arguments[i])) return;
      }
      orig.apply(console, arguments);
    };
  });
  var RealWebSocket = window.WebSocket;
  if (RealWebSocket) {
    window.WebSocket = function(url, protocols) {
      if (protocols === 'vite-hmr' || (typeof url === 'string' && (url.indexOf('vite-hmr') !== -1 || url.indexOf('token=') !== -1))) {
        return {
          url: url,
          readyState: 3,
          send: function() {},
          close: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; },
          onopen: null,
          onclose: null,
          onerror: null,
          onmessage: null
        };
      }
      return new RealWebSocket(url, protocols);
    };
    window.WebSocket.prototype = RealWebSocket.prototype;
  }
  window.addEventListener('error', function(e) {
    if (isViteHmr(e.message) || isViteHmr(e.filename) || isViteHmr(e.error)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    if (isViteHmr(e.reason)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
})();
`,
          injectTo: 'head-prepend'
        }
      ];
    }
  }
};

export default defineConfig(() => {
  return {
    plugins: [
      suppressHmrPlugin,
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'نظام إدارة المكتب — مونجلش',
          short_name: 'إدارة المكتب',
          description: 'نظام إدارة المكتب الشامل لأكاديمية مونجلش الدولية - مقر الإسكندرية',
          theme_color: '#075073',
          background_color: '#03151F',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
