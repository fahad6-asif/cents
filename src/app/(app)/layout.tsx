import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { demoUserName } from "@/lib/sim";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const userName = demoUserName();
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar userName={userName} />
      <MobileTopBar userName={userName} />
      <main className="px-4 pt-6 pb-12 md:ml-[232px] md:px-10 md:pt-10">{children}</main>
    </div>
  );
}
