import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Workspace-Root explizit setzen, damit Turbopack keinen Elternordner waehlt.
  turbopack: { root: path.resolve(__dirname) },
  // Schlankes, eigenstaendiges Build nur fuer den Docker-Container.
  // Lokal (npm run build && npm start) bleibt der normale Modus, sonst
  // warnt "next start" bei jedem Start.
  output: process.env.STANDALONE_BUILD ? 'standalone' : undefined,
};

export default nextConfig;
