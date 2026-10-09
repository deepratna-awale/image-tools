import Image from "next/image";
import Link from "next/link";
import { AspectRatio } from "../components/ui/aspect-ratio";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-2 pb-24 gap-18 sm:p-3 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[12px] items-center w-full max-w-5xl">
        <h1 className="text-center w-full text-6xl">Image Tools</h1>
        <p className="text-muted-foreground text-center w-full text-lg">
          Use popular image tools in your browser, free, no sign-up required.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 w-full max-w-4xl mx-auto">
          <Link href="/bg-remover" className="flex flex-col items-center">
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden w-full"
            >
              <Image
                className="hover:scale-110 transition-transform duration-300"
                src="/bg-remover.png"
                alt="Background Remover"
                fill
                style={{ objectFit: "cover" }}
              />
            </AspectRatio>
            <span className="mt-3 text-base font-medium text-center">
              Background Remover
            </span>
          </Link>
          <Link href="/sky-swap" className="flex flex-col items-center">
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden w-full"
            >
              <Image
                className="hover:scale-110 transition-transform duration-300"
                src="/sky-swap.png"
                alt="Sky Swap"
                fill
                style={{ objectFit: "cover" }}
              />
            </AspectRatio>
            <span className="mt-3 text-base font-medium text-center">
              Sky Swap
            </span>
          </Link>
          <Link href="/bg-changer" className="flex flex-col items-center">
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden w-full"
            >
              <Image
                className="hover:scale-110 transition-transform duration-300"
                src="/bg-changer.png"
                alt="Background Changer"
                fill
                style={{ objectFit: "cover" }}
              />
            </AspectRatio>
            <span className="mt-3 text-base font-medium text-center">
              Background Changer
            </span>
          </Link>
          <Link href="/prompt-reader" className="flex flex-col items-center">
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden w-full"
            >
              <Image
                className="hover:scale-110 transition-transform duration-300"
                src="/prompt-reader.png"
                alt="Prompt Reader"
                fill
                style={{ objectFit: "cover" }}
              />
            </AspectRatio>
            <span className="mt-3 text-base font-medium text-center">
              Prompt Reader
            </span>
          </Link>
          <Link href="/outpainting" className="flex flex-col items-center">
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden w-full"
            >
              <Image
                className="hover:scale-110 transition-transform duration-300"
                src="/outpainting.webp"
                alt="Outpainting"
                fill
                style={{ objectFit: "cover" }}
              />
              <span className="absolute top-3 right-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
                Coming soon
              </span>
            </AspectRatio>
            <span className="mt-3 text-base font-medium text-center">
              Outpainting
            </span>
          </Link>
        </div>
      </main>
      <footer className="flex gap-[24px] flex-wrap items-center justify-center w-full mt-12">
        Footer Text
      </footer>
    </div>
  );
}
