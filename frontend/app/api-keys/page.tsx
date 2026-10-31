"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check, Copy, KeyRound, LogOut, ShieldCheck, Trash2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  daily_limit: number;
  used_today: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  public: boolean;
}

interface KeyList {
  keys: ApiKey[];
  used_today: number;
  daily_limit_total: number;
  default_daily_limit: number;
  max_keys: number;
  env_keys: number;
  resets_in_seconds: number;
  public_used_today: number;
  public_daily_limit_total: number;
}

interface PublicLimits {
  signup_open: boolean;
  daily_limit: number;
  rate_limit_per_minute: number;
  poll_limit_per_minute: number;
  keys_per_day: number;
  active_keys: number;
}

interface OwnKey {
  name: string;
  prefix?: string;
  daily_limit: number;
  used_today: number;
  rate_limit_per_minute: number;
  resets_in_seconds: number;
  created_at?: string;
  last_used_at?: string | null;
}

const DOCS_URL = "https://github.com/deepratna-awale/image-tools/blob/main/docs/API.md";
const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function requestJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let message = body.detail;
    if (Array.isArray(message)) message = "Give the key a name (up to 60 characters)";
    const err = new Error(message || `Request failed (${res.status})`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return body;
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

function AdminPanel({ onClose }: { onClose: () => void }) {
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

  if (!token || !data) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Admin</h2>
            <p className="text-sm text-muted-foreground">
              Enter the admin token from the server&apos;s <code>.env</code> to manage every key.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
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
      </section>
    );
  }

  const active = data.keys.filter((k) => !k.revoked_at && !k.public);
  const activePublic = data.keys.filter((k) => !k.revoked_at && k.public);
  const revoked = data.keys.filter((k) => k.revoked_at);
  const totalPercent = Math.min(100, (data.used_today / data.daily_limit_total) * 100);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Admin</h2>
          <p className="text-sm text-muted-foreground">
            Limits reset at 00:00 UTC (in {formatDuration(data.resets_in_seconds)}).
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
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
          <div className="mt-2 flex justify-between text-sm">
            <span className="font-medium">Self-serve keys today</span>
            <span className="text-muted-foreground">
              {data.public_used_today} / {data.public_daily_limit_total} images
            </span>
          </div>
          <Progress value={Math.min(100, (data.public_used_today / data.public_daily_limit_total) * 100)} />
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
            No admin keys yet{data.env_keys ? ` (plus ${data.env_keys} from the server's .env)` : ""}.
          </p>
        )}
        {active.map((key) => (
          <AdminKeyCard key={key.id} apiKey={key} onRevoke={revokeKey} />
        ))}
        {active.length > 0 && data.env_keys > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Plus {data.env_keys} key{data.env_keys > 1 ? "s" : ""} from the server&apos;s .env, each with{" "}
            {data.default_daily_limit} images per day.
          </p>
        )}
        {activePublic.length > 0 && (
          <details className="flex flex-col gap-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Self-serve keys ({activePublic.length})
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {activePublic.map((key) => (
                <AdminKeyCard key={key.id} apiKey={key} onRevoke={revokeKey} />
              ))}
            </div>
          </details>
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
    </section>
  );
}

function AdminKeyCard({ apiKey: key, onRevoke }: { apiKey: ApiKey; onRevoke: (key: ApiKey) => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">{key.name}</p>
            <p className="text-xs text-muted-foreground">
              <code>{key.prefix}…</code> · created {formatDate(key.created_at)} · last used{" "}
              {formatDate(key.last_used_at)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRevoke(key)}>
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
  );
}

function NewKeyCard({ name, apiKey }: { name: string; apiKey: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="border-primary">
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          Your key for {name}. Copy it now: it is stored hashed and won&apos;t be shown again.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-sm">{apiKey}</code>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy key"
            onClick={async () => {
              await navigator.clipboard.writeText(apiKey);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Send it in the <code>X-API-Key</code> header. Examples are in the{" "}
          <Link href={DOCS_URL} className="underline">
            API docs
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function SignUp({ limits }: { limits: PublicLimits | null }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = await requestJson("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), website }),
      });
      setCreated({ name: body.name, key: body.key });
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (limits && !limits.signup_open) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">Self-serve keys are turned off on this server.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Get a free key</h2>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              What is it for?
              <input
                className={inputClass}
                placeholder="e.g. My shop backend"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {/* Hidden from people; bots that fill every field are refused */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <Button type="submit" disabled={!name.trim() || busy}>
              {busy ? "Creating…" : "Create key"}
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {limits && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              <li>
                {limits.daily_limit} images a day per key, {limits.rate_limit_per_minute} submissions and{" "}
                {limits.poll_limit_per_minute} status checks a minute.
              </li>
              <li>
                All free keys share a daily allowance, so on a busy day you may get a 429 before your own limit.
                Limits reset at 00:00 UTC.
              </li>
              <li>
                Up to {limits.keys_per_day} new keys a day and {limits.active_keys} active keys from one network.
                Revoke keys you no longer use below.
              </li>
            </ul>
          )}
        </CardContent>
      </Card>
      {created && <NewKeyCard name={created.name} apiKey={created.key} />}
    </section>
  );
}

function CheckKey() {
  const [key, setKey] = useState("");
  const [info, setInfo] = useState<OwnKey | null>(null);
  const [error, setError] = useState("");
  const [revoked, setRevoked] = useState(false);

  const headers = () => ({ "X-API-Key": key.trim() });

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRevoked(false);
    try {
      setInfo(await requestJson("/api/api-keys/me", { headers: headers() }));
    } catch (e) {
      setInfo(null);
      setError((e as Error).message);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this key? Apps using it stop working immediately.")) return;
    setError("");
    try {
      await requestJson("/api/api-keys/me", { method: "DELETE", headers: headers() });
      setInfo(null);
      setKey("");
      setRevoked(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Check or revoke a key</h2>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={check}>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Your key
              <input
                type="password"
                autoComplete="off"
                placeholder="it_…"
                className={inputClass}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <Button type="submit" variant="outline" disabled={!key.trim()}>
              Check
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {revoked && <p className="text-sm text-muted-foreground">Key revoked.</p>}
          {info && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{info.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {info.prefix && <code>{info.prefix}… · </code>}
                    {info.rate_limit_per_minute} submissions a minute · last used {formatDate(info.last_used_at ?? null)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={revoke}>
                  <Trash2 /> Revoke
                </Button>
              </div>
              <Progress value={Math.min(100, (info.used_today / info.daily_limit) * 100)} />
              <p className="text-xs text-muted-foreground">
                {info.used_today} / {info.daily_limit} images today · resets in {formatDuration(info.resets_in_seconds)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function ApiKeysPage() {
  const [limits, setLimits] = useState<PublicLimits | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    requestJson("/api/api-keys/limits").then(setLimits).catch(() => setLimits(null));
    if (readToken()) setAdminOpen(true);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <KeyRound className="size-8 text-muted-foreground" />
        <h1 className="text-3xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Use the background removal, upscaling and watermark removal tools from your own apps. Create a free key
          below, then follow the{" "}
          <Link href={DOCS_URL} className="underline">
            API docs
          </Link>
          .
        </p>
      </div>

      <SignUp limits={limits} />
      <CheckKey />

      {adminOpen ? (
        <AdminPanel onClose={() => setAdminOpen(false)} />
      ) : (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setAdminOpen(true)}>
            <ShieldCheck /> Admin
          </Button>
        </div>
      )}
    </main>
  );
}
