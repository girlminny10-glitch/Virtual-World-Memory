# 🚀 Virtual World Memory - Guia de Deployment

## 📋 Overview

Este projeto usa um pipeline de CI/CD que sincroniza automaticamente entre:
- **GitHub** (fonte de verdade)
- **Railway** (production)
- **Replit** (desenvolvimento)

---

## 🔧 Configuração Rápida

### 1. Railway Setup

```bash
# Variáveis de ambiente necessárias no Railway:
PORT=8080
NODE_ENV=production
GROQ_API_KEY=sk_...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGc...
```

**Arquivo de configuração**: `railway.toml`
- Build automático ao fazer push
- Start command: `node --enable-source-maps ./artifacts/api-server/dist/index.mjs`

### 2. Replit Setup

```bash
# Variáveis no .env (Replit Secrets):
GROQ_API_KEY=sk_...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGc...
```

**Arquivo de configuração**: `.replit`
- Conectado ao repositório GitHub
- Sincroniza automaticamente
- Execute `pnpm dev` para testar

---

## 📡 Fluxo de Sincronização

```
Local (seu computador)
    ↓ git push
GitHub (repositório central)
    ↓ webhook automático
    ├→ Railway (deploy prod)
    └→ Replit (sync via GitHub)
```

### ✅ Ordem de Sincronização

1. **Local → GitHub** (você faz push)
2. **GitHub → Railway** (automático via webhook)
3. **GitHub → Replit** (automático via GitHub sync)

---

## 🚀 Como Deploy

### Opção 1: Automático (Recomendado)

```bash
# Na sua máquina local
pnpm run deploy  # Isso executa scripts/deploy.sh
```

Ou simplesmente:
```bash
git add -A
git commit -m "feature: sua mudança"
git push origin main
```

**O que acontece:**
- ✅ GitHub atualiza
- ✅ Railway detecta e faz deploy automático
- ✅ Replit sincroniza do GitHub
- ✅ Logs aparecem em Railway dashboard

### Opção 2: Manual via Railway CLI

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up
```

### Opção 3: Via Replit

1. Abra seu projeto no Replit
2. Faça mudanças
3. Commit e push (Replit oferece interface Git)
4. Railway detecta automaticamente

---

## 🔍 Monitoramento e Debug

### Ver Logs do Railway

```bash
# Instalar CLI do Railway
npm i -g @railway/cli

# Login
railway login

# Ver logs em tempo real
railway logs --follow

# Ou via Railway Dashboard
# https://railway.app → seu projeto → Logs
```

### Ver Logs do Replit

```bash
# Dentro do Replit
tail -f .logs/error.log

# Ou no console do Replit
```

### Health Check

```bash
# Testar se está funcionando
curl http://localhost:8080/api/healthz

# Ou em produção (Railway)
curl https://seu-app.up.railway.app/api/healthz
```

### Monitorar Estado do Mundo

```bash
# Ver estado dos NPCs
curl http://localhost:8080/api/world/state

# Ver detalhes de um NPC
curl http://localhost:8080/api/npcs/npc-1
```

---

## 🛠️ Troubleshooting

### ❌ Railway não está fazendo deploy

**Solução:**
1. Verifique se `railway.toml` está no root
2. Verifique se variáveis de ambiente estão todas configuradas
3. Ver logs: `railway logs --follow`

```bash
# Forçar rebuild
railway build --force
```

### ❌ Replit não está sincronizando

**Solução:**
1. Replit → Account → GitHub → Reconnect
2. Ou faça sync manual: Pull from GitHub

### ❌ Erros de IA no Railway

**Solução:**
```bash
# Verificar se GROQ_API_KEY está configurada
railway logs --follow | grep GROQ

# Se não aparecer, configure em Railway Dashboard:
# Project → Variables → Adicione GROQ_API_KEY
```

### ❌ WebSocket não funciona

**Solução:**
```bash
# Verificar se porta está correta
railway logs --follow | grep "listening"

# Deve mostrar: "listening on port 8080"
```

---

## 📊 Scripts Disponíveis

```bash
# Desenvolvimento
pnpm dev          # Build + Start com NODE_ENV=development

# Produção
pnpm prod         # Build + Start com NODE_ENV=production

# Deploy automático
pnpm run deploy   # Git push + Railway deploy

# Validação
pnpm run typecheck  # TypeScript check
pnpm run build      # Build apenas

# Ver status
cat .build-status.json    # Último build
cat .build-error.json     # Último erro
```

---

## 🔐 Variáveis de Ambiente

### Obrigatórias em Produção

```env
PORT=8080
NODE_ENV=production
GROQ_API_KEY=sk_...              # De https://console.groq.com
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGc...
```

### Opcionais

```env
LOG_LEVEL=info                    # debug, info, warn, error
RAILWAY_ENVIRONMENT_NAME=...      # Automático no Railway
```

---

## 📈 Performance

### Otimizações Ativas

- ✅ Timeout de 15s para requisições IA
- ✅ Cap de 300 tokens para respostas rápidas
- ✅ Try-catch em todas as funções críticas
- ✅ Fallback automático para movimento
- ✅ Graceful shutdown

### Monitorar Performance

```bash
# Ver CPU/Memória no Railway
railway logs --follow | grep -E "(usage|memory|cpu)"

# Ou via Railway Dashboard → Project → Metrics
```

---

## 🚀 Próximos Passos

1. ✅ Configure variáveis em Railway Dashboard
2. ✅ Teste com `pnpm dev` no Replit
3. ✅ Faça um commit e push para testar pipeline
4. ✅ Monitore logs em Railway
5. ✅ Se tudo funcionar, parabéns! 🎉

---

## 📞 Suporte

- **Railway**: https://railway.app → Docs ou Support
- **Replit**: https://replit.com → Help ou Community
- **GitHub**: Crie um issue neste repositório

---

**Última atualização**: 2026-06-04  
**Status**: ✅ Documentação Completa
