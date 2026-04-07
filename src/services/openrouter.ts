/**
 * OpenRouter AI Service — Análise de espectro acústico via IA.
 *
 * Usa modelos gratuitos do OpenRouter para analisar dados de FFT,
 * resposta em frequência, coerência e fase — retornando diagnósticos
 * e instruções específicas por equipamento em PT-BR.
 */

import type { SpectrumData } from "../types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Você é um engenheiro acústico sênior especializado em sonorização de igrejas, auditórios e ambientes ao vivo. Você analisa dados de espectro de áudio (frequências, magnitudes, função de transferência, fase, coerência) e fornece diagnósticos técnicos precisos em português brasileiro.

Para cada análise você DEVE:

1. **Resumo do Espectro**: descrever a curva geral (grave/médio/agudo), nível médio, variação
2. **Problemas Identificados**: listar cada problema com gravidade (🟢 Info | 🟡 Aviso | 🔴 Crítico)
   - Ressonâncias / acúmulo em frequências
   - Cancelamentos e nulos
   - Problemas de fase / inversão
   - Delay excessivo entre caixas
   - Potencial de realimentação (feedback)
3. **Instruções por Equipamento**: passos EXATOS para o equipamento do usuário
   - Nome do menu / aba / botão no equipamento
   - Valores numéricos (frequência, ganho, delay em ms e metros)
   - Exemplo: "No DCX2496: UTILITY → DELAY → Output A → ajuste para 4.23 ms (1.46 m)"
4. **Recomendações Gerais**: orientações de posicionamento, tratamento acústico, etc.

Equipamentos que você conhece (menus e workflow):
- **Behringer DCX2496**: UTILITY → DELAY (por saída), INPUT/OUTPUT → EQ (paramétrico 31 bandas), XOVER → crossover, LIMITER, DYNAMIC EQ
- **Behringer DEQ2496**: GEQ (31 bandas), PEQ (10 paramétricos), FEEDBACK DESTROYER (auto), RTA, DELAY
- **Behringer X32/M32**: HOME → canal → EQ → 6 bandas paramétrico, SETUP → Config, ROUTING, EFFECTS rack
- **DBX DriveRack PA2**: Wizard auto-setup, INPUT → EQ/Delay, OUTPUT → crossover/EQ/limiter/delay
- **Yamaha CL/QL**: OVERVIEW → canal → EQ, OUTPUT → Delay, INSERT → GEQ

