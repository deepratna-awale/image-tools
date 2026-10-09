import { toolByHref } from "@/lib/tools";

/** Icon, name and one-line description at the top of every tool page */
export default function ToolHeader({ href, description }: { href: string; description?: string }) {
  const tool = toolByHref(href);
  if (!tool) return null;
  const Icon = tool.icon;

  return (
    <div className="flex flex-col items-center gap-3 px-4 pt-10 pb-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary ring-1 ring-primary/20">
        <Icon className="size-6" />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
      <p className="max-w-xl text-muted-foreground">{description ?? tool.description}</p>
    </div>
  );
}
