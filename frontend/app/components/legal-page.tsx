export const CONTACT_URL = "https://github.com/deepratna-awale/image-tools/issues";
export const LAST_UPDATED = "11 October 2026";

/** Shared layout for the privacy policy and terms pages */
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
      <div className="mt-8 flex flex-col gap-4 leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </main>
  );
}
