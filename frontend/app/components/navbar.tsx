import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { ModeToggle } from "./mode-toggle";

export function Navbar() {
  return (
    <nav className="w-full flex justify-center py-4">
      <NavigationMenu className="dark:bg-zinc-900 bg-zinc-300 px-6 py-2 rounded-full drop-shadow-xl/50 ">
        <NavigationMenuList className="flex gap-x-2">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link href="/" className="px-4 py-2 rounded-full transition">
                Home
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/bg-remover"
                className="px-4 py-2 rounded-full transition"
              >
                Background Remover
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/bg-changer"
                className="px-4 py-2 rounded-full transition"
              >
                Background Changer
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/sky-swap"
                className="px-4 py-2 rounded-full transition"
              >
                Sky Swap
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/outpainting"
                className="px-4 py-2 rounded-full transition"
              >
                Outpainting
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <ModeToggle />
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
