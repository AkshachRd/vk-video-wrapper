import { DesktopApp } from "@/app/desktop-app";
import { MobileApp } from "@/app/mobile-app";
import { useVideoApp } from "@/lib/app/use-video-app";
import { usePlatform } from "@/lib/platform/use-platform";

// Диспетчер платформы: единый контроллер useVideoApp() питает обе вёрстки.
export default function App() {
  const platform = usePlatform();
  const app = useVideoApp();

  return platform === "mobile" ? <MobileApp app={app} /> : <DesktopApp app={app} />;
}
