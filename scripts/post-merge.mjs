#!/usr/bin/env node
/**
 * Post-merge hook para validar build após pull/merge
 * Executado automaticamente em Replit e Railway
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('🔄 Post-merge validation iniciado...\n');

try {
  // 1. Instalar deps
  console.log('📦 Instalando dependências...');
  execSync('pnpm install', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  console.log('✅ Deps instaladas\n');

  // 2. TypeScript check
  console.log('🔍 Validando TypeScript...');
  execSync('pnpm run typecheck', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  console.log('✅ TypeScript OK\n');

  // 3. Build
  console.log('🔨 Buildando...');
  execSync('pnpm --filter @workspace/api-server run build', { 
    cwd: PROJECT_ROOT, 
    stdio: 'pipe' 
  });
  console.log('✅ Build OK\n');

  // 4. Status
  const statusFile = path.join(PROJECT_ROOT, '.build-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    success: true,
    environment: process.env.NODE_ENV || 'unknown',
  }, null, 2));

  console.log('🎉 Post-merge validation completada!');
  console.log('✅ Pronto para production\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Erro:', error instanceof Error ? error.message : error);
  
  const errorFile = path.join(PROJECT_ROOT, '.build-error.json');
  fs.writeFileSync(errorFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));

  process.exit(1);
}
