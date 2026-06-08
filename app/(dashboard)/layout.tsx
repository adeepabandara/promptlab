import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/shared/Navbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Navbar userEmail={user.email ?? ''} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
