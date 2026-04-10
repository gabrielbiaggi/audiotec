#!/bin/bash

# ==============================================================================
# SCRIPT DE SINCRONIZAÇÃO: AUDIOTEC -> NOTEBOOKLM
# ==============================================================================
# Empacota o codebase via Repomix e sincroniza com o NotebookLM.
# Executar manualmente: bash sync_notebooklm.sh
# ==============================================================================

# Garante que ~/.local/bin (onde nlm é instalado via pipx) esteja no PATH
export PATH="$HOME/.local/bin:$PATH"

NOTEBOOK_ID="8a0eebb6-995c-40e8-8a7d-0ee8513eb8f6"
PROJECT_ROOT="/mnt/allmight/alldata/Projetos/Igreja/audiotec"
TEMP_DIR="/tmp/nlm_sync"
OUTPUT_FILE="$TEMP_DIR/audiotec_codebase.txt"
TITLE_PREFIX="audiotec-codebase"

ensure_nlm_auth() {
    echo "🔐 Validando autenticação do NotebookLM..."

    if nlm login --check >/dev/null 2>&1; then
        echo "   → Sessão válida."
        return 0
    fi

    echo "   → Sessão inválida/expirada. Renovando autenticação..."
    if nlm login --force >/dev/null 2>&1; then
        echo "   → Autenticação renovada com sucesso."
        return 0
    fi

    echo "❌ Falha ao autenticar no NotebookLM via CLI."
    exit 1
}

ensure_notebook_access() {
    echo "📓 Validando acesso ao notebook alvo..."

    if nlm notebook get "$NOTEBOOK_ID" --json >/dev/null 2>&1; then
        echo "   → Notebook acessível."
        return 0
    fi

    echo "   → Falha ao acessar notebook. Tentando renovar sessão e validar novamente..."
    ensure_nlm_auth

    if nlm notebook get "$NOTEBOOK_ID" --json >/dev/null 2>&1; then
        echo "   → Notebook acessível após renovar sessão."
        return 0
    fi

    echo "❌ NOTEBOOK_ID inválido ou sem acesso: $NOTEBOOK_ID"
    exit 1
}

# ---- Verificação de dependências ----
if ! command -v nlm >/dev/null 2>&1; then
    echo "❌ 'nlm' não encontrado. Instale com: pipx install notebooklm-mcp-cli"
    exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
    echo "❌ 'npx' não encontrado. Instale o Node.js."
    exit 1
fi

echo "🚀 Iniciando sincronização audiotec → NotebookLM..."

ensure_nlm_auth
ensure_notebook_access

cd "$PROJECT_ROOT" || { echo "❌ Não foi possível acessar $PROJECT_ROOT"; exit 1; }

# ---- 1. Prep temp ----
mkdir -p "$TEMP_DIR"
rm -f "$TEMP_DIR"/audiotec_codebase*.txt

# ---- 2. Repomix dump ----
echo "📦 Gerando dump do codebase com Repomix..."
npx -y repomix "$PROJECT_ROOT" \
    --ignore "node_modules*,src-tauri/target/**,*.lock,dist,*.png,*.ico,*.svg,design-reference/**" \
    --output "$OUTPUT_FILE"

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "❌ Falha ao gerar dump via Repomix."
    exit 1
fi

# ---- 3. Sanitizar (remove bytes NUL e UTF-8 inválido) ----
echo "🧹 Sanitizando dump..."
LC_ALL=C tr -d '\000' < "$OUTPUT_FILE" | iconv -f UTF-8 -t UTF-8 -c > "${OUTPUT_FILE}.clean"
mv "${OUTPUT_FILE}.clean" "$OUTPUT_FILE"

FILE_SIZE=$(wc -c < "$OUTPUT_FILE")
echo "   → Arquivo: $(( FILE_SIZE / 1024 ))KB"

# ---- 4. Deletar fontes antigas ----
echo "🗑️  Removendo fontes antigas do NotebookLM..."
OLD_IDS=$(nlm notebook get "$NOTEBOOK_ID" --json 2>/dev/null | python3 -c "
import sys, json
try:
    sources = json.load(sys.stdin).get('value', {}).get('sources', [])
    ids = [s['id'] for s in sources
           if any(k in s.get('title','') for k in ['audiotec-codebase','audiotec_codebase'])]
    print(' '.join(ids))
except Exception:
    pass
" 2>/dev/null)

if [ -n "$(echo "$OLD_IDS" | tr -d ' ')" ]; then
    COUNT_OLD=$(echo "$OLD_IDS" | wc -w)
    # shellcheck disable=SC2086
    nlm source delete $OLD_IDS --confirm
    echo "   → $COUNT_OLD fonte(s) removida(s)"
else
    echo "   → Nenhuma fonte antiga encontrada."
fi

# ---- 5. Upload do arquivo ----
TITLE="${TITLE_PREFIX}-$(date +%Y-%m-%d)"
echo "📤 Fazendo upload: $TITLE..."

SENT=false
for ATTEMPT in 1 2 3; do
    if nlm source add "$NOTEBOOK_ID" --file "$OUTPUT_FILE" --title "$TITLE" --wait; then
        SENT=true
        break
    fi
    echo "   ↻ Falhou, retry ${ATTEMPT}/3 (aguardando $(( ATTEMPT * 3 ))s)..."
    sleep $(( ATTEMPT * 3 ))
done

# ---- 6. Resultado ----
rm -rf "$TEMP_DIR"
echo ""
if [ "$SENT" = true ]; then
    echo "✅ Sync concluído: $TITLE enviado ao NotebookLM!"
else
    echo "❌ Falha definitiva no upload!"
    exit 1
fi
