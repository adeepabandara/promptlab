'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/concept', label: 'Concept Gen' },
  { href: '/image-gen', label: 'Image Gen' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/models', label: 'Models' },
  { href: '/products', label: 'Products' },
  { href: '/results', label: 'Results' },
];

export function Navbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="h-14 border-b bg-white flex items-center px-6 gap-8 shrink-0">
      <Link href="/concept" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center">
          <span className="text-white text-xs font-bold">PL</span>
        </div>
        <span className="font-semibold text-gray-900 text-sm">PromptLab</span>
      </Link>

      <nav className="flex items-center gap-1 flex-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400 hidden sm:block">{userEmail}</span>
        <Button variant="ghost" size="sm" className="text-gray-500 h-7 px-2 text-xs" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
