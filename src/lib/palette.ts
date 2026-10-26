/** Farben fuer Diagramm-Reihen. Eigene Datei ohne 'use client', damit auch Server-Seiten sie nutzen koennen. */
export const PALETTE = ['#e5006d', '#22c55e', '#6366f1', '#eab308', '#0ea5e9', '#f97316', '#a855f7', '#14b8a6', '#64748b'];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];
