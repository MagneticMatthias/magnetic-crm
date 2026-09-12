import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Das CRM liegt als Unterordner im zeit-app-Repo; ohne diese Angabe
  // waehlt Turbopack das Elternverzeichnis als Workspace-Root.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
