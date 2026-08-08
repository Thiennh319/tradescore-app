#!/usr/bin/env node
/**
 * Stamp constants/buildDate.generated.ts with today's Asia/Ho_Chi_Minh date.
 * Run BEFORE expo export / Gradle so the JS bundle embeds the real build day.
 * Usage: node scripts/stamp-build-date.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { writeBuildDateGenerated } from './lib/buildDateStamp.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { path: out, buildDate } = writeBuildDateGenerated(root);
console.log(`buildDate stamped: ${buildDate} -> ${out}`);
