import { useState } from "react";
import { Package, FolderOpen, Sparkles } from "lucide-react";

interface WelcomeWizardProps {
  onComplete: () => void;
  onAddRepo: () => void;
}

export function WelcomeWizard({ onComplete, onAddRepo }: WelcomeWizardProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Roadmap Manager",
      description: "A desktop app for managing multi-repo roadmaps with AI-assisted item creation.",
      icon: Package,
    },
    {
      title: "Add Your Repos",
      description: "Point to your git repositories that contain markdown work items in docs/ directories.",
      icon: FolderOpen,
    },
    {
      title: "AI-Powered Documentation",
      description: "Use Claude to create detailed bug reports, improvements, and features from just a title.",
      icon: Sparkles,
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
          <current.icon className="w-8 h-8 text-primary" />
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">{current.title}</h2>
          <p className="text-muted-foreground">{current.description}</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <div className="flex gap-3 justify-center">
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              Next
            </button>
          ) : (
            <>
              <button
                onClick={onAddRepo}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                Add your first repo
              </button>
              <button
                onClick={onComplete}
                className="px-6 py-2.5 text-muted-foreground hover:text-foreground text-sm"
              >
                Skip for now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
