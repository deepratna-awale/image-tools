import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

export function Navbar() {
  return (
    <nav className="w-full flex justify-center py-4">
      <NavigationMenu className="rounded-ful bg-zinc-900 shadow px-6 py-2 rounded-full">
        <NavigationMenuList className="flex gap-x-2">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/"
                className="px-4 py-2 rounded-ful transition"
              >
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
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
