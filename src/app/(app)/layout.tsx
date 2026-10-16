import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { RefreshOnDataChange } from "@/components/shell/refresh-on-change";
import { Sidebar } from "@/components/shell/sidebar";
import { currentSession } from "@/lib/session";
import { demoUserName } from "@/lib/sim";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession(); // seeds this visitor's simulated account on first visit
  const userName = demoUserName();
  if (!session) return <BusyNotice />;
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar userName={userName} />
      <MobileTopBar userName={userName} />
      <RefreshOnDataChange />
      <main className="px-4 pt-6 pb-12 md:ml-[232px] md:px-10 md:pt-10">{children}</main>
    </div>
  );
}

/** Shown when the hourly cap on new demo sessions is reached. */
function BusyNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card max-w-md p-6">
        <h1 className="text-[18px] font-semibold text-text">The demo is busy</h1>
        <p className="mt-2 text-[14px] leading-[21px] text-text-secondary">
          Too many new demo accounts were created in the last hour. Please try again in a few minutes.
        </p>
      </div>
    </div>
  );
}
