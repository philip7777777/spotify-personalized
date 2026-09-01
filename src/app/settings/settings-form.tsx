"use client";

import { useState } from "react";

type Props = {
  totpEnabled: boolean;
};

export function SettingsForm({ totpEnabled }: Props) {
  return (
    <div className="space-y-10">
      <PasswordSection />
      <TwoFactorSection initialEnabled={totpEnabled} />
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setMessage("Password updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Change password</h2>

      <div className="space-y-1">
        <label className="text-sm font-medium">Current password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

function RecoveryCodesList({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        Save these recovery codes now — each one can be used once if you
        lose access to your authenticator app. They will not be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-amber-950">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}

function TwoFactorSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleStartEnroll() {
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/enroll", { method: "POST" });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setQrCodeDataUrl(data.qrCodeDataUrl);
    setSecret(data.secret);
    setEnrolling(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Invalid code");
      return;
    }

    setEnabled(true);
    setEnrolling(false);
    setQrCodeDataUrl(null);
    setSecret(null);
    setCode("");
    setRecoveryCodes(data.recoveryCodes);
    setMessage("Two-factor authentication enabled");
  }

  async function handleDisable() {
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/disable", { method: "POST" });

    setLoading(false);

    if (!res.ok) {
      setError("Something went wrong");
      return;
    }

    setEnabled(false);
    setRecoveryCodes(null);
    setMessage("Two-factor authentication disabled");
  }

  async function handleRegenerateCodes() {
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/regenerate-codes", {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setRecoveryCodes(data.recoveryCodes);
    setMessage("Recovery codes regenerated");
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">
        Two-factor authentication (authenticator app)
      </h2>

      {enabled ? (
        <>
          <p className="text-sm text-gray-500">
            2FA is enabled for this account.
          </p>

          {recoveryCodes && <RecoveryCodesList codes={recoveryCodes} />}

          <div className="flex gap-2">
            <button
              onClick={handleRegenerateCodes}
              disabled={loading}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Regenerate recovery codes"}
            </button>
            <button
              onClick={handleDisable}
              disabled={loading}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Disable 2FA"}
            </button>
          </div>
        </>
      ) : enrolling ? (
        <form onSubmit={handleVerify} className="space-y-3">
          <p className="text-sm text-gray-500">
            Scan this QR code with an authenticator app (Google
            Authenticator, Authy, 1Password, etc.), then enter the 6-digit
            code it shows.
          </p>

          {qrCodeDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCodeDataUrl}
              alt="2FA QR code"
              className="h-48 w-48 rounded-md border"
            />
          )}

          {secret && (
            <p className="break-all text-xs text-gray-400">
              Can&apos;t scan? Enter this key manually: {secret}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Enter the 6-digit code from your app
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm tracking-widest"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify & enable"}
          </button>
        </form>
      ) : (
        <button
          onClick={handleStartEnroll}
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Please wait…" : "Set up 2FA"}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
