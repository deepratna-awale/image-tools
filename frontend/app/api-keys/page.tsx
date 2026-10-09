"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check, Copy, KeyRound, LogOut, Trash2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  daily_limit: number;
  used_today: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface KeyList {
  keys: ApiKey[];
  used_today: number;
  daily_limit_total: number;
  default_daily_limit: number;
  max_keys: number;
  env_keys: number;
  resets_in_seconds: number;
}

const TOKEN_STORAGE = "imagetools-admin-token";
const ENDPOINT = "/api/admin/api-keys";

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function saveToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE, token);
    else sessionStorage.removeItem(TOKEN_STORAGE);
  } catch {
    // Private windows can refuse storage; the token then lasts until reload
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function ApiKeysPage() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<KeyList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const call = useCallback(
    async (path: string, init: RequestInit = {}, authToken = token) => {
      const res = await fetch(`${ENDPOINT}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.detail || `Request failed (${res.status})`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return body;
    },
    [token]
  );

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setError("");
      try {
        const body: KeyList = await call("", {}, authToken);
        setData(body);
        setToken(authToken);
        saveToken(authToken);
      } catch (e) {
        const err = e as Error & { status?: number };
        if (err.status === 401 || err.status === 403) {
          setToken("");
          saveToken("");
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [call]
  );

  useEffect(() => {
    const saved = readToken();
    if (saved) load(saved);
    // Only on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await call("", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          daily_limit: dailyLimit ? Number(dailyLimit) : null,
        }),
      });
      setNewKey({ name: created.name, key: created.key });
      setCopied(false);
      setName("");
      setDailyLimit("");
      await load(token);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function revokeKey(key: ApiKey) {
    if (!confirm(`Revoke "${key.name}"? Apps using it stop working immediately.`)) return;
    setError("");
    try {
      await call(`/${key.id}`, { method: "DELETE" });
      await load(token);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
  }

  function signOut() {
    saveToken("");
    setToken("");
    setData(null);
    setNewKey(null);
  }

  const inputClass =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!token || !data) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
        <div className="flex flex-col gap-2 text-center">
          <KeyRound className="mx-auto size-8 text-muted-foreground" />
          <h1 className="text-3xl font-semibold">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Enter the admin token from the server&apos;s <code>.env</code> to create and revoke keys.
          </p>
        </div>
        <Card>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                load(tokenInput.trim());
              }}
            >
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Admin token"
                className={inputClass}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <Button type="submit" disabled={!tokenInput.trim() || loading}>
                {loading ? "Checking…" : "Unlock"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const active = data.keys.filter((k) => !k.revoked_at);
  const revoked = data.keys.filter((k) => k.revoked_at);
  const totalPercent = Math.min(100, (data.used_today / data.daily_limit_total) * 100);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Keys for the{" "}
            <Link href="https://github.com/deepratna-awale/image-tools/blob/main/docs/API.md" className="underline">
              background removal API
            </Link>
            . Limits reset at 00:00 UTC (in {formatDuration(data.resets_in_seconds)}).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut /> Lock
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">All keys today</span>
            <span className="text-muted-foreground">
              {data.used_today} / {data.daily_limit_total} images
            </span>
          </div>
          <Progress value={totalPercent} />
          <p className="text-xs text-muted-foreground">
            Once every key together reaches this cap, the API answers 429 until midnight UTC, so it can
            never use more than this much server time in a day. The site itself is not counted.
          </p>
        </CardContent>
      </Card>

      {newKey && (
        <Card className="border-primary">
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-medium">
              New key for {newKey.name}. Copy it now: it is stored hashed and won&apos;t be shown again.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm">{newKey.key}</code>
              <Button variant="outline" size="icon" onClick={copyKey} aria-label="Copy key">
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createKey}>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Name
              <input
                className={inputClass}
                placeholder="e.g. My shop backend"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:w-40">
              Images per day
              <input
                className={inputClass}
                type="number"
                min={1}
                max={data.daily_limit_total}
                placeholder={String(data.default_daily_limit)}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={!name.trim() || active.length >= data.max_keys}>
              Create key
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {active.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No keys yet{data.env_keys ? ` (plus ${data.env_keys} from the server's .env)` : ""}.
          </p>
        )}
        {active.map((key) => (
          <Card key={key.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <code>{key.prefix}…</code> · created {formatDate(key.created_at)} · last used{" "}
                    {formatDate(key.last_used_at)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revokeKey(key)}>
                  <Trash2 /> Revoke
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Progress value={Math.min(100, (key.used_today / key.daily_limit) * 100)} />
                <p className="text-xs text-muted-foreground">
                  {key.used_today} / {key.daily_limit} images today
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
        {active.length > 0 && data.env_keys > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Plus {data.env_keys} key{data.env_keys > 1 ? "s" : ""} from the server&apos;s .env, each with{" "}
            {data.default_daily_limit} images per day.
          </p>
        )}
        {revoked.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">Revoked keys ({revoked.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {revoked.map((key) => (
                <li key={key.id}>
                  {key.name} <code>{key.prefix}…</code> · revoked {formatDate(key.revoked_at)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}
