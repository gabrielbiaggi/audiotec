#!/bin/bash

# ==============================================================================
# SCRIPT DE SINCRONIZAÇÃO: AUDIOTEC -> NOTEBOOKLM
# ==============================================================================
# Empacota o codebase via Repomix e sincroniza com o NotebookLM.
# Executar manualmente: bash sync_notebooklm.sh
# ==============================================================================

set -euo pipefail

# Garante que ~/.local/bin (onde nlm é instalado via pipx) esteja no PATH
export PATH="$HOME/.local/bin:$PATH"

NOTEBOOK_ID="8a0eebb6-995c-40e8-8a7d-0ee8513eb8f6"
PROJECT_ROOT="/mnt/allmight/alldata/Projetos/Igreja/audiotec"
TEMP_DIR="/tmp/nlm_sync"
OUTPUT_FILE="$TEMP_DIR/audiotec_codebase.txt"
TITLE_PREFIX="audiotec_codebase"

# ---- Verificação de dependências ----
for cmd in nlm npx python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "❌ '$cmd' não encontrado."
        [[ "$cmd" == "nlm" ]] && echo "   → Instale com: pipx install notebooklm-mcp-cli"
        [[ "$cmd" == "npx" ]] && echo "   → Instale o Node.js."
        exit 1
    fi
done

# ---- 1. Validar autenticação ----
echo "🔐 Validando autenticação do NotebookLM..."
if ! nlm login --check >/dev/null 2>&1; then
    echo ""
    echo "❌ Sessão expirada. Para renovar, copie os cookies do Chrome e execute:"
    echo "   python3 /tmp/save_fresh_cookies.py"
    echo ""
    echo "   (Acesse notebooklm.google.com, F12 → Network → qualquer request →"
    echo "    clique direito → 'Copy as cURL' → cole no script acima)"
    exit 1
fi
echo "   → Sessão válida."

# ---- 2. Prep temp ----
mkdir -p "$TEMP_DIR"
rm -f "$TEMP_DIR"/audiotec_codebase*.txt

# ---- 3. Repomix dump ----
echo "📦 Gerando dump do codebase com Repomix..."
cd "$PROJECT_ROOT"
npx -y repomix \
    --ignore "node_modules/**,src-tauri/target/**,*.lock,dist/**,*.png,*.ico,*.svg,design-reference/**" \
    --output "$OUTPUT_FILE"

if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo "❌ Falha ao gerar dump via Repomix."
    exit 1
fi

FILE_SIZE=$(wc -c < "$OUTPUT_FILE")
TOKEN_COUNT=$(wc -w < "$OUTPUT_FILE")
echo "   → $(( FILE_SIZE / 1024 ))KB (~${TOKEN_COUNT} words)"

# ---- 4. Deletar fontes antigas (título contém prefixo) ----
echo "🗑️  Removendo fontes antigas do NotebookLM..."
OLD_IDS=$(nlm source list "$NOTEBOOK_ID" --json 2>/dev/null | python3 -c "
import sys, json
sources = json.load(sys.stdin)
ids = [s['id'] for s in sources
       if any(k in s.get('title', '') for k in ['audiotec-codebase', 'audiotec_codebase'])]
print(' '.join(ids))
" 2>/dev/null || true)

OLD_IDS=$(echo "$OLD_IDS" | xargs)  # trim whitespace
if [[ -n "$OLD_IDS" ]]; then
    COUNT_OLD=$(echo "$OLD_IDS" | wc -w)
    # shellcheck disable=SC2086
    nlm source delete $OLD_IDS --confirm
    echo "   → $COUNT_OLD fonte(s) removida(s)."
else
    echo "   → Nenhuma fonte antiga encontrada."
fi

# ---- 5. Upload da fonte nova ----
TITLE="${TITLE_PREFIX}_$(date +%Y-%m-%d)"
echo "📤 Fazendo upload: $TITLE..."

set +e
for ATTEMPT in 1 2 3; do
    if nlm source add "$NOTEBOOK_ID" --file "$OUTPUT_FILE" --title "$TITLE" --wait; then
        SENT=true
        break
    fi
    SENT=false
    echo "   ↻ Retry ${ATTEMPT}/3 (aguardando $(( ATTEMPT * 5 ))s)..."
    sleep $(( ATTEMPT * 5 ))
done
set -e

# ---- 6. Resultado ----
rm -rf "$TEMP_DIR"
echo ""
if [[ "${SENT:-false}" == "true" ]]; then
    echo "✅ Sync concluído: '$TITLE' enviado ao NotebookLM!"
    echo "   Notebook: https://notebooklm.google.com/notebook/$NOTEBOOK_ID"
else
    echo "❌ Falha definitiva no upload após 3 tentativas."
    exit 1
fi
