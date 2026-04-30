import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Article { title: string; description: string; url: string; source: string; publishedAt: string; urlToImage?: string; }

export function NewsTab({ location }: { location?: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState("");

  useEffect(() => {
    setLoading(true);
    callFn<{ articles: Article[] }>("safety-news", {})
      .then((d) => setArticles(d.articles))
      .catch((e) => toast.error(`News: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const summarize = async () => {
    setSummarizing(true);
    try {
      const r = await callFn<{ summary: string; articles: Article[] }>("safety-news", { summarize: true, location });
      setSummary(r.summary);
      if (r.articles?.length) setArticles(r.articles);
    } catch (e: any) { toast.error(e.message); }
    finally { setSummarizing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground">SAFETY NEWS · LAST 8 STORIES</h2>
        <Button onClick={summarize} disabled={summarizing || loading}>
          {summarizing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Summarizing…</> : <><Sparkles className="h-4 w-4 mr-2" /> AI Summary</>}
        </Button>
      </div>

      {summary && (
        <Card className="panel p-5 border-primary/40">
          <div className="text-xs font-mono text-primary mb-2">GUARDIAN BRIEFING</div>
          <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{summary}</ReactMarkdown></div>
        </Card>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="panel p-5 animate-pulse">
              <div className="h-4 w-3/4 bg-muted rounded mb-3" />
              <div className="h-3 w-full bg-muted rounded mb-1" />
              <div className="h-3 w-5/6 bg-muted rounded" />
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card className="panel p-8 text-center text-muted-foreground">No news available right now.</Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {articles.map((a, i) => (
            <Card key={i} className="panel p-5 flex flex-col gap-2">
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                <span className="text-primary">{a.source}</span>
                <span>·</span>
                <span>{new Date(a.publishedAt).toLocaleDateString()}</span>
              </div>
              <h3 className="font-bold leading-tight">{a.title}</h3>
              {a.description && <p className="text-sm text-muted-foreground line-clamp-3">{a.description}</p>}
              <a href={a.url} target="_blank" rel="noreferrer" className="mt-auto text-sm text-primary hover:underline inline-flex items-center gap-1">
                Read more <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
