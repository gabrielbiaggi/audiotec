import { useState } from "react";
import { WIZARD_FLOWS, type WizardFlow } from "../data/tooltips";

interface OnboardingGuideProps {
  open: boolean;
  onClose: () => void;
}

/**
 * OnboardingGuide — floating wizard overlay with step-by-step tutorials.
 * Darkens the screen and walks the beginner through procedures.
 */
export default function OnboardingGuide({ open, onClose }: OnboardingGuideProps) {
  const [selectedFlow, setSelectedFlow] = useState<WizardFlow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  if (!open) return null;

  const handleSelectFlow = (flow: WizardFlow) => {
    setSelectedFlow(flow);
    setStepIndex(0);
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      setSelectedFlow(null);
    }
  };

  const handleNext = () => {
    if (selectedFlow && stepIndex < selectedFlow.steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Finished — go back to menu
      setSelectedFlow(null);
      setStepIndex(0);
    }
  };

  const handleClose = () => {
    setSelectedFlow(null);
    setStepIndex(0);
    onClose();
  };

  return (
    <div className="wizard-overlay fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Card */}
      <div className="wizard-card relative z-10 bg-bg-panel border border-border-default rounded-xl
                      shadow-2xl shadow-black/60 w-[480px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="text-accent text-lg">📘</span>
            <h2 className="text-sm font-bold text-text-primary">
              {selectedFlow ? selectedFlow.title : "Guia Interativo"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 rounded flex items-center justify-center text-text-dim
                       hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {!selectedFlow ? (
            /* Flow selection menu */
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-text-dim mb-2">
                Escolha um tutorial para começar. Cada passo vai te guiar pela interface.
              </p>
              {WIZARD_FLOWS.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => handleSelectFlow(flow)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border-default
                             bg-bg-surface hover:bg-bg-elevated hover:border-accent/20
                             transition-colors text-left group"
                >
                  <span className="text-2xl">{flow.icon === "mic" ? "🎙️" : flow.icon === "tune" ? "🔧" : "🎛️"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {flow.title}
                    </p>
                    <p className="text-[10px] text-text-dim mt-0.5 leading-relaxed">
                      {flow.description}
                    </p>
                    <p className="text-[9px] text-text-muted mt-1">{flow.steps.length} passos</p>
                  </div>
                  <span className="text-text-dim group-hover:text-accent transition-colors mt-1">→</span>
                </button>
              ))}
            </div>
          ) : (
            /* Step view */
            <div>
              {/* Progress bar */}
              <div className="flex items-center gap-1.5 mb-4">
                {selectedFlow.steps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full flex-1 transition-colors ${
                      i <= stepIndex ? "bg-accent" : "bg-bg-surface"
                    }`}
                  />
                ))}
              </div>

              {/* Step info */}
              <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">
                Passo {stepIndex + 1} de {selectedFlow.steps.length}
              </div>
              <h3 className="text-[13px] font-bold text-text-primary mb-3">
                {selectedFlow.steps[stepIndex].title}
              </h3>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                {selectedFlow.steps[stepIndex].content}
              </p>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {selectedFlow && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-default">
            <button
              onClick={handleBack}
              className="px-3 py-1 rounded text-[11px] text-text-dim
                         hover:text-text-secondary hover:bg-bg-elevated transition-colors"
            >
              {stepIndex === 0 ? "← Menu" : "← Anterior"}
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-1 rounded text-[11px] font-semibold bg-accent text-black
                         hover:bg-accent-hover transition-colors"
            >
              {stepIndex < selectedFlow.steps.length - 1 ? "Próximo →" : "Concluir ✓"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
