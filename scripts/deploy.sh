#!/bin/bash
# Deploy script com sincronização Railway + Replit
# Uso: pnpm run deploy

set -e

echo "🚀 Iniciando deploy para Railway e Replit..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Validação
echo -e "${BLUE}1️⃣ Validando repositório...${NC}"
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo -e "${RED}❌ Não é um repositório git válido${NC}"
  exit 1
fi

# 2. Instalar dependências
echo -e "${BLUE}2️⃣ Instalando dependências...${NC}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 3. TypeScript check
echo -e "${BLUE}3️⃣ Validando TypeScript...${NC}"
pnpm run typecheck || {
  echo -e "${RED}❌ Erro em TypeScript${NC}"
  exit 1
}

# 4. Build
echo -e "${BLUE}4️⃣ Buildando projeto...${NC}"
pnpm --filter @workspace/api-server run build || {
  echo -e "${RED}❌ Erro no build${NC}"
  exit 1
}

# 5. Git operations
echo -e "${BLUE}5️⃣ Sincronizando com GitHub...${NC}"
git add -A
git commit -m "chore: deploy $(date +%Y-%m-%d\ %H:%M:%S)" 2>/dev/null || true
git push origin main || git push

# 6. Status
echo ""
echo -e "${GREEN}✅ Deploy iniciado com sucesso!${NC}"
echo ""
echo -e "${GREEN}📊 Status da Sincronização:${NC}"
echo -e "  ${GREEN}✓${NC} GitHub: Atualizado"
echo -e "  ${BLUE}→${NC} Railway: Detectando mudanças..."
echo -e "  ${BLUE}→${NC} Replit: Sincronizando do GitHub..."
echo ""
echo -e "${GREEN}💡 Próximos Passos:${NC}"
echo -e "  1. Monitore em: ${BLUE}https://railway.app${NC}"
echo -e "  2. Ver logs: ${BLUE}railway logs --follow${NC}"
echo -e "  3. Testar em Replit: ${BLUE}pnpm dev${NC}"
echo ""
