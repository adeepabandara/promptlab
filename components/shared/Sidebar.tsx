'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { href: '/concept', label: 'Concept Gen', icon: '🧠' },
  { href: '/image-gen', label: 'Image Gen', icon: '🎨' },
  { href: '/prompts', label: 'Prompts', icon: '📝' },
  { href: '/models', label: 'Models', icon: '🤖' },
  { href: '/products', label: 'Products', icon: '📦' },
  { href: '/results', label: 'Results', icon: '📊' },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r bg-white flex flex-col">
      <div className="px-4 py-5 border-b">
        <h1 className="text-lg font-bold text-gray-900">PromptLab</h1>
        <p className="text-xs text-gray-500 mt-0.5">AI Prompt Testing</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t space-y-2">
        <Separator />
        <p className="px-3 text-xs text-gray-500 truncate">{userEmail}</p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-600"
          onClick={handleLogout}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