REGRAS:
- Sempre responda em PT-BR técnico mas acessível
- Use valores numéricos reais (não aproximações vagas)
- Se não há problemas graves, diga isso claramente
- Se os dados parecem ruídosos ou sem sinal, sugira verificar conexões
- Máximo 500 palavras por resposta
- NÃO use markdown headers (##), use apenas texto com emojis de gravidade`;

/**
 * Summarizes SpectrumData into a concise text description for the AI.
 */
export function summarizeSpectrum(data: SpectrumData): string {
  const n = data.frequencies.length;
  if (n === 0) return "Sem dados de espectro disponíveis.";

  const freqs = data.frequencies;
  const magRef = data.magnitudeRef;
  const magMeas = data.magnitudeMeas;
  const transfer = data.transferMagnitude;
  const phase = data.transferPhase;
  const coher = data.coherence;

  // Frequency range
  const fMin = freqs[0]?.toFixed(0) ?? "?";
  const fMax = freqs[n - 1]?.toFixed(0) ?? "?";

  // Average levels
  const avgRef = magRef.reduce((a, b) => a + b, 0) / n;
  const avgMeas = magMeas.reduce((a, b) => a + b, 0) / n;

  // Peak detection (top 5 peaks in measured)
  const peaks: { freq: number; db: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (magMeas[i] > magMeas[i - 1] && magMeas[i] > magMeas[i + 1] && magMeas[i] > avgMeas + 6) {
      peaks.push({ freq: freqs[i], db: magMeas[i] });
    }
  }
  peaks.sort((a, b) => b.db - a.db);
  const topPeaks = peaks.slice(0, 5);

  // Null detection (dips below average - 10dB)
  const nulls: { freq: number; db: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (magMeas[i] < magMeas[i - 1] && magMeas[i] < magMeas[i + 1] && magMeas[i] < avgMeas - 10) {
      nulls.push({ freq: freqs[i], db: magMeas[i] });
    }
  }
  nulls.sort((a, b) => a.db - b.db);
  const topNulls = nulls.slice(0, 5);

  // Average coherence
  const avgCoherence = coher.reduce((a, b) => a + b, 0) / n;

  // Transfer function range
  const transferMin = Math.min(...transfer);
  const transferMax = Math.max(...transfer);

  // Band energy (low/mid/high)
  let lowSum = 0, lowN = 0, midSum = 0, midN = 0, highSum = 0, highN = 0;
  for (let i = 0; i < n; i++) {
    if (freqs[i] < 250) { lowSum += magMeas[i]; lowN++; }
    else if (freqs[i] < 2000) { midSum += magMeas[i]; midN++; }
    else { highSum += magMeas[i]; highN++; }
  }

  const summary = [
    `DADOS DO ESPECTRO (FFT ${data.fftSize} pts, ${data.sampleRate} Hz):`,
    `Faixa: ${fMin} Hz — ${fMax} Hz (${n} bins)`,
    `Nível médio REF: ${avgRef.toFixed(1)} dB | MEAS: ${avgMeas.toFixed(1)} dB`,
    `Energia por banda — Grave (<250Hz): ${lowN > 0 ? (lowSum / lowN).toFixed(1) : "N/A"} dB | Médio (250-2k): ${midN > 0 ? (midSum / midN).toFixed(1) : "N/A"} dB | Agudo (>2k): ${highN > 0 ? (highSum / highN).toFixed(1) : "N/A"} dB`,
    `Função de transferência: ${transferMin.toFixed(1)} a ${transferMax.toFixed(1)} dB (variação ${(transferMax - transferMin).toFixed(1)} dB)`,
    `Coerência média: ${(avgCoherence * 100).toFixed(0)}%`,
  ];

  if (topPeaks.length > 0) {
    summary.push(`Picos detectados: ${topPeaks.map(p => `${p.freq.toFixed(0)}Hz (${p.db.toFixed(1)}dB)`).join(", ")}`);
  }
  if (topNulls.length > 0) {
    summary.push(`Nulos/cancelamentos: ${topNulls.map(p => `${p.freq.toFixed(0)}Hz (${p.db.toFixed(1)}dB)`).join(", ")}`);
  }

  // Phase info
  const phaseWraps = phase.filter((_, i) => i > 0 && Math.abs(phase[i] - phase[i - 1]) > 160).length;
  summary.push(`Fase: ${phaseWraps} inversões detectadas`);

  return summary.join("\n");
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Sends spectrum analysis request to OpenRouter and returns the AI response.
 */
export async function analyzeWithAi(
  spectrumSummary: string,
  roomInfo: string,
  equipment: string,
  history: AiMessage[] = [],
): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Chave da API OpenRouter não configurada. Crie um arquivo .env com VITE_OPENROUTER_API_KEY");

  const model = import.meta.env.VITE_AI_MODEL || "qwen/qwen3-8b:free";

  const userMessage = [
    spectrumSummary,
    roomInfo ? `\nINFORMAÇÕES DA SALA:\n${roomInfo}` : "",
    equipment ? `\nEQUIPAMENTO DO USUÁRIO: ${equipment}` : "",
    "\nAnalise os dados acima e forneça diagnóstico completo com instruções específicas para o equipamento.",
  ].filter(Boolean).join("\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://audiotec.local",
      "X-Title": "AudioTec Acoustic Analyzer",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter erro ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Sem resposta da IA.";
}
