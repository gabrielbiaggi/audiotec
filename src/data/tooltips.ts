/**
 * Tooltip definitions for AudioTec contextual help system.
 * Each control/concept gets a short explanation targeting beginners.
 */

export interface TooltipDef {
  id: string;
  title: string;
  short: string;
  detail?: string;
}

export const TOOLTIPS: Record<string, TooltipDef> = {
  coherence: {
    id: "coherence",
    title: "Coerência (γ²)",
    short: "Mostra a confiabilidade da medição. Se estiver baixa (vermelha), o som está sofrendo reflexões da sala ou ruído externo.",
    detail: "Varia de 0 a 1. Acima de 0.85 é confiável. Abaixo de 0.5 indica que a medição naquela faixa de frequência não é representativa do sistema de som — provavelmente há muita interferência do ambiente.",
  },
  phaseWrap: {
    id: "phaseWrap",
    title: "Phase Wrap",
    short: "Quando a fase ultrapassa +180° ou -180°, ela 'dá a volta'. Isso é normal — representa o atraso entre referência e medição.",
    detail: "Se você ver a fase girando rapidamente, significa que há um atraso (delay) não compensado entre o sinal de referência e o medido. Use o Delay Finder para corrigir.",
  },
  delayFinder: {
    id: "delayFinder",
    title: "Delay Finder",
    short: "Encontra automaticamente o atraso entre o sinal de referência e o medido pelo microfone. Essencial para alinhar subs com PA.",
    detail: "O Delay Finder calcula a Resposta ao Impulso (IR) e encontra o pico principal. A distância em milissegundos corresponde ao tempo que o som leva para chegar da caixa ao microfone.",
  },
  transferFunction: {
    id: "transferFunction",
    title: "Função de Transferência (TF)",
    short: "Compara o sinal que ENTRA na mesa com o que SAI pela caixa de som. Mostra exatamente o que o sistema de som está fazendo com o áudio.",
    detail: "A linha de cima (Magnitude) mostra ganho/perda por frequência. A linha de baixo (Fase) mostra o atraso relativo. Juntas, revelam a 'assinatura' completa do sistema.",
  },
  fftSize: {
    id: "fftSize",
    title: "Tamanho da FFT",
    short: "Controla a resolução da análise. Valores maiores = mais detalhe em graves, mas resposta mais lenta. 4096 é ideal para PA ao vivo.",
    detail: "FFT 4096 @ 48kHz = resolução de 11.7Hz e ~85ms de janela. FFT 8192 dá mais detalhe abaixo de 100Hz, mas responde mais devagar a mudanças.",
  },
  windowType: {
    id: "windowType",
    title: "Tipo de Janela (Window)",
    short: "Define como o software 'recorta' o áudio para análise. Hann é o padrão para PA — bom equilíbrio entre resolução e vazamento.",
    detail: "Hann: uso geral. BlackmanHarris: menos vazamento, ideal para sinais tonais. FlatTop: mais preciso em amplitude, mas pior em frequência. Rectangular: sem janelamento.",
  },
  averaging: {
    id: "averaging",
    title: "Média (Averaging)",
    short: "Suaviza a medição tirando a média de vários frames. Mais média = menos ruído visual, mas responde mais devagar. 8x é bom para alinhamento.",
    detail: "Usa média exponencial (EMA). O LPF filter aplica suavização adicional no domínio do tempo. Para captura rápida use 2x-4x; para alinhamento de subs use 16x-32x.",
  },
  sampleRate: {
    id: "sampleRate",
    title: "Taxa de Amostragem (Sample Rate)",
    short: "Quantas vezes por segundo o áudio é capturado. 48kHz é o padrão profissional — cobre todo o espectro audível até 20kHz.",
    detail: "44.1kHz = padrão CD. 48kHz = padrão broadcast/PA. 96kHz = dobro de resolução temporal, útil para medições de impulso muito precisas.",
  },
  signalGenerator: {
    id: "signalGenerator",
    title: "Gerador de Sinal",
    short: "Gera ruído rosa (Pink Noise) ou outros sinais de teste direto pelo software. Essencial para medições — o ruído rosa tem energia igual por oitava.",
    detail: "Pink Noise é o padrão para medição de PA porque simula a distribuição de energia da música. White Noise tem energia igual por frequência (soa mais agudo).",
  },
  magnitude: {
    id: "magnitude",
    title: "Magnitude (dBFS / dB)",
    short: "A curva principal do gráfico. Mostra o 'volume' de cada frequência. Em Espectro mostra em dBFS (nível digital); em TF mostra ganho/perda relativo.",
    detail: "Em modo Espectro, 0 dBFS = máximo digital (clipping). Em modo Transferência, 0 dB = sem ganho nem perda — a caixa reproduz fielmente o que entra.",
  },
  phase: {
    id: "phase",
    title: "Fase (graus)",
    short: "A linha rosa/magenta. Mostra o 'atraso' de cada frequência. Se a fase está reta e perto de 0°, o sistema está bem alinhado.",
    detail: "Em um sistema perfeito, a fase é 0° em todas as frequências. Cruzamentos de crossover e reflexões da sala causam rotação de fase. Use o Delay Finder para compensar atrasos grossos.",
  },
  spectrum: {
    id: "spectrum",
    title: "Espectro (RTA)",
    short: "Modo Real-Time Analyzer. Mostra o nível de cada frequência em tempo real — como um 'equalizador visual' do som na sala.",
    detail: "Ideal para verificar se o som está equilibrado, encontrar ressonâncias da sala, e ajustar EQ de sistema. Os dois canais (REF e MED) permitem comparar entrada vs saída.",
  },
  impulse: {
    id: "impulse",
    title: "Resposta ao Impulso (IR)",
    short: "Mostra como o som se propaga no ambiente ao longo do tempo. O pico principal é o som direto; os picos menores são reflexões.",
    detail: "A IR é calculada via IFFT da Função de Transferência. É como bater palmas e ver o 'eco' do ambiente. O Delay Finder usa a IR para encontrar o atraso.",
  },
  autoEq: {
    id: "autoEq",
    title: "Auto-EQ",
    short: "Calcula automaticamente filtros paramétricos para 'corrigir' a resposta do sistema e aproximá-la de uma curva alvo.",
    detail: "O algoritmo detecta picos e vales na medição e gera bandas PEQ (frequência + ganho + Q). Os filtros podem ser enviados via OSC para mixers como X32/M32.",
  },
  oscControl: {
    id: "oscControl",
    title: "Controle OSC",
    short: "Open Sound Control — protocolo para controlar mixers digitais pela rede. O AudioTec pode enviar EQ e parâmetros direto para sua mesa X32, M32 ou QL.",
    detail: "Configure o IP e porta do mixer. Depois de rodar o Auto-EQ, os filtros podem ser enviados automaticamente para o canal desejado da mesa digital.",
  },
};

