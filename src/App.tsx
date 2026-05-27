import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <form className="mx-auto flex max-w-5xl gap-2">
        <Input aria-label="VK Video URL" placeholder="https://vkvideo.ru/video-..." />
        <Button type="submit">Load</Button>
      </form>
    </main>
  );
}
