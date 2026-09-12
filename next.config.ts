import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Workspace-Root explizit setzen, damit Turbopack keinen Elternordner waehlt.
  turbopack: { root: path.resolve(__dirname) },
  // Schlankes, eigenstaendiges Build fuer den Docker-Container
  output: 'standalone',
};

export default nextConfig;
