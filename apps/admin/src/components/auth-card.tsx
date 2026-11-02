import { strings } from "@/strings";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-7 py-3.5">
        <span className="text-[19px] font-extrabold text-white">{strings.appName}</span>
        <span className="text-xs tracking-[0.08em] text-navy-mute uppercase">
          {strings.adminLabel}
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-7">
        <div className="flex w-full max-w-[400px] flex-col gap-3 rounded-lg border bg-card p-[18px]">
          <h1 className="text-lg font-extrabold text-foreground">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
