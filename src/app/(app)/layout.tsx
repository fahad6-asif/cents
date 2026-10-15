import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { currentSession } from "@/lib/session";
import { demoUserName } from "@/lib/sim";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await currentSession(); // seeds this visitor's simulated account on first visit
  const userName = demoUserName();
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar userName={userName} />
      <MobileTopBar userName={userName} />
      <main className="px-4 pt-6 pb-12 md:ml-[232px] md:px-10 md:pt-10">{children}</main>
    </div>
  );
}