/** Wizard step definitions */
export interface WizardStep {
  id: string;
  title: string;
  content: string;
  highlightSelector?: string;
  action?: string;
}

export interface WizardFlow {
  id: string;
  title: string;
  description: string;
  icon: string;
  steps: WizardStep[];
}

export const WIZARD_FLOWS: WizardFlow[] = [
  {
    id: "calibrate-mic",
    title: "Como Calibrar o Microfone",
    description: "Configure seu microfone de medição corretamente para obter resultados precisos.",
    icon: "mic",
    steps: [
      {
        id: "cal-1",
        title: "Conecte o Microfone",
        content: "Conecte seu microfone de medição (ex: Behringer ECM8000, Dayton Audio UMM-6) na entrada do canal 2 da sua interface de áudio. O canal 1 será o sinal de referência vindo da mesa.",
      },
      {
        id: "cal-2",
        title: "Selecione o Dispositivo",
        content: "Na barra inferior, clique em 'Device' e selecione sua interface de áudio. Certifique-se de que o Sample Rate está em 48kHz.",
        highlightSelector: "[data-help='device']",
      },
      {
        id: "cal-3",
        title: "Ajuste o Ganho",
        content: "No seu preamp/interface, ajuste o ganho do microfone até que o nível em repouso (ruído de fundo) fique entre -60dBFS e -50dBFS. Isso garante headroom suficiente.",
      },
      {
        id: "cal-4",
        title: "Verifique o Ruído de Fundo",
        content: "Clique '▶ Start' para iniciar a medição. SEM som tocando, o nível deve ficar abaixo de -50dBFS. Se estiver mais alto, reduza o ganho ou verifique interferências.",
        highlightSelector: "[data-help='start']",
      },
      {
        id: "cal-5",
        title: "Calibração Concluída!",
        content: "Seu microfone está pronto. O sinal de referência (CH1, linha cyan) virá direto da mesa, e a medição (CH2, linha amarela) virá do microfone captando o som ambiente.",
      },
    ],
  },
  {
    id: "align-sub",
    title: "Como Alinhar o Sub com o PA",
    description: "Use o Delay Finder para sincronizar subwoofer e caixas principais — elimine cancelamentos.",
    icon: "tune",
    steps: [
      {
        id: "sub-1",
        title: "Prepare as Caixas",
        content: "Posicione o microfone entre o PA (caixas principais) e o subwoofer, no ponto de escuta mais importante (ex: posição do operador de som ou meio da plateia).",
      },
      {
        id: "sub-2",
        title: "Ligue Apenas o PA (Caixas Principais)",
        content: "Mute o subwoofer. Deixe apenas as caixas top/fullrange ligadas. Isso será nossa referência temporal.",
      },
      {
        id: "sub-3",
        title: "Ative o Gerador de Sinal",
        content: "Na barra inferior, mude 'Signal' para 'Pink Noise'. O ruído rosa vai sair pelo PA. Ajuste o volume para um nível confortável.",
        highlightSelector: "[data-help='signal']",
      },
      {
        id: "sub-4",
        title: "Inicie a Medição",
        content: "Clique '▶ Start'. Vá para o modo 'TF' (Função de Transferência) na barra superior. Você verá a magnitude e fase do PA.",
        highlightSelector: "[data-help='start']",
      },
      {
        id: "sub-5",
        title: "Execute o Delay Finder",
        content: "Clique em 'Delay Finder' na barra inferior. O software calculará a Resposta ao Impulso e encontrará automaticamente o atraso em milissegundos.",
        highlightSelector: "[data-help='delay-finder']",
      },
      {
        id: "sub-6",
        title: "Agora Meça o Subwoofer",
        content: "Mute o PA e desmute o subwoofer. Rode o Delay Finder novamente. A diferença entre os dois delays é o valor que você deve inserir no processador/mesa.",
      },
      {
        id: "sub-7",
        title: "Aplique o Delay",
        content: "No seu processador (DBX DriveRack, DCX2496) ou mesa digital (X32), insira o delay encontrado no canal do subwoofer. Depois ligue PA + Sub juntos e verifique a coerência no cruzamento.",
      },
      {
        id: "sub-8",
        title: "Alinhamento Concluído!",
        content: "Com PA e Sub ligados juntos, a fase deve estar mais suave na região de cruzamento (80-120Hz) e a coerência deve estar alta (verde). Se não, ajuste o delay em ±0.5ms.",
      },
    ],
  },
  {
    id: "auto-eq-flow",
    title: "Como Fazer o Auto-EQ",
    description: "Deixe o software calcular os filtros de EQ automaticamente e envie para sua mesa digital.",
    icon: "equalizer",
    steps: [
      {
        id: "eq-1",
        title: "Meça o Sistema",
        content: "Com Pink Noise tocando pelo PA, inicie a medição em modo Transferência (TF). Aguarde pelo menos 10 segundos com média de 16x para uma leitura estável.",
      },
      {
        id: "eq-2",
        title: "Abra o Painel de EQ",
        content: "Clique no ícone de ferramentas (🔧) e selecione a aba 'EQ'. O painel mostrará sua curva medida e permitirá configurar o alvo.",
        highlightSelector: "[data-help='tools']",
      },
      {
        id: "eq-3",
        title: "Configure os Parâmetros",
        content: "Defina o número máximo de bandas (8-12 para começar), o boost máximo (+6dB recomendado), e o threshold (±3dB). Clique 'Calcular EQ'.",
      },
      {
        id: "eq-4",
        title: "Revise os Filtros",
        content: "O software mostrará os filtros PEQ sugeridos. Cada um tem Frequência, Ganho e Q. A curva 'Predita' mostra como ficará após aplicar.",
      },
      {
        id: "eq-5",
        title: "Envie via OSC (Opcional)",
        content: "Se você tem uma mesa digital (X32, M32, QL), vá à aba 'OSC', conecte, e envie os filtros diretamente. Caso contrário, anote os valores e insira manualmente.",
      },
      {
        id: "eq-6",
        title: "EQ Aplicado!",
        content: "Faça uma nova medição para verificar o resultado. A curva deve estar mais próxima do alvo. Repita o processo se necessário, mas evite mais de 2 rodadas de correção.",
      },
    ],
  },
];

