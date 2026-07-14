import path from "path"
import type { IncomingMessage, ServerResponse } from "node:http"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function robinhoodGraphqlProxy(): Plugin {
  const upstreamUrl = 'https://interface.gateway.uniswap.org/v1/graphql'
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/rh-graphql')) return next()
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ error: 'POST only' }))
      return
    }

    try {
      const body = await readBody(req)
      let status = 502
      let text = ''
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const upstream = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'https://app.uniswap.org',
              referer: 'https://app.uniswap.org/',
              'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body,
          })
          status = upstream.status
          text = await upstream.text()
          if ((status >= 500 || status === 429) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
            continue
          }
          break
        } catch (e) {
          status = 502
          text = JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
          if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
        }
      }
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(text)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    }
  }
  return {
    name: 'robinhood-graphql-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

function robinhoodGeckoProxy(): Plugin {
  const base = 'https://api.geckoterminal.com/api/v2'
  const cache = new Map<string, { status: number; body: string; exp: number }>()
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/rh-gecko')) return next()
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end(JSON.stringify({ error: 'GET only' }))
      return
    }

    const parsed = new URL(req.url, 'http://local')
    const path = parsed.searchParams.get('path') || req.url.replace(/^\/api\/rh-gecko/, '') || '/'
    const hit = cache.get(path)
    if (hit && hit.exp > Date.now()) {
      res.statusCode = hit.status
      res.setHeader('content-type', 'application/json')
      res.setHeader('x-rh-gecko-cache', 'HIT')
      res.end(hit.body)
      return
    }

    let status = 502
    let body = ''
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const upstream = await fetch(`${base}${path}`, {
          headers: { accept: 'application/json', 'user-agent': 'crypto-dashboard-rh-lp/1.0' },
        })
        status = upstream.status
        body = await upstream.text()
        if (status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
          continue
        }
        break
      } catch (e) {
        status = 502
        body = JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      }
    }

    if (status === 200) cache.set(path, { status, body, exp: Date.now() + 90_000 })
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('x-rh-gecko-cache', 'MISS')
    res.end(body)
  }

  return {
    name: 'robinhood-gecko-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), robinhoodGraphqlProxy(), robinhoodGeckoProxy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
