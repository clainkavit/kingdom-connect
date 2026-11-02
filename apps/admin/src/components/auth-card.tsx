import { strings } from "@/strings";
import { NavIcon } from "./nav-icon";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <NavIcon name="users" size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-foreground">
            {strings.appName} {strings.adminLabel}
          </span>
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}
