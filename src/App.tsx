import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGameTrackStore } from "./store";
import Toast from "./components/Toast";
import NotFoundView from "./components/NotFoundView";
import DashboardView from "./components/DashboardView";
import LibraryView from "./components/LibraryView";
import DiscoverView from "./components/DiscoverView";
import AnalyticsView from "./components/AnalyticsView";
import WishlistView from "./components/WishlistView";
import SettingsModal from "./components/SettingsModal";
import AuthModal from "./components/AuthModal";
import GameDetailsModal from "./components/GameDetailsModal";
import AddGameModal from "./components/AddGameModal";
import { ActivePlayingConflictModal } from "./components/ActivePlayingConflictModal";
import { Menu, X, Settings, Joystick } from "lucide-react";
import PageLoader from "./components/PageLoader";

export default function App() {
  const { 
    activeTab, setActiveTab, fetchGames, fetchAnalytics,
    fetchTrending, fetchDiscoverLists,
    steamSettings, setSettingsOpen, fetchSteamSettings,
    fetchWishlist, fetchCustomPlatforms,
    loadingGames,
  } = useGameTrackStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pathname] = useState(() => window.location.pathname);
  const [booted, setBooted] = useState(false);

  const mainRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Reset scroll position to top instantly when switching tabs
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [activeTab]);

  // Preload everything once at boot — games, Steam identity, analytics,
  // wishlist and custom platforms — so every tab is instant afterwards.
  // Discover fetches respect the 5-minute freshness window inside the store;
  // reading current state via getState() keeps this effect from re-running
  // (its previous deps were written by the very fetches it started).
  useEffect(() => {
    const s = useGameTrackStore.getState();
    fetchGames();
    fetchSteamSettings();
    fetchAnalytics();
    fetchWishlist();
    fetchCustomPlatforms();
    if (s.trendingGames.length === 0 || Date.now() - s.lastTrendingFetch > 300_000) fetchTrending();
    if (!s.discoverLists || Date.now() - s.lastListsFetch > 300_000) fetchDiscoverLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const tabs = [
    { id: "dashboard", num: "00", label: "CENTRAL" },
    { id: "library", num: "01", label: "LIBRARY" },
    { id: "discover", num: "02", label: "DISCOVER" },
    { id: "analytics", num: "03", label: "ANALYTICS" }
  ] as const;

  const renderActiveView = () => {
    switch (activeTab) {
      case "library":
        return <LibraryView />;
      case "discover":
        return <DiscoverView />;
      case "analytics":
        return <AnalyticsView />;
      case "wishlist":
        return <WishlistView />;
      case "dashboard":
      default:
        return <DashboardView />;
    }
  };

  // Custom 404 — any unknown path renders the not-found terminal instead of the app shell
  if (pathname !== "/") {
    return (
      <div className="min-h-dvh bg-brand-bg font-sans selection:bg-brand-accent/30 selection:text-brand-accent">
        <NotFoundView path={pathname} />
        {!booted && (
          <PageLoader checks={[!loadingGames]} onComplete={() => setBooted(true)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen w-full bg-brand-bg overflow-hidden text-zinc-300 font-sans selection:bg-brand-accent/30 selection:text-brand-accent relative">
      
        {/* Subtle Ambient Glow accents across the entire app */}
        <div className="fixed top-[-150px] left-1/3 w-[800px] h-[400px] bg-brand-accent/[0.04] blur-[150px] rounded-full pointer-events-none z-0" />
        <div className="fixed bottom-[-200px] right-1/4 w-[600px] h-[500px] bg-brand-accent/[0.02] blur-[150px] rounded-full pointer-events-none z-0" />

      {/* Container with Sidebar on Desktop, Stacked on Mobile */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-0 relative z-10">
        
        {/* Sidebar Left panel (Desktop Only) */}
        <aside className="hidden md:flex flex-col justify-between px-8 pt-10 pb-4 border-r border-brand-border bg-brand-bg relative z-10">
          <div className="space-y-16">
            {/* Branding Logo */}
            <div className="text-left select-none">
              <div className="text-4xl font-black tracking-tighter leading-none text-brand-accent">
                GAME<br />TRACK_
              </div>
              <p className="text-[11px] font-mono tracking-widest text-brand-muted mt-2 font-bold uppercase">Gaming Registry</p>
            </div>

            {/* Sidebar Navigation */}
            <nav className="space-y-6">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`sidebar-nav-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-baseline gap-4 w-full text-left transition-all ${
                      isActive 
                        ? "text-brand-accent scale-[1.02]" 
                        : "text-white hover:text-brand-accent"
                    }`}
                  >
                    <span className="text-xs font-mono font-bold text-brand-muted group-hover:text-brand-accent transition-colors">
                      {tab.num}
                    </span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Steam Identity */}
          <div className="pt-6 mt-auto">
            <div className="-mx-3 p-3">
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-9 h-9 bg-zinc-900 border border-brand-border flex items-center justify-center overflow-hidden">
                  {steamSettings?.avatarUrl ? (
                    <img src={steamSettings.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Joystick className="w-4 h-4 text-brand-accent" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black tracking-tight text-white truncate">
                    {steamSettings?.steamName || "Operator"}
                  </p>
                  <p className="text-[11px] font-mono text-brand-muted mt-0.5 lowercase truncate">
                    {steamSettings?.steamId || "unlinked"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Header (Mobile Only) */}
        <header className="md:hidden flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-bg relative z-20">
          <div className="text-2xl font-black tracking-tighter text-brand-accent select-none">
            GAMETRACK
          </div>
          
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
            className="p-1.5 text-white bg-brand-border rounded-none hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile Dropdown Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-[65px] inset-x-0 bg-brand-bg border-b border-brand-border z-30 px-6 py-6 space-y-4">
            <nav className="flex flex-col gap-4">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-baseline gap-3 text-left py-1 ${
                      isActive ? "text-brand-accent font-bold" : "text-zinc-300"
                    }`}
                  >
                    <span className="text-[11px] font-mono text-brand-muted">{tab.num}</span>
                    <span className="text-lg font-black tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-brand-border pt-4 mt-4">
              <div 
                onClick={() => {
                  setSettingsOpen(true);
                  setMobileMenuOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSettingsOpen(true);
                    setMobileMenuOpen(false);
                  }
                }}
                tabIndex={0}
                role="button"
                className="cursor-pointer group flex items-center justify-between gap-3 focus:outline-none focus:border-brand-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono text-brand-muted uppercase">
                    Steam Operator
                  </p>
                  <p className="text-xs font-bold truncate text-white mt-0.5 group-hover:text-brand-accent transition-colors flex items-center gap-1.5">
                    {steamSettings?.steamName || "Operator"}
                  </p>
                  <p className="text-[11px] text-brand-muted truncate mt-0.5 lowercase">
                    {steamSettings?.profile || steamSettings?.steamId || "unlinked"}
                  </p>
                </div>
                <div
                  className="p-1.5 bg-zinc-900 text-brand-muted hover:text-brand-accent border border-brand-border rounded-none hover:bg-zinc-800 transition-colors shrink-0 flex items-center justify-center"
                  title="Open Settings"
                >
                  <Settings className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Right pane */}
        <main ref={mainRef} className="flex-1 flex flex-col min-w-0 min-h-0 bg-brand-bg overflow-y-auto scroll-smooth antialiased">
          {/* Persistent settings access — lives outside the animated view
              container so it never remounts or flashes on tab switches. */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="hidden md:flex fixed top-6 right-6 z-30 p-3 bg-zinc-900 hover:bg-zinc-800 border border-brand-border text-brand-muted hover:text-white transition-all cursor-pointer"
            title="Open Settings"
            aria-label="Open Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="w-full px-6 md:px-12 md:pr-24 py-10 pb-24 overflow-x-hidden shrink-0 relative">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                ref={pageRef}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
                className="w-full min-h-[60vh]"
                onAnimationComplete={() => {
                  const el = pageRef.current;
                  if (el && el.style.transform) el.style.transform = "";
                }}
              >
                {renderActiveView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Global Overlays & Portals */}
      <GameDetailsModal />
      <AddGameModal />
      <SettingsModal />
      <AuthModal />
      <ActivePlayingConflictModal />
      <Toast />

      {/* Full-screen boot loader: the screen in index.html stays blank (like
          the theme change) while the game registry preloads, then fades to
          reveal. Analytics/discover data streams in behind — the views show
          their own states — so nothing else can delay the reveal. */}
      {!booted && (
        <PageLoader
          checks={[!loadingGames]}
          onComplete={() => setBooted(true)}
        />
      )}
    </div>
    </>
  );
}