/** Glossary entries for the Academy panel */
export interface GlossaryEntry {
  term: string;
  definition: string;
  category: "measurement" | "dsp" | "acoustics" | "equipment";
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: "RTA", definition: "Real-Time Analyzer — analisador de espectro em tempo real. Mostra o nível de cada frequência instantaneamente.", category: "measurement" },
  { term: "FFT", definition: "Fast Fourier Transform — algoritmo que converte áudio do domínio do tempo para frequência. É o 'motor' por trás de toda análise espectral.", category: "dsp" },
  { term: "Função de Transferência", definition: "Comparação matemática entre sinal de entrada (referência) e saída (medição). Revela ganho, fase e coerência do sistema.", category: "measurement" },
  { term: "Coerência", definition: "Indica se a medição é confiável (0 a 1). Valores acima de 0.85 são bons. Coerência baixa = muita interferência do ambiente.", category: "measurement" },
  { term: "Fase", definition: "Atraso relativo de cada frequência, medido em graus (-180° a +180°). Sistema bem alinhado tem fase suave e próxima de 0°.", category: "measurement" },
  { term: "Resposta ao Impulso (IR)", definition: "Como o sistema/sala responde a um pulso instantâneo. O pico principal = som direto; picos secundários = reflexões.", category: "acoustics" },
  { term: "Crossover", definition: "Filtro que divide o sinal em faixas de frequência (graves para sub, médios/agudos para tops). Pode ser passivo (na caixa) ou ativo (no processador).", category: "equipment" },
  { term: "Delay (Atraso)", definition: "Tempo que o som leva para percorrer uma distância. ~2.94ms por metro a 20°C. Essencial para alinhar caixas a distâncias diferentes.", category: "acoustics" },
  { term: "dBFS", definition: "Decibéis Full Scale — escala digital onde 0 dBFS é o máximo. Valores são sempre negativos (ex: -20dBFS). Clipping ocorre acima de 0.", category: "measurement" },
  { term: "dB SPL", definition: "Decibéis Sound Pressure Level — nível de pressão sonora no ar. 0 dB SPL = limiar da audição. 120 dB SPL = limiar da dor.", category: "acoustics" },
  { term: "Pink Noise", definition: "Ruído com energia igual por oitava — soa 'equilibrado'. Padrão para medição de PA porque simula a distribuição de energia da música.", category: "measurement" },
  { term: "White Noise", definition: "Ruído com energia igual por frequência — soa mais agudo que pink noise. Usado em calibração de equipamentos e testes acústicos.", category: "measurement" },
  { term: "PEQ", definition: "Parametric Equalizer — filtro com 3 parâmetros ajustáveis: Frequência central, Ganho (boost/cut), e Q (largura da banda).", category: "dsp" },
  { term: "Q (Fator de Qualidade)", definition: "Largura de um filtro PEQ. Q alto = filtro estreito (cirúrgico). Q baixo = filtro largo (musical). Q 1.0 ≈ 1.4 oitavas.", category: "dsp" },
  { term: "OSC", definition: "Open Sound Control — protocolo de rede para controlar mixers digitais. Permite enviar parâmetros (EQ, faders, delay) do AudioTec para sua mesa.", category: "equipment" },
  { term: "Averaging (Média)", definition: "Suavização temporal da medição. Mais média = menos ruído visual, mas resposta mais lenta. Usa média exponencial (EMA).", category: "measurement" },
  { term: "Janelamento (Window)", definition: "Função matemática aplicada ao bloco de áudio antes da FFT. Hann é o padrão — minimiza artefatos de borda.", category: "dsp" },
  { term: "Latência", definition: "Atraso total do sistema (conversor AD + processamento + conversor DA). Em medição, é compensada automaticamente pelo delay finder.", category: "equipment" },
  { term: "Schroeder Frequency", definition: "Frequência acima da qual a sala se comporta de forma difusa. Abaixo dela, modos ressonantes (standing waves) dominam.", category: "acoustics" },
  { term: "Modos da Sala", definition: "Frequências onde o som ressoa intensamente devido às dimensões do ambiente. Causam 'picos' e 'vales' em graves.", category: "acoustics" },
  { term: "Cardioid Sub", definition: "Configuração de subwoofers que reduz emissão para trás do palco. Usa delay e polaridade invertida em subs traseiros.", category: "equipment" },
  { term: "Line Array", definition: "Sistema de caixas empilhadas verticalmente que formam uma fonte sonora coerente. Cada elemento cobre um ângulo, permitindo cobertura uniforme.", category: "equipment" },
  { term: "Drive Rack", definition: "Processador digital de sistema que inclui crossover, EQ, delay, limiters. Fica entre a mesa e os amplificadores.", category: "equipment" },
];
